import { useState, useEffect } from 'react'
import { db, storage } from '../firebase'
import {
    collection, onSnapshot, query, orderBy, addDoc,
    serverTimestamp, where, getDocs
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuthStore } from '../store/authStore'
import {
    Search, Plus, FileText, Download, X,
    Filter, BookOpen, Shield, ClipboardList, Info,
    CheckCircle2, Loader2, Link as LinkIcon
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const CATEGORIES = ['Todos', 'Manuales de Equipos', 'Protocolos', 'Seguridad', 'Reglamentos', 'Otros']

export default function Documentos() {
    const { userProfile, user } = useAuthStore()
    const isAdmin = userProfile?.role === 'admin'

    const [documents, setDocuments] = useState([])
    const [equipmentList, setEquipmentList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('Todos')
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    // Form state
    const [form, setForm] = useState({
        name: '',
        category: 'Manuales de Equipos',
        relatedEquipmentId: '',
        file: null
    })

    useEffect(() => {
        // Fetch Documents
        const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'))
        const unsubDocs = onSnapshot(q, (snap) => {
            setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        })

        // Fetch Equipment for selector
        const fetchEq = async () => {
            const snap = await getDocs(query(collection(db, 'equipment'), orderBy('name', 'asc')))
            setEquipmentList(snap.docs.map(d => ({ id: d.id, name: d.data().name })))
        }
        fetchEq()

        return () => unsubDocs()
    }, [])

    const handleUpload = async (e) => {
        e.preventDefault()
        if (!form.file || !form.name) return toast.error('Completa los campos obligatorios')

        setIsUploading(true)
        try {
            const fileName = `${Date.now()}_${form.file.name}`
            const storageRef = ref(storage, `documents/${fileName}`)
            await uploadBytes(storageRef, form.file)
            const downloadURL = await getDownloadURL(storageRef)

            await addDoc(collection(db, 'documents'), {
                name: form.name,
                category: form.category,
                relatedEquipmentId: form.relatedEquipmentId || null,
                relatedEquipmentName: form.relatedEquipmentId ? equipmentList.find(e => e.id === form.relatedEquipmentId).name : null,
                fileURL: downloadURL,
                fileName: fileName,
                fileType: form.file.type,
                uploadedBy: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario'),
                userId: user.uid,
                createdAt: serverTimestamp()
            })

            toast.success('Documento guardado en la biblioteca')
            setIsUploadModalOpen(false)
            setForm({ name: '', category: 'Manuales de Equipos', relatedEquipmentId: '', file: null })
        } catch (error) {
            console.error(error)
            toast.error('Error al subir el documento')
        } finally {
            setIsUploading(false)
        }
    }

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = selectedCategory === 'Todos' || doc.category === selectedCategory
        return matchesSearch && matchesCategory
    })

    const getFileIcon = (type) => {
        if (type?.includes('pdf')) return <FileText color="#FF3B30" size={24} />
        if (type?.includes('word')) return <FileText color="#007AFF" size={24} />
        if (type?.includes('image')) return <BookOpen color="#34C759" size={24} />
        return <FileText color="#8E8E93" size={24} />
    }

    return (
        <div className="page-container" style={{ background: '#F5F5F5', minHeight: '100vh', paddingBottom: '120px' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#1A1A1A', margin: '0 0 4px 0', letterSpacing: '-0.02em', fontFamily: 'Manrope, sans-serif' }}>Biblioteca</h1>
                    <p style={{ fontSize: '14px', color: '#8E8E93', margin: 0, fontWeight: '600' }}>Documentación científica y técnica</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '16px', background: '#2D1B5E', color: 'white', border: 'none', fontWeight: '800', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,27,94,0.2)' }}
                    >
                        <Plus size={18} strokeWidth={3} />
                        Subir
                    </button>
                )}
            </header>

            {/* Search Bar - Premium Glassmorphism style */}
            <div style={{ position: 'relative', marginBottom: '24px' }}>
                <div style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
                    <Search size={20} color="#94A3B8" />
                </div>
                <input
                    type="text"
                    placeholder="Buscar por nombre o equipo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '18px 20px 18px 56px', borderRadius: '22px', border: '1px solid transparent', background: 'white', fontSize: '16px', fontWeight: '600', color: '#1A1A1A', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', outline: 'none', transition: 'all 0.3s' }}
                />
            </div>

            {/* Categories - Horizontal Scroll */}
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollbarWidth: 'none', padding: '4px 0 24px 0', margin: '0 -16px', paddingLeft: '16px' }}>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{ whiteSpace: 'nowrap', padding: '12px 20px', borderRadius: '15px', fontSize: '13px', fontWeight: '800', border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: selectedCategory === cat ? '#9B72CF' : 'white', color: selectedCategory === cat ? 'white' : '#64748B', boxShadow: selectedCategory === cat ? '0 4px 12px rgba(155,114,207,0.3)' : '0 2px 6px rgba(0,0,0,0.02)' }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Document List - Grid-ish Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" color="#9B72CF" size={32} /></div>
                ) : filteredDocs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 40px', background: 'white', borderRadius: '32px', border: '2px dashed #F1F5F9' }}>
                        <div style={{ background: '#F8FAFC', width: '64px', height: '64px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <FileText size={32} color="#CBD5E1" />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: '0 0 6px 0' }}>No se encontraron documentos</h3>
                        <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>Intenta con otra búsqueda o categoría</p>
                    </div>
                ) : (
                    filteredDocs.map(doc => (
                        <div key={doc.id} className="card" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', border: '1px solid #F1F5F9', background: 'white' }}>
                            <div style={{ display: 'flex', padding: '20px' }}>
                                {/* Icon Side */}
                                <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', flexShrink: 0 }}>
                                    {getFileIcon(doc.fileType)}
                                </div>

                                {/* Content Side */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: '900', color: '#9B72CF', background: '#F0EBF8', padding: '3px 10px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {doc.category}
                                        </span>
                                        {doc.relatedEquipmentName && (
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <LinkIcon size={12} strokeWidth={2.5} /> {doc.relatedEquipmentName}
                                            </span>
                                        )}
                                    </div>
                                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</h3>
                                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>
                                        {doc.uploadedBy} • {doc.createdAt?.toDate() ? format(doc.createdAt.toDate(), 'dd MMM yyyy', { locale: es }) : 'Reciente'}
                                    </div>
                                </div>

                                {/* Action Side */}
                                <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
                                    <a
                                        href={doc.fileURL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ width: '48px', height: '48px', borderRadius: '16px', background: '#F0EBF8', color: '#9B72CF', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
                                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <Download size={22} strokeWidth={2.5} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Upload Modal (Keep existing logic but improve styles) */}
            {isUploadModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(26, 26, 46, 0.4)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ background: 'white', width: '100%', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '32px 24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#1A1A1A', margin: 0 }}>Cargar Documento</h2>
                            <button onClick={() => setIsUploadModalOpen(false)} style={{ background: '#F1F5F9', border: 'none', padding: '8px', borderRadius: '50%', cursor: 'pointer' }}>
                                <X size={20} color="#64748B" />
                            </button>
                        </div>

                        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Nombre del documento</label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', outline: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Categoría</label>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', outline: 'none', background: 'white' }}
                                >
                                    {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Equipo Relacionado (Opcional)</label>
                                <select
                                    value={form.relatedEquipmentId}
                                    onChange={(e) => setForm({ ...form, relatedEquipmentId: e.target.value })}
                                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', outline: 'none', background: 'white' }}
                                >
                                    <option value="">No relacionado a un equipo específico</option>
                                    {equipmentList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Archivo (PDF, Word, Imágenes)</label>
                                <input
                                    type="file"
                                    required
                                    onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                                    style={{ width: '100%', padding: '12px', border: '1px dashed #CBD5E1', borderRadius: '16px' }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isUploading}
                                style={{ width: '100%', padding: '18px', borderRadius: '20px', background: '#2D1B5E', color: 'white', fontWeight: '900', border: 'none', marginTop: '12px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,27,94,0.3)' }}
                            >
                                {isUploading ? 'Subiendo...' : 'Publicar en Biblioteca'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}
