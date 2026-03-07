// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { db } from '../firebase'
import { collection, query, where, orderBy, limit, getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore'
import { formatDistanceToNow, parseISO, format, isAfter, parseISO as parseDateISO } from 'date-fns'
import { es } from 'date-fns/locale'

import {
    Calendar, AlertTriangle, FlaskConical,
    Clock, ArrowRight
} from 'lucide-react'

export default function Dashboard() {
    const navigate = useNavigate()
    const { userProfile, user } = useAuthStore()

    const [nextReservation, setNextReservation] = useState(null)
    const [recentActivity, setRecentActivity] = useState([])
    const [stockAlerts, setStockAlerts] = useState([])
    const [loadingNext, setLoadingNext] = useState(true)
    const [loading, setLoading] = useState(true)

    let firstName = 'Investigador'
    if (userProfile?.firstName && userProfile.firstName.trim() !== '') {
        firstName = userProfile.firstName
    } else if (user?.displayName) {
        firstName = user.displayName.split(' ')[0]
    }

    const groupName = userProfile?.group || 'Laboratorio'

    // Real-time listener for next reservation — updates when admin deletes or user creates
    useEffect(() => {
        if (!user?.uid) return

        // Single where clause (no composite index needed)
        const resQ = query(
            collection(db, 'reservations'),
            where('userId', '==', user.uid)
        )
        const unsub = onSnapshot(resQ, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))

            const now = new Date()
            const nowStr = now.toISOString().split('T')[0]  // "YYYY-MM-DD"
            const nowTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`   // "HH:MM"

            const future = all.filter(res => {
                if (!res.date) return false
                if (res.status !== 'confirmed') return false

                // Strictly future date → always include
                if (res.date > nowStr) return true

                // Today → include only if endTime hasn't passed yet
                if (res.date === nowStr) {
                    const endTime = res.endTime || '23:59'
                    // Handle "24:00" as end of day
                    return endTime === '24:00' || endTime > nowTime
                }

                // Past date → exclude
                return false
            })

            future.sort((a, b) => {
                const dateComp = (a.date || '').localeCompare(b.date || '')
                if (dateComp !== 0) return dateComp
                return (a.startTime || '').localeCompare(b.startTime || '')
            })

            setNextReservation(future.length > 0 ? future[0] : null)
            setLoadingNext(false)
        }, (err) => {
            console.error('Reservations onSnapshot error:', err)
            setLoadingNext(false)
        })
        return unsub
    }, [user?.uid])

    // Fetch audit log + stock alerts (less frequently, not real-time needed)
    useEffect(() => {
        const fetchStatic = async () => {
            if (!user) return
            try {
                // Recent activity
                let actSnap;
                try {
                    const actQ = query(
                        collection(db, 'audit_log'),
                        orderBy('createdAt', 'desc'),
                        limit(5)
                    )
                    actSnap = await getDocs(actQ)
                } catch (err) {
                    const actQ2 = query(collection(db, 'audit_log'), limit(20))
                    const tempSnap = await getDocs(actQ2)
                    let logs = tempSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    logs.sort((a, b) => {
                        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
                        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
                        return timeB - timeA;
                    })
                    actSnap = { docs: logs.slice(0, 5).map(l => ({ id: l.id, data: () => l })) }
                }

                const logsMap = actSnap.docs.map(d => ({ id: d.id, ...d.data() }))

                const uniqueUserIds = [...new Set(logsMap.map(log => log.userId).filter(Boolean))]
                const photoMap = {}
                for (const uid of uniqueUserIds) {
                    try {
                        const snap = await getDoc(doc(db, 'users', uid))
                        if (snap.exists()) photoMap[uid] = snap.data().photoURL || null
                    } catch (e) { }
                }

                setRecentActivity(logsMap.map(log => ({
                    ...log,
                    userPhoto: log.userPhoto || photoMap[log.userId] || null
                })))

                // Stock alerts
                const invQ = query(collection(db, 'inventory'), where('group', '==', groupName))
                const invSnap = await getDocs(invQ)
                const alerts = invSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(item => item.quantity <= item.minStock)
                setStockAlerts(alerts)
            } catch (err) {
                console.error('Error fetching dashboard static data:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchStatic()
    }, [user])

    const quickActions = [
        { label: 'Mis reservas', icon: Calendar, colorClass: 'green', path: '/reservas' },
        { label: 'Inventario', icon: FlaskConical, colorClass: 'blue', path: '/inventario' },
        { label: 'Reportar Daño', icon: AlertTriangle, colorClass: 'orange', path: '/damage-report', fullWidth: true },
    ]

    return (
        <div className="page-container" style={{ paddingBottom: '100px' }}>
            {/* Greeting Section */}
            <div className="greeting-section" style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h1 className="greeting-title" style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Hola, {firstName}</h1>
                    {userProfile?.role === 'admin' && (
                        <span style={{ background: '#2D1B5E', color: 'white', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADMIN</span>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Next Activity Card */}
                    <div className="card" style={{ padding: '24px', position: 'relative', overflow: 'hidden', borderLeft: '5px solid #9B72CF' }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', color: '#9B72CF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>MI PRÓXIMA ACTIVIDAD</div>
                        {loadingNext ? (
                            <div style={{ fontSize: '14px', color: '#9CA3AF', fontWeight: '600' }}>Cargando...</div>
                        ) : nextReservation ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#1A1A2E', margin: 0, letterSpacing: '-0.02em' }}>{nextReservation.equipmentName}</h2>
                                <div style={{ fontSize: '14px', color: '#64748B', fontWeight: '600', textTransform: 'capitalize' }}>
                                    {format(parseISO(nextReservation.date), "EEEE d 'de' MMMM", { locale: es })}
                                </div>
                                <div style={{ fontSize: '20px', color: '#9B72CF', fontWeight: '900' }}>
                                    {nextReservation.startTime} — {nextReservation.endTime}
                                </div>
                                <div style={{ marginTop: '4px' }}>
                                    <span style={{ background: '#E8F8ED', color: '#16A34A', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Confirmada</span>
                                </div>
                                <button
                                    onClick={() => navigate('/reservas')}
                                    style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#1A1A2E', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', width: 'fit-content' }}
                                >
                                    Ver reserva <ArrowRight size={14} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#94A3B8', margin: 0 }}>Sin actividades programadas</h2>
                                <div style={{ fontSize: '14px', color: '#CBD5E1', fontWeight: '500' }}>Reserva un equipo para comenzar.</div>
                                <button
                                    onClick={() => navigate('/reservas')}
                                    style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '12px', padding: '10px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', width: 'fit-content' }}
                                >
                                    Ir a Reservas <ArrowRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Accesos Rápidos</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {quickActions.map((action, idx) => {
                                const bgColors = { green: '#E8F8ED', orange: '#FFF0EF', blue: '#E5F0FF' }
                                const iconColors = { green: '#34C759', orange: '#FF3B30', blue: '#007AFF' }
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => navigate(action.path)}
                                        className="card"
                                        style={{
                                            padding: action.fullWidth ? '24px' : '16px',
                                            display: 'flex',
                                            flexDirection: action.fullWidth ? 'row' : 'column',
                                            alignItems: 'center',
                                            justifyContent: action.fullWidth ? 'flex-start' : 'center',
                                            gap: '16px',
                                            cursor: 'pointer',
                                            gridColumn: action.fullWidth ? 'span 2' : 'auto',
                                            border: action.fullWidth ? '1px solid #FFD6D6' : 'none',
                                            background: action.fullWidth ? '#FFF0EF' : '#FFFFFF'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px', height: '48px', borderRadius: '16px',
                                            background: action.fullWidth ? '#FFD6D6' : bgColors[action.colorClass],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColors[action.colorClass],
                                            flexShrink: 0
                                        }}>
                                            <action.icon strokeWidth={2.5} size={24} />
                                        </div>
                                        <span style={{ fontSize: action.fullWidth ? '15px' : '13px', fontWeight: '800', color: '#1A1A2E' }}>
                                            {action.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Stock Alerts Section */}
                    {stockAlerts.length > 0 && (
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Alertas de Stock</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {stockAlerts.map((alert, idx) => (
                                    <div key={alert.id} className="card" style={{ padding: '16px', borderLeft: '4px solid #FF3B30', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '4px' }}>{alert.name}</div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>Quedan {alert.quantity} {alert.unit} (Mín: {alert.minStock})</div>
                                        </div>
                                        <button
                                            onClick={() => navigate('/inventario')}
                                            style={{ background: '#FFF0EF', color: '#FF3B30', border: '1px solid #FFD6D6', borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', width: '100%' }}
                                        >
                                            REVISAR
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    {/* Activity Feed */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E' }}>Actividad Reciente</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', color: '#9B72CF', padding: '16px', fontWeight: 'bold' }}>Cargando actividad...</div>
                        ) : recentActivity.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#666666', padding: '16px' }}>No hay actividad reciente</div>
                        ) : recentActivity.map((item) => {
                            let itemType = 'blue'
                            const actionLower = (item.action || '').toLowerCase()
                            if (actionLower.includes('error') || actionLower.includes('damage') || actionLower.includes('daño')) itemType = 'red'
                            if (actionLower.includes('reservation') || actionLower.includes('reserva')) itemType = 'green'
                            if (actionLower.includes('inventory') || actionLower.includes('inventario') || actionLower.includes('movimiento')) itemType = 'orange'

                            const badgeColors = {
                                blue: { bg: '#E5F0FF', text: '#007AFF' },
                                red: { bg: '#FEF2F2', text: '#EF4444' },
                                green: { bg: '#E8F8ED', text: '#16A34A' },
                                orange: { bg: '#FFF4E5', text: '#EA580C' }
                            }
                            const colorSet = badgeColors[itemType] || badgeColors.blue

                            const timeRef = item.timestamp || item.createdAt
                            const timeAgo = timeRef?.toDate ? formatDistanceToNow(timeRef.toDate(), { addSuffix: true, locale: es }) : 'reciente'

                            return (
                                <div key={item.id} className="card" style={{ padding: '16px', borderLeft: `4px solid ${colorSet.text}` }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <img
                                            src={item.userPhoto || `https://ui-avatars.com/api/?name=${item.userName || 'U'}&background=random`}
                                            alt="Avatar"
                                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: '#F5F5F5' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '4px' }}>
                                                {(!item.userName || item.userName === 'undefined undefined') ? 'Usuario Glia' : item.userName}
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#666666', marginBottom: '12px', lineHeight: '1.4' }}>
                                                {item.detail}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9CA3AF', fontSize: '11px', fontWeight: '700' }}>
                                            <Clock size={12} />
                                            <span>{timeAgo}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
