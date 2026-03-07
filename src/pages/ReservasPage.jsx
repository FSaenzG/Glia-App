// src/pages/ReservasPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, getDocs, getDoc, deleteDoc } from 'firebase/firestore'
import { addDays, format, parseISO, differenceInMinutes } from 'date-fns'
import { es } from 'date-fns/locale'

import { Calendar, Trash2, CheckCircle2, CalendarPlus, ShieldAlert } from 'lucide-react'

const TIME_BLOCKS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)

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

    const [dates, setDates] = useState([])
    const [selectedDate, setSelectedDate] = useState(0)

    const [equipmentList, setEquipmentList] = useState([])
    const [selectedEqId, setSelectedEqId] = useState(null)

    const [reservations, setReservations] = useState([])
    const [myReservations, setMyReservations] = useState([])
    const [selectedStartTime, setSelectedStartTime] = useState(null)   // e.g. "09:00"
    const [selectedDuration, setSelectedDuration] = useState(1)         // hours: 1-8
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
        setSelectedDate(0)
    }, [])

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'equipment'), (snap) => {
            const eqData = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
            setEquipmentList(eqData)
            if (!selectedEqId && eqData.length > 0) {
                setSelectedEqId(eqData[0].id)
            }
        })
        return unsub
    }, [selectedEqId])

    useEffect(() => {
        if (!dates[selectedDate] || !selectedEqId) return

        const q = query(
            collection(db, 'reservations'),
            where('date', '==', dates[selectedDate].dateStr),
            where('equipmentId', '==', selectedEqId),
            where('status', '==', 'confirmed')
        )
        const unsub = onSnapshot(q, (snap) => {
            const res = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setReservations(res)
        })
        return unsub
    }, [selectedDate, selectedEqId, dates])

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

    const currentEq = equipmentList.find(e => e.id === selectedEqId)
    const currentDay = dates[selectedDate]

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

    const toggleBlock = (time) => {
        // Legacy: not used in new UI
    }

    // Derive the selected blocks from start + duration for conflict checking
    const getSelectedBlocks = () => {
        if (!selectedStartTime) return []
        const startIdx = TIME_BLOCKS.indexOf(selectedStartTime)
        if (startIdx === -1) return []
        return TIME_BLOCKS.slice(startIdx, Math.min(startIdx + selectedDuration, TIME_BLOCKS.length))
    }
    const selectedBlocks = getSelectedBlocks()

    // Compute computed endTime string
    const getEndTime = () => {
        if (!selectedStartTime) return null
        const startIdx = TIME_BLOCKS.indexOf(selectedStartTime)
        const endIdx = startIdx + selectedDuration
        return endIdx >= 24 ? '24:00' : TIME_BLOCKS[endIdx]
    }

    const handleConfirm = async () => {
        if (!selectedStartTime || !currentEq || !currentDay || !user) return

        // ─── PAST DATE/TIME GUARD ────────────────────────────────────────────────
        const now = new Date()
        const nowStr = now.toISOString().split('T')[0]
        const nowHour = now.getHours()

        if (currentDay.dateStr < nowStr) {
            toast.error('No se pueden realizar reservas en fechas pasadas.')
            return
        }
        if (currentDay.dateStr === nowStr && parseInt(selectedStartTime.split(':')[0]) < nowHour) {
            toast.error('No puedes reservar en una hora que ya pasó.')
            return
        }
        // ─────────────────────────────────────────────────────────────────────────

        const reqCerts = ['Microscopio de Fluorescencia', 'Termociclador PCR']
        if (reqCerts.includes(currentEq.name) || currentEq.requiresCertification) {
            const hasCert = userProfile.certifications && userProfile.certifications.includes(currentEq.name)
            if (!hasCert) {
                toast.error(`No tienes la certificación requerida para usar: ${currentEq.name}`)
                return
            }
        }

        if (userProfile.role === 'estudiante' && selectedDate > 7) {
            toast.error('Estudiantes solo pueden reservar con máximo 8 días de anticipación')
            return
        }

        if (userProfile.role === 'estudiante' && selectedDuration > 4) {
            toast.error('Estudiantes pueden reservar máximo 4 horas por día.')
            return
        }

        // Conflict check
        const q = query(
            collection(db, 'reservations'),
            where('date', '==', currentDay.dateStr),
            where('equipmentId', '==', selectedEqId),
            where('status', '==', 'confirmed')
        )
        const currSnap = await getDocs(q)
        const existingBlocks = []
        currSnap.docs.forEach(d => {
            const r = d.data()
            const startIdx = TIME_BLOCKS.indexOf(r.startTime)
            let endStr = r.endTime === '24:00' ? '23:00' : r.endTime
            const endIdx = TIME_BLOCKS.indexOf(endStr)
            for (let i = startIdx; i < (endIdx === -1 ? TIME_BLOCKS.length : endIdx); i++) {
                existingBlocks.push(TIME_BLOCKS[i])
            }
        })

        const conflict = selectedBlocks.some(b => existingBlocks.includes(b))
        if (conflict) {
            toast.error('Este horario ya fue reservado. Elige otro.')
            setSelectedStartTime(null)
            return
        }

        const endTimeStr = getEndTime()

        setIsSubmitting(true)
        try {
            const endTimeStr = getEndTime()
            await addDoc(collection(db, 'reservations'), {
                equipmentId: currentEq.id,
                equipmentName: currentEq.name,
                userId: user.uid,
                userName: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario'),
                userGroup: userProfile.group || '',
                date: currentDay.dateStr,
                startTime: selectedStartTime,
                endTime: endTimeStr,
                slots: selectedDuration,
                status: 'confirmed',
                createdAt: serverTimestamp(),
                cancelledAt: null
            })

            const finalLogName = (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario')
            await addAuditLog(user.uid, finalLogName, 'reservation_created', `Reserva en ${currentEq.name} el ${currentDay.dateStr} ${selectedStartTime}-${endTimeStr}`, 'reservas')

            setSelectedStartTime(null)
            setSelectedDuration(1)
            setSuccessData({
                eqName: currentEq.name,
                dateStr: currentDay.dateStr,
                startTime: selectedStartTime,
                endTime: endTimeStr,
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
            toast.success('Reserva eliminada correctamente.')
        } catch (err) {
            console.error('Error deleting reservation:', err)
            toast.error('No se pudo eliminar la reserva.')
        }
    }

    const handleEqChange = (id) => {
        setSelectedEqId(id)
        setSelectedStartTime(null)
        setSelectedDuration(1)
    }

    const handleDateChange = (id) => {
        setSelectedDate(id)
        setSelectedStartTime(null)
        setSelectedDuration(1)
    }

    const handleDownloadICS = (eqName, dateStr, startTime, endTime) => {
        const formatICSDate = (dt, time) => {
            const [y, m, d] = dt.split('-');
            let [h, min] = time.split(':');
            if (h === '24') { h = '23'; min = '59'; }
            return `${y}${m}${d}T${h}${min}00`;
        }
        const startStr = formatICSDate(dateStr, startTime);
        const endStr = formatICSDate(dateStr, endTime);

        const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Glia App//Laboratorio//ES\nCALSCALE:GREGORIAN\nBEGIN:VEVENT\nSUMMARY:Reserva: ${eqName}\nDTSTART;TZID=America/Bogota:${startStr}\nDTEND;TZID=America/Bogota:${endStr}\nDESCRIPTION:Reserva de equipo en el laboratorio\\nIngresa a Glia para mas detalles.\nLOCATION:Laboratorio PUJ\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR`;

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `reserva-${eqName.replace(/\s+/g, '-')}-${dateStr}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                            onClick={() => handleDownloadICS(successData.eqName, successData.dateStr, successData.startTime, successData.endTime)}
                            style={{ width: '100%', padding: '18px', borderRadius: '20px', background: '#1A1A2E', color: 'white', fontSize: '15px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(26,26,46,0.2)', transition: 'transform 0.2s' }}
                        >
                            Agregar al calendario
                        </button>

                        <button
                            onClick={() => { setSuccessData(null); navigate('/'); }}
                            style={{ width: '100%', padding: '18px', borderRadius: '20px', background: 'transparent', color: '#64748B', fontSize: '15px', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                        >
                            Ir al Inicio
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
                        onClick={() => setActiveTab(tab)}
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
                                                    onClick={() => handleDownloadICS(res.equipmentName, res.date, res.startTime, res.endTime)}
                                                    title="Agregar al calendario"
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
                    {/* Date Selection */}
                    <div style={{ marginBottom: '32px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Selecciona el día</h4>
                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '16px', margin: '0 -24px', paddingLeft: '24px', paddingRight: '24px', scrollbarWidth: 'none' }}>
                            {dates.map(d => {
                                const isActive = selectedDate === d.id
                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => handleDateChange(d.id)}
                                        style={{
                                            flex: '0 0 auto', minWidth: '70px', height: '88px', borderRadius: '20px',
                                            background: isActive ? '#1A1A2E' : '#FFFFFF',
                                            color: isActive ? '#FFFFFF' : '#1A1A2E',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: isActive ? '0 10px 20px rgba(26,26,46,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            border: isActive ? 'none' : '1px solid #F0F0F0'
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: '900', opacity: isActive ? 0.8 : 0.5, marginBottom: '2px' }}>{d.day}</span>
                                        <span style={{ fontSize: '24px', fontWeight: '900' }}>{d.num}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Equipment Selection */}
                    <div style={{ marginBottom: '32px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Selecciona el equipo</h4>
                        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '20px', margin: '0 -24px', paddingLeft: '24px', paddingRight: '24px', scrollbarWidth: 'none' }}>
                            {equipmentList.map(eq => {
                                const isActive = selectedEqId === eq.id
                                return (
                                    <div
                                        key={eq.id}
                                        onClick={() => handleEqChange(eq.id)}
                                        style={{
                                            flex: '0 0 auto', padding: '14px 24px', borderRadius: '20px',
                                            background: isActive ? '#9B72CF' : '#FFFFFF',
                                            color: isActive ? '#FFFFFF' : '#64748B',
                                            fontSize: '14px', fontWeight: '900', cursor: 'pointer',
                                            boxShadow: isActive ? '0 8px 20px rgba(155,114,207,0.25)' : '0 2px 8px rgba(0,0,0,0.03)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            border: isActive ? 'none' : '1px solid #F0F0F0'
                                        }}
                                    >
                                        {eq.name.replace('Cabina de ', 'C. ').replace('Microscopio de ', 'M. ')}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Step 3: Time Picker */}
                    {currentEq && (() => {
                        const now = new Date()
                        const isToday = selectedDate === 0
                        const nowHour = now.getHours()
                        const isAdmin = userProfile?.role === 'admin'
                        const isAvailable = currentEq.status === 'available' || isAdmin

                        // Build available start hours: not occupied and not past (for today)
                        const availableHours = TIME_BLOCKS.filter(time => {
                            const hour = parseInt(time.split(':')[0])
                            if (!isAdmin && !isAvailable) return false
                            if (isToday && hour <= nowHour && !isAdmin) return false
                            return true
                        })

                        // For a selected start, compute max allowed duration (until next occupied or midnight)
                        const maxDuration = (() => {
                            if (!selectedStartTime) return 8
                            const startIdx = TIME_BLOCKS.indexOf(selectedStartTime)
                            let maxH = 8
                            for (let i = 1; i <= 8; i++) {
                                const checkIdx = startIdx + i
                                if (checkIdx >= 24) { maxH = i; break }
                                if (occupied[TIME_BLOCKS[checkIdx]]) { maxH = i; break }
                            }
                            return maxH
                        })()

                        // Clamp duration if max decreased
                        if (selectedDuration > maxDuration && selectedStartTime) {
                            setTimeout(() => setSelectedDuration(maxDuration), 0)
                        }

                        const endTime = getEndTime()

                        return (
                            <div style={{ marginBottom: '32px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Horario</h4>
                                    {currentEq.status === 'out_of_service' && <span style={{ color: '#FF4D4F', fontWeight: '900', fontSize: '12px' }}>FUERA DE SERVICIO</span>}
                                    {currentEq.status === 'maintenance' && <span style={{ color: '#FAAD14', fontWeight: '900', fontSize: '12px' }}>MANTENIMIENTO</span>}
                                    {currentEq.status === 'available' && <span style={{ color: '#52C41A', fontWeight: '900', fontSize: '12px' }}>DISPONIBLE</span>}
                                </div>

                                <div className="card" style={{ padding: '24px', borderRadius: '28px' }}>
                                    {/* 3a. Start time row */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Hora de inicio</div>
                                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
                                            {TIME_BLOCKS.map(time => {
                                                const hour = parseInt(time.split(':')[0])
                                                const isPast = isToday && hour <= nowHour && !isAdmin
                                                const isOccupied = !!occupied[time]
                                                const isDisabled = isPast || isOccupied || !isAvailable
                                                const isSelected = selectedStartTime === time

                                                return (
                                                    <button
                                                        key={time}
                                                        onClick={() => !isDisabled && setSelectedStartTime(isSelected ? null : time)}
                                                        style={{
                                                            flexShrink: 0,
                                                            padding: '10px 16px', borderRadius: '14px', fontSize: '13px', fontWeight: '800',
                                                            border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                            background: isSelected ? '#9B72CF' : isOccupied ? '#FFF1F0' : isPast ? '#F1F5F9' : '#F0FDF4',
                                                            color: isSelected ? 'white' : isOccupied ? '#FF4D4F' : isPast ? '#CBD5E1' : '#16A34A',
                                                            opacity: isDisabled && !isOccupied ? 0.5 : 1,
                                                            transition: 'all 0.2s',
                                                            boxShadow: isSelected ? '0 4px 12px rgba(155,114,207,0.35)' : 'none',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        {time}
                                                        {isOccupied && (
                                                            <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: '#FF4D4F', border: '2px solid white' }} />
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* 3b. Duration selector */}
                                    {selectedStartTime && (
                                        <div style={{ marginBottom: '24px' }}>
                                            <div style={{ fontSize: '12px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Duración</div>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {[1, 2, 3, 4, 5, 6, 7, 8].map(h => {
                                                    const isDisabled = h > maxDuration
                                                    const isSelected = selectedDuration === h
                                                    return (
                                                        <button
                                                            key={h}
                                                            onClick={() => !isDisabled && setSelectedDuration(h)}
                                                            style={{
                                                                padding: '10px 18px', borderRadius: '14px', fontSize: '14px', fontWeight: '900',
                                                                border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                background: isSelected ? '#1A1A2E' : isDisabled ? '#F1F5F9' : '#F8FAFC',
                                                                color: isSelected ? 'white' : isDisabled ? '#CBD5E1' : '#64748B',
                                                                opacity: isDisabled ? 0.5 : 1,
                                                                transition: 'all 0.2s',
                                                                boxShadow: isSelected ? '0 4px 12px rgba(26,26,46,0.2)' : 'none'
                                                            }}
                                                        >
                                                            {h}h
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* 3c. Preview + confirm */}
                                    {selectedStartTime && endTime && (
                                        <div style={{ background: 'linear-gradient(135deg, #2D1B5E 0%, #9B72CF 100%)', borderRadius: '20px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Tu reserva</div>
                                                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', letterSpacing: '-0.01em' }}>
                                                    {selectedStartTime} → {endTime}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: '700', marginTop: '2px' }}>
                                                    {selectedDuration} hora{selectedDuration > 1 ? 's' : ''} · {currentEq.name}
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleConfirm}
                                                disabled={isSubmitting}
                                                style={{
                                                    background: 'white', color: '#2D1B5E', border: 'none', borderRadius: '16px',
                                                    padding: '14px 22px', fontSize: '14px', fontWeight: '900', cursor: 'pointer',
                                                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)', transition: 'all 0.2s', flexShrink: 0
                                                }}
                                            >
                                                {isSubmitting ? '...' : 'Confirmar'}
                                            </button>
                                        </div>
                                    )}

                                    {/* No start selected yet */}
                                    {!selectedStartTime && (
                                        <div style={{ textAlign: 'center', padding: '16px 0 4px', color: '#94A3B8', fontSize: '13px', fontWeight: '600' }}>
                                            Selecciona una hora de inicio
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </div>
            )}

            <style>{`
                @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}
