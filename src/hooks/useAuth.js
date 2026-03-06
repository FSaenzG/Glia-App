// src/hooks/useAuth.js
import { useEffect, useRef } from 'react'
import { auth, db } from '../firebase'
import {
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
} from 'firebase/auth'
import {
    doc, getDoc, setDoc, updateDoc, serverTimestamp,
    collection, addDoc, query, where, getDocs, limit
} from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import i18n from '../i18n'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes

export function useAuthListener() {
    const { setUser, setUserProfile, setLoading, logout } = useAuthStore()
    const inactivityTimer = useRef(null)

    useEffect(() => {
        const resetInactivityTimer = () => {
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
            inactivityTimer.current = setTimeout(async () => {
                await signOut(auth)
                toast.error(i18n.t('sessionExpired') || 'Sesión expirada por inactividad')
            }, INACTIVITY_TIMEOUT)
        }

        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
        events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))

        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    try {
                        const profileRef = doc(db, 'users', firebaseUser.uid)
                        let snap = await getDoc(profileRef)

                        if (!snap.exists()) {
                            // First time login - Check if users collection is empty
                            const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)))
                            const isFirstUser = usersSnap.empty;

                            let role = "estudiante"
                            let group = "Neurobioquímica"
                            let validInvite = null;

                            if (isFirstUser) {
                                role = "admin"
                            } else {
                                // Check invitations
                                const invitesRef = collection(db, 'invitations')
                                const q = query(invitesRef, where('email', '==', firebaseUser.email), where('used', '==', false))
                                const inviteSnap = await getDocs(q)

                                if (inviteSnap.empty) {
                                    await signOut(auth)
                                    toast.error('Tu cuenta de Google no está registrada. Contacta al administrador.')
                                    logout()
                                    setLoading(false)
                                    return
                                }

                                validInvite = inviteSnap.docs[0]
                                role = validInvite.data().role
                                group = validInvite.data().group
                            }

                            // Create new user document
                            const newUser = {
                                uid: firebaseUser.uid,
                                email: firebaseUser.email,
                                firstName: firebaseUser.displayName?.split(' ')[0] || 'Miembro',
                                lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
                                role,
                                group,
                                photoURL: firebaseUser.photoURL || '',
                                bio: '',
                                researchArea: '',
                                currentProject: '',
                                orcid: '',
                                linkedin: '',
                                points: 0,
                                level: 'Novato',
                                certifications: [],
                                language: 'es',
                                darkMode: false,
                                acceptedRegulations: false,
                                acceptedRegulationsAt: null,
                                createdAt: serverTimestamp(),
                                isActive: true,
                                expiresAt: null
                            };
                            await setDoc(profileRef, newUser);

                            if (validInvite) {
                                await updateDoc(doc(db, 'invitations', validInvite.id), {
                                    used: true
                                });
                            }

                            setUser(firebaseUser)
                            setUserProfile(newUser)
                        } else {
                            const profile = snap.data()

                            if (profile.isActive === false || profile.suspended) {
                                await signOut(auth)
                                toast.error('Esta cuenta ha sido suspendida o está inactiva.')
                                logout()
                                setLoading(false)
                                return
                            }

                            setUser(firebaseUser)
                            setUserProfile(profile)
                        }
                    } catch (firestoreError) {
                        console.warn('Firestore profile read failed:', firestoreError)
                        setUserProfile(null)
                    }

                    resetInactivityTimer()
                } else {
                    logout()
                }
            } catch (err) {
                console.error('Auth state error:', err)
                logout()
            } finally {
                setLoading(false)
            }
        })

        return () => {
            unsub()
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
            events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
        }
    }, [logout, setLoading, setUser, setUserProfile])
}

export async function loginWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password)
}

export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    return signInWithPopup(auth, provider)
}

export async function logoutUser() {
    await signOut(auth)
}

export async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email)
}

export async function addAuditLog(userId, userName, action, detail, page = 'general') {
    try {
        await addDoc(collection(db, 'audit_log'), {
            userId,
            userName,
            action,
            detail,
            page,
            createdAt: serverTimestamp(),
        })
    } catch (err) {
        console.warn('Audit log failed:', err)
    }
}
