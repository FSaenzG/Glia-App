// src/pages/DamageReportPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { db } from '../firebase'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'

export default function DamageReportPage() {
    const navigate = useNavigate()
    const { userProfile, user } = useAuthStore()

    const [equipmentList, setEquipmentList] = useState([])
    const [equipmentId, setEquipmentId] = useState('')
    const [severity, setSeverity] = useState('medium') // low, medium, high
    const [description, setDescription] = useState('')
    const [photoFile, setPhotoFile] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        const fetchEquipment = async () => {
            const snap = await getDocs(collection(db, 'equipment'))
            const eq = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
            setEquipmentList(eq)
            if (eq.length > 0) setEquipmentId(eq[0].id)
        }
        fetchEquipment()
    }, [])

    const handlePhotoChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('La imagen no debe superar los 5MB')
                return
            }
            setPhotoFile(file)
            setPhotoPreview(URL.createObjectURL(file))
        }
    }

    const removePhoto = () => {
        setPhotoFile(null)
        setPhotoPreview(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!description.trim()) {
            return toast.error('Por favor describe el problema.')
        }
        if (!equipmentId || !user) return

        setIsSubmitting(true)
        try {
            let photoUrl = null

            if (photoFile) {
                const storage = getStorage()
                const storageRef = ref(storage, `damage_reports/${user.uid}_${Date.now()}_${photoFile.name}`)
                const snapshot = await uploadBytes(storageRef, photoFile)
                photoUrl = await getDownloadURL(snapshot.ref)
            }

            const selectedEq = equipmentList.find(e => e.id === equipmentId)

            await addDoc(collection(db, 'damage_reports'), {
                equipmentId: selectedEq.id,
                equipmentName: selectedEq.name,
                userId: user.uid,
                userName: `${userProfile?.firstName} ${userProfile?.lastName}`,
                description: description.trim(),
                severity: severity,
                status: 'reported',
                photoUrl: photoUrl,
                reportedAt: serverTimestamp()
            })

            await addAuditLog(user.uid, `${userProfile.firstName} ${userProfile.lastName}`, 'damage_reported', `Reporte de daño en ${selectedEq.name} (${severity})`, 'damage')

            toast.success('Reporte enviado correctamente. El administrador ha sido notificado.')

            setEquipmentId(equipmentList.length > 0 ? equipmentList[0].id : '')
            setDescription('')
            setSeverity('medium')
            removePhoto()

            navigate('/')
        } catch (err) {
            console.error('Error reporting damage:', err)
            toast.error('Hubo un error al enviar el reporte.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="page-container" style={{ paddingBottom: '100px', background: '#FFFFFF', minHeight: '100vh', margin: 0, maxWidth: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button onClick={() => navigate(-1)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <ArrowLeft size={20} color="#1A1A2E" />
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Reportar Daño</h1>
            </div>

            <form style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Equipment Dropdown */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Equipo Afectado</label>
                    <select
                        className="input-field"
                        value={equipmentId}
                        onChange={(e) => setEquipmentId(e.target.value)}
                        style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', fontSize: '15px' }}>
                        {equipmentList.map(eq => (
                            <option key={eq.id} value={eq.id}>{eq.name}</option>
                        ))}
                    </select>
                </div>

                {/* Description Textarea */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Descripción del problema</label>
                    <textarea
                        placeholder="Ej. El lente de 40x presenta una mancha o rayón interno que impide la correcta visualización de las muestras..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{ width: '100%', height: '120px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: '16px', padding: '16px', fontSize: '14px', fontFamily: 'inherit', resize: 'none', outline: 'none' }}
                    />
                </div>

                {/* Severity Pills */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Nivel de Gravedad</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div
                            onClick={() => setSeverity('low')}
                            style={{ flex: 1, padding: '12px 0', textAlign: 'center', borderRadius: '12px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: severity === 'low' ? '2px solid #34C759' : '1px solid #E0E0E0', background: severity === 'low' ? '#E8F8ED' : '#FFFFFF', color: severity === 'low' ? '#1A7A3A' : '#666666' }}
                        >
                            Leve
                        </div>
                        <div
                            onClick={() => setSeverity('medium')}
                            style={{ flex: 1, padding: '12px 0', textAlign: 'center', borderRadius: '12px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: severity === 'medium' ? '2px solid #FF9500' : '1px solid #E0E0E0', background: severity === 'medium' ? '#FFF3E0' : '#FFFFFF', color: severity === 'medium' ? '#CC5500' : '#666666' }}
                        >
                            Moderado
                        </div>
                        <div
                            onClick={() => setSeverity('high')}
                            style={{ flex: 1, padding: '12px 0', textAlign: 'center', borderRadius: '12px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: severity === 'high' ? '2px solid #FF3B30' : '1px solid #E0E0E0', background: severity === 'high' ? '#FFF0EF' : '#FFFFFF', color: severity === 'high' ? '#CC0000' : '#666666' }}
                        >
                            Grave
                        </div>
                    </div>
                </div>

                {/* Photo Upload Area */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Evidencia Fotográfica</label>
                    {!photoPreview ? (
                        <label style={{ width: '100%', height: '140px', background: '#F9F9F9', border: '2px dashed #D1D5DB', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer' }}>
                            <div style={{ width: '48px', height: '48px', background: '#FFFFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                <Camera size={24} color="#9CA3AF" />
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#666666' }}>Subir fotos del daño</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                style={{ display: 'none' }}
                            />
                        </label>
                    ) : (
                        <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '16px', overflow: 'hidden' }}>
                            <img src={photoPreview} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                                type="button"
                                onClick={removePhoto}
                                style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    style={{
                        width: '100%', height: '56px', background: '#FF3B30', color: 'white', borderRadius: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', fontWeight: '800', border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(255,59,48,0.3)', marginTop: '8px', opacity: isSubmitting ? 0.7 : 1
                    }}>
                    {isSubmitting ? (
                        <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin-submit 0.8s linear infinite' }} />
                    ) : (
                        <>Enviar Reporte <Send size={18} strokeWidth={2.5} /></>
                    )}
                </button>
                <style>{`
                    @keyframes spin-submit { to { transform: rotate(360deg); } }
                `}</style>
            </form>
        </div>
    )
}
