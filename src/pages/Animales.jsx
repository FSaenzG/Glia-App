// src/pages/Animales.jsx
import { useState, useEffect, useRef } from 'react'
import { db, storage } from '../firebase'
import {
    collection, onSnapshot, query, orderBy, addDoc,
    serverTimestamp, where, getDocs, doc, updateDoc,
    deleteDoc, limit
} from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import {
    Plus, Search, X, Users, Calendar, Activity,
    ChevronRight, Clock, Trash2, ArrowLeft,
    FileText, User, Tag, Heart, Save, Download,
    Megaphone, CheckCircle2, AlertCircle, History
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { sendNotification } from '../hooks/useNotifications'

export default function Animales() {
    const { user, userProfile } = useAuthStore()
    const [view, setView] = useState('list') // 'list', 'register', 'profile', 'availability'
    const [animals, setAnimals] = useState([])
    const [announcements, setAnnouncements] = useState([])
    const [selectedAnimal, setSelectedAnimal] = useState(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('Todos')
    const [projects, setProjects] = useState([])
    const [usersList, setUsersList] = useState([])

    // Registration Form
    const [regForm, setRegForm] = useState({
        id: '',
        species: 'Ratón',
        strain: '',
        birthDate: '',
        initialWeight: '',
        projectId: '',
        projectName: '',
        responsibleId: '',
        responsibleName: '',
        responsiblePhoto: '',
        notes: '',
        protocolNumber: ''
    })

    // Procedure Form
    const [procForm, setProcForm] = useState({
        type: '',
        dose: '',
        observations: ''
    })

    // Health Status Change
    const [healthUpdating, setHealthUpdating] = useState(false)

    // Availability Form
    const [availForm, setAvailForm] = useState({
        species: 'Ratón',
        quantity: 1,
        fromDate: '',
        untilDate: '',
        notes: ''
    })

    useEffect(() => {
        // Fetch Animals
        const qAnimals = query(collection(db, 'animals'), orderBy('createdAt', 'desc'))
        const unsubAnimals = onSnapshot(qAnimals, (snap) => {
            setAnimals(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        })

        // Fetch Availability Announcements
        const qAvail = query(collection(db, 'animal_availability'), where('active', '==', true))
        const unsubAvail = onSnapshot(qAvail, (snap) => {
            setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })

        // Load Projects & Users for selectors
        const loadRefs = async () => {
            const projSnap = await getDocs(collection(db, 'projects'))
            setProjects(projSnap.docs.map(d => ({ id: d.id, name: d.data().name })))

            const userSnap = await getDocs(collection(db, 'users'))
            setUsersList(userSnap.docs.map(d => ({
                uid: d.id,
                name: `${d.data().firstName} ${d.data().lastName}`,
                photo: d.data().photoURL
            })))
        }
        loadRefs()

        return () => {
            unsubAnimals()
            unsubAvail()
        }
    }, [])

    const handleRegister = async (e) => {
        e.preventDefault()
        if (!regForm.id || !regForm.strain || !regForm.birthDate) {
            return toast.error('Completa los campos obligatorios')
        }

        try {
            const project = projects.find(p => p.id === regForm.projectId)
            const responsible = usersList.find(u => u.uid === regForm.responsibleId)

            await addDoc(collection(db, 'animals'), {
                ...regForm,
                projectName: project?.name || 'Experimental',
                responsibleName: responsible?.name || 'Sin asignar',
                responsiblePhoto: responsible?.photo || null,
                currentWeight: Number(regForm.initialWeight),
                healthStatus: 'Saludable',
                status: 'Activo',
                weightLog: [{ date: new Date(), weight: Number(regForm.initialWeight) }],
                createdAt: serverTimestamp(),
                createdBy: user.uid
            })

            toast.success('Animal registrado correctamente')
            setView('list')
            setRegForm({
                id: '', species: 'Ratón', strain: '', birthDate: '', initialWeight: '',
                projectId: '', projectName: '', responsibleId: '', responsibleName: '', responsiblePhoto: '',
                notes: '', protocolNumber: ''
            })
        } catch (err) {
            toast.error('Error al registrar animal')
        }
    }

    const handleUpdateHealth = async (newStatus) => {
        if (!selectedAnimal) return
        try {
            await updateDoc(doc(db, 'animals', selectedAnimal.id), {
                healthStatus: newStatus
            })
            setSelectedAnimal({ ...selectedAnimal, healthStatus: newStatus })
            toast.success('Estado de salud actualizado')
        } catch (err) {
            toast.error('Error al actualizar estado')
        }
    }

    const handleRegisterProcedure = async (e) => {
        e.preventDefault()
        if (!procForm.type) return toast.error('Ingresa el tipo de procedimiento')

        try {
            const procData = {
                ...procForm,
                date: new Date(),
                performedBy: `${userProfile?.firstName} ${userProfile?.lastName}`,
                userId: user.uid
            }
            await addDoc(collection(db, 'animals', selectedAnimal.id, 'procedures'), procData)
            toast.success('Procedimiento registrado')
            setProcForm({ type: '', dose: '', observations: '' })
        } catch (err) {
            toast.error('Error al registrar procedimiento')
        }
    }

    const handleEndExperiment = async () => {
        const method = prompt('Método de finalización:')
        if (!method) return

        try {
            await updateDoc(doc(db, 'animals', selectedAnimal.id), {
                status: 'Finalizado',
                endMethod: method,
                endDate: new Date()
            })
            setSelectedAnimal({ ...selectedAnimal, status: 'Finalizado', endMethod: method, endDate: new Date() })
            toast.success('Experimento finalizado')
        } catch (err) {
            toast.error('Error al finalizar')
        }
    }

    const handlePostAvailability = async (e) => {
        e.preventDefault()
        try {
            const snap = await addDoc(collection(db, 'animal_availability'), {
                ...availForm,
                active: true,
                postedBy: `${userProfile.firstName} ${userProfile.lastName}`,
                postedById: user.uid,
                timestamp: serverTimestamp()
            })

            // Notify all users (Mocked list fetch for notification)
            const allUsers = await getDocs(collection(db, 'users'))
            const notifyPromises = allUsers.docs.map(u =>
                sendNotification(u.id, {
                    type: 'animal_availability',
                    message: `Nueva disponibilidad: ${availForm.quantity} ${availForm.species}(s) anunciados por ${userProfile.firstName}.`,
                    timestamp: new Date()
                })
            )
            await Promise.all(notifyPromises)

            toast.success('Disponibilidad anunciada')
            setView('list')
            setAvailForm({ species: 'Ratón', quantity: 1, fromDate: '', untilDate: '', notes: '' })
        } catch (err) {
            toast.error('Error al publicar anuncio')
        }
    }

    const handleCloseAnnouncement = async (id) => {
        try {
            await updateDoc(doc(db, 'animal_availability', id), { active: false })
            toast.success('Anuncio cerrado')
        } catch (err) {
            toast.error('Error al cerrar anuncio')
        }
    }

    const exportPDF = async (animal) => {
        const doc = new jsPDF()
        doc.setFontSize(18)
        doc.text(`Registro de Bienestar: ${animal.id}`, 20, 20)
        doc.setFontSize(12)
        doc.text(`Especie: ${animal.species} (${animal.strain})`, 20, 30)
        doc.text(`Proyecto: ${animal.projectName}`, 20, 38)
        doc.text(`Responsable: ${animal.responsibleName}`, 20, 46)
        doc.text(`Estado: ${animal.healthStatus} - ${animal.status}`, 20, 54)

        const procSnap = await getDocs(collection(db, 'animals', animal.id, 'procedures'))
        const procs = procSnap.docs.map(d => [
            format(d.data().date.toDate(), 'dd/MM/yyyy'),
            d.data().type,
            d.data().dose || '-',
            d.data().observations,
            d.data().performedBy
        ])

        doc.autoTable({
            startY: 65,
            head: [['Fecha', 'Procedimiento', 'Dosis', 'Observaciones', 'Realizado por']],
            body: procs
        })

        doc.save(`Animal_${animal.id}_Log.pdf`)
    }

    const filteredAnimals = animals.filter(a => {
        if (filter === 'Ratones') return a.species === 'Ratón'
        if (filter === 'Peces Zebra') return a.species === 'Pez Zebra'
        if (filter === 'Activos') return a.status === 'Activo'
        if (filter === 'Finalizados') return a.status === 'Finalizado'
        return true
    })

    return (
        <div className="page-container" style={{ paddingBottom: '120px' }}>
            {view === 'list' && (
                <>
                    <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E', margin: '0 0 4px 0' }}>Bienestar Animal</h1>
                            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Registro y trazabilidad</p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {(userProfile?.role === 'admin' || userProfile?.role === 'profesor') && (
                                <>
                                    <button
                                        onClick={() => setView('availability')}
                                        style={{ background: '#FFF7ED', color: '#EA580C', border: 'none', padding: '12px 16px', borderRadius: '16px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(234,88,12,0.1)' }}
                                    >
                                        <Megaphone size={20} /> <span className="hidden md:inline">Anunciar Disponibilidad</span>
                                    </button>
                                    <button
                                        onClick={() => setView('register')}
                                        style={{ width: '48px', height: '48px', borderRadius: '16px', background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}
                                    >
                                        <Plus size={24} />
                                    </button>
                                </>
                            )}
                        </div>
                    </header>

                    {announcements.map(ann => (
                        <div key={ann.id} style={{ background: '#FFFBEB', border: '2px solid #FEF3C7', borderRadius: '24px', padding: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.4s ease' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <div style={{ fontSize: '32px' }}>{ann.species === 'Ratón' ? '🐭' : '🐟'}</div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '900', color: '#92400E', textTransform: 'uppercase' }}>Disponibilidad anunciada</div>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E' }}>{ann.quantity} {ann.species}(s) - {ann.notes}</div>
                                    <div style={{ fontSize: '12px', color: '#B45309', fontWeight: '700' }}>Disponible del {ann.fromDate} al {ann.untilDate} • Por {ann.postedBy}</div>
                                </div>
                            </div>
                            {(userProfile?.role === 'admin' || userProfile?.uid === ann.postedById) && (
                                <button onClick={() => handleCloseAnnouncement(ann.id)} style={{ background: '#FDE68A', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: '800', color: '#92400E', cursor: 'pointer' }}>Cerrar</button>
                            )}
                        </div>
                    ))}

                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '24px', paddingBottom: '4px' }}>
                        {['Todos', 'Ratones', 'Peces Zebra', 'Activos', 'Finalizados'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '10px 20px', borderRadius: '14px', whiteSpace: 'nowrap', border: 'none', fontWeight: '800', fontSize: '13px', cursor: 'pointer',
                                    background: filter === f ? '#9B72CF' : 'white',
                                    color: filter === f ? 'white' : '#64748B',
                                    boxShadow: filter === f ? '0 4px 12px rgba(155,114,207,0.3)' : '0 2px 8px rgba(0,0,0,0.05)'
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                        {filteredAnimals.map(a => (
                            <div
                                key={a.id}
                                className="card"
                                onClick={() => { setSelectedAnimal(a); setView('profile') }}
                                style={{ padding: '20px', cursor: 'pointer', border: '1px solid #F1F5F9' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <span style={{ background: a.species === 'Ratón' ? '#F0EBF8' : '#E5F0FF', color: a.species === 'Ratón' ? '#9B72CF' : '#007AFF', padding: '4px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '900' }}>
                                        {a.id}
                                    </span>
                                    <span style={{
                                        background: a.healthStatus === 'Saludable' ? '#E8F8ED' : a.healthStatus === 'En observación' ? '#FFF3E0' : '#FEF2F2',
                                        color: a.healthStatus === 'Saludable' ? '#22C55E' : a.healthStatus === 'En observación' ? '#FF9500' : '#EF4444',
                                        padding: '4px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase'
                                    }}>
                                        {a.healthStatus}
                                    </span>
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '4px' }}>{a.species} - {a.strain}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#64748B', fontSize: '13px', marginBottom: '16px', fontWeight: '600' }}>
                                    <span>{a.currentWeight}g</span>
                                    <span>•</span>
                                    <span>Actualizado {format(a.createdAt?.toDate() || new Date(), 'd MMM')}</span>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EEE', overflow: 'hidden' }}>
                                        {a.responsiblePhoto ? <img src={a.responsiblePhoto} style={{ width: '100%' }} /> : <User size={16} color="#94A3B8" style={{ margin: '8px' }} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '800', textTransform: 'uppercase' }}>Responsable</div>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E' }}>{a.responsibleName}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#9B72CF' }}>
                                    <Users size={12} style={{ marginRight: '4px' }} /> {a.projectName}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {view === 'register' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => setView('list')} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '8px', cursor: 'pointer' }}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={20} /></button>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Registrar Nuevo Animal</h2>
                    </header>
                    <form onSubmit={handleRegister} className="card" style={{ padding: '24px', color: '#1A1A2E' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Identificador ID *</label>
                                <input type="text" required value={regForm.id} onChange={e => setRegForm({ ...regForm, id: e.target.value })} className="input-field" placeholder="Ej. RAT-042" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Especie *</label>
                                <select value={regForm.species} onChange={e => setRegForm({ ...regForm, species: e.target.value })} className="input-field" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                    <option value="Ratón">Ratón</option>
                                    <option value="Pez Zebra">Pez Zebra</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Cepa/Línea *</label>
                            <input type="text" required value={regForm.strain} onChange={e => setRegForm({ ...regForm, strain: e.target.value })} className="input-field" placeholder="Ej. C57BL/6J" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Fecha Nacimiento</label>
                                <input type="date" required value={regForm.birthDate} onChange={e => setRegForm({ ...regForm, birthDate: e.target.value })} className="input-field" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Peso Inicial (g)</label>
                                <input type="number" required value={regForm.initialWeight} onChange={e => setRegForm({ ...regForm, initialWeight: e.target.value })} className="input-field" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Proyecto Asignado</label>
                            <select value={regForm.projectId} onChange={e => setRegForm({ ...regForm, projectId: e.target.value })} className="input-field" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                <option value="">Seleccionar proyecto...</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Usuario Responsable</label>
                            <select value={regForm.responsibleId} onChange={e => setRegForm({ ...regForm, responsibleId: e.target.value })} className="input-field" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                <option value="">Seleccionar responsable...</option>
                                {usersList.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                            </select>
                        </div>
                        {userProfile?.role === 'admin' && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Número de Protocolo Ético</label>
                                <input type="text" value={regForm.protocolNumber} onChange={e => setRegForm({ ...regForm, protocolNumber: e.target.value })} className="input-field" placeholder="Ej. PUJ-2024-ETH-001" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }} />
                            </div>
                        )}
                        <button type="submit" style={{ width: '100%', padding: '18px', background: '#9B72CF', color: 'white', borderRadius: '16px', border: 'none', fontSize: '16px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 16px rgba(155,114,207,0.4)', marginTop: '8px' }}>Registrar Animal</button>
                    </form>
                </div>
            )}

            {view === 'profile' && selectedAnimal && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button onClick={() => setView('list')} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '8px', cursor: 'pointer' }}><ArrowLeft size={20} /></button>
                            <div>
                                <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E', margin: 0 }}>Perfil {selectedAnimal.id}</h1>
                                <span style={{ fontSize: '14px', color: '#666', fontWeight: '600' }}>{selectedAnimal.strain} • {selectedAnimal.healthStatus}</span>
                            </div>
                        </div>
                        <button onClick={() => exportPDF(selectedAnimal)} style={{ padding: '10px 16px', borderRadius: '12px', background: '#F0EBF8', color: '#9B72CF', border: 'none', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <Download size={18} /> Exportar Log
                        </button>
                    </header>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="card" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: '8px' }}><Heart size={20} color="#9B72CF" /> Estado de Salud</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {['Saludable', 'En observación', 'Crítico'].map(s => (
                                        <button
                                            key={s}
                                            onClick={() => handleUpdateHealth(s)}
                                            style={{
                                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer',
                                                background: selectedAnimal.healthStatus === s ? (s === 'Saludable' ? '#22C55E' : s === 'En observación' ? '#FF9500' : '#EF4444') : '#F1F5F9',
                                                color: selectedAnimal.healthStatus === s ? 'white' : '#64748B'
                                            }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                {selectedAnimal.protocolNumber && (
                                    <div style={{ marginTop: '20px', padding: '12px', background: '#F0FDF4', borderRadius: '12px', border: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={16} color="#22C55E" />
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#166534' }}>Prot. Ético: {selectedAnimal.protocolNumber}</span>
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: '#1A1A2E' }}>Información</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800' }}>ESPECIE</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700' }}>{selectedAnimal.species}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800' }}>CEPA</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700' }}>{selectedAnimal.strain}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800' }}>PROYECTO</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700' }}>{selectedAnimal.projectName}</div>
                                    </div>
                                    <div style={{ marginTop: '12px', padding: '12px', background: '#F8FAFC', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '800' }}>PESO ACTUAL</div>
                                        <div style={{ fontSize: '20px', fontWeight: '900', color: '#1A1A2E' }}>{selectedAnimal.currentWeight}g</div>
                                    </div>
                                </div>
                                {selectedAnimal.status === 'Activo' && (
                                    <button onClick={handleEndExperiment} style={{ width: '100%', marginTop: '20px', padding: '14px', borderRadius: '12px', border: '1px solid #EF4444', color: '#EF4444', background: 'transparent', fontWeight: '800', cursor: 'pointer' }}>Finalizar Experimento</button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="card" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: '8px' }}><History size={20} color="#9B72CF" /> Cronología de Procedimientos</h3>
                                <form onSubmit={handleRegisterProcedure} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', marginBottom: '24px' }}>
                                    <input type="text" placeholder="Procedimiento (ej. Inyección IP)" value={procForm.type} onChange={e => setProcForm({ ...procForm, type: e.target.value })} className="input-field" style={{ fontSize: '13px' }} />
                                    <input type="text" placeholder="Dosis/Obv" value={procForm.observations} onChange={e => setProcForm({ ...procForm, observations: e.target.value })} className="input-field" style={{ fontSize: '13px' }} />
                                    <button type="submit" style={{ padding: '0 20px', background: '#9B72CF', color: 'white', borderRadius: '12px', border: 'none', fontWeight: '800', cursor: 'pointer' }}>Registrar</button>
                                </form>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Procedimientos log fetch would happen here, showing dummy for now */}
                                    <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '16px', borderLeft: '4px solid #9B72CF' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '14px' }}>Registro Inicial</span>
                                            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{format(selectedAnimal.createdAt?.toDate() || new Date(), 'dd/MM/yyyy')}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#64748B' }}>Ingreso al bioterio, peso inicial {selectedAnimal.initialWeight}g</div>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: '#1A1A2E' }}>Log de Peso</h3>
                                <div style={{ height: '200px', width: '100%', background: '#F8FAFC', borderRadius: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '20px' }}>
                                    {/* Mini SVG Chart placeholder */}
                                    <svg viewBox="0 0 100 40" style={{ width: '100%', height: '100%' }}>
                                        <polyline
                                            fill="none"
                                            stroke="#9B72CF"
                                            strokeWidth="2"
                                            points="0,30 20,28 40,25 60,32 80,22 100,20"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {view === 'availability' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => setView('list')} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '8px', cursor: 'pointer' }}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={20} /></button>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Anunciar Disponibilidad</h2>
                    </header>
                    <form onSubmit={handlePostAvailability} className="card" style={{ padding: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Especie</label>
                                <select value={availForm.species} onChange={e => setAvailForm({ ...availForm, species: e.target.value })} className="input-field" style={{ background: '#F9FAFB' }}>
                                    <option value="Ratón">Ratón</option>
                                    <option value="Pez Zebra">Pez Zebra</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Cantidad</label>
                                <input type="number" required min="1" value={availForm.quantity} onChange={e => setAvailForm({ ...availForm, quantity: e.target.value })} className="input-field" style={{ background: '#F9FAFB' }} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Disponible desde</label>
                                <input type="date" required value={availForm.fromDate} onChange={e => setAvailForm({ ...availForm, fromDate: e.target.value })} className="input-field" style={{ background: '#F9FAFB' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Disponible hasta</label>
                                <input type="date" required value={availForm.untilDate} onChange={e => setAvailForm({ ...availForm, untilDate: e.target.value })} className="input-field" style={{ background: '#F9FAFB' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', display: 'block' }}>Notas / Detalles</label>
                            <textarea value={availForm.notes} onChange={e => setAvailForm({ ...availForm, notes: e.target.value })} className="input-field" placeholder="Ej. Disponibles para cultivo celular, cepa C57BL/6J..." style={{ minHeight: '100px', background: '#F9FAFB', resize: 'none' }} />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '18px', background: '#EA580C', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(234,88,12,0.3)' }}>Publicar Anuncio</button>
                    </form>
                </div>
            )}
        </div>
    )
}
