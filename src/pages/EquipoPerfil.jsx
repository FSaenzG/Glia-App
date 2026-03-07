import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db, storage } from '../firebase'
import {
    doc, onSnapshot, collection, query, where, orderBy, limit,
    updateDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage'
import { useAuthStore } from '../store/authStore'
import {
    ChevronLeft, Edit2, Shield, FileText, Download, Upload,
    AlertTriangle, History, Clock, Tag, MapPin,
    Info, Trash2, X, Lock, CheckCircle2, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function EquipoPerfil() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { userProfile } = useAuthStore()
    const isAdmin = userProfile?.role === 'admin'

    const [equipment, setEquipment] = useState(null)
    const [damageReports, setDamageReports] = useState([])
    const [usageHistory, setUsageHistory] = useState([])
    const [documents, setDocuments] = useState([])
    const [libDocuments, setLibDocuments] = useState([])
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [loading, setLoading] = useState(true)

    // Edit Form State
    const [editForm, setEditForm] = useState({})

    useEffect(() => {
        if (!id) return

        // 1. Equipment Data - Real-time
        const unsubEq = onSnapshot(doc(db, 'equipment', id), (snap) => {
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() }
                setEquipment(data)
                setEditForm(data)
                setLoading(false)
            } else {
                toast.error('Equipo no encontrado')
                navigate('/equipos')
            }
        }, (err) => {
            console.error("Error fetching equipment:", err)
            toast.error("Error al cargar el equipo")
        })

        // 2. Damage Reports - Last 5
        const qDamage = query(
            collection(db, 'damage_reports'),
            where('equipmentId', '==', id),
            orderBy('createdAt', 'desc'),
            limit(5)
        )
        const unsubDamage = onSnapshot(qDamage, (snap) => {
            setDamageReports(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.warn("Damage reports error:", err))

        // 3. Usage History - Last 10
        const qUsage = query(
            collection(db, 'reservations'),
            where('equipmentId', '==', id),
            where('status', '==', 'confirmed'),
            orderBy('date', 'desc'),
            limit(10)
        )
        const unsubUsage = onSnapshot(qUsage, (snap) => {
            setUsageHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.warn("Usage history error:", err))

        // 4. Library Documents - Filtered by current equipment
        const qLibDocs = query(
            collection(db, 'documents'),
            where('relatedEquipmentId', '==', id)
        )
        const unsubLibDocs = onSnapshot(qLibDocs, (snap) => {
            setLibDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })

        // 4. Documents from Storage
        fetchDocuments()

        return () => {
            unsubEq()
            unsubDamage()
            unsubUsage()
            unsubLibDocs()
        }
    }, [id])

    const fetchDocuments = async () => {
        try {
            const listRef = ref(storage, `equipment-docs/${id}`)
            const res = await listAll(listRef)
            const docs = await Promise.all(res.items.map(async (item) => {
                const url = await getDownloadURL(item)
                return { name: item.name, url, fullPath: item.fullPath }
            }))
            setDocuments(docs)
        } catch (error) {
            console.error("Error fetching documents:", error)
        }
    }

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
            toast.error('El archivo es demasiado grande (máx 10MB)')
            return
        }

        setIsUploading(true)
        const docPromise = (async () => {
            const storageRef = ref(storage, `equipment-docs/${id}/${file.name}`)
            await uploadBytes(storageRef, file)
            await fetchDocuments()
        })()

        toast.promise(docPromise, {
            loading: 'Subiendo documento...',
            success: 'Documento subido correctamente',
            error: 'Error al subir el documento'
        })

        try {
            await docPromise
        } finally {
            setIsUploading(false)
        }
    }

    const handleUpdate = async (e) => {
        e.preventDefault()
        try {
            await updateDoc(doc(db, 'equipment', id), {
                ...editForm,
                updatedAt: serverTimestamp()
            })
            toast.success('Equipo actualizado exitosamente')
            setIsEditModalOpen(false)
        } catch (error) {
            toast.error('Error al actualizar el equipo')
            console.error(error)
        }
    }

    const handleDelete = async () => {
        if (!window.confirm('¿ELIMINAR EQUIPO?\nEsta acción es irreversible y borrará el registro de inventario.')) return
        try {
            await deleteDoc(doc(db, 'equipment', id))
            toast.success('Equipo eliminado del sistema')
            navigate('/equipos')
        } catch (error) {
            toast.error('Error al eliminar el equipo')
            console.error(error)
        }
    }

    const getStatusStyle = (status) => {
        switch (status) {
            case 'available': return { bg: '#E8FFF0', text: '#34C759', label: 'Disponible' }
            case 'occupied': return { bg: '#FFF0F0', text: '#FF3B30', label: 'En uso' }
            case 'maintenance': return { bg: '#F1F5F9', text: '#8E8E93', label: 'Mantenimiento' }
            case 'reserved': return { bg: '#FFF8E0', text: '#FF9500', label: 'Reserva próxima' }
            default: return { bg: '#F1F5F9', text: '#64748B', label: status }
        }
    }

    const getSeverityStyle = (severity) => {
        switch (severity?.toLowerCase()) {
            case 'high': return { bg: '#FFF0F0', text: '#FF3B30', label: 'CRÍTICO' }
            case 'medium': return { bg: '#FFF8E0', text: '#FF9500', label: 'MEDIO' }
            case 'low': return { bg: '#E8FFF0', text: '#34C759', label: 'LEVE' }
            default: return { bg: '#F1F5F9', text: '#64748B', label: severity }
        }
    }

    const calculateDuration = (start, end) => {
        if (!start || !end) return '—'
        const [h1, m1] = start.split(':').map(Number)
        const [h2, m2] = end.split(':').map(Number)
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1)
        const hours = Math.floor(diff / 60)
        return hours === 1 ? '1 hora' : `${hours} horas`
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F5F5F5' }}>
            <div className="w-8 h-8 border-4 border-[#9B72CF] border-t-transparent rounded-full animate-spin" />
        </div>
    )

    const statusStyle = getStatusStyle(equipment.status)

    return (
        <div className="page-container" style={{ background: '#F5F5F5', paddingBottom: '120px' }}>
            {/* Header */}
            <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button onClick={() => navigate(-1)} style={{ background: 'white', border: 'none', padding: '10px', borderRadius: '14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex' }}>
                    <ChevronLeft size={22} color="#1A1A1A" />
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#1A1A1A', margin: 0, letterSpacing: '-0.02em' }}>{equipment.name}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '900', backgroundColor: statusStyle.bg, color: statusStyle.text, padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {statusStyle.label}
                        </span>
                        {equipment.requiresCertification && (
                            <span style={{ fontSize: '10px', fontWeight: '900', background: '#F0EBF8', color: '#9B72CF', padding: '3px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.05em' }}>
                                <Lock size={10} /> REQUIERE CERTIFICACIÓN
                            </span>
                        )}
                    </div>
                </div>
                {isAdmin && (
                    <button onClick={() => setIsEditModalOpen(true)} style={{ background: '#2D1B5E', border: 'none', padding: '12px', borderRadius: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,27,94,0.2)', display: 'flex' }}>
                        <Edit2 size={18} color="white" />
                    </button>
                )}
            </header>

            {/* Section 1: Información Técnica */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px', borderRadius: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#9B72CF' }}>
                    <div style={{ background: '#F1F5F9', padding: '8px', borderRadius: '10px' }}>
                        <Tag size={18} />
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>Información técnica</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <InfoItem label="Número de Serie" value={equipment.serialNumber} />
                    <InfoItem label="Marca" value={equipment.brand} />
                    <InfoItem label="Modelo" value={equipment.model} />
                    <InfoItem label="Ubicación" value={equipment.location} icon={<MapPin size={12} />} />
                    <InfoItem label="Adquisición" value={equipment.acquisitionDate} />
                    <InfoItem label="Último Mant." value={equipment.lastMaintenance} />
                    <InfoItem label="Próximo Mant." value={equipment.nextMaintenance} />
                    <InfoItem label="Certificación" value={equipment.requiresCertification ? 'OBLIGATORIA' : 'No requerida'} />
                </div>
                {equipment.notes && (
                    <div style={{ marginTop: '20px', padding: '16px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas adicionales</span>
                        <p style={{ fontSize: '14px', color: '#475569', margin: '6px 0 0 0', lineHeight: '1.5' }}>{equipment.notes}</p>
                    </div>
                )}
            </div>

            {/* Section 2: Documentos */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px', borderRadius: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#9B72CF' }}>
                        <div style={{ background: '#F1F5F9', padding: '8px', borderRadius: '10px' }}>
                            <FileText size={18} />
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>Documentación</h2>
                    </div>
                    {isAdmin && (
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F0EBF8', color: '#9B72CF', borderRadius: '12px', fontSize: '12px', fontWeight: '900', transition: 'all 0.2s' }}>
                            <Upload size={14} /> Subir
                            <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isUploading} />
                        </label>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {documents.length === 0 && libDocuments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', background: '#F8FAFC', borderRadius: '16px', border: '1px dashed #E2E8F0' }}>
                            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No hay documentos registrados</p>
                        </div>
                    ) : (
                        <>
                            {documents.map((doc, i) => (
                                <div key={`stor-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '16px', background: 'white', border: '1px solid #F1F5F9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
                                        <FileText size={20} />
                                    </div>
                                    <span style={{ flex: 1, fontSize: '14px', fontWeight: '700', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ width: '40px', height: '40px', borderRadius: '12px', color: '#9B72CF', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Download size={18} />
                                    </a>
                                </div>
                            ))}
                            {libDocuments.map((doc) => (
                                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '16px', background: 'white', border: '2px solid #F0EBF8', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B72CF' }}>
                                        <BookOpen size={20} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#9B72CF', textTransform: 'uppercase' }}>{doc.category}</span>
                                    </div>
                                    <a href={doc.fileURL} target="_blank" rel="noopener noreferrer" style={{ width: '40px', height: '40px', borderRadius: '12px', color: '#9B72CF', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Download size={18} />
                                    </a>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Section 3: Historial de Daños */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px', borderRadius: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#9B72CF' }}>
                    <div style={{ background: '#F1F5F9', padding: '8px', borderRadius: '10px' }}>
                        <AlertTriangle size={18} />
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>Historial de daños</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {damageReports.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8' }}>
                            <Info size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                            <p style={{ fontSize: '13px', margin: 0 }}>Sin incidencias reportadas</p>
                        </div>
                    ) : (
                        damageReports.map((report) => {
                            const sev = getSeverityStyle(report.severity)
                            return (
                                <div key={report.id} style={{ padding: '16px', borderRadius: '16px', border: '1px solid #F1F5F9', background: '#FFFFFF' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' }}>
                                            {report.createdAt?.toDate() ? format(report.createdAt.toDate(), 'dd MMM yyyy') : 'Reciente'}
                                        </span>
                                        <span style={{ fontSize: '10px', fontWeight: '900', background: sev.bg, color: sev.text, padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>{sev.label}</span>
                                    </div>
                                    <p style={{ fontSize: '14px', color: '#1A1A2E', margin: '4px 0', fontWeight: '600', lineHeight: '1.4' }}>{report.description}</p>
                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#9B72CF' }} />
                                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Reportado por: {report.userName}</span>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Section 4: Historial de Uso */}
            <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#9B72CF' }}>
                    <div style={{ background: '#F1F5F9', padding: '8px', borderRadius: '10px' }}>
                        <History size={18} />
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>Historial de uso reciente</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {usageHistory.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', margin: 0 }}>Sin historial de uso</p>
                    ) : (
                        usageHistory.map((usage) => (
                            <div key={usage.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '16px', background: '#F8FAFC' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900', color: '#64748B' }}>
                                        {usage.userName?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A1A' }}>{usage.userName}</div>
                                        <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <Calendar size={10} /> {usage.date}  <Clock size={10} style={{ marginLeft: '4px' }} /> {usage.startTime} - {usage.endTime}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: '900', color: '#9B72CF', background: '#F0EBF8', padding: '4px 10px', borderRadius: '10px' }}>
                                    {calculateDuration(usage.startTime, usage.endTime)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(26, 26, 46, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ background: 'white', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '32px 24px', animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                            <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#1A1A1A', margin: 0, letterSpacing: '-0.02em' }}>Gestionar Equipo</h2>
                            <button onClick={() => setIsEditModalOpen(false)} style={{ background: '#F1F5F9', border: 'none', padding: '10px', borderRadius: '50%', cursor: 'pointer' }}>
                                <X size={20} color="#1A1A1A" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <Input label="Nombre del equipo" value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <Input label="Marca" value={editForm.brand} onChange={v => setEditForm({ ...editForm, brand: v })} />
                                <Input label="Modelo" value={editForm.model} onChange={v => setEditForm({ ...editForm, model: v })} />
                            </div>
                            <Input label="Número de Serie" value={editForm.serialNumber} onChange={v => setEditForm({ ...editForm, serialNumber: v })} />
                            <Input label="Ubicación" value={editForm.location} onChange={v => setEditForm({ ...editForm, location: v })} />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <Input label="Último Mant." type="date" value={editForm.lastMaintenance} onChange={v => setEditForm({ ...editForm, lastMaintenance: v })} />
                                <Input label="Próximo Mant." type="date" value={editForm.nextMaintenance} onChange={v => setEditForm({ ...editForm, nextMaintenance: v })} />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#F8FAFC', borderRadius: '16px', cursor: 'pointer', border: '1px solid #E2E8F0' }}>
                                <div style={{ position: 'relative', width: '20px', height: '20px' }}>
                                    <input
                                        type="checkbox"
                                        checked={editForm.requiresCertification}
                                        onChange={e => setEditForm({ ...editForm, requiresCertification: e.target.checked })}
                                        style={{ position: 'absolute', opacity: 0, cursor: 'pointer', height: 0, width: 0 }}
                                    />
                                    <div style={{ height: '20px', width: '20px', backgroundColor: editForm.requiresCertification ? '#9B72CF' : '#FFF', borderRadius: '6px', border: `2px solid ${editForm.requiresCertification ? '#9B72CF' : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {editForm.requiresCertification && <X size={14} color="white" style={{ transform: 'rotate(45deg)' }} />}
                                    </div>
                                </div>
                                <span style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A1A' }}>Requiere certificación para reserva</span>
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas Adicionales</label>
                                <textarea
                                    value={editForm.notes}
                                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                    placeholder="Agrega especificaciones o avisos..."
                                    style={{ width: '100%', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', fontSize: '15px', height: '100px', resize: 'none', fontFamily: 'Manrope, sans-serif' }}
                                />
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '18px', borderRadius: '20px', background: '#2D1B5E', color: 'white', fontWeight: '900', border: 'none', marginTop: '12px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,27,94,0.3)' }}>
                                Guardar Cambios
                            </button>

                            <button type="button" onClick={handleDelete} style={{ width: '100%', padding: '12px', borderRadius: '20px', color: '#FF3B30', fontWeight: '800', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <Trash2 size={16} /> Eliminar Equipo del Sistema
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            `}</style>
        </div>
    )
}

function InfoItem({ label, value, icon }) {
    return (
        <div>
            <span style={{ fontSize: '10px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                {icon && <span style={{ color: '#9B72CF', display: 'flex' }}>{icon}</span>}
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A' }}>{value || '—'}</span>
            </div>
        </div>
    )
}

function Input({ label, value, onChange, type = 'text' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
            <input
                type={type}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                style={{ width: '100%', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', fontSize: '15px', fontWeight: '600', color: '#1A1A1A' }}
            />
        </div>
    )
}
