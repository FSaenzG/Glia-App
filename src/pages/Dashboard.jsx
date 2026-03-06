// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { db } from '../firebase'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'

import {
    Calendar, AlertTriangle, FlaskConical,
    CheckCircle2, Clock, AlertCircle
} from 'lucide-react'

export default function Dashboard() {
    const navigate = useNavigate()
    const { userProfile, user } = useAuthStore()

    const [nextReservation, setNextReservation] = useState(null)
    const [recentActivity, setRecentActivity] = useState([])
    const [healthState, setHealthState] = useState({ text: 'Verificando...', issues: 0 })
    const [loading, setLoading] = useState(true)

    let firstName = 'Investigador'
    if (userProfile?.firstName && userProfile.firstName.trim() !== '') {
        firstName = userProfile.firstName
    } else if (user?.displayName) {
        firstName = user.displayName.split(' ')[0]
    }

    const groupName = userProfile?.group || 'Laboratorio'

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!user) return
            try {
                // Fetch next reservation
                const today = new Date().toISOString().split('T')[0]
                const resQ = query(
                    collection(db, 'reservations'),
                    where('userId', '==', user.uid),
                    where('status', '==', 'confirmed')
                )
                const resSnap = await getDocs(resQ)
                const allDocs = resSnap.docs.map(d => ({ id: d.id, ...d.data() }))

                const futureDocs = allDocs.filter(d => d.date >= today)
                futureDocs.sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date)
                    return a.startTime.localeCompare(b.startTime)
                })

                if (futureDocs.length > 0) {
                    setNextReservation(futureDocs[0])
                } else {
                    setNextReservation(null)
                }

                // Fetch recent activity
                let actSnap;
                try {
                    const actQ = query(
                        collection(db, 'audit_log'),
                        orderBy('timestamp', 'desc'),
                        limit(5)
                    )
                    actSnap = await getDocs(actQ)
                } catch (err) {
                    // Fallback if timestamp index is missing or field is createdAt
                    const actQ2 = query(collection(db, 'audit_log'), limit(15))
                    const tempSnap = await getDocs(actQ2)
                    const logs = tempSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    logs.sort((a, b) => {
                        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)
                        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0)
                        return timeB - timeA;
                    })
                    actSnap = { docs: logs.slice(0, 5).map(l => ({ id: l.id, data: () => l })) }
                }

                setRecentActivity(actSnap.docs.map(d => {
                    const data = d.data()
                    return { id: d.id, ...data }
                }))

                // Fetch health data
                const eqSnap = await getDocs(collection(db, 'equipment'))
                const inMaintenance = eqSnap.docs.filter(d => {
                    const status = d.data().status
                    return status === 'maintenance' || status === 'broken' || status === 'repair' || status === 'out_of_service'
                }).length

                const invSnap = await getDocs(collection(db, 'inventory'))
                const criticalInv = invSnap.docs.filter(d => {
                    const qnty = d.data().quantity || d.data().currentStock || 0
                    const min = d.data().minStock || 0
                    return qnty <= (min * 0.5)
                }).length

                const totalIssues = inMaintenance + criticalInv;
                if (totalIssues > 0) {
                    setHealthState({ text: `${totalIssues} atención(es) requerida(s)`, issues: totalIssues })
                } else {
                    setHealthState({ text: 'Sistema en estado óptimo', issues: 0 })
                }

            } catch (err) {
                console.error("Error fetching dashboard data:", err)
            } finally {
                setLoading(false)
            }
        }

        fetchDashboardData()
    }, [user])

    const quickActions = [
        { label: 'Reservas', icon: Calendar, colorClass: 'green', path: '/reservas' },
        { label: 'R. Daño', icon: AlertTriangle, colorClass: 'orange', path: '/damage-report' },
        { label: 'Inventario', icon: FlaskConical, colorClass: 'blue', path: '/inventario' },
    ]

    return (
        <div className="page-container" style={{ paddingBottom: '100px' }}>
            {/* Greeting Section */}
            <div className="greeting-section" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h1 className="greeting-title" style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Hola, {firstName}</h1>
                    {userProfile?.role === 'admin' && (
                        <span style={{ background: '#2D1B5E', color: 'white', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADMIN</span>
                    )}
                </div>
                <div className="greeting-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="status-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34C759' }} />
                    <span style={{ fontSize: '14px', color: '#666666', fontWeight: '700' }}>Laboratorio {groupName} operativo</span>
                </div>
            </div>

            {/* Lab Health Badge */}
            <div className="health-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: healthState.issues > 0 ? '#FEF2F2' : '#F0FDF4', color: healthState.issues > 0 ? '#EF4444' : '#16A34A', padding: '12px 16px', borderRadius: '16px', marginBottom: '32px', fontWeight: '800', fontSize: '13px' }}>
                {healthState.issues > 0 ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                <span>{healthState.text}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Next Activity Card */}
                    <div className="card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#9B72CF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>MI PRÓXIMA ACTIVIDAD</div>
                        {loading ? (
                            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Cargando...</h2>
                        ) : nextReservation ? (
                            <>
                                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 8px 0' }}>{nextReservation.equipmentName}</h2>
                                <div style={{ fontSize: '14px', color: '#666666', fontWeight: '600' }}>
                                    {format(parseISO(nextReservation.date), "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, c => c.toUpperCase())} • {nextReservation.startTime} - {nextReservation.endTime}
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#666666', margin: '0 0 8px 0' }}>No hay reservas próximas</h2>
                                <div style={{ fontSize: '14px', color: '#9CA3AF', fontWeight: '600' }}>Nada programado</div>
                            </>
                        )}
                        <button
                            onClick={() => navigate('/reservas')}
                            style={{ position: 'absolute', right: '24px', bottom: '24px', width: '48px', height: '48px', borderRadius: '16px', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: '#1A1A2E' }}
                        >
                            <Calendar size={20} />
                        </button>
                    </div>

                    {/* Quick Actions */}
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Accesos Rápidos</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            {quickActions.map((action) => {
                                const bgColors = { green: '#E8F8ED', orange: '#FFF4E5', blue: '#E5F0FF' }
                                const iconColors = { green: '#34C759', orange: '#FF9500', blue: '#007AFF' }
                                return (
                                    <div
                                        key={action.label}
                                        onClick={() => navigate(action.path)}
                                        className="card"
                                        style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                    >
                                        <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: bgColors[action.colorClass], display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColors[action.colorClass] }}>
                                            <action.icon strokeWidth={2.5} size={24} />
                                        </div>
                                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A2E' }}>
                                            {action.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <div>
                    {/* Activity Feed */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E' }}>Actividad Reciente</div>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#9B72CF', cursor: 'pointer' }}>Ver todo</div>
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
                                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E', marginBottom: '4px' }}>{item.action || item.type}</div>
                                    <div style={{ fontSize: '13px', color: '#666666', marginBottom: '12px', lineHeight: '1.4' }}>{item.details || item.detail}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9CA3AF', fontSize: '11px', fontWeight: '700' }}>
                                            <Clock size={12} />
                                            <span>{timeAgo}</span>
                                        </div>
                                        <div style={{ background: colorSet.bg, color: colorSet.text, padding: '4px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {item.userName || 'Sistema'}
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
