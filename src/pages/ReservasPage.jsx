// src/pages/ReservasPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, getDocs, getDoc } from 'firebase/firestore'
import { addDays, format, parseISO, differenceInMinutes } from 'date-fns'
import { es } from 'date-fns/locale'

import { Calendar, Trash2, CheckCircle2 } from 'lucide-react'

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
    const [selectedBlocks, setSelectedBlocks] = useState([])
    const [isSubmitting, setIsSubmitting] = useState(false)

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

    useEffect(() => {
        if (activeTab === 'Mis Reservas' && user) {
            const today = new Date().toISOString().split('T')[0]
            const q = query(
                collection(db, 'reservations'),
                where('userId', '==', user.uid),
                where('status', '==', 'confirmed')
            )
            const unsub = onSnapshot(q, (snap) => {
                const allRes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                const futureDocs = allRes.filter(d => d.date >= today)
                futureDocs.sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date)
                    return a.startTime.localeCompare(b.startTime)
                })
                setMyReservations(futureDocs)
            })
            return unsub
        }
    }, [activeTab, user])

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
        if (occupied[time]) return

        setSelectedBlocks(prev => {
            if (prev.includes(time)) {
                return prev.filter(t => t !== time)
            } else {
                const updated = [...prev, time].sort()
                if (userProfile?.role === 'estudiante' && updated.length > 4) {
                    toast.error('Estudiantes pueden reservar máximo 4 horas por día.')
                    return prev
                }
                return updated
            }
        })
    }

    const handleConfirm = async () => {
        if (selectedBlocks.length === 0 || !currentEq || !currentDay || !user) return

        if (currentEq.requiresCertification && !userProfile.certifications.includes(currentEq.name)) {
            toast.error(`No tienes certificación para usar: ${currentEq.name}`)
            return
        }

        if (userProfile.role === 'estudiante' && selectedDate > 7) {
            toast.error('Estudiantes solo pueden reservar con máximo 8 días de anticipación')
            return
        }

        // Verify conflicts manually just to be safe at atomic level
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
            toast.error('Uno de los bloques seleccionados ya fue reservado. Refrescando...')
            setSelectedBlocks([])
            return
        }

        setIsSubmitting(true)
        try {
            let currentStart = null;
            let currentEnd = null;
            const chunks = []

            for (let i = 0; i < selectedBlocks.length; i++) {
                const block = selectedBlocks[i]
                const blockIdx = TIME_BLOCKS.indexOf(block)
                if (currentStart === null) {
                    currentStart = blockIdx;
                    currentEnd = blockIdx + 1;
                } else if (currentEnd === blockIdx) {
                    currentEnd++;
                } else {
                    chunks.push({ start: TIME_BLOCKS[currentStart], end: TIME_BLOCKS[currentEnd < 24 ? currentEnd : 23], isMidnight: currentEnd >= 24, count: currentEnd - currentStart })
                    currentStart = blockIdx
                    currentEnd = blockIdx + 1
                }
            }
            if (currentStart !== null) {
                chunks.push({ start: TIME_BLOCKS[currentStart], end: TIME_BLOCKS[currentEnd < 24 ? currentEnd : 23], isMidnight: currentEnd >= 24, count: currentEnd - currentStart })
            }

            for (const chunk of chunks) {
                let endTimeStr = chunk.isMidnight ? '24:00' : chunk.end;
                if (!endTimeStr) endTimeStr = '24:00'

                await addDoc(collection(db, 'reservations'), {
                    equipmentId: currentEq.id,
                    equipmentName: currentEq.name,
                    userId: user.uid,
                    userName: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
                    userGroup: userProfile.group || '',
                    date: currentDay.dateStr,
                    startTime: chunk.start,
                    endTime: endTimeStr,
                    slots: chunk.count,
                    status: "confirmed",
                    createdAt: serverTimestamp(),
                    cancelledAt: null
                })
            }

            await addAuditLog(user.uid, `${userProfile.firstName} ${userProfile.lastName}`.trim(), 'reservation_created', `Reserva en ${currentEq.name} el ${currentDay.dateStr}`, 'reservas')

            toast.success(`Reserva confirmada en ${currentEq.name}.`, {
                duration: 4000,
                style: { borderRadius: '16px', fontWeight: 'bold' }
            })

            setSelectedBlocks([])
            navigate('/')
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

    const handleEqChange = (id) => {
        setSelectedEqId(id)
        setSelectedBlocks([])
    }

    const handleDateChange = (id) => {
        setSelectedDate(id)
        setSelectedBlocks([])
    }

    if (!dates.length) return null;

    return (
        <div className="page-container" style={{ paddingBottom: '140px', background: '#F7F6F8', minHeight: '100vh', margin: 0, maxWidth: '100%', position: 'relative' }}>

            <div style={{ padding: '0 8px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#1A1A2E', marginBottom: '24px' }}>Reservas</h1>

                {/* Tabs */}
                <div style={{ display: 'flex', background: '#EAE5F2', padding: '4px', borderRadius: '16px', marginBottom: '24px' }}>
                    {['Nueva Reserva', 'Mis Reservas'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                                background: activeTab === tab ? '#FFFFFF' : 'transparent',
                                color: activeTab === tab ? '#9B72CF' : '#666666',
                                boxShadow: activeTab === tab ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === 'Mis Reservas' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {myReservations.length === 0 ? (
                            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF' }}>
                                <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#1A1A2E' }}>Vaya, todo muy tranquilo</h3>
                                <p>No tienes reservas confirmadas para los próximos días.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {myReservations.map(res => (
                                    <div key={res.id} className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid #34C759' }}>
                                        <div>
                                            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '6px' }}>{res.equipmentName}</h3>
                                            <div style={{ fontSize: '14px', color: '#666666', fontWeight: '600' }}>
                                                {format(parseISO(res.date), "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                                            </div>
                                            <div style={{ fontSize: '14px', color: '#9B72CF', fontWeight: '800', marginTop: '4px' }}>
                                                {res.startTime} - {res.endTime}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleCancelReservation(res)}
                                            style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Nueva Reserva' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {/* Date Selection */}
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', margin: '0 -24px 8px -24px', paddingLeft: '24px', paddingRight: '24px', scrollbarWidth: 'none' }}>
                            {dates.map(d => {
                                const isActive = selectedDate === d.id
                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => handleDateChange(d.id)}
                                        style={{
                                            flex: '0 0 auto',
                                            minWidth: '64px',
                                            height: '80px',
                                            borderRadius: '16px',
                                            background: isActive ? '#0F172A' : '#FFFFFF',
                                            color: isActive ? '#FFFFFF' : '#1A1A2E',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: isActive ? '0 8px 16px rgba(15,23,42,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
                                            transition: 'all 0.2s',
                                            border: isActive ? 'none' : '1px solid #F0F0F0'
                                        }}
                                    >
                                        <span style={{ fontSize: '13px', fontWeight: '800', opacity: isActive ? 0.9 : 0.6 }}>{d.day}</span>
                                        <span style={{ fontSize: '22px', fontWeight: '800' }}>{d.num}</span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Equipment Selection */}
                        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '20px', margin: '0 -24px 16px -24px', paddingLeft: '24px', paddingRight: '24px', scrollbarWidth: 'none' }}>
                            {equipmentList.map(eq => {
                                const isActive = selectedEqId === eq.id
                                return (
                                    <div
                                        key={eq.id}
                                        onClick={() => handleEqChange(eq.id)}
                                        style={{
                                            flex: '0 0 auto',
                                            padding: '16px 24px',
                                            borderRadius: '24px',
                                            background: isActive ? '#5b47fb' : '#FFFFFF',
                                            color: isActive ? '#FFFFFF' : '#64748B',
                                            fontSize: '14px',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            boxShadow: isActive ? '0 4px 12px rgba(91, 71, 251, 0.3)' : '0 2px 8px rgba(0,0,0,0.04)',
                                            transition: 'all 0.2s',
                                            border: isActive ? 'none' : '1px solid #F0F0F0'
                                        }}
                                    >
                                        {eq.name.replace('Cabina de ', 'C. ').replace('Microscopio de ', 'M. ')}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Main Card */}
                        {currentEq && (
                            <div className="card" style={{ padding: '32px 24px', borderRadius: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.04)' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1E293B', marginBottom: '8px' }}>
                                    {currentEq.name}
                                </h2>
                                <p style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '32px' }}>
                                    {currentEq.status.replace('_', ' ')}
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {TIME_BLOCKS.map(time => {
                                        const reservedBy = occupied[time]
                                        const isOccupied = !!reservedBy
                                        const isSelected = selectedBlocks.includes(time)

                                        // Base Styles
                                        let bg = '#FFFFFF'
                                        let border = '2px dashed #CBD5E1'
                                        let textColor = '#94A3B8'
                                        let labelText = 'DISPONIBLE'
                                        let cursor = 'pointer'

                                        if (isSelected) {
                                            bg = '#5b47fb'
                                            border = '2px solid #5b47fb'
                                            textColor = '#FFFFFF'
                                            labelText = 'SELECCIONADO'
                                        } else if (isOccupied) {
                                            bg = '#F1F5F9'
                                            border = '2px solid transparent'
                                            textColor = '#94A3B8'
                                            const shortName = reservedBy.length > 20 ? reservedBy.substring(0, 18) + '...' : reservedBy;
                                            labelText = `RESERVADO POR: ${shortName.toUpperCase()}`
                                            cursor = 'not-allowed'
                                        }

                                        return (
                                            <div key={time} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                {/* Time Label */}
                                                <div style={{ width: '48px', fontSize: '14px', fontWeight: '600', color: '#94A3B8', textAlign: 'right', flexShrink: 0 }}>
                                                    {time}
                                                </div>

                                                {/* Block */}
                                                <div
                                                    onClick={() => !isOccupied && toggleBlock(time)}
                                                    style={{
                                                        flex: 1,
                                                        height: '64px',
                                                        borderRadius: '20px',
                                                        background: bg,
                                                        border: border,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '0 24px',
                                                        color: textColor,
                                                        fontSize: isOccupied ? '12px' : '15px',
                                                        fontWeight: '800',
                                                        cursor: cursor,
                                                        transition: 'all 0.2s ease',
                                                        opacity: isOccupied ? 0.7 : 1,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {labelText}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating Action Bar */}
            {activeTab === 'Nueva Reserva' && selectedBlocks.length > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: 'calc(var(--bottom-nav-h, 72px) + 16px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 'calc(100% - 32px)',
                    maxWidth: '480px',
                    background: '#0F172A',
                    borderRadius: '24px',
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.4)',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    zIndex: 100
                }}>
                    <div>
                        <div style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: '800', marginBottom: '2px' }}>
                            {selectedBlocks.length} hora(s) elegida(s)
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Reservando para: {userProfile?.group || 'Laboratorio'}
                        </div>
                    </div>

                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        style={{
                            background: '#5b47fb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '16px',
                            padding: '14px 28px',
                            fontSize: '15px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(91, 71, 251, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                        {isSubmitting ? (
                            <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin-confirm 0.8s linear infinite' }} />
                        ) : 'CONFIRMAR'}
                    </button>
                </div>
            )}

            <style>{`
                @keyframes spin-confirm { to { transform: rotate(360deg); } }
                @keyframes slideUp {
                    from { transform: translate(-50%, 100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
