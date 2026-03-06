// src/pages/AdminPanel.jsx
import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
    collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc
} from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import {
    Users, Settings, ShieldCheck, Activity,
    Search, UserPlus, Filter, ChevronRight,
    MoreVertical, Mail, Trash2, Ban, X, Key, Briefcase, Plus, Edit2
} from 'lucide-react'

const TABS = ['Usuarios', 'Auditoría', 'Equipos', 'Invitaciones', 'Configuración']

export default function AdminPanel() {
    const { userProfile, user } = useAuthStore()
    const [activeTab, setActiveTab] = useState('Usuarios')

    const [usersList, setUsersList] = useState([])
    const [auditLogs, setAuditLogs] = useState([])
    const [equipmentList, setEquipmentList] = useState([])
    const [invitations, setInvitations] = useState([])

    const [search, setSearch] = useState('')
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({ email: '', role: 'estudiante', group: 'Laboratorio' })

    const [isUserModalOpen, setIsUserModalOpen] = useState(false)
    const [userEditForm, setUserEditForm] = useState({ id: null, role: '', group: '', isActive: true, certificationsText: '' })

    const [isEqModalOpen, setIsEqModalOpen] = useState(false)
    const [eqForm, setEqForm] = useState({ id: null, name: '', status: 'available', location: '', maintenanceNote: '', returnDate: '' })

    const [auditStartDate, setAuditStartDate] = useState('')
    const [auditEndDate, setAuditEndDate] = useState('')

    const [labSettings, setLabSettings] = useState({ regulations: '', emergencyProtocol: '', contacts: [] })

    // Listeners
    useEffect(() => {
        let unsubUsers = () => { };
        let unsubLogs = () => { };
        let unsubEq = () => { };
        let unsubInv = () => { };

        if (activeTab === 'Usuarios') {
            unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
                setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
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
        } else if (activeTab === 'Invitaciones') {
            const q = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'))
            unsubInv = onSnapshot(q, (snap) => {
                setInvitations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            })
        } else if (activeTab === 'Configuración') {
            unsubInv = onSnapshot(doc(db, 'settings', 'main'), (snap) => {
                if (snap.exists()) setLabSettings(snap.data())
            })
        }

        return () => {
            unsubUsers();
            unsubLogs();
            unsubEq();
            unsubInv();
        }
    }, [activeTab])

    const handleInvite = async (e) => {
        e.preventDefault()
        if (!inviteForm.email.trim()) return

        try {
            // Check if user already exists
            const currentUsers = await getDocs(collection(db, 'users'))
            const exists = currentUsers.docs.some(d => d.data().email === inviteForm.email.trim())
            if (exists) {
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

            await addAuditLog(
                user.uid,
                `${userProfile?.firstName} ${userProfile?.lastName}`,
                'invitation_created',
                `Invitación enviada a ${inviteForm.email.trim()}`,
                'admin'
            )

            toast.success('Usuario agregado. Ya puede registrarse en la app.')
            setIsInviteModalOpen(false)
            setInviteForm({ email: '', role: 'estudiante', group: 'Laboratorio' })
        } catch (error) {
            console.error('Error in invite:', error)
            toast.error('Hubo un error al enviar la invitación')
        }
    }

    const handleSaveEquipment = async (e) => {
        e.preventDefault()
        if (!eqForm.name.trim()) return

        try {
            if (eqForm.id) {
                await updateDoc(doc(db, 'equipment', eqForm.id), {
                    name: eqForm.name,
                    status: eqForm.status,
                    location: eqForm.location,
                    maintenanceNote: eqForm.status === 'maintenance' ? eqForm.maintenanceNote : '',
                    returnDate: eqForm.status === 'maintenance' ? eqForm.returnDate : ''
                })
                toast.success('Equipo actualizado')
            } else {
                await addDoc(collection(db, 'equipment'), {
                    name: eqForm.name,
                    status: eqForm.status,
                    location: eqForm.location,
                    maintenanceNote: eqForm.status === 'maintenance' ? eqForm.maintenanceNote : '',
                    returnDate: eqForm.status === 'maintenance' ? eqForm.returnDate : '',
                    createdAt: serverTimestamp()
                })
                toast.success('Equipo añadido')
            }
            setIsEqModalOpen(false)
            setEqForm({ id: null, name: '', status: 'available', location: '', maintenanceNote: '', returnDate: '' })
        } catch (error) {
            console.error(error)
            toast.error('Error al guardar equipo')
        }
    }

    const handleDeleteEquipment = async (id, name) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar el equipo "${name}"?`)) return
        try {
            await deleteDoc(doc(db, 'equipment', id))
            toast.success('Equipo eliminado')
        } catch (error) {
            console.error(error)
            toast.error('Error al eliminar equipo')
        }
    }

    const handleUpdateUser = async (e) => {
        e.preventDefault()
        try {
            const certsArray = userEditForm.certificationsText
                ? userEditForm.certificationsText.split(',').map(c => c.trim()).filter(c => c)
                : []

            await updateDoc(doc(db, 'users', userEditForm.id), {
                role: userEditForm.role,
                group: userEditForm.group,
                isActive: userEditForm.isActive,
                certifications: certsArray
            })
            toast.success('Usuario actualizado')
            setIsUserModalOpen(false)
        } catch (error) {
            console.error('Error in user update:', error)
            toast.error('Error al actualizar el usuario')
        }
    }

    const filteredUsers = usersList.filter(u => {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()
        const term = search.toLowerCase()
        return name.includes(term) || u.email?.toLowerCase().includes(term)
    })

    const handleSaveSettings = async () => {
        try {
            const settingsRef = doc(db, 'settings', 'main')
            // Using updateDoc directly might fail if document doesn't exist, handle nicely
            try {
                await updateDoc(settingsRef, labSettings)
            } catch (err) {
                // If it doesn't exist, create it (a trick without importing setDoc)
                await db.collection('settings').doc('main').set(labSettings)
            }
            toast.success('Configuración guardada')
        } catch (err) {
            console.error(err)
            toast.error('Error guardando configuración')
        }
    }

    const filteredAuditLogs = auditLogs.filter(log => {
        if (!auditStartDate && !auditEndDate) return true;
        const logDateObj = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();
        const logTime = logDateObj.setHours(0, 0, 0, 0);

        if (auditStartDate) {
            const start = new Date(auditStartDate).setHours(0, 0, 0, 0);
            if (logTime < start) return false;
        }
        if (auditEndDate) {
            const end = new Date(auditEndDate).setHours(0, 0, 0, 0);
            if (logTime > end) return false;
        }
        return true;
    })

    return (
        <div className="page-container" style={{ paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E' }}>Administración</h1>
                <button style={{ background: '#F0EBF8', color: '#9B72CF', padding: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>
                    <Settings size={22} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#F5F5F5', padding: '4px', borderRadius: '12px', marginBottom: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: '1 0 auto', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                            background: activeTab === tab ? '#FFFFFF' : 'transparent',
                            color: activeTab === tab ? '#9B72CF' : '#666666',
                            boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Users Tab */}
            {activeTab === 'Usuarios' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={18} color="#9CA3AF" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o correo..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="input-field"
                                style={{ paddingLeft: '44px', background: '#F5F5F5', border: 'none', height: '52px' }}
                            />
                        </div>
                        <button
                            onClick={() => setIsInviteModalOpen(true)}
                            style={{ width: '52px', height: '52px', borderRadius: '16px', background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                            <UserPlus size={24} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredUsers.map(u => (
                            <div key={u.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B72CF', fontWeight: '800', flexShrink: 0 }}>
                                        {u.firstName ? u.firstName.charAt(0).toUpperCase() : <Users size={18} />}
                                    </div>
                                    <div style={{ overflow: 'hidden' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.firstName} {u.lastName}</h3>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#9B72CF', background: '#F0EBF8', padding: '2px 8px', borderRadius: '8px' }}>{u.role?.toUpperCase()}</span>
                                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#666666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.group}</span>
                                            {u.isActive === false && (
                                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#EF4444', background: '#FEF2F2', padding: '2px 8px', borderRadius: '8px' }}>SUSPENDIDO</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setUserEditForm({
                                            id: u.id,
                                            role: u.role || 'estudiante',
                                            group: u.group || 'Laboratorio',
                                            isActive: u.isActive !== false,
                                            certificationsText: (u.certifications || []).join(', ')
                                        })
                                        setIsUserModalOpen(true)
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#D1D5DB', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Edit2 size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Audit Logs Tab */}
            {activeTab === 'Auditoría' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: '800', color: '#1A1A2E' }}>Fecha Inicio</label>
                            <input type="date" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} className="input-field" style={{ background: '#F5F5F5', border: 'none' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: '800', color: '#1A1A2E' }}>Fecha Fin</label>
                            <input type="date" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} className="input-field" style={{ background: '#F5F5F5', border: 'none' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredAuditLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No hay registros en este rango.</div>
                        ) : (
                            filteredAuditLogs.map(log => (
                                <div key={log.id} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', borderLeft: '4px solid #9B72CF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{log.action}</span>
                                        <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '700' }}>
                                            {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'Reciente'}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#666666', margin: '0 0 8px 0' }}>{log.detail}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Users size={12} color="#9CA3AF" />
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF' }}>{log.userName}</span>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#D1D5DB' }}>| {log.page}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* Equipment Tab */}
            {activeTab === 'Equipos' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                        <button
                            onClick={() => {
                                setEqForm({ id: null, name: '', status: 'available', location: '' })
                                setIsEqModalOpen(true)
                            }}
                            style={{ background: '#9B72CF', color: 'white', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                            <Plus size={18} /> Nuevo Equipo
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {equipmentList.map(eq => (
                            <div key={eq.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{eq.name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: eq.status === 'available' ? '#34C759' : eq.status === 'in_use' ? '#FF9500' : '#FF3B30' }} />
                                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#666666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {eq.status === 'available' ? 'Disponible' : eq.status === 'in_use' ? 'En Uso' : eq.status === 'maintenance' ? 'Mantenimiento' : eq.status}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '4px 0 0 0' }}>Ubicación: {eq.location || 'N/A'}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                                    <button
                                        onClick={() => {
                                            setEqForm({ id: eq.id, name: eq.name, status: eq.status, location: eq.location, maintenanceNote: eq.maintenanceNote || '', returnDate: eq.returnDate || '' })
                                            setIsEqModalOpen(true)
                                        }}
                                        style={{ background: '#F5F5F5', color: '#666666', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                                        style={{ background: '#FFF0EF', color: '#FF3B30', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Invitations Tab */}
            {activeTab === 'Invitaciones' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {invitations.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No hay invitaciones activas.</div>
                        ) : (
                            invitations.map(inv => (
                                <div key={inv.id} className="card" style={{ padding: '16px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: inv.used ? '#D1D5DB' : '#34C759' }} />
                                    <div style={{ paddingLeft: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{inv.email}</h3>
                                            <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 8px', borderRadius: '8px', background: inv.used ? '#F5F5F5' : '#E8F8ED', color: inv.used ? '#9CA3AF' : '#1A7A3A' }}>
                                                {inv.used ? 'USADA' : 'ACTIVA'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#666666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px' }}>{inv.role}</span>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#666666', background: '#F5F5F5', padding: '2px 8px', borderRadius: '8px' }}>{inv.group}</span>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>
                                            Enviada: {inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : ''}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* Configuración Tab */}
            {activeTab === 'Configuración' && (
                <section style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Reglamento del Laboratorio</h3>
                            <textarea
                                value={labSettings.regulations}
                                onChange={e => setLabSettings({ ...labSettings, regulations: e.target.value })}
                                className="input-field"
                                style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', minHeight: '150px', resize: 'vertical' }}
                                placeholder="Escribe el reglamento oficial aquí..."
                            />
                        </div>

                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Protocolo S.O.S (Emergencias)</h3>
                            <textarea
                                value={labSettings.emergencyProtocol}
                                onChange={e => setLabSettings({ ...labSettings, emergencyProtocol: e.target.value })}
                                className="input-field"
                                style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', minHeight: '150px', resize: 'vertical' }}
                                placeholder="Escribe los pasos en caso de emergencia..."
                            />
                        </div>

                        <button onClick={handleSaveSettings} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                            Guardar Configuración
                        </button>
                    </div>
                </section>
            )}

            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', position: 'relative', animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Invitar Usuario</h2>
                            <button onClick={() => setIsInviteModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} color="#666666" />
                            </button>
                        </div>

                        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Mail size={16} color="#9B72CF" /> Correo Institucional
                                </label>
                                <input
                                    type="email"
                                    required
                                    placeholder="correo@javeriana.edu.co"
                                    value={inviteForm.email}
                                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Key size={16} color="#9B72CF" /> Rol
                                </label>
                                <select
                                    value={inviteForm.role}
                                    onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                >
                                    <option value="estudiante">Estudiante / Pasante</option>
                                    <option value="profesor_asignado">Profesor Asignado</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Briefcase size={16} color="#9B72CF" /> Grupo de Investigación
                                </label>
                                <select
                                    value={inviteForm.group}
                                    onChange={e => setInviteForm({ ...inviteForm, group: e.target.value })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                >
                                    <option value="Laboratorio">Laboratorio General</option>
                                    <option value="Neurobioquímica">Neurobioquímica</option>
                                    <option value="Bioquímica">Bioquímica</option>
                                    <option value="Nutrición">Nutrición</option>
                                </select>
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                                Guardar Invitación
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Equipment Modal */}
            {isEqModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', position: 'relative', animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{eqForm.id ? 'Editar Equipo' : 'Añadir Equipo'}</h2>
                            <button onClick={() => setIsEqModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} color="#666666" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Nombre del Equipo
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={eqForm.name}
                                    onChange={e => setEqForm({ ...eqForm, name: e.target.value })}
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Estado
                                </label>
                                <select
                                    value={eqForm.status}
                                    onChange={e => setEqForm({ ...eqForm, status: e.target.value })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                >
                                    <option value="available">Disponible</option>
                                    <option value="in_use">En Uso</option>
                                    <option value="maintenance">Mantenimiento</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Ubicación Física
                                </label>
                                <input
                                    type="text"
                                    value={eqForm.location}
                                    onChange={e => setEqForm({ ...eqForm, location: e.target.value })}
                                    className="input-field"
                                    style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                    placeholder="Ej. Cuarto 2"
                                />
                            </div>

                            {eqForm.status === 'maintenance' && (
                                <>
                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            Motivo / Nota de Mantenimiento
                                        </label>
                                        <textarea
                                            value={eqForm.maintenanceNote}
                                            onChange={e => setEqForm({ ...eqForm, maintenanceNote: e.target.value })}
                                            className="input-field"
                                            style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            Fecha Estimada de Retorno
                                        </label>
                                        <input
                                            type="date"
                                            value={eqForm.returnDate}
                                            onChange={e => setEqForm({ ...eqForm, returnDate: e.target.value })}
                                            className="input-field"
                                            style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                        />
                                    </div>
                                </>
                            )}

                            <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                                Guardar Equipo
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {isUserModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', position: 'relative', animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Modificar Usuario</h2>
                            <button onClick={() => setIsUserModalOpen(false)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} color="#666666" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Key size={16} color="#9B72CF" /> Rol
                                </label>
                                <select
                                    value={userEditForm.role}
                                    onChange={e => setUserEditForm({ ...userEditForm, role: e.target.value })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                >
                                    <option value="estudiante">Estudiante / Pasante</option>
                                    <option value="profesor_asignado">Profesor Asignado</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Briefcase size={16} color="#9B72CF" /> Grupo de Investigación
                                </label>
                                <select
                                    value={userEditForm.group}
                                    onChange={e => setUserEditForm({ ...userEditForm, group: e.target.value })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                >
                                    <option value="Laboratorio">Laboratorio General</option>
                                    <option value="Neurobioquímica">Neurobioquímica</option>
                                    <option value="Bioquímica">Bioquímica</option>
                                    <option value="Nutrición">Nutrición</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Settings size={16} color="#9B72CF" /> Estado de la cuenta
                                </label>
                                <select
                                    value={userEditForm.isActive ? 'active' : 'suspended'}
                                    onChange={e => setUserEditForm({ ...userEditForm, isActive: e.target.value === 'active' })}
                                    className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', color: userEditForm.isActive ? '#1A1A2E' : '#FF3B30' }}
                                >
                                    <option value="active">Activo</option>
                                    <option value="suspended">Suspendido (Restringido)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldCheck size={16} color="#9B72CF" /> Certificaciones
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#F5F5F5', padding: '12px', borderRadius: '12px' }}>
                                    {['Microscopio de Fluorescencia', 'Termociclador PCR'].map(cert => {
                                        const currentCerts = userEditForm.certificationsText ? userEditForm.certificationsText.split(',').map(c => c.trim()) : []
                                        const isChecked = currentCerts.includes(cert)
                                        return (
                                            <label key={cert} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#1A1A2E', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                        const newVal = e.target.checked
                                                        let outCerts = [...currentCerts]
                                                        if (newVal) outCerts.push(cert)
                                                        else outCerts = outCerts.filter(c => c !== cert)
                                                        setUserEditForm({ ...userEditForm, certificationsText: outCerts.join(', ') })
                                                    }}
                                                    style={{ width: '18px', height: '18px', accentColor: '#9B72CF' }}
                                                />
                                                {cert}
                                            </label>
                                        )
                                    })}
                                </div>
                                <input
                                    type="text"
                                    value={userEditForm.certificationsText}
                                    onChange={e => setUserEditForm({ ...userEditForm, certificationsText: e.target.value })}
                                    className="input-field"
                                    placeholder="Otras certificaciones (separadas por coma)"
                                    style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', marginTop: '8px' }}
                                />
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#9B72CF', color: 'white', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                                Actualizar Usuario
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
