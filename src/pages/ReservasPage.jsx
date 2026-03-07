// src/pages/ReservasPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, getDocs, getDoc, deleteDoc, orderBy } from 'firebase/firestore'
import { addDays, format, parseISO, differenceInMinutes, addHours } from 'date-fns'
import { es } from 'date-fns/locale'

import {
    Calendar, Trash2, CheckCircle2, CalendarPlus,
    ShieldAlert, Lock, Check, ChevronLeft, ChevronRight, Clock, Info
} from 'lucide-react'
import { sendNotification } from '../hooks/useNotifications'

const TIME_BLOCKS = Array.from({ length: 17 }, (_, i) => `${(i + 6).toString().padStart(2, '0')}:00`) // 06:00 to 22:00

const updatePointsAndLevel = async (userId, pointsToAdd) => {
    try {
        const userRef = doc(db, 'users', userId)
        const snap = await getDoc(userRef)
        if (!snap.exists()) return

        const newPoints = (snap.data().points || 0) + pointsToAdd
        let newLevel = 'Novato'
        if (newPoints >= 50) newLevel = 'Estudiante'
        if (newPoints >= 150) newLevel = 'Investigador Junior'
        if (newPoints >= 300) newLevel = 'Investigador Senior'
        if (newPoints >= 1000) newLevel = 'Maestro Científico'

        await updateDoc(userRef, { points: newPoints, level: newLevel })
        return newPoints
    } catch (e) {
        console.warn('Could not update points:', e)
        return null
    }
}

export default function ReservasPage() {
    const navigate = useNavigate()
    const { userProfile, user, setUserProfile } = useAuthStore()

    const [activeTab, setActiveTab] = useState('Nueva Reserva')
    const [step, setStep] = useState(1)

    const resetFlow = () => {
        setStep(1)
        setSelectedEq(null)
        setStartTime(null)
        setEndTime(null)
        setSelectedDateId(0)
    }

    const handleTabChange = (tab) => {
        setActiveTab(tab)
        if (tab === 'Nueva Reserva') resetFlow()
    }

    const [dates, setDates] = useState([])
    const [selectedDateId, setSelectedDateId] = useState(0)

    const [equipmentList, setEquipmentList] = useState([])
    const [selectedEq, setSelectedEq] = useState(null)

    const [reservations, setReservations] = useState([])
    const [myReservations, setMyReservations] = useState([])
    const [projects, setProjects] = useState([])
    const [selectedProjectId, setSelectedProjectId] = useState('')

    // Time Selection
    const [startTime, setStartTime] = useState(null)
    const [endTime, setEndTime] = useState(null)

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [successData, setSuccessData] = useState(null)

    useEffect(() => {
        const generated = Array.from({ length: 14 }, (_, i) => {
            const d = addDays(new Date(), i)
            return {
                id: i,
                dateObj: d,
                dateStr: format(d, 'yyyy-MM-dd'),
                day: i === 0 ? 'HOY' : format(d, 'EEE', { locale: es }).toUpperCase().slice(0, 3),
                num: format(d, 'd')
            }
        })
        setDates(generated)
    }, [])

    useEffect(() => {
        const q = query(collection(db, 'equipment'), orderBy('sortOrder', 'asc'))
        const unsub = onSnapshot(q, (snap) => {
            let eqData = snap.docs.map(d => ({ id: d.id, ...d.data() }))

            // Manual fallback for specific order if sortOrder is not set yet
            const manualOrder = [
                "Cabina de Cultivo 1", "Cabina de Cultivo 2", "Cabina de Cultivo 3",
                "Cabina de Cultivo 4", "Cabina de Cultivo 5", "Cabina de Cultivo 6",
                "Cabina de Bacterias", "Cabina de Extracción",
                "Microscopio de Fluorescencia", "Termociclador PCR"
            ]

            eqData.sort((a, b) => {
                if (a.sortOrder && b.sortOrder) return a.sortOrder - b.sortOrder
                const idxA = manualOrder.indexOf(a.name)
                const idxB = manualOrder.indexOf(b.name)
                if (idxA !== -1 && idxB !== -1) return idxA - idxB
                if (idxA !== -1) return -1
                if (idxB !== -1) return 1
                return a.name.localeCompare(b.name)
            })

            setEquipmentList(eqData)
        })
        return unsub
    }, [])

    useEffect(() => {
        if (!user) return
        const q = query(collection(db, 'projects'))
        const unsub = onSnapshot(q, (snap) => {
            const allProj = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            const myProj = allProj.filter(p => p.ownerId === user.uid || (p.collaborators || []).find(c => c.uid === user.uid))
            setProjects(myProj)
        })
        return unsub
    }, [user])

    useEffect(() => {
        if (!dates[selectedDateId] || !selectedEq) return

        const q = query(
            collection(db, 'reservations'),
            where('date', '==', dates[selectedDateId].dateStr),
            where('equipmentId', '==', selectedEq.id),
            where('status', '==', 'confirmed')
        )
        const unsub = onSnapshot(q, (snap) => {
            const res = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setReservations(res)
        })
        return unsub
    }, [selectedDateId, selectedEq, dates])

    // "Mis Reservas" tab: for admins show ALL reservations, for users only theirs
    useEffect(() => {
        if (activeTab === 'Mis Reservas' && user) {
            const today = new Date().toISOString().split('T')[0]
            const isAdmin = userProfile?.role === 'admin'

            // Admin sees all confirmed reservations; user sees only their own
            const q = isAdmin
                ? query(collection(db, 'reservations'), where('status', '==', 'confirmed'))
                : query(collection(db, 'reservations'), where('userId', '==', user.uid), where('status', '==', 'confirmed'))

            const unsub = onSnapshot(q, (snap) => {
                const allRes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                const futureDocs = allRes.filter(d => d.date >= today)
                futureDocs.sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date)
                    return (a.startTime || '').localeCompare(b.startTime || '')
                })
                setMyReservations(futureDocs)
            })
            return unsub
        }
    }, [activeTab, user, userProfile])

    const getOccupiedBlocks = () => {
        const occupied = {}
        reservations.forEach(r => {
            const startIdx = TIME_BLOCKS.indexOf(r.startTime)
            let endStr = r.endTime
            if (endStr === '24:00') endStr = '23:00'
            const endIdx = TIME_BLOCKS.indexOf(endStr)

            const maxIdx = endIdx === -1 ? TIME_BLOCKS.length : endIdx;
            for (let i = startIdx; i < maxIdx; i++) {
                if (i >= 0 && i < TIME_BLOCKS.length) {
                    occupied[TIME_BLOCKS[i]] = r.userName
                }
            }
        })
        return occupied
    }

    const occupied = getOccupiedBlocks()

    const handleConfirm = async () => {
        if (!startTime || !endTime || !selectedEq || !dates[selectedDateId] || !user) return

        setIsSubmitting(true)
        try {
            const currentDay = dates[selectedDateId]
            await addDoc(collection(db, 'reservations'), {
                equipmentId: selectedEq.id,
                equipmentName: selectedEq.name,
                userId: user.uid,
                userName: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario'),
                userGroup: userProfile?.group || '',
                date: currentDay.dateStr,
                startTime,
                endTime,
                projectId: selectedProjectId || null,
                projectName: projects.find(p => p.id === selectedProjectId)?.name || null,
                status: 'confirmed',
                createdAt: serverTimestamp(),
            })

            const finalLogName = (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario')
            await addAuditLog(user.uid, finalLogName, 'reservation_created', `Reserva en ${selectedEq.name} el ${currentDay.dateStr} ${startTime}-${endTime}`, 'reservas')

            // Send Notification
            await sendNotification(user.uid, {
                type: 'reservation_confirmed',
                message: `Tu reserva de ${selectedEq.name} fue confirmada para el ${currentDay.dateStr} a las ${startTime}`
            })

            setSuccessData({
                eqName: selectedEq.name,
                dateStr: currentDay.dateStr,
                startTime: startTime,
                endTime: endTime,
                displayDate: format(currentDay.dateObj, "EEEE d 'de' MMMM", { locale: es })
            })
        } catch (err) {
            console.error(err)
            toast.error('Hubo un error al confirmar la reserva')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCancelReservation = async (reservation) => {
        if (!confirm('¿Estás seguro de cancelar esta reserva?')) return;

        try {
            await updateDoc(doc(db, 'reservations', reservation.id), {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            })

            // Calculate points
            // Parse target reservation start datetime
            const d = parseISO(reservation.date)
            // startTime like "08:00"
            if (reservation.startTime) {
                const [h, m] = reservation.startTime.split(':')
                d.setHours(h, m, 0)

                const now = new Date()
                const minutesDiff = differenceInMinutes(d, now)

                if (minutesDiff >= 120) { // More than 2 hours
                    const newPts = await updatePointsAndLevel(user.uid, 15)
                    toast.success('Reserva cancelada. ¡+15 puntos por cancelar con anticipación!')
                    if (newPts !== null) setUserProfile({ ...userProfile, points: newPts })
                } else {
                    toast.success('Reserva cancelada exitosamente.')
                }
            }

            await addAuditLog(user.uid, `${userProfile?.firstName} ${userProfile?.lastName}`, 'reservation_cancelled', `Canceló reserva de ${reservation.equipmentName}`, 'reservas')

            // Send Notification
            await sendNotification(reservation.userId, {
                type: 'reservation_cancelled',
                message: `Tu reserva de ${reservation.equipmentName} para el ${reservation.date} fue cancelada`
            })

        } catch (err) {
            console.error('Error cancelling reservation:', err)
            toast.error('Hubo un problema al cancelar la reserva.')
        }
    }

    const handleAdminDeleteReservation = async (reservation) => {
        const confirmed = window.confirm(
            `¿Eliminar esta reserva?\n\n` +
            `Equipo: ${reservation.equipmentName}\n` +
            `Usuario: ${reservation.userName || 'Desconocido'}\n` +
            `Fecha: ${reservation.date} • ${reservation.startTime} - ${reservation.endTime}\n\n` +
            `Esta acción no se puede deshacer.`
        )
        if (!confirmed) return

        try {
            await deleteDoc(doc(db, 'reservations', reservation.id))
            const adminName = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'Admin'
            await addAuditLog(
                user.uid,
                adminName,
                'reservation_deleted',
                `Admin eliminó reserva de ${reservation.userName || 'usuario'} en ${reservation.equipmentName} (${reservation.date})`,
                'reservas'
            )

            // Send Notification to user (deleted by admin)
            await sendNotification(reservation.userId, {
                type: 'reservation_cancelled',
                message: `Tu reserva de ${reservation.equipmentName} para el ${reservation.date} fue cancelada por el administrador`
            })

            toast.success('Reserva eliminada correctamente.')
        } catch (err) {
            console.error('Error deleting reservation:', err)
            toast.error('No se pudo eliminar la reserva.')
        }
    }

    // Event handlers for direct changes no longer used in stepped flow

    const handleAddToGoogleCalendar = (eqName, dateStr, startTime, endTime) => {
        const formatGCalDate = (dt, time) => {
            const cleanDate = dt.replace(/-/g, '');
            let [h, min] = time.split(':');
            return `${cleanDate}T${h}${min}00`;
        }

        const startStr = formatGCalDate(dateStr, startTime);
        const endStr = formatGCalDate(dateStr, endTime);

        const title = encodeURIComponent(`Reserva: ${eqName}`);
        const details = encodeURIComponent(`Reserva gestionada via Glia App.\nEquipo: ${eqName}\nFecha: ${dateStr}\nHorario: ${startTime} - ${endTime}`);
        const location = encodeURIComponent('Laboratorio Glia - PUJ');

        const gcalUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}&sf=true&output=xml`;

        window.open(gcalUrl, '_blank');
    }

    if (!dates.length) return null;

    if (successData) {
        return (
            <div className="page-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#F8FAFC' }}>
                <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '48px 32px', borderRadius: '32px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', animation: 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)', background: 'white' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#E8F8ED', color: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: 'inset 0 0 0 2px rgba(52, 199, 89, 0.1)' }}>
                        <CheckCircle2 size={42} strokeWidth={2.5} />
                    </div>
                    <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#1A1A2E', marginBottom: '12px', letterSpacing: '-0.02em' }}>¡Todo Listo!</h2>
                    <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '32px', lineHeight: '1.5' }}>Tu reserva en <strong>{successData.eqName}</strong> ha sido confirmada correctamente.</p>

                    <div style={{ background: '#F8FAFC', padding: '24px', borderRadius: '24px', textAlign: 'left', marginBottom: '32px', border: '1px solid #F1F5F9' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FECHA</span>
                            <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', textTransform: 'capitalize', marginTop: '4px' }}>{successData.displayDate}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HORARIO</span>
                            <div style={{ fontSize: '20px', fontWeight: '900', color: '#9B72CF', marginTop: '4px' }}>{successData.startTime} — {successData.endTime}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            onClick={() => handleAddToGoogleCalendar(successData.eqName, successData.dateStr, successData.startTime, successData.endTime)}
                            style={{ width: '100%', padding: '18px', borderRadius: '20px', background: '#1A1A2E', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(26,26,46,0.2)', transition: 'transform 0.2s' }}
                        >
                            Agregar a Google Calendar
                        </button>

                        <button
                            onClick={() => { setSuccessData(null); resetFlow(); }}
                            style={{ width: '100%', padding: '18px', borderRadius: '20px', background: '#F1F5F9', color: '#1A1A2E', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer' }}
                        >
                            Reservar otro equipo
                        </button>

                        <button
                            onClick={() => { setSuccessData(null); resetFlow(); navigate('/'); }}
                            style={{ width: '100%', padding: '12px', borderRadius: '20px', background: 'transparent', color: '#64748B', fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                        >
                            Volver al Inicio
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container" style={{ paddingBottom: '140px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#1A1A2E', margin: '0 0 8px 0', letterSpacing: '-0.03em' }}>Agenda</h1>
                <p style={{ fontSize: '15px', color: '#64748B', fontWeight: '500' }}>Reserva equipos y herramientas para tu investigación.</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '5px', borderRadius: '18px', marginBottom: '32px', width: 'fit-content', minWidth: '320px' }}>
                {['Nueva Reserva', 'Mis Reservas'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        style={{
                            flex: 1, padding: '10px 24px', borderRadius: '14px', fontSize: '14px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', border: 'none',
                            background: activeTab === tab ? '#FFFFFF' : 'transparent',
                            color: activeTab === tab ? '#9B72CF' : '#64748B',
                            boxShadow: activeTab === tab ? '0 4px 12px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'Mis Reservas' && (
                <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                    {myReservations.length === 0 ? (
                        <div className="card" style={{ padding: '64px 32px', textAlign: 'center', color: '#94A3B8', border: '2px dashed #E2E8F0', background: 'transparent' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <Calendar size={32} strokeWidth={1.5} />
                            </div>
                            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#1A1A2E' }}>Sin reservas próximas</h3>
                            <p style={{ fontSize: '14px' }}>Cuando realices una reserva aparecerá listada aquí.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {myReservations.map((res, idx) => {
                                const isOwn = res.userId === user?.uid
                                const isAdmin = userProfile?.role === 'admin'
                                return (
                                    <div key={res.id} className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `6px solid ${isOwn ? '#9B72CF' : '#64748B'}`, animation: `fadeIn 0.3s ease-out ${idx * 0.05}s both` }}>
                                        <div style={{ flex: 1 }}>
                                            {isAdmin && !isOwn && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                    <ShieldAlert size={12} style={{ color: '#FF4D4F' }} />
                                                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#FF4D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {res.userName || 'Otro usuario'}
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{ fontSize: '11px', fontWeight: '900', color: isOwn ? '#9B72CF' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                                {isOwn ? 'CONFIRMADA' : `Grupo: ${res.userGroup || '—'}`}
                                            </div>
                                            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', marginBottom: '4px' }}>{res.equipmentName}</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '14px', color: '#64748B', fontWeight: '600' }}>
                                                    {format(parseISO(res.date), "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                                                </span>
                                                <span style={{ color: '#E2E8F0' }}>•</span>
                                                <span style={{ fontSize: '15px', color: '#1A1A2E', fontWeight: '800' }}>
                                                    {res.startTime} — {res.endTime}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            {isOwn && (
                                                <button
                                                    onClick={() => handleAddToGoogleCalendar(res.equipmentName, res.date, res.startTime, res.endTime)}
                                                    title="Agregar a Google Calendar"
                                                    style={{ width: '44px', height: '44px', borderRadius: '14px', border: '1px solid #F1F5F9', background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    <CalendarPlus size={20} />
                                                </button>
                                            )}
                                            {/* Admin sees delete button on ALL reservations; user sees cancel only on their own */}
                                            {isAdmin ? (
                                                <button
                                                    onClick={() => handleAdminDeleteReservation(res)}
                                                    title="Eliminar reserva (Admin)"
                                                    style={{ height: '44px', padding: '0 16px', borderRadius: '14px', border: 'none', background: '#FFF1F0', color: '#FF4D4F', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '12px', fontWeight: '900' }}
                                                >
                                                    <Trash2 size={16} /> Eliminar
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleCancelReservation(res)}
                                                    title="Cancelar reserva"
                                                    style={{ width: '44px', height: '44px', borderRadius: '14px', border: 'none', background: '#FFF1F0', color: '#FF4D4F', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'Nueva Reserva' && (
                <div style={{ animation: 'fadeIn 0.4s ease-out' }}>

                    {/* STEP PROGRESS */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                        {[1, 2, 3].map(s => (
                            <div key={s} style={{ flex: 1, height: '4px', background: step >= s ? '#9B72CF' : '#E2E8F0', borderRadius: '2px', transition: 'background 0.3s' }} />
                        ))}
                    </div>

                    {/* STEP 1: SELECT EQUIPMENT */}
                    {step === 1 && (
                        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px', color: '#1A1A2E' }}>Selecciona el equipo</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {equipmentList.map(eq => {
                                    const isSelected = selectedEq?.id === eq.id;
                                    const requiresCert = eq.requiresCertification;
                                    const isCertified = userProfile?.certifications?.includes(eq.name);
                                    const isDisabled = requiresCert && !isCertified;

                                    return (
                                        <div
                                            key={eq.id}
                                            onClick={() => !isDisabled && setSelectedEq(eq)}
                                            style={{
                                                padding: '16px',
                                                borderRadius: '20px',
                                                background: isDisabled ? '#F1F5F9' : '#FFFFFF',
                                                border: isSelected ? '2px solid #9B72CF' : '2px solid transparent',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                position: 'relative',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: eq.status === 'available' ? '#34C759' : '#FF3B30' }} />
                                                <span style={{ fontSize: '10px', fontWeight: '800', color: eq.status === 'available' ? '#34C759' : '#FF3B30', textTransform: 'uppercase' }}>
                                                    {eq.status === 'available' ? 'Disponible' : 'Ocupado'}
                                                </span>
                                            </div>
                                            <h3 style={{ fontSize: '14px', fontWeight: '800', color: isDisabled ? '#94A3B8' : '#1A1A2E', marginBottom: '4px' }}>{eq.name}</h3>

                                            {isDisabled && (
                                                <div style={{ position: 'absolute', top: '12px', right: '12px', color: '#94A3B8' }}>
                                                    <Lock size={14} />
                                                </div>
                                            )}
                                            {isSelected && !isDisabled && (
                                                <div style={{ position: 'absolute', top: '12px', right: '12px', color: '#9B72CF' }}>
                                                    <Check size={18} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                disabled={!selectedEq}
                                onClick={() => setStep(2)}
                                style={{
                                    marginTop: '32px', width: '100%', padding: '16px', borderRadius: '16px',
                                    background: selectedEq ? '#9B72CF' : '#E2E8F0',
                                    color: 'white', fontWeight: '800', border: 'none', cursor: 'pointer'
                                }}
                            >
                                Siguiente
                            </button>
                        </div>
                    )}

                    {/* STEP 2: SELECT DATE & TIME */}
                    {step === 2 && (
                        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#9B72CF', cursor: 'pointer' }}><ChevronLeft size={24} /></button>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Fecha y Horario</h2>
                            </div>
                            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px', fontWeight: '500' }}>
                                Selecciona tu bloque de <span style={{ color: '#9B72CF', fontWeight: '800' }}>inicio</span> y luego el de <span style={{ color: '#9B72CF', fontWeight: '800' }}>fin</span> (máx. 6 horas).
                            </p>

                            {/* DATE STRIP */}
                            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '24px', scrollbarWidth: 'none', padding: '4px' }}>
                                {dates.map((d, idx) => {
                                    const isStudent = userProfile?.role === 'estudiante';
                                    const isBlocked = isStudent && idx > 7;
                                    const isSelected = selectedDateId === idx;
                                    const isToday = idx === 0;
                                    return (
                                        <div
                                            key={d.id}
                                            onClick={() => !isBlocked && setSelectedDateId(idx)}
                                            style={{
                                                flex: '0 0 auto', width: '64px', height: '80px', borderRadius: '16px',
                                                background: isSelected ? '#9B72CF' : isBlocked ? '#F1F5F9' : '#FFFFFF',
                                                color: isSelected ? 'white' : isBlocked ? '#CBD5E1' : '#1A1A2E',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                cursor: isBlocked ? 'not-allowed' : 'pointer',
                                                boxShadow: isSelected ? '0 4px 12px rgba(155,114,207,0.3)' : '0 2px 8px rgba(0,0,0,0.05)',
                                                border: isSelected ? 'none' : isToday ? '2px solid #9B72CF' : '1px solid #F1F5F9'
                                            }}
                                        >
                                            <span style={{ fontSize: '10px', fontWeight: '800', marginBottom: '4px' }}>{d.day}</span>
                                            <span style={{ fontSize: '20px', fontWeight: '900' }}>{d.num}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* TIMELINE */}
                            <div style={{ background: 'white', borderRadius: '24px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {TIME_BLOCKS.map((time, idx) => {
                                        const hourNum = parseInt(time.split(':')[0]);
                                        const now = new Date();
                                        const isToday = selectedDateId === 0;
                                        // Strict past check: if today, disable current and past hours
                                        const isPast = isToday && hourNum <= now.getHours();
                                        const res = reservations.find(r => r.startTime === time || (time >= r.startTime && time < r.endTime));
                                        const isOccupied = !!res;

                                        const isSelected = startTime === time;
                                        const isInRange = startTime && endTime && time >= startTime && time < endTime;

                                        const handleTimeClick = () => {
                                            if (isPast || isOccupied) return;

                                            // Case 1: Starting a new selection
                                            // (either nothing selected or we already had a complete range)
                                            if (!startTime || (startTime && endTime)) {
                                                setStartTime(time);
                                                setEndTime(null);
                                                return;
                                            }

                                            // Case 2: Expanding an existing start point (startTime exists, endTime is null)
                                            if (startTime && !endTime) {
                                                if (time === startTime) {
                                                    // Clicking same block makes it a 1-hour reservation
                                                    setEndTime(TIME_BLOCKS[idx + 1] || "23:00");
                                                } else if (time > startTime) {
                                                    const startIdx = TIME_BLOCKS.indexOf(startTime);
                                                    const endIdx = TIME_BLOCKS.indexOf(time);
                                                    const duration = endIdx - startIdx + 1;

                                                    if (duration > 6) {
                                                        toast.error('Máximo 6 horas de reserva');
                                                        // Keep current startTime, don't reset
                                                        return;
                                                    }

                                                    // Check for conflicts in between
                                                    const hasOverlap = TIME_BLOCKS.slice(startIdx, endIdx + 1).some(t => {
                                                        return reservations.some(r => t >= r.startTime && t < r.endTime);
                                                    });

                                                    if (hasOverlap) {
                                                        toast.error('El rango se cruza con otra reserva');
                                                        return;
                                                    }

                                                    setEndTime(TIME_BLOCKS[idx + 1] || "23:00");
                                                } else {
                                                    // Clicked before startTime - restart selection here
                                                    setStartTime(time);
                                                    setEndTime(TIME_BLOCKS[idx + 1] || "23:00");
                                                }
                                            }
                                        };

                                        return (
                                            <div
                                                key={time}
                                                onClick={handleTimeClick}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px', height: '44px',
                                                    position: 'relative'
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', width: '40px' }}>{time}</span>
                                                <div style={{
                                                    flex: 1, height: '100%', borderRadius: '8px',
                                                    background: isPast ? '#F1F5F9' : isOccupied ? '#FFF0F0' : (isSelected || isInRange) ? '#F0EBF8' : '#F0FDF4',
                                                    border: (isSelected || isInRange) ? '2px solid #9B72CF' : '1px solid transparent',
                                                    display: 'flex', alignItems: 'center', padding: '0 12px',
                                                    cursor: (isPast || isOccupied) ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {isOccupied && <span style={{ fontSize: '11px', fontWeight: '800', color: '#FF3B30' }}>{res.userName}</span>}
                                                    {!isOccupied && !isPast && !isInRange && <span style={{ fontSize: '11px', fontWeight: '700', color: '#34C759' }}>Disponible</span>}
                                                    {isInRange && <span style={{ fontSize: '11px', fontWeight: '800', color: '#9B72CF' }}>Tu selección</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SUMMARY & NEXT */}
                            {startTime && (
                                <div style={{
                                    marginTop: '24px', background: '#F0EBF8', padding: '20px', borderRadius: '20px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#9B72CF', fontWeight: '800' }}>SELECCIÓN</div>
                                        <div style={{ fontSize: '16px', fontWeight: '900', color: '#1A1A2E' }}>
                                            {startTime} — {endTime}
                                        </div>
                                    </div>
                                    <button
                                        disabled={!endTime}
                                        onClick={() => setStep(3)}
                                        style={{ background: endTime ? '#9B72CF' : '#E2E8F0', color: 'white', padding: '12px 24px', borderRadius: '12px', border: 'none', fontWeight: '800', cursor: 'pointer' }}
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: CONFIRM */}
                    {step === 3 && (
                        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: '#9B72CF', cursor: 'pointer' }}><ChevronLeft size={24} /></button>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Confirmar Reserva</h2>
                            </div>

                            <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>EQUIPO</span>
                                        <div style={{ fontSize: '18px', fontWeight: '900', color: '#1A1A2E' }}>{selectedEq?.name}</div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>FECHA</span>
                                            <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E' }}>{dates[selectedDateId].dateStr}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>HORARIO</span>
                                            <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E' }}>{startTime} — {endTime}</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Clock size={20} color="#9B72CF" />
                                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>
                                            Duración: {(() => {
                                                const sIdx = TIME_BLOCKS.indexOf(startTime);
                                                const eIdx = TIME_BLOCKS.indexOf(endTime === "23:00" ? "22:00" : endTime);
                                                return endTime === "23:00" ? (22 - sIdx + 1) : (eIdx - sIdx);
                                            })()} horas
                                        </span>
                                    </div>
                                    {projects.length > 0 && (
                                        <div style={{ marginTop: '20px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Vincular a Proyecto (Opcional)</label>
                                            <select
                                                value={selectedProjectId}
                                                onChange={e => setSelectedProjectId(e.target.value)}
                                                className="input-field"
                                                style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                            >
                                                <option value="">Ninguno</option>
                                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleConfirm}
                                    disabled={isSubmitting}
                                    style={{
                                        width: '100%', marginTop: '32px', padding: '18px', borderRadius: '16px',
                                        background: '#2D1B5E', color: 'white', fontSize: '16px', fontWeight: '800',
                                        border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,27,94,0.3)'
                                    }}
                                >
                                    {isSubmitting ? 'Confirmando...' : 'Confirmar Reserva'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}
