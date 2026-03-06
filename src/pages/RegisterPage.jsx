// src/pages/RegisterPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import toast from 'react-hot-toast'
import { FlaskConical, Eye, EyeOff, Camera } from 'lucide-react'
import { addAuditLog } from '../hooks/useAuth'

export default function RegisterPage() {
    const navigate = useNavigate()
    const [step, setStep] = useState(1) // 1: verify email, 2: account details
    const [loading, setLoading] = useState(false)
    const [validInvite, setValidInvite] = useState(null)

    // Form states
    const [email, setEmail] = useState('')
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        password: '',
        confirmPassword: '',
        researchArea: '',
        currentProject: '',
        orcid: '',
        linkedin: ''
    })
    const [profilePhoto, setProfilePhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)

    const [showPw, setShowPw] = useState(false)
    const [showConfirmPw, setShowConfirmPw] = useState(false)

    // Step 1: Verify Invitation
    const handleVerify = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const q = query(
                collection(db, 'invitations'),
                where('email', '==', email.trim()),
                where('used', '==', false)
            )
            const snap = await getDocs(q)
            if (snap.empty) {
                toast.error('Este correo no está registrado. Contacta al administrador.', {
                    style: { background: '#FEF2F2', color: '#EF4444', fontWeight: 'bold' }
                })
            } else {
                setValidInvite({ id: snap.docs[0].id, ...snap.docs[0].data() })
                setStep(2)
            }
        } catch (err) {
            console.error('Error verifying invite:', err)
            toast.error('Error al verificar la invitación.')
        } finally {
            setLoading(false)
        }
    }

    const handlePhotoChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                toast.error('La imagen no debe superar los 2MB')
                return
            }
            setProfilePhoto(file)
            setPhotoPreview(URL.createObjectURL(file))
        }
    }

    // Step 2: Create Account
    const handleCreateAccount = async (e) => {
        e.preventDefault()

        if (formData.password !== formData.confirmPassword) {
            toast.error('Las contraseñas no coinciden')
            return
        }

        if (formData.password.length < 8) {
            toast.error('La contraseña debe tener al menos 8 caracteres')
            return
        }

        setLoading(true)
        try {
            // 1. Create auth user
            const credential = await createUserWithEmailAndPassword(auth, email.trim(), formData.password)
            const user = credential.user

            // 2. Upload photo if exists
            let photoUrl = ''
            if (profilePhoto) {
                const storage = getStorage()
                const storageRef = ref(storage, `profiles/${user.uid}_${Date.now()}_${profilePhoto.name}`)
                const snapshot = await uploadBytes(storageRef, profilePhoto)
                photoUrl = await getDownloadURL(snapshot.ref)
            }

            // 3. Create user document
            const newUserDoc = {
                uid: user.uid,
                email: user.email,
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                role: validInvite.role,
                group: validInvite.group,
                photoURL: photoUrl,
                bio: '',
                researchArea: formData.researchArea.trim(),
                currentProject: formData.currentProject.trim(),
                orcid: formData.orcid.trim(),
                linkedin: formData.linkedin.trim(),
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
            }
            await setDoc(doc(db, 'users', user.uid), newUserDoc)

            // 4. Mark invitation as used
            await updateDoc(doc(db, 'invitations', validInvite.id), { used: true })

            // 5. Audit log
            await addAuditLog(
                user.uid,
                `${formData.firstName.trim()} ${formData.lastName.trim()}`,
                'user_registered',
                `New user registered: ${user.email}`,
                'auth'
            )

            toast.success('¡Bienvenido a Glia!', { duration: 4000 })
            // Automatically redirects to /regulations via useAuthListener due to acceptedRegulations check
            // or we manually navigate to avoid relying on auth listener timings:
            navigate('/regulations')

        } catch (err) {
            console.error('Registration error:', err)
            if (err.code === 'auth/email-already-in-use') {
                toast.error('Este correo ya está registrado en la plataforma')
            } else {
                toast.error('Ocurrió un error al crear la cuenta')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card" style={{ maxWidth: step === 2 ? '500px' : '400px' }}>
                <div className="login-logo-container" style={{ marginBottom: '24px' }}>
                    <div className="login-logo-icon">
                        <FlaskConical size={40} color="#9B72CF" />
                    </div>
                </div>

                {step === 1 ? (
                    <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 8px 0' }}>Crear tu cuenta</h2>
                            <p style={{ color: '#666666', fontSize: '14px', margin: 0 }}>Ingresa el correo con el que fuiste registrado</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' }}>Correo Electrónico</label>
                            <input
                                type="email"
                                placeholder="tu@correo.edu.co"
                                required
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)', marginTop: '8px' }}>
                            {loading ? 'Verificando...' : 'Verificar'}
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            style={{ background: 'none', border: 'none', color: '#9B72CF', fontWeight: '700', cursor: 'pointer', marginTop: '8px' }}>
                            Volver al inicio de sesión
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 8px 0' }}>Completa tu perfil</h2>
                        </div>

                        {/* Photo Upload */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                            <label style={{ position: 'relative', cursor: 'pointer' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #EAE5F2' }}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Camera size={24} color="#9B72CF" />
                                    )}
                                </div>
                                <span style={{ position: 'absolute', bottom: -5, right: -5, background: '#9B72CF', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: '2px solid white' }}>
                                    <Camera size={14} />
                                </span>
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Nombre *</label>
                                <input
                                    type="text"
                                    required
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none' }}
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Apellido *</label>
                                <input
                                    type="text"
                                    required
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none' }}
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Contraseña *</label>
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    required
                                    minLength="8"
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none', paddingRight: '40px' }}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: '12px', top: '34px', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Confirmar *</label>
                                <input
                                    type={showConfirmPw ? 'text' : 'password'}
                                    required
                                    minLength="8"
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none', paddingRight: '40px' }}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                />
                                <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} style={{ position: 'absolute', right: '12px', top: '34px', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
                                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Área de investigación (Opcional)</label>
                            <input
                                type="text"
                                className="input-field"
                                style={{ background: '#F5F5F5', border: 'none', marginTop: '6px' }}
                                value={formData.researchArea}
                                onChange={(e) => setFormData({ ...formData, researchArea: e.target.value })}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Proyecto actual (Opcional)</label>
                            <input
                                type="text"
                                className="input-field"
                                style={{ background: '#F5F5F5', border: 'none', marginTop: '6px' }}
                                value={formData.currentProject}
                                onChange={(e) => setFormData({ ...formData, currentProject: e.target.value })}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>ORCID (Opcional)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none', marginTop: '6px' }}
                                    value={formData.orcid}
                                    onChange={(e) => setFormData({ ...formData, orcid: e.target.value })}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>LinkedIn (Opcional)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: 'none', marginTop: '6px' }}
                                    value={formData.linkedin}
                                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)', marginTop: '8px' }}>
                            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
