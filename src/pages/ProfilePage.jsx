// src/pages/ProfilePage.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { logoutUser } from '../hooks/useAuth'
import { db } from '../firebase'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, Settings, LogOut, ChevronRight, Activity, Users, MapPin, FlaskConical, Target } from 'lucide-react'

export default function MiLabPage() {
    const navigate = useNavigate()
    const { userProfile, user, setUserProfile } = useAuthStore()

    const [teamMembers, setTeamMembers] = useState([])
    const [equipmentList, setEquipmentList] = useState([])
    const [uploadingImage, setUploadingImage] = useState(false)
    const [labHealth, setLabHealth] = useState({ score: 100, status: 'Óptimo', color: '#34C759' })
    const fileInputRef = useRef(null)

    const groupName = userProfile?.group || 'Laboratorio'
    const role = userProfile?.role || 'estudiante'

    useEffect(() => {
        if (!user || !groupName) return

        const fetchLabData = async () => {
            try {
                // Fetch team members
                const userQ = query(collection(db, 'users'), where('group', '==', groupName))
                const userSnap = await getDocs(userQ)
                const members = userSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                    if (a.role === 'admin') return -1
                    if (b.role === 'admin') return 1
                    return (a.firstName || '').localeCompare(b.firstName || '')
                })
                setTeamMembers(members)

                // Fetch equipment (assuming equipment has 'group' or we show all for now if no group specified)
                // Let's query all equipment for this example, or filter if equipment has group
                const eqSnap = await getDocs(collection(db, 'equipment'))
                const eqs = eqSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                // If the app uses global equipment, we show it, else we filter
                setEquipmentList(eqs)

                // Visual Health Check - e.g. based on active equipment vs maintenance
                const activeEqs = eqs.filter(eq => eq.status !== 'maintenance').length
                const totalEqs = eqs.length > 0 ? eqs.length : 1
                const healthScore = Math.round((activeEqs / totalEqs) * 100)

                let healthStatus = 'Óptimo'
                let healthColor = '#34C759'
                if (healthScore < 50) { healthStatus = 'Crítico'; healthColor = '#FF3B30' }
                else if (healthScore < 80) { healthStatus = 'Atención'; healthColor = '#FF9500' }

                setLabHealth({ score: healthScore, status: healthStatus, color: healthColor })

            } catch (err) {
                console.error('Error fetching Mi Lab data:', err)
            }
        }
        fetchLabData()
    }, [user, groupName])

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0]
        if (!file || !user) return
        if (file.size > 2 * 1024 * 1024) {
            toast.error('La imagen no debe superar los 2MB')
            return
        }

        setUploadingImage(true)
        try {
            const storage = getStorage()
            const storageRef = ref(storage, `profiles/${user.uid}_${Date.now()}_${file.name}`)
            const snapshot = await uploadBytes(storageRef, file)
            const photoUrl = await getDownloadURL(snapshot.ref)

            await updateDoc(doc(db, 'users', user.uid), {
                photoURL: photoUrl
            })

            setUserProfile({ ...userProfile, photoURL: photoUrl })
            toast.success('Foto de perfil actualizada')
        } catch (err) {
            console.error('Error uploading photo:', err)
            toast.error('Error al subir la imagen')
        } finally {
            setUploadingImage(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleLogout = async () => {
        try {
            await logoutUser()
            toast.success('Sesión cerrada')
        } catch {
            navigate('/login')
        }
    }

    const displayName = userProfile?.firstName ? `${userProfile.firstName} ${userProfile.lastName}` : 'Usuario'
    const photoURL = userProfile?.photoURL || ''

    return (
        <div className="page-container" style={{ paddingBottom: '100px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E' }}>Mi Lab</h1>
                    <span style={{ background: '#F0EBF8', color: '#9B72CF', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
                        {groupName}
                    </span>
                </div>
                <button onClick={handleLogout} style={{ background: '#FFF0EF', border: 'none', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <LogOut size={20} color="#FF3B30" />
                </button>
            </div>

            {/* Profile Overview (My Profile) */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '20px', gap: '20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'relative' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F0EBF8', border: '3px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {photoURL ? (
                            <img src={photoURL} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span style={{ fontSize: '32px', fontWeight: '800', color: '#9B72CF' }}>
                                {displayName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        style={{ position: 'absolute', bottom: -4, right: -4, width: '28px', height: '28px', borderRadius: '50%', background: '#9B72CF', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(155,114,207,0.4)', opacity: uploadingImage ? 0.7 : 1 }}>
                        <Camera size={14} strokeWidth={2.5} />
                    </button>
                    <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{displayName}</h2>
                    <p style={{ fontSize: '14px', color: '#666666', margin: '0 0 8px 0', textTransform: 'capitalize' }}>{role}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Target size={16} color="#9B72CF" />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A2E' }}>{userProfile?.points || 0} Pts</span>
                    </div>
                </div>
            </div>

            {/* Health Visually */}
            <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={20} color="#1A1A2E" />
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Salud del Laboratorio</h3>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: labHealth.color }}>{labHealth.status}</span>
                </div>
                <div style={{ width: '100%', height: '12px', background: '#F5F5F5', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${labHealth.score}%`, height: '100%', background: labHealth.color, borderRadius: '6px', transition: 'width 1s ease-in-out' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#666666', fontWeight: '600' }}>Equipos Operativos</span>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{labHealth.score}%</span>
                </div>
            </div>

            {/* Team Members */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Users size={20} color="#1A1A2E" />
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Mi Grupo ({teamMembers.length})</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {teamMembers.map(member => (
                        <div key={member.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F0EBF8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                {member.photoURL ? (
                                    <img src={member.photoURL} alt={member.firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: '18px', fontWeight: '800', color: '#9B72CF' }}>
                                        {(member.firstName || 'U').charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>
                                        {member.firstName} {member.lastName}
                                    </h4>
                                    {member.role === 'admin' && (
                                        <span style={{ background: '#FFF3E0', color: '#FF9500', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '800' }}>LÍDER</span>
                                    )}
                                </div>
                                <p style={{ fontSize: '13px', color: '#666666', margin: 0, textTransform: 'capitalize' }}>{member.role}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Equipment List */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <FlaskConical size={20} color="#1A1A2E" />
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Equipos ({equipmentList.length})</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {equipmentList.map(eq => (
                        <div key={eq.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {eq.photoUrl ? (
                                    <img src={eq.photoUrl} alt={eq.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                                ) : (
                                    <FlaskConical size={24} color="#9CA3AF" />
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{eq.name}</h4>
                                    <span style={{
                                        background: eq.status === 'maintenance' ? '#FFF0EF' : '#E8F8ED',
                                        color: eq.status === 'maintenance' ? '#FF3B30' : '#34C759',
                                        padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800'
                                    }}>
                                        {eq.status === 'maintenance' ? 'MANTENIMIENTO' : 'ACTIVO'}
                                    </span>
                                </div>
                                <p style={{ fontSize: '13px', color: '#666666', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <MapPin size={12} /> {eq.location || 'Laboratorio'}
                                </p>
                            </div>
                        </div>
                    ))}
                    {equipmentList.length === 0 && (
                        <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginTop: '16px' }}>No hay equipos registrados.</p>
                    )}
                </div>
            </div>

        </div>
    )
}
