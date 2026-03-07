import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { db, storage } from '../firebase'
import {
    collection, onSnapshot, query, orderBy, addDoc,
    serverTimestamp, doc, updateDoc, getDocs, arrayUnion, arrayRemove
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuthStore } from '../store/authStore'
import {
    Image, Plus, X, Share2, MessageSquare,
    FlaskConical, Wrench, Clock, Send, Camera,
    CheckCircle2, Trash2, Loader2, User
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const REACTIONS = ['🧬', '🔬', '⚗️', '🧪', '🧠']

export default function LabFeed() {
    const location = useLocation()
    const { user, userProfile } = useAuthStore()
    const [posts, setPosts] = useState([])
    const [projects, setProjects] = useState([])
    const [selectedProjectId, setSelectedProjectId] = useState('')
    const [equipmentList, setEquipmentList] = useState([])
    const [loading, setLoading] = useState(true)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fileInputRef = useRef(null)

    // Form State
    const [text, setText] = useState('')
    const [selectedEquipment, setSelectedEquipment] = useState([])
    const [reagents, setReagents] = useState([]) // [{ name, amount, unit }]
    const [photo, setPhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)

    useEffect(() => {
        // Fetch Posts
        const q = query(collection(db, 'lab_feed'), orderBy('createdAt', 'desc'))
        const unsubPosts = onSnapshot(q, (snap) => {
            setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        })

        const fetchRefs = async () => {
            const eqSnap = await getDocs(query(collection(db, 'equipment'), orderBy('name', 'asc')))
            setEquipmentList(eqSnap.docs.map(d => ({ id: d.id, name: d.data().name })))

            const projSnap = await getDocs(collection(db, 'projects'))
            setProjects(projSnap.docs.map(d => ({ id: d.id, name: d.data().name })))
        }
        fetchRefs()

        if (location.state?.presetProject) {
            setSelectedProjectId(location.state.presetProject)
            setIsExpanded(true)
        }

        return () => unsubPosts()
    }, [location.state])

    const handlePhotoChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            setPhoto(file)
            setPhotoPreview(URL.createObjectURL(file))
        }
    }

    const addReagent = () => {
        setReagents([...reagents, { name: '', amount: '', unit: 'ml' }])
    }

    const updateReagent = (index, field, value) => {
        const newReagents = [...reagents]
        newReagents[index][field] = value
        setReagents(newReagents)
    }

    const removeReagent = (index) => {
        setReagents(reagents.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!text.trim() && !photo) return toast.error('Escribe algo o sube una foto')
        if (text.length > 280) return toast.error('El texto es demasiado largo')

        setIsSubmitting(true)
        try {
            let photoUrl = null
            if (photo) {
                const storageRef = ref(storage, `lab_feed/${Date.now()}_${photo.name}`)
                await uploadBytes(storageRef, photo)
                photoUrl = await getDownloadURL(storageRef)
            }

            const initialReactions = {}
            REACTIONS.forEach(r => initialReactions[r] = { count: 0, userIds: [] })

            await addDoc(collection(db, 'lab_feed'), {
                userId: user.uid,
                userName: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Investigador'),
                userPhoto: userProfile?.photoURL || null,
                text: text.trim(),
                equipmentUsed: selectedEquipment,
                reagentsConsumed: reagents.filter(r => r.name && r.amount),
                projectId: selectedProjectId || null,
                projectName: projects.find(p => p.id === selectedProjectId)?.name || null,
                photoUrl,
                reactions: initialReactions,
                createdAt: serverTimestamp()
            })

            // Reset
            setText('')
            setSelectedEquipment([])
            setReagents([])
            setPhoto(null)
            setPhotoPreview(null)
            setIsExpanded(false)
            toast.success('¡Publicado en el Feed!')
        } catch (error) {
            console.error(error)
            toast.error('Error al publicar')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleReaction = async (postId, emoji) => {
        const post = posts.find(p => p.id === postId)
        if (!post) return

        const currentReaction = post.reactions[emoji] || { count: 0, userIds: [] }
        const hasReacted = currentReaction.userIds.includes(user.uid)

        const postRef = doc(db, 'lab_feed', postId)

        try {
            if (hasReacted) {
                await updateDoc(postRef, {
                    [`reactions.${emoji}.count`]: currentReaction.count - 1,
                    [`reactions.${emoji}.userIds`]: arrayRemove(user.uid)
                })
            } else {
                await updateDoc(postRef, {
                    [`reactions.${emoji}.count`]: currentReaction.count + 1,
                    [`reactions.${emoji}.userIds`]: arrayUnion(user.uid)
                })
            }
        } catch (error) {
            console.error("Reaction error:", error)
        }
    }

    return (
        <div className="page-container" style={{ background: '#F5F5F5', minHeight: '100vh', paddingBottom: '120px' }}>
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#9B72CF',
                    margin: '0 0 4px 0',
                    fontFamily: "'Playfair Display', serif",
                    fontStyle: 'italic'
                }}>
                    Lab Feed
                </h1>
                <p style={{ fontSize: '15px', color: '#666', margin: 0, fontWeight: '600' }}>¿En qué está trabajando el laboratorio?</p>
            </header>

            {/* Create Post Card */}
            <div className="card" style={{ padding: '16px', borderRadius: '24px', marginBottom: '24px', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                {!isExpanded ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => setIsExpanded(true)}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {userProfile?.photoURL ? (
                                <img src={userProfile.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <User size={22} color="#9B72CF" />
                            )}
                        </div>
                        <div style={{ flex: 1, padding: '12px 20px', background: '#F8FAFC', borderRadius: '24px', color: '#94A3B8', fontSize: '15px', fontWeight: '600' }}>
                            ¿En qué estás trabajando hoy?
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>Nueva Publicación</h3>
                            <button type="button" onClick={() => setIsExpanded(false)} style={{ background: '#F1F5F9', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer' }}>
                                <X size={18} color="#64748B" />
                            </button>
                        </div>

                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value.slice(0, 280))}
                            placeholder="Describe tu experimento o avance de hoy..."
                            autoFocus
                            style={{ width: '100%', padding: '0', border: 'none', fontSize: '16px', fontWeight: '600', color: '#1A1A1A', minHeight: '100px', resize: 'none', outline: 'none', fontFamily: 'Manrope, sans-serif' }}
                        />

                        <div style={{ textAlign: 'right', fontSize: '11px', fontWeight: '800', color: text.length > 250 ? '#FF3B30' : '#CBD5E1', marginBottom: '16px', letterSpacing: '0.05em' }}>
                            {text.length} / 280
                        </div>

                        {/* Equipment Tags Search/Selection (Simplified for MVP) */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Equipos usados</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {equipmentList.map(eq => {
                                    const isSelected = selectedEquipment.includes(eq.name)
                                    return (
                                        <button
                                            key={eq.id}
                                            type="button"
                                            onClick={() => isSelected ? setSelectedEquipment(selectedEquipment.filter(n => n !== eq.name)) : setSelectedEquipment([...selectedEquipment, eq.name])}
                                            style={{
                                                padding: '6px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s',
                                                background: isSelected ? '#F0EBF8' : '#F8FAFC',
                                                color: isSelected ? '#9B72CF' : '#64748B',
                                                border: `1px solid ${isSelected ? '#9B72CF' : 'transparent'}`
                                            }}
                                        >
                                            {eq.name}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Reagents Section */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' }}>Reactivos consumidos</label>
                                <button type="button" onClick={addReagent} style={{ background: 'transparent', border: 'none', color: '#9B72CF', fontSize: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={14} /> Añadir
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {reagents.map((r, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            placeholder="Reactivo"
                                            value={r.name}
                                            onChange={(e) => updateReagent(i, 'name', e.target.value)}
                                            style={{ flex: 2, padding: '10px 14px', borderRadius: '12px', border: '1px solid #F1F5F9', background: '#F8FAFC', fontSize: '13px', fontWeight: '600' }}
                                        />
                                        <input
                                            placeholder="Cant."
                                            type="number"
                                            value={r.amount}
                                            onChange={(e) => updateReagent(i, 'amount', e.target.value)}
                                            style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid #F1F5F9', background: '#F8FAFC', fontSize: '13px', fontWeight: '600' }}
                                        />
                                        <select
                                            value={r.unit}
                                            onChange={(e) => updateReagent(i, 'unit', e.target.value)}
                                            style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid #F1F5F9', background: '#F8FAFC', fontSize: '13px', fontWeight: '600' }}
                                        >
                                            <option value="ml">ml</option>
                                            <option value="g">g</option>
                                            <option value="mg">mg</option>
                                            <option value="u">u</option>
                                        </select>
                                        <button type="button" onClick={() => removeReagent(i)} style={{ color: '#FF3B30', background: 'transparent', border: 'none', padding: '4px' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Project Link */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Vincular a Proyecto</label>
                            <select
                                value={selectedProjectId}
                                onChange={e => setSelectedProjectId(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '14px', border: '1px solid #F1F5F9', background: '#F8FAFC', fontSize: '13px', fontWeight: '600' }}
                            >
                                <option value="">Ninguno</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        {photoPreview && (
                            <div style={{ position: 'relative', marginBottom: '20px', borderRadius: '20px', overflow: 'hidden', height: '180px' }}>
                                <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null) }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.8)', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer' }}>
                                    <X size={16} color="#FF3B30" />
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current.click()}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#F8FAFC', color: '#64748B', borderRadius: '14px', border: 'none', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}
                            >
                                <Camera size={18} /> Foto
                                <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handlePhotoChange} />
                            </button>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                style={{ padding: '12px 28px', background: '#2D1B5E', color: 'white', borderRadius: '16px', border: 'none', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,27,94,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <><Send size={18} /> Publicar</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Posts Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" color="#9B72CF" size={32} /></div>
                ) : posts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 40px', background: 'white', borderRadius: '32px' }}>
                        <div style={{ background: '#F0EBF8', width: '60px', height: '60px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <FlaskConical size={32} color="#9B72CF" />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A1A' }}>Aún no hay publicaciones</h3>
                        <p style={{ fontSize: '14px', color: '#94A3B8', marginTop: '4px' }}>Comparte lo que estás haciendo hoy con el equipo.</p>
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="card" style={{ padding: '24px', borderRadius: '32px', border: '1px solid #F1F5F9' }}>
                            {/* User Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                    {post.userPhoto ? (
                                        <img src={post.userPhoto} alt={post.userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={24} color="#9B72CF" />
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: '15px', fontWeight: '900', color: '#1A1A1A', margin: 0 }}>{post.userName}</h4>
                                    <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>
                                        {post.createdAt?.toDate() ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true, locale: es }) : 'Ahora'}
                                    </span>
                                </div>
                            </div>

                            {/* Post Text */}
                            {post.text && (
                                <p style={{ fontSize: '16px', color: '#1A1A1A', margin: '0 0 16px 0', lineHeight: '1.6', fontWeight: '500', whiteSpace: 'pre-wrap' }}>
                                    {post.text}
                                </p>
                            )}

                            {/* Post Photo */}
                            {post.photoUrl && (
                                <div style={{ borderRadius: '24px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                                    <img src={post.photoUrl} alt="Post content" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block' }} />
                                </div>
                            )}

                            {/* Equipment & Reagents Tags */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                                {post.equipmentUsed?.map((eq, i) => (
                                    <span key={i} style={{ padding: '4px 12px', borderRadius: '10px', background: '#F0EBF8', color: '#9B72CF', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Wrench size={10} /> {eq}
                                    </span>
                                ))}
                                {post.reagentsConsumed?.map((r, i) => (
                                    <span key={i} style={{ padding: '4px 12px', borderRadius: '10px', background: '#F1F5F9', color: '#64748B', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FlaskConical size={10} /> {r.name} ({r.amount}{r.unit})
                                    </span>
                                ))}
                                {post.projectId && (
                                    <span style={{ padding: '4px 12px', borderRadius: '10px', background: '#E5F0FF', color: '#007AFF', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle2 size={10} /> Proyecto: {post.projectName}
                                    </span>
                                )}
                            </div>

                            {/* Reactions */}
                            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {REACTIONS.map(emoji => {
                                    const reaction = post.reactions?.[emoji] || { count: 0, userIds: [] }
                                    const isActive = reaction.userIds.includes(user.uid)
                                    return (
                                        <button
                                            key={emoji}
                                            onClick={() => handleReaction(post.id, emoji)}
                                            style={{
                                                background: isActive ? '#F0EBF8' : 'white',
                                                border: `1px solid ${isActive ? '#9B72CF' : '#F1F5F9'}`,
                                                padding: '6px 12px',
                                                borderRadius: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                fontSize: '14px'
                                            }}
                                        >
                                            <span>{emoji}</span>
                                            {reaction.count > 0 && (
                                                <span style={{ fontSize: '12px', fontWeight: '900', color: isActive ? '#9B72CF' : '#64748B' }}>
                                                    {reaction.count}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
