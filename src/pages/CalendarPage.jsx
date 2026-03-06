// src/pages/CalendarPage.jsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import {
    collection, addDoc, onSnapshot, query, updateDoc, doc,
    serverTimestamp, orderBy
} from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import { addAuditLog } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import {
    Calendar, Plus, Clock, ChevronLeft, ChevronRight, X, AlertTriangle,
    User, Microscope, LayoutGrid, Check, Trash2, List
} from 'lucide-react'
import {
    addDays, format, startOfMonth, endOfMonth, eachDayOfInterval,
    isToday, isSameDay, parseISO, differenceInHours
} from 'date-fns'
import { es } from 'date-fns/locale'

const EQUIPMENT_LIST = [
    'Cabina 1', 'Cabina 2', 'Cabina 3', 'Cabina 4', 'Cabina 5',
    'Microscopio A', 'Microscopio B', 'Microscopio C'
]

const HOURS = Array.from({ length: 24 }, (_, i) => {
    const h = i.toString().padStart(2, '0')
    return `${h}:00`
})

const STATUS_COLORS = {
    pending: { label: 'Pendiente', color: '#FF9500', bg: 'rgba(255,149,0,0.15)' },
    confirmed: { label: 'Confirmada', color: '#34C759', bg: 'rgba(52,199,89,0.15)' },
    cancelled: { label: 'Cancelada', color: '#8E8E93', bg: 'rgba(142,142,147,0.15)' },
    waiting: { label: 'En Espera', color: '#007AFF', bg: 'rgba(0,122,255,0.15)' },
}

export default function CalendarPage() {
    const { t } = useTranslation()
    const { user, userProfile } = useAuthStore()
    const [reservations, setReservations] = useState([])
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [showModal, setShowModal] = useState(false)
    const [view, setView] = useState('calendar') // 'calendar' | 'list'
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        equipment: EQUIPMENT_LIST[0],
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '08:00',
        endTime: '10:00',
        purpose: '',
    })
    const [maintenanceForm, setMaintenanceForm] = useState({ equipment: '', date: '', reason: '' })
    const [showMaintenance, setShowMaintenance] = useState(false)

    useEffect(() => {
        const q = query(collection(db, 'reservations'), orderBy('startTime', 'asc'))
        const unsub = onSnapshot(q, snap => {
            setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })
        return unsub
    }, [])

    const monthDays = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
    })

    const getReservationsForDay = (day) =>
        reservations.filter(r => {
            try { return isSameDay(parseISO(r.date || r.startTime?.toDate?.()?.toISOString()?.slice(0, 10) || ''), day) }
            catch { return false }
        })

    const checkConflict = (equipment, date, startTime, endTime, excludeId = null) => {
        return reservations.some(r => {
            if (r.id === excludeId || r.status === 'cancelled') return false
            if (r.equipment !== equipment || r.date !== date) return false
            // Time overlap check
            const [sh, sm] = startTime.split(':').map(Number)
            const [eh, em] = endTime.split(':').map(Number)
            const [rsh, rsm] = (r.startTime || '00:00').split(':').map(Number)
            const [reh, rem] = (r.endTime || '23:59').split(':').map(Number)
            const start = sh * 60 + sm, end = eh * 60 + em
            const rStart = rsh * 60 + rsm, rEnd = reh * 60 + rem
            return start < rEnd && end > rStart
        })
    }

    const validateStudentRules = (date, startTime, endTime) => {
        if (userProfile?.role !== 'student') return null
        // Max 8 days ahead
        const reserveDate = parseISO(date)
        const maxDate = addDays(new Date(), 8)
        if (reserveDate > maxDate) return 'Los estudiantes solo pueden reservar hasta 8 días adelante'
        // Max 6 hours
        const [sh] = startTime.split(':').map(Number)
        const [eh] = endTime.split(':').map(Number)
        if (eh - sh > 6) return 'Los estudiantes pueden reservar máximo 6 horas'
        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const { equipment, date, startTime, endTime, purpose } = form

        // Role validation
        const roleError = validateStudentRules(date, startTime, endTime)
        if (roleError) return toast.error(roleError)

        // Certification check
        const equipType = equipment.includes('Microscopio') ? 'microscope' : 'cabin'
        const hasCert = userProfile?.certifications?.includes(equipType)
        if (!hasCert && userProfile?.role === 'student') {
            toast.error('Necesitas certificación para usar este equipo')
            return
        }

        // Conflict detection
        const hasConflict = checkConflict(equipment, date, startTime, endTime)

        setLoading(true)
        try {
            const status = hasConflict ? 'waiting' : 'confirmed'
            await addDoc(collection(db, 'reservations'), {
                userId: user.uid,
                userName: userProfile?.displayName || user.email,
                equipment, date, startTime, endTime, purpose,
                status,
                createdAt: serverTimestamp(),
                requiresApproval: userProfile?.role === 'student',
            })

            // Update equipment status
            if (!hasConflict) {
                await updateDoc(doc(db, 'equipment', equipment), { status: 'reserved' }).catch(() => { })
            }

            // Points for making a reservation
            await updateDoc(doc(db, 'users', user.uid), {
                points: (userProfile?.points || 0) + 5
            }).catch(() => { })

            await addAuditLog(user.uid, 'reservation_created', `${equipment} - ${date} ${startTime}-${endTime}`)
            toast.success(hasConflict ? 'Agregado a la lista de espera' : 'Reserva confirmada')
            setShowModal(false)
        } catch {
            toast.error(t('error'))
        } finally { setLoading(false) }
    }

    const handleCancel = async (res) => {
        if (res.userId !== user.uid && userProfile?.role === 'student') {
            return toast.error('No puedes cancelar reservas de otros usuarios')
        }
        try {
            await updateDoc(doc(db, 'reservations', res.id), { status: 'cancelled' })
            await addAuditLog(user.uid, 'reservation_cancelled', `${res.equipment} - ${res.date}`)
            // Points for advance cancellation
            const today = new Date()
            const resDate = parseISO(res.date)
            if (differenceInHours(resDate, today) > 24) {
                await updateDoc(doc(db, 'users', user.uid), {
                    points: (userProfile?.points || 0) + 10
                }).catch(() => { })
                toast.success('Reserva cancelada (+10 puntos por cancelación anticipada)')
            } else {
                toast.success('Reserva cancelada')
            }
        } catch { toast.error(t('error')) }
    }

    const handleMaintenance = async (e) => {
        e.preventDefault()
        if (userProfile?.role !== 'admin' && userProfile?.role !== 'researcher') return
        try {
            await addDoc(collection(db, 'reservations'), {
                userId: user.uid,
                userName: 'Sistema — Mantenimiento',
                equipment: maintenanceForm.equipment,
                date: maintenanceForm.date,
                startTime: '00:00', endTime: '23:59',
                purpose: maintenanceForm.reason,
                status: 'confirmed',
                isMaintenance: true,
                createdAt: serverTimestamp(),
            })
            await updateDoc(doc(db, 'equipment', maintenanceForm.equipment), { status: 'maintenance' }).catch(() => { })
            await addAuditLog(user.uid, 'maintenance_scheduled', `${maintenanceForm.equipment} - ${maintenanceForm.date}`)
            toast.success('Mantenimiento programado')
            setShowMaintenance(false)
        } catch { toast.error(t('error')) }
    }

    const selectedDayReservations = getReservationsForDay(selectedDate)

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Calendar size={24} className="text-[#9B72CF]" />
                        {t('calendar')}
                    </h1>
                    <p className="text-white/50 text-sm mt-1">Reserva cabinas y microscopios del laboratorio</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setView(v => v === 'calendar' ? 'list' : 'calendar')} className="btn-ghost">
                        {view === 'calendar' ? <List size={16} /> : <Calendar size={16} />}
                        {view === 'calendar' ? 'Lista' : 'Calendario'}
                    </button>
                    {(userProfile?.role === 'admin' || userProfile?.role === 'researcher') && (
                        <button onClick={() => setShowMaintenance(true)} className="btn-ghost">
                            <AlertTriangle size={16} className="text-yellow-400" />
                            Mantenimiento
                        </button>
                    )}
                    <button onClick={() => setShowModal(true)} className="btn-primary">
                        <Plus size={16} />
                        {t('newReservation')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar grid */}
                <div className="lg:col-span-2 glass p-5">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1))}
                            className="btn-ghost p-2"><ChevronLeft size={18} /></button>
                        <h2 className="text-white font-semibold capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h2>
                        <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1))}
                            className="btn-ghost p-2"><ChevronRight size={18} /></button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                            <div key={d} className="text-center text-white/30 text-xs font-medium py-1">{d}</div>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Leading empty cells */}
                        {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {monthDays.map(day => {
                            const dayRes = getReservationsForDay(day)
                            const isSelected = isSameDay(day, selectedDate)
                            const isTodayDate = isToday(day)
                            return (
                                <button
                                    key={day.toISOString()}
                                    onClick={() => setSelectedDate(day)}
                                    className={`relative p-1.5 rounded-lg min-h-[52px] text-left transition-all ${isSelected ? 'ring-2 ring-[#9B72CF]' : 'hover:bg-white/5'}`}
                                    style={{ background: isSelected ? 'rgba(155,114,207,0.15)' : undefined }}>
                                    <span className={`text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center ${isTodayDate ? 'bg-[#9B72CF] text-white' : isSelected ? 'text-white' : 'text-white/60'}`}>
                                        {format(day, 'd')}
                                    </span>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                        {dayRes.slice(0, 2).map(r => {
                                            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.confirmed
                                            return (
                                                <div key={r.id} className="text-[9px] truncate px-1 rounded"
                                                    style={{ background: sc.bg, color: sc.color }}>
                                                    {r.equipment?.replace('Cabina ', 'C').replace('Microscopio ', 'M')}
                                                </div>
                                            )
                                        })}
                                        {dayRes.length > 2 && (
                                            <span className="text-[9px] text-white/30">+{dayRes.length - 2} más</span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Day detail */}
                <div className="glass p-5 flex flex-col gap-3">
                    <h3 className="text-white font-semibold capitalize text-sm">
                        {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                    </h3>
                    {selectedDayReservations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                            <Calendar size={32} className="text-white/20" />
                            <p className="text-white/30 text-sm">Sin reservas</p>
                            <button onClick={() => { setForm(f => ({ ...f, date: format(selectedDate, 'yyyy-MM-dd') })); setShowModal(true) }}
                                className="btn-primary mt-2 text-xs px-3 py-1.5">
                                <Plus size={14} /> Reservar
                            </button>
                        </div>
                    ) : (
                        selectedDayReservations.map(r => {
                            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.confirmed
                            return (
                                <div key={r.id} className="p-3 rounded-xl"
                                    style={{ background: sc.bg, border: `1px solid ${sc.color}30` }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{r.equipment}</p>
                                            <p className="text-xs mt-0.5" style={{ color: sc.color }}>
                                                <Clock size={10} className="inline mr-1" />{r.startTime} – {r.endTime}
                                            </p>
                                            <p className="text-white/50 text-xs mt-0.5 flex items-center gap-1">
                                                <User size={10} />{r.userName}
                                            </p>
                                            {r.purpose && <p className="text-white/40 text-xs mt-1 truncate">{r.purpose}</p>}
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
                                                style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}40` }}>
                                                {sc.label}
                                            </span>
                                        </div>
                                        {(r.userId === user?.uid || userProfile?.role !== 'student') && r.status !== 'cancelled' && (
                                            <button onClick={() => handleCancel(r)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors flex-shrink-0">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* My reservations list */}
            {view === 'list' && (
                <div className="glass p-5">
                    <h2 className="text-white font-semibold mb-4">{t('myReservations')}</h2>
                    <div className="flex flex-col gap-2">
                        {reservations.filter(r => r.userId === user?.uid).length === 0 ? (
                            <p className="text-white/30 text-sm">{t('noData')}</p>
                        ) : reservations.filter(r => r.userId === user?.uid).map(r => {
                            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.confirmed
                            return (
                                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(155,114,207,0.1)' }}>
                                    <div className="flex items-center gap-4">
                                        <div className="text-center">
                                            <p className="text-white font-bold text-sm">{r.date?.slice(8, 10)}</p>
                                            <p className="text-white/40 text-xs uppercase">{r.date?.slice(5, 7) && ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(r.date.slice(5, 7))]}</p>
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{r.equipment}</p>
                                            <p className="text-white/50 text-xs"><Clock size={10} className="inline mr-1" />{r.startTime} – {r.endTime}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs px-2 py-1 rounded-full font-medium"
                                            style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                                        {r.status !== 'cancelled' && (
                                            <button onClick={() => handleCancel(r)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* New Reservation Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <div className="glass w-full max-w-md" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(155,114,207,0.2)' }}>
                            <h2 className="text-white font-semibold">{t('newReservation')}</h2>
                            <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="text-white/60 text-xs mb-1.5 block">{t('equipment')}</label>
                                <select className="input" value={form.equipment} onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}>
                                    {EQUIPMENT_LIST.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-white/60 text-xs mb-1.5 block">Fecha</label>
                                <input type="date" required className="input" value={form.date}
                                    min={format(new Date(), 'yyyy-MM-dd')}
                                    max={userProfile?.role === 'student' ? format(addDays(new Date(), 8), 'yyyy-MM-dd') : undefined}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                                {userProfile?.role === 'student' && (
                                    <p className="text-yellow-400 text-xs mt-1">Estudiantes: máx. 8 días adelante</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-white/60 text-xs mb-1.5 block">Hora inicio</label>
                                    <select className="input" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}>
                                        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-white/60 text-xs mb-1.5 block">Hora fin</label>
                                    <select className="input" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}>
                                        {HOURS.filter(h => h > form.startTime).map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    {userProfile?.role === 'student' && (
                                        <p className="text-yellow-400 text-xs mt-1">Máx. 6 horas</p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-white/60 text-xs mb-1.5 block">Propósito / Experimento</label>
                                <textarea className="input resize-none" rows={3} value={form.purpose}
                                    onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                                    placeholder="Describe el experimento a realizar..." />
                            </div>

                            {checkConflict(form.equipment, form.date, form.startTime, form.endTime) && (
                                <div className="flex items-center gap-2 p-3 rounded-xl"
                                    style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.3)' }}>
                                    <AlertTriangle size={14} className="text-blue-400 flex-shrink-0" />
                                    <p className="text-blue-400 text-xs">Este horario tiene conflicto. Serás agregado a la lista de espera.</p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1 justify-center">
                                    {t('cancel')}
                                </button>
                                <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
                                    {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                                    {t('confirm')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Maintenance Modal */}
            {showMaintenance && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <div className="glass w-full max-w-md p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white font-semibold">Programar Mantenimiento</h2>
                            <button onClick={() => setShowMaintenance(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleMaintenance} className="flex flex-col gap-4">
                            <select className="input" value={maintenanceForm.equipment} required
                                onChange={e => setMaintenanceForm(f => ({ ...f, equipment: e.target.value }))}>
                                <option value="">Seleccionar equipo...</option>
                                {EQUIPMENT_LIST.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                            </select>
                            <input type="date" className="input" required value={maintenanceForm.date}
                                onChange={e => setMaintenanceForm(f => ({ ...f, date: e.target.value }))} />
                            <input type="text" className="input" placeholder="Motivo del mantenimiento" required
                                value={maintenanceForm.reason} onChange={e => setMaintenanceForm(f => ({ ...f, reason: e.target.value }))} />
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowMaintenance(false)} className="btn-ghost flex-1 justify-center">Cancelar</button>
                                <button type="submit" className="btn-danger flex-1 justify-center">Bloquear Equipo</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
