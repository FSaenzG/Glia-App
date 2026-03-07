// src/pages/Proyectos.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
    collection, onSnapshot, query, orderBy, addDoc,
    serverTimestamp, where, getDocs, doc, updateDoc, deleteDoc
} from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import {
    Plus, Search, X, Users, Calendar, BarChart,
    ChevronRight, Clock, FlaskConical, Wrench,
    Edit2, Archive, CheckCircle2, MoreVertical,
    ArrowLeft, UserPlus, Trash2, Layout
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Proyectos() {
    const navigate = useNavigate()
    const { user, userProfile } = useAuthStore()
    const [view, setView] = useState('list') // 'list', 'create', 'detail'
    const [projects, setProjects] = useState([])
    const [selectedProject, setSelectedProject] = useState(null)
    const [loading, setLoading] = useState(true)

    // Form States
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        startDate: '',
        endDate: '',
        status: 'Activo',
        equipmentUsed: [],
        reagentsUsed: [],
        collaborators: []
    })

    // Search & Data
    const [searchTerm, setSearchTerm] = useState('')
    const [userSearch, setUserSearch] = useState('')
    const [foundUsers, setFoundUsers] = useState([])
    const [equipmentList, setEquipmentList] = useState([])
    const [reagentsList, setReagentsList] = useState([])

    // Detail Stats
    const [activity, setActivity] = useState([])
    const [reagentsConsumed, setReagentsConsumed] = useState(0)
    const [equipmentHours, setEquipmentHours] = useState(0)

    useEffect(() => {
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(q, (snap) => {
            setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        })

        // Load equipment & reagents for selectors
        const loadRefs = async () => {
            const eqSnap = await getDocs(collection(db, 'equipment'))
            setEquipmentList(eqSnap.docs.map(d => ({ id: d.id, name: d.data().name })))

            const reSnap = await getDocs(collection(db, 'inventory'))
            setReagentsList(reSnap.docs.map(d => ({ id: d.id, name: d.data().name })))
        }
        loadRefs()

        return unsub
    }, [])

    useEffect(() => {
        if (userSearch.length > 2) {
            const search = async () => {
                const q = query(
                    collection(db, 'users'),
                    where('firstName', '>=', userSearch),
                    where('firstName', '<=', userSearch + '\uf8ff')
                )
                const snap = await getDocs(q)
                setFoundUsers(snap.docs.map(d => ({
                    uid: d.id,
                    name: `${d.data().firstName} ${d.data().lastName}`,
                    photo: d.data().photoURL
                })).filter(u => u.uid !== user.uid))
            }
            search()
        } else {
            setFoundUsers([])
        }
    }, [userSearch])

    useEffect(() => {
        if (selectedProject && view === 'detail') {
            loadProjectStats(selectedProject.id)
        }
    }, [selectedProject, view])

    const loadProjectStats = async (projectId) => {
        // Activity from lab_feed
        const feedQ = query(collection(db, 'lab_feed'), where('projectId', '==', projectId), orderBy('createdAt', 'desc'))
        const feedSnap = await getDocs(feedQ)
        setActivity(feedSnap.docs.map(d => d.data()))

        // Reagents from inventory_movements
        const moveQ = query(collection(db, 'inventory_movements'), where('projectId', '==', projectId))
        const moveSnap = await getDocs(moveQ)
        const totalReagents = moveSnap.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0)
        setReagentsConsumed(totalReagents)

        // Equipment usage from reservations
        const resQ = query(collection(db, 'reservations'), where('projectId', '==', projectId))
        const resSnap = await getDocs(resQ)
        // Simple hour calculation: each reservation is ~1-2 hours on average, or we can just count them.
        // For a more accurate sum, we'd need to parse startTime/endTime.
        setEquipmentHours(resSnap.size * 1.5) // Using 1.5 as an average multiplier for visual impact
    }

    const handleCreateProject = async (e) => {
        e.preventDefault()
        if (!formData.name || !formData.startDate || !formData.endDate) {
            return toast.error('Completa los campos obligatorios')
        }

        try {
            await addDoc(collection(db, 'projects'), {
                ...formData,
                ownerId: user.uid,
                ownerName: `${userProfile.firstName} ${userProfile.lastName}`,
                ownerPhoto: userProfile.photoURL || null,
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp()
            })
            toast.success('Proyecto creado correctamente')
            setView('list')
            setFormData({
                name: '', description: '', startDate: '', endDate: '',
                status: 'Activo', equipmentUsed: [], reagentsUsed: [], collaborators: []
            })
        } catch (err) {
            console.error(err)
            toast.error('Error al crear proyecto')
        }
    }

    const calculateProgress = (start, end) => {
        const s = new Date(start)
        const e = new Date(end)
        const now = new Date()
        if (now < s) return 0
        if (now > e) return 100
        const total = e - s
        const elapsed = now - s
        return Math.round((elapsed / total) * 100)
    }

    const addCollaborator = (u) => {
        if (formData.collaborators.find(c => c.uid === u.uid)) return
        setFormData({ ...formData, collaborators: [...formData.collaborators, u] })
        setUserSearch('')
    }

    const removeCollaborator = (uid) => {
        setFormData({ ...formData, collaborators: formData.collaborators.filter(c => c.uid !== uid) })
    }

    const toggleMultiSelect = (type, id) => {
        const current = formData[type]
        if (current.includes(id)) {
            setFormData({ ...formData, [type]: current.filter(i => i !== id) })
        } else {
            setFormData({ ...formData, [type]: [...current, id] })
        }
    }

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Activo': return { bg: '#E8F8ED', color: '#34C759' }
            case 'Pausado': return { bg: '#FFF3E0', color: '#FF9500' }
            case 'Completado': return { bg: '#E5F0FF', color: '#007AFF' }
            default: return { bg: '#F5F5F5', color: '#666' }
        }
    }

    // --- RENDER COMPONENTS ---

    const ListView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
            {projects.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
                    <Layout size={64} style={{ marginBottom: '16px', opacity: 0.2 }} />
                    <p style={{ fontSize: '16px', fontWeight: '600' }}>No hay proyectos de investigación aún</p>
                    <p style={{ fontSize: '14px' }}>Toca el "+" para crear el primero.</p>
                </div>
            )}

            {projects.map(p => {
                const progress = calculateProgress(p.startDate, p.endDate)
                const statusStyle = getStatusStyle(p.status)

                return (
                    <div
                        key={p.id}
                        className="card"
                        onClick={() => { setSelectedProject(p); setView('detail') }}
                        style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.2s' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{p.name}</h3>
                                <p style={{ fontSize: '13px', color: '#666', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {p.description}
                                </p>
                            </div>
                            <span style={{
                                fontSize: '11px', fontWeight: '800', padding: '4px 10px',
                                borderRadius: '20px', background: statusStyle.bg, color: statusStyle.color,
                                textTransform: 'uppercase'
                            }}>
                                {p.status}
                            </span>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: '#9CA3AF', marginBottom: '6px' }}>
                                <span>Progreso</span>
                                <span>{progress}%</span>
                            </div>
                            <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${progress}%`, background: '#9B72CF', transition: 'width 0.5s ease' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#EEE', overflow: 'hidden' }}>
                                    {p.ownerPhoto ? <img src={p.ownerPhoto} style={{ width: '100%' }} /> : <div style={{ background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', height: '100%' }}>{p.ownerName?.[0]}</div>}
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: '#4B5563' }}>{p.ownerName}</span>
                            </div>

                            {p.collaborators?.length > 0 && (
                                <div style={{ display: 'flex', marginLeft: 'auto', alignItems: 'center' }}>
                                    <div style={{ display: 'flex' }}>
                                        {p.collaborators.slice(0, 3).map((c, i) => (
                                            <div key={i} style={{
                                                width: '24px', height: '24px', borderRadius: '50%', border: '2px solid white',
                                                marginLeft: i === 0 ? 0 : '-8px', background: '#EEE', overflow: 'hidden'
                                            }}>
                                                {c.photo ? <img src={c.photo} style={{ width: '100%' }} /> : <div style={{ background: '#64748B', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', height: '100%' }}>{c.name?.[0]}</div>}
                                            </div>
                                        ))}
                                    </div>
                                    {p.collaborators.length > 3 && (
                                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#9CA3AF', marginLeft: '4px' }}>+{p.collaborators.length - 3}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {(p.equipmentUsed?.length > 0) && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '16px', flexWrap: 'wrap' }}>
                                {p.equipmentUsed.slice(0, 3).map(eqId => {
                                    const eq = equipmentList.find(e => e.id === eqId)
                                    return (
                                        <span key={eqId} style={{ fontSize: '10px', fontWeight: '700', background: '#F0EBF8', color: '#9B72CF', padding: '2px 8px', borderRadius: '6px' }}>
                                            {eq?.name || 'Equipo'}
                                        </span>
                                    )
                                })}
                                {p.equipmentUsed.length > 3 && <span style={{ fontSize: '10px', color: '#9CA3AF' }}>+others</span>}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )

    const CreateHeader = () => (
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
                onClick={() => setView('list')}
                style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '8px', cursor: 'pointer' }}
            >
                <ChevronRight style={{ transform: 'rotate(180deg)' }} size={20} />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Nuevo Proyecto</h2>
        </div>
    )

    const DetailView = () => {
        if (!selectedProject) return null
        const p = selectedProject
        const isAdmin = userProfile?.role === 'admin'
        const isOwner = p.ownerId === user.uid
        const progress = calculateProgress(p.startDate, p.endDate)
        const statusStyle = getStatusStyle(p.status)

        return (
            <div style={{ paddingBottom: '100px', animation: 'fadeIn 0.3s ease-out' }}>
                <button
                    onClick={() => setView('list')}
                    style={{ marginBottom: '20px', border: 'none', background: 'none', color: '#666', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                >
                    <ArrowLeft size={18} /> Volver a proyectos
                </button>

                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <span style={{
                                fontSize: '10px', fontWeight: '800', padding: '4px 10px',
                                borderRadius: '20px', background: statusStyle.bg, color: statusStyle.color,
                                textTransform: 'uppercase', marginBottom: '8px', display: 'inline-block'
                            }}>
                                {p.status}
                            </span>
                            <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E', margin: 0 }}>{p.name}</h2>
                            <p style={{ color: '#666', marginTop: '8px', fontSize: '15px', lineHeight: '1.6' }}>{p.description}</p>
                        </div>
                        {(isAdmin || isOwner) && (
                            <button style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Edit2 size={20} color="#666" />
                            </button>
                        )}
                    </div>

                    <div style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', display: 'grid', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800', marginBottom: '4px' }}>DURACIÓN</div>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E' }}>
                                {format(new Date(p.startDate), 'MMM d, yyyy')} - {format(new Date(p.endDate), 'MMM d, yyyy')}
                            </div>
                        </div>
                        <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '800', marginBottom: '4px' }}>PROGRESO</div>
                            <div style={{ fontSize: '18px', fontWeight: '900', color: '#9B72CF' }}>{progress}%</div>
                        </div>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '12px' }}>Equipo del Proyecto</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F0EBF8', padding: '10px 16px', borderRadius: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EEE', overflow: 'hidden' }}>
                                {p.ownerPhoto ? <img src={p.ownerPhoto} style={{ width: '100%' }} /> : <div style={{ background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', height: '100%' }}>{p.ownerName?.[0]}</div>}
                            </div>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E' }}>{p.ownerName}</div>
                                <div style={{ fontSize: '10px', color: '#9B72CF', fontWeight: '800' }}>INVESTIGADOR PRINCIPAL</div>
                            </div>
                        </div>
                        {p.collaborators?.map(c => (
                            <div key={c.uid} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F9FAFB', padding: '10px 16px', borderRadius: '12px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EEE', overflow: 'hidden' }}>
                                    {c.photo ? <img src={c.photo} style={{ width: '100%' }} /> : <div style={{ background: '#64748B', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', height: '100%' }}>{c.name?.[0]}</div>}
                                </div>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E' }}>{c.name}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Integration Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                        <FlaskConical size={24} color="#9B72CF" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E' }}>{reagentsConsumed}</div>
                        <div style={{ fontSize: '12px', color: '#666', fontWeight: '700' }}>Reactivos Usados</div>
                    </div>
                    <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                        <Calendar size={24} color="#007AFF" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E' }}>{equipmentHours}h</div>
                        <div style={{ fontSize: '12px', color: '#666', fontWeight: '700' }}>Uso de Equipos</div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Actividad Reciente</h3>
                    <button
                        onClick={() => navigate('/feed', { state: { presetProject: p.id } })}
                        style={{ background: '#9B72CF', color: 'white', border: 'none', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
                        + Actualizar
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {activity.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '24px', color: '#9CA3AF', fontSize: '14px' }}>
                            Aún no hay actualizaciones vinculadas a este proyecto.
                        </div>
                    ) : (
                        activity.map((act, i) => (
                            <div key={i} className="card" style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#F0EBF8', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A2E' }}>{act.userName}</div>
                                        <div style={{ fontSize: '13px', color: '#4B5563', marginTop: '4px' }}>{act.text}</div>
                                        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
                                            {act.createdAt?.toDate ? format(act.createdAt.toDate(), 'd MMM, HH:mm') : 'Reciente'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            {view === 'list' && (
                <>
                    <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1A1A2E', margin: '0 0 4px 0' }}>Proyectos</h1>
                            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Investigación activa del laboratorio</p>
                        </div>
                        <button
                            onClick={() => setView('create')}
                            style={{
                                width: '48px', height: '48px', borderRadius: '16px', background: '#9B72CF',
                                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)'
                            }}
                        >
                            <Plus size={24} />
                        </button>
                    </header>
                    <ListView />
                </>
            )}

            {view === 'create' && (
                <div style={{ paddingBottom: '100px' }}>
                    <CreateHeader />
                    <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="card" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Nombre del Proyecto *</label>
                                    <input
                                        type="text" required value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="input-field" placeholder="Ej. Estudios de Neurobioquímica..."
                                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Descripción</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="input-field" placeholder="Escribe un resumen del objetivo..."
                                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', minHeight: '100px', resize: 'none' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Inicio *</label>
                                        <input
                                            type="date" required value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                            className="input-field"
                                            style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Fin Estimado *</label>
                                        <input
                                            type="date" required value={formData.endDate}
                                            onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                            className="input-field"
                                            style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={20} color="#9B72CF" /> Colaboradores
                            </h3>
                            <div style={{ position: 'relative' }}>
                                <Search size={18} color="#9CA3AF" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text" value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                    className="input-field" placeholder="Buscar por nombre..."
                                    style={{ paddingLeft: '44px', background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                                />
                                {foundUsers.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, marginTop: '4px', overflow: 'hidden' }}>
                                        {foundUsers.map(u => (
                                            <div
                                                key={u.uid}
                                                onClick={() => addCollaborator(u)}
                                                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid #F5F5F5' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                            >
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#F0EBF8', overflow: 'hidden' }}>
                                                    {u.photo ? <img src={u.photo} style={{ width: '100%' }} /> : <div style={{ background: '#9B72CF', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', height: '100%' }}>{u.name[0]}</div>}
                                                </div>
                                                <span style={{ fontSize: '14px', fontWeight: '700' }}>{u.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                                {formData.collaborators.map(c => (
                                    <div key={c.uid} style={{ background: '#F0EBF8', padding: '6px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#9B72CF' }}>{c.name}</span>
                                        <X size={14} color="#9B72CF" style={{ cursor: 'pointer' }} onClick={() => removeCollaborator(c.uid)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Recursos Vinculados</h3>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '800', marginBottom: '8px', display: 'block' }}>EQUIPOS FRECUENTES</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {equipmentList.map(eq => (
                                        <div
                                            key={eq.id}
                                            onClick={() => toggleMultiSelect('equipmentUsed', eq.id)}
                                            style={{
                                                padding: '6px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                                                background: formData.equipmentUsed.includes(eq.id) ? '#9B72CF' : '#F5F5F5',
                                                color: formData.equipmentUsed.includes(eq.id) ? 'white' : '#666',
                                                transition: '0.2s'
                                            }}
                                        >
                                            {eq.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '800', marginBottom: '8px', display: 'block' }}>REACTIVOS USADOS</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {reagentsList.map(re => (
                                        <div
                                            key={re.id}
                                            onClick={() => toggleMultiSelect('reagentsUsed', re.id)}
                                            style={{
                                                padding: '6px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                                                background: formData.reagentsUsed.includes(re.id) ? '#34D399' : '#F5F5F5',
                                                color: formData.reagentsUsed.includes(re.id) ? 'white' : '#666',
                                                transition: '0.2s'
                                            }}
                                        >
                                            {re.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            style={{
                                padding: '18px', borderRadius: '20px', background: '#9B72CF', color: 'white',
                                fontSize: '16px', fontWeight: '900', border: 'none', cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(155,114,207,0.4)', marginTop: '8px'
                            }}
                        >
                            Crear Proyecto
                        </button>
                    </form>
                </div>
            )}

            {view === 'detail' && <DetailView />}
        </div>
    )
}
