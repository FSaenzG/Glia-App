// src/pages/ProfilePage.jsx — Mi Lab (Admin Control Center)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import { db, storage } from '../firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
    collection, onSnapshot, query, orderBy, limit, addDoc, deleteDoc,
    serverTimestamp, getDocs, doc, updateDoc
} from 'firebase/firestore'
import toast from 'react-hot-toast'
import {
    Users, Settings, ShieldCheck, Activity, FlaskConical,
    Search, UserPlus, Trash2, X, Key, Briefcase, Plus, Edit2,
    Shield, ChevronRight, Camera, Bell
} from 'lucide-react'
import { sendNotification } from '../hooks/useNotifications'

const TABS = ['Usuarios', 'Equipos', 'Mis Publicaciones', 'Auditoría', 'Invitaciones', 'Configuración']

export default function MiLabPage() {
    const navigate = useNavigate()
    const { userProfile, user } = useAuthStore()
    const isAdmin = userProfile?.role === 'admin'

    // Redirect non-admins immediately
    useEffect(() => {
        if (userProfile && !isAdmin) {
            navigate('/', { replace: true })
        }
    }, [userProfile, isAdmin, navigate])

    const [activeTab, setActiveTab] = useState('Usuarios')

    const [usersList, setUsersList] = useState([])
    const [auditLogs, setAuditLogs] = useState([])
    const [equipmentList, setEquipmentList] = useState([])
    const [invitations, setInvitations] = useState([])
    const [labSettings, setLabSettings] = useState({ regulations: '', emergencyProtocol: '' })

    const [search, setSearch] = useState('')
    const [myPosts, setMyPosts] = useState([])
    const [auditStartDate, setAuditStartDate] = useState('')
    const [auditEndDate, setAuditEndDate] = useState('')

    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({ email: '', role: 'usuario', group: 'Bioquímica' })

    const [isUserModalOpen, setIsUserModalOpen] = useState(false)
    const [userEditForm, setUserEditForm] = useState({ id: null, role: '', group: '', isActive: true, certificationsText: '' })

    const [isEqModalOpen, setIsEqModalOpen] = useState(false)
    const [eqForm, setEqForm] = useState({ id: null, name: '', category: 'General', status: 'available', location: '', maintenanceNote: '', returnDate: '' })

    const [isCertModalOpen, setIsCertModalOpen] = useState(false)
    const [certUserForm, setCertUserForm] = useState({ id: null, firstName: '', lastName: '', certifications: [], initialCertifications: [] })

    // Realtime listeners by tab
    useEffect(() => {
        let unsubUsers = () => { }
        let unsubLogs = () => { }
        let unsubEq = () => { }
        let unsubInv = () => { }
        let unsubSettings = () => { }

        if (!isAdmin) return

        if (activeTab === 'Usuarios') {
            unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                list.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''))
                setUsersList(list)
            })
        } else if (activeTab === 'Auditoría') {
            const q = query(collection(db, 'audit_log'), orderBy('createdAt', 'desc'), limit(50))
            unsubLogs = onSnapshot(q, (snap) => {
                setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            })
        } else if (activeTab === 'Equipos') {
            const q = query(collection(db, 'equipment'), orderBy('name', 'asc'))
            unsubEq = onSnapshot(q, (snap) => {
                setEquipmentList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            })
            unsubInv = onSnapshot(q, (snap) => {
                setInvitations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            })
        } else if (activeTab === 'Mis Publicaciones') {
            const q = query(
                collection(db, 'lab_feed'),
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                limit(5)
            )
            onSnapshot(q, (snap) => {
                setMyPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            })
        } else if (activeTab === 'Configuración') {
            unsubSettings = onSnapshot(doc(db, 'settings', 'main'), (snap) => {
                if (snap.exists()) setLabSettings(snap.data())
            })
        }

        return () => { unsubUsers(); unsubLogs(); unsubEq(); unsubInv(); unsubSettings() }
    }, [activeTab, isAdmin])

    // ---- Handlers ----
    const adminName = () => (userProfile?.firstName && userProfile?.lastName)
        ? `${userProfile.firstName} ${userProfile.lastName}`
        : (user?.displayName || 'Administrador')

    const handleInvite = async (e) => {
        e.preventDefault()
        if (!inviteForm.email.trim()) return
        try {
            const existing = await getDocs(collection(db, 'users'))
            if (existing.docs.some(d => d.data().email === inviteForm.email.trim())) {
                toast.error('Un usuario con este correo ya existe.')
                return
            }
            await addDoc(collection(db, 'invitations'), {
                email: inviteForm.email.trim(),
                role: inviteForm.role,
                group: inviteForm.group,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                used: false
            })
            await addAuditLog(user.uid, adminName(), 'invitation_created', `Invitación a ${inviteForm.email.trim()}`, 'admin')
            toast.success('Invitación guardada. El usuario puede registrarse.')
            setIsInviteModalOpen(false)
            setInviteForm({ email: '', role: 'usuario', group: 'Bioquímica' })
        } catch (err) {
            console.error(err)
            toast.error('Error al crear invitación')
        }
    }

    const handleUpdateUser = async (e) => {
        e.preventDefault()
        try {
            const certsArray = userEditForm.certificationsText
                ? userEditForm.certificationsText.split(',').map(c => c.trim()).filter(Boolean)
                : []

            // Notification logic: find new certifications
            // We need to know what they had before. If we don't have it in state, we might need to fetch it or skip.
            // Let's at least notify about the ones currently being added.

            await updateDoc(doc(db, 'users', userEditForm.id), {
                role: userEditForm.role,
                group: userEditForm.group,
                isActive: userEditForm.isActive,
                certifications: certsArray
            })

            // If we are giving them a new cert, we notify. (Simplification: notify all current certs as approved)
            if (certsArray.length > 0) {
                await sendNotification(userEditForm.id, {
                    type: 'cert_approved',
                    message: `El administrador actualizó tus certificaciones para: ${certsArray.join(', ')}`
                })
            }

            toast.success('Usuario actualizado')
            setIsUserModalOpen(false)
        } catch (err) {
            console.error(err)
            toast.error('Error al actualizar usuario')
        }
    }

    const handleSaveCerts = async (e) => {
        e.preventDefault()
        try {
            await updateDoc(doc(db, 'users', certUserForm.id), { certifications: certUserForm.certifications })
            const newCerts = certUserForm.certifications.filter(c => !certUserForm.initialCertifications.includes(c))
            if (newCerts.length > 0) {
                await sendNotification(certUserForm.id, {
                    type: 'cert_approved',
                    message: `El administrador te certificó para usar: ${newCerts.join(', ')}`
                })
            }
            toast.success('Certificaciones actualizadas')
            setIsCertModalOpen(false)
        } catch (err) {
            console.error(err)
            toast.error('Error al guardar certificaciones')
        }
    }

    const handleSaveEquipment = async (e) => {
        e.preventDefault()
        if (!eqForm.name.trim()) return
        try {
            if (eqForm.id) {
                await updateDoc(doc(db, 'equipment', eqForm.id), {
                    name: eqForm.name, category: eqForm.category, status: eqForm.status,
                    location: eqForm.location,
                    maintenanceNote: eqForm.status === 'maintenance' ? eqForm.maintenanceNote : '',
                    returnDate: eqForm.status === 'maintenance' ? eqForm.returnDate : '',
                    sortOrder: Number(eqForm.sortOrder || 99)
                })
                toast.success('Equipo actualizado')
            } else {
                await addDoc(collection(db, 'equipment'), {
                    name: eqForm.name, category: eqForm.category, status: eqForm.status,
                    location: eqForm.location,
                    maintenanceNote: eqForm.status === 'maintenance' ? eqForm.maintenanceNote : '',
                    returnDate: eqForm.status === 'maintenance' ? eqForm.returnDate : '',
                    sortOrder: Number(eqForm.sortOrder || 99),
                    createdAt: serverTimestamp()
                })
                toast.success('Equipo añadido')
            }
            setIsEqModalOpen(false)
            setEqForm({ id: null, name: '', category: 'General', status: 'available', location: '', maintenanceNote: '', returnDate: '', sortOrder: '' })
        } catch (err) {
            console.error(err)
            toast.error('Error al guardar equipo')
        }
    }

    const handleDeleteEquipment = async (id, name) => {
        if (!window.confirm(`¿Eliminar el equipo "${name}"?`)) return
        try {
            await deleteDoc(doc(db, 'equipment', id))
            toast.success('Equipo eliminado')
        } catch (err) {
            toast.error('Error al eliminar equipo')
        }
    }

    const handleSaveSettings = async () => {
        try {
            await updateDoc(doc(db, 'settings', 'main'), labSettings)
            toast.success('Configuración guardada')
        } catch {
            try {
                await addDoc(collection(db, 'settings'), { ...labSettings, _id: 'main' })
                toast.success('Configuración guardada')
            } catch (err) {
                toast.error('Error guardando configuración')
            }
        }
    }

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0]
        if (!file || !user) return

        if (file.size > 5 * 1024 * 1024) {
            toast.error('La imagen debe pesar menos de 5MB')
            return
        }

        const toastId = toast.loading('Subiendo foto...')
        try {
            const storageRef = ref(storage, `profile-photos/${user.uid}`)
            await uploadBytes(storageRef, file)
            const downloadURL = await getDownloadURL(storageRef)

            await updateDoc(doc(db, 'users', user.uid), {
                photoURL: downloadURL
            })

            toast.success('Foto actualizada', { id: toastId })
        } catch (error) {
            console.error(error)
            toast.error('Error al subir la imagen', { id: toastId })
        }
    }

    const filteredUsers = usersList.filter(u => {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()
        const term = search.toLowerCase()
        return name.includes(term) || u.email?.toLowerCase().includes(term)
    })

    const filteredAuditLogs = auditLogs.filter(log => {
        if (!auditStartDate && !auditEndDate) return true
        const logDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date()
        const logTime = new Date(logDate).setHours(0, 0, 0, 0)
        if (auditStartDate && logTime < new Date(auditStartDate).setHours(0, 0, 0, 0)) return false
        if (auditEndDate && logTime > new Date(auditEndDate).setHours(0, 0, 0, 0)) return false
        return true
    })

    const eqStatusLabel = (s) => s === 'available' ? 'Activo' : s === 'maintenance' ? 'Agenda bloqueada' : s === 'out_of_service' ? 'Bloqueado por daño' : s
    const eqStatusColor = (s) => s === 'available' ? '#34C759' : s === 'in_use' ? '#FF9500' : '#FF3B30'

    if (!isAdmin) return null

    return (
        <div className="page-container" style={{ paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px', textAlign: 'center' }}>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: '#F0EBF8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        border: '3px solid white',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        {userProfile?.photoURL ? (
                            <img src={userProfile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span style={{ fontSize: '32px', fontWeight: '800', color: '#9B72CF' }}>
                                {(userProfile?.firstName || 'U').charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <label style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '0',
                        background: '#9B72CF',
                        color: 'white',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        border: '2px solid white'
                    }}>
                        <Camera size={14} />
                        <input type="file" accept="image/png, image/jpeg, image/webp" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                    </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} color="#9B72CF" />
                    <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Mi Lab</h1>
                    <span style={{ background: '#F0EBF8', color: '#9B72CF', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800' }}>ADMIN</span>
                </div>
                <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>Control de acceso y configuración del sistema</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#F5F5F5', padding: '4px', borderRadius: '12px', marginBottom: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: '1 0 auto', padding: '8px 16px', borderRadius: '8px',
                            fontSize: '12px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                            background: activeTab === tab ? '#FFFFFF' : 'transparent',
                            color: activeTab === tab ? '#9B72CF' : '#666666',
                            boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* ===== USUARIOS TAB ===== */}
            {activeTab === 'Usuarios' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={18} color="#9CA3AF" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o correo..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input-field"
                                style={{ paddingLeft: '44px', background: '#F5F5F5', border: 'none', height: '52px' }}
                            />
                        </div>
                        <button
                            onClick={() => setIsInviteModalOpen(true)}
                            style={{ width: '52px', height: '52px', borderRadius: '16px', background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)', flexShrink: 0 }}>
                            <UserPlus size={24} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredUsers.map(u => (
                            <div key={u.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                        {u.photoURL ? (
                                            <img src={u.photoURL} alt={u.firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '18px', fontWeight: '800', color: '#9B72CF' }}>
                                                {(u.firstName || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ overflow: 'hidden' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{u.firstName} {u.lastName}</h3>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#9B72CF', background: '#F0EBF8', padding: '2px 8px', borderRadius: '8px' }}>{u.role?.toUpperCase()}</span>
                                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px' }}>{u.group}</span>
                                            {u.isActive === false && <span style={{ fontSize: '10px', fontWeight: '800', color: '#EF4444', background: '#FEF2F2', padding: '2px 8px', borderRadius: '8px' }}>SUSPENDIDO</span>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => {
                                            setCertUserForm({ id: u.id, firstName: u.firstName || '', lastName: u.lastName || '', certifications: u.certifications || [], initialCertifications: u.certifications || [] })
                                            setIsCertModalOpen(true)
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#9B72CF', cursor: 'pointer', padding: '8px' }}
                                        title="Certificaciones"
                                    >
                                        <ShieldCheck size={20} />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (window.confirm(`¿Notificar aseo a ${u.firstName}?`)) {
                                                await sendNotification(u.id, {
                                                    type: 'cleaning_duty',
                                                    message: 'Te corresponde aseo esta semana'
                                                })
                                                toast.success('Notificación de aseo enviada')
                                            }
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#007AFF', cursor: 'pointer', padding: '8px' }}
                                        title="Notificar aseo"
                                    >
                                        <Bell size={20} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setUserEditForm({ id: u.id, role: u.role || 'usuario', group: u.group || 'Bioquímica', isActive: u.isActive !== false, certificationsText: (u.certifications || []).join(', ') })
                                            setIsUserModalOpen(true)
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#D1D5DB', cursor: 'pointer', padding: '8px' }}>
                                        <Edit2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredUsers.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No se encontraron usuarios.</div>
                        )}
                    </div>
                </section>
            )}

            {/* ===== EQUIPOS TAB ===== */}
            {activeTab === 'Equipos' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                        <button
                            onClick={() => { setEqForm({ id: null, name: '', category: 'General', status: 'available', location: '' }); setIsEqModalOpen(true) }}
                            style={{ background: '#9B72CF', color: 'white', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                            <Plus size={18} /> Nuevo Equipo
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {equipmentList.map(eq => (
                            <div key={eq.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{eq.name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: eqStatusColor(eq.status) }} />
                                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#666', textTransform: 'uppercase' }}>{eqStatusLabel(eq.status)}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Cat: {eq.category || 'N/A'}</span>
                                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Ubic: {eq.location || 'N/A'}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => { setEqForm({ id: eq.id, name: eq.name, category: eq.category || 'General', status: eq.status, location: eq.location, maintenanceNote: eq.maintenanceNote || '', returnDate: eq.returnDate || '', sortOrder: eq.sortOrder || '' }); setIsEqModalOpen(true) }} style={{ background: '#F5F5F5', color: '#666', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                    <button onClick={() => handleDeleteEquipment(eq.id, eq.name)} style={{ background: '#FFF0EF', color: '#FF3B30', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                </div>
                            </div>
                        ))}
                        {equipmentList.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No hay equipos registrados.</div>}
                    </div>
                </section>
            )}

            {/* ===== MIS PUBLICACIONES TAB ===== */}
            {activeTab === 'Mis Publicaciones' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {myPosts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No has realizado ninguna publicación aún.</div>
                        ) : (
                            myPosts.map(post => (
                                <div key={post.id} className="card" style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800' }}>
                                            {post.createdAt?.toDate() ? post.createdAt.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Reciente'}
                                        </span>
                                        <button
                                            onClick={async () => {
                                                if (window.confirm('¿Eliminar esta publicación?')) {
                                                    await deleteDoc(doc(db, 'lab_feed', post.id));
                                                    toast.success('Publicación eliminada');
                                                }
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#FF3B30', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '14px', color: '#1A1A2E', fontWeight: '600', margin: '0 0 10px 0', lineHeight: '1.4' }}>{post.text}</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {post.equipmentUsed?.map((eq, i) => (
                                            <span key={i} style={{ fontSize: '9px', fontWeight: '800', background: '#F0EBF8', color: '#9B72CF', padding: '2px 6px', borderRadius: '4px' }}>{eq}</span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* ===== AUDITORÍA TAB ===== */}
            {activeTab === 'Auditoría' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}><label style={{ fontSize: '11px', fontWeight: '800', color: '#1A1A2E' }}>Fecha Inicio</label><input type="date" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} className="input-field" style={{ background: '#F5F5F5', border: 'none' }} /></div>
                        <div style={{ flex: 1 }}><label style={{ fontSize: '11px', fontWeight: '800', color: '#1A1A2E' }}>Fecha Fin</label><input type="date" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} className="input-field" style={{ background: '#F5F5F5', border: 'none' }} /></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredAuditLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No hay registros en este rango.</div>
                        ) : filteredAuditLogs.map(log => (
                            <div key={log.id} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', borderLeft: '4px solid #9B72CF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{log.action}</span>
                                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '700' }}>{log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('es-CO') : 'Reciente'}</span>
                                </div>
                                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>{log.detail}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {log.userPhoto && <img src={log.userPhoto} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />}
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF' }}>
                                        {(!log.userName || log.userName === 'undefined undefined') ? 'Usuario Glia' : log.userName}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#D1D5DB' }}>| {log.page}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ===== INVITACIONES TAB ===== */}
            {activeTab === 'Invitaciones' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {invitations.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No hay invitaciones activas.</div>
                        ) : invitations.map(inv => (
                            <div key={inv.id} className="card" style={{ padding: '16px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: inv.used ? '#D1D5DB' : '#34C759' }} />
                                <div style={{ paddingLeft: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{inv.email}</h3>
                                        <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 8px', borderRadius: '8px', background: inv.used ? '#F5F5F5' : '#E8F8ED', color: inv.used ? '#9CA3AF' : '#1A7A3A' }}>{inv.used ? 'USADA' : 'ACTIVA'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px' }}>{inv.role}</span>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px' }}>{inv.group}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ===== CONFIGURACIÓN TAB ===== */}
            {activeTab === 'Configuración' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="card" style={{ padding: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Reglamento del Laboratorio</h3>
                        <textarea value={labSettings.regulations || ''} onChange={e => setLabSettings({ ...labSettings, regulations: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', minHeight: '150px', resize: 'vertical' }} placeholder="Escribe el reglamento oficial aquí..." />
                    </div>
                    <div className="card" style={{ padding: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Protocolo S.O.S (Emergencias)</h3>
                        <textarea value={labSettings.emergencyProtocol || ''} onChange={e => setLabSettings({ ...labSettings, emergencyProtocol: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', minHeight: '150px', resize: 'vertical' }} placeholder="Pasos en caso de emergencia..." />
                    </div>
                    <button onClick={handleSaveSettings} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                        Guardar Configuración
                    </button>
                </section>
            )}

            {/* ===== INVITE MODAL ===== */}
            {isInviteModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Invitar Usuario</h2>
                            <button onClick={() => setIsInviteModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} color="#666" /></button>
                        </div>
                        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Correo Electrónico</label>
                                <input type="email" required placeholder="correo@javeriana.edu.co" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Rol</label>
                                <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="usuario">Usuario</option>
                                    <option value="estudiante">Estudiante</option>
                                    <option value="profesor">Profesor</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Grupo de Investigación</label>
                                <select value={inviteForm.group} onChange={e => setInviteForm({ ...inviteForm, group: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="Bioquímica">Bioquímica</option>
                                    <option value="Neurobioquímica">Neurobioquímica</option>
                                    <option value="Nutrición">Nutrición</option>
                                </select>
                            </div>
                            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>Guardar Invitación</button>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== EDIT USER MODAL ===== */}
            {isUserModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Modificar Usuario</h2>
                            <button onClick={() => setIsUserModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} color="#666" /></button>
                        </div>
                        <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={16} color="#9B72CF" /> Rol</label>
                                <select value={userEditForm.role} onChange={e => setUserEditForm({ ...userEditForm, role: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="usuario">Usuario</option>
                                    <option value="estudiante">Estudiante</option>
                                    <option value="profesor">Profesor</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={16} color="#9B72CF" /> Grupo de Investigación</label>
                                <select value={userEditForm.group} onChange={e => setUserEditForm({ ...userEditForm, group: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="Bioquímica">Bioquímica</option>
                                    <option value="Neurobioquímica">Neurobioquímica</option>
                                    <option value="Nutrición">Nutrición</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Settings size={16} color="#9B72CF" /> Estado de cuenta</label>
                                <select value={userEditForm.isActive ? 'active' : 'suspended'} onChange={e => setUserEditForm({ ...userEditForm, isActive: e.target.value === 'active' })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="active">Activo</option>
                                    <option value="suspended">Suspendido</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="#9B72CF" /> Certificaciones</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#F5F5F5', padding: '12px', borderRadius: '12px' }}>
                                    {['Microscopio de Fluorescencia', 'Termociclador PCR'].map(cert => {
                                        const currentCerts = userEditForm.certificationsText ? userEditForm.certificationsText.split(',').map(c => c.trim()) : []
                                        const isChecked = currentCerts.includes(cert)
                                        return (
                                            <label key={cert} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#1A1A2E', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={isChecked} onChange={e => {
                                                    let out = [...currentCerts]
                                                    if (e.target.checked) out.push(cert)
                                                    else out = out.filter(c => c !== cert)
                                                    setUserEditForm({ ...userEditForm, certificationsText: out.join(', ') })
                                                }} style={{ width: '18px', height: '18px', accentColor: '#9B72CF' }} />
                                                {cert}
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>
                            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>Actualizar Usuario</button>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== CERTIFICATIONS MODAL ===== */}
            {isCertModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Certificaciones</h2>
                            <button onClick={() => setIsCertModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} color="#666" /></button>
                        </div>
                        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>Gestionar accesos de <strong>{certUserForm.firstName} {certUserForm.lastName}</strong></p>
                        <form onSubmit={handleSaveCerts} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F5F5F5', padding: '16px', borderRadius: '16px' }}>
                                {['Microscopio de Fluorescencia', 'Termociclador PCR'].map(cert => {
                                    const isChecked = certUserForm.certifications.includes(cert)
                                    return (
                                        <div key={cert} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A2E' }}>{cert}</span>
                                            <label style={{ cursor: 'pointer' }}>
                                                <input type="checkbox" checked={isChecked} onChange={e => {
                                                    let newCerts = [...certUserForm.certifications]
                                                    if (e.target.checked) newCerts.push(cert)
                                                    else newCerts = newCerts.filter(c => c !== cert)
                                                    setCertUserForm({ ...certUserForm, certifications: newCerts })
                                                }} style={{ display: 'none' }} />
                                                <div style={{ width: '44px', height: '24px', background: isChecked ? '#34C759' : '#D1D5DB', borderRadius: '12px', position: 'relative', transition: '0.2s' }}>
                                                    <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: isChecked ? '22px' : '2px', transition: '0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                                                </div>
                                            </label>
                                        </div>
                                    )
                                })}
                            </div>
                            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>Guardar Certificaciones</button>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== EQUIPMENT MODAL ===== */}
            {isEqModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{eqForm.id ? 'Editar Equipo' : 'Añadir Equipo'}</h2>
                            <button onClick={() => setIsEqModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} color="#666" /></button>
                        </div>
                        <form onSubmit={handleSaveEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div><label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Nombre del Equipo</label><input type="text" required value={eqForm.name} onChange={e => setEqForm({ ...eqForm, name: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} /></div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Orden de Aparición (1-10)</label>
                                <input type="number" value={eqForm.sortOrder} onChange={e => setEqForm({ ...eqForm, sortOrder: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} placeholder="Ej. 1" />
                            </div>
                            <div><label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Categoría</label><input type="text" value={eqForm.category} onChange={e => setEqForm({ ...eqForm, category: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} placeholder="Ej. Microscopía" /></div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Estado</label>
                                <select value={eqForm.status} onChange={e => setEqForm({ ...eqForm, status: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                    <option value="available">Activo</option>
                                    <option value="maintenance">Agenda bloqueada por administrador</option>
                                    <option value="out_of_service">Bloqueado por daño</option>
                                </select>
                            </div>
                            <div><label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Ubicación Física</label><input type="text" value={eqForm.location} onChange={e => setEqForm({ ...eqForm, location: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} placeholder="Ej. Cuarto 2" /></div>
                            {eqForm.status === 'maintenance' && (
                                <>
                                    <div><label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Motivo de Mantenimiento</label><textarea value={eqForm.maintenanceNote} onChange={e => setEqForm({ ...eqForm, maintenanceNote: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} /></div>
                                    <div><label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Fecha Estimada de Retorno</label><input type="date" value={eqForm.returnDate} onChange={e => setEqForm({ ...eqForm, returnDate: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} /></div>
                                </>
                            )}
                            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>Guardar Equipo</button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    )
}
