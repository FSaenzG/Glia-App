import { useState, useRef, useEffect } from 'react'
import { Bell, Clock, AlertTriangle, FlaskConical, Calendar, CheckCircle2, User, Star } from 'lucide-react'
import { db } from '../firebase'
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch, getDocs } from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const getIcon = (type) => {
    switch (type) {
        case 'reservation_confirmed': return { icon: Calendar, color: 'text-[#34C759]', bg: 'bg-[#E8F8ED]' }
        case 'reservation_cancelled': return { icon: AlertTriangle, color: 'text-[#FF3B30]', bg: 'bg-[#FFF0EF]' }
        case 'low_stock': return { icon: FlaskConical, color: 'text-[#EA580C]', bg: 'bg-[#FFF4E5]' }
        case 'damage_report': return { icon: AlertTriangle, color: 'text-[#FF3B30]', bg: 'bg-[#FFF0EF]' }
        case 'cert_approved': return { icon: Star, color: 'text-[#9B72CF]', bg: 'bg-[#F0EBF8]' }
        case 'cleaning_duty': return { icon: CheckCircle2, color: 'text-[#007AFF]', bg: 'bg-[#E5F0FF]' }
        default: return { icon: Bell, color: 'text-[#64748B]', bg: 'bg-[#F1F5F9]' }
    }
}

export default function NotificationsDropdown() {
    const { user } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState([])
    const dropdownRef = useRef(null)

    useEffect(() => {
        if (!user) return
        const q = query(
            collection(db, 'notifications', user.uid, 'items'),
            orderBy('createdAt', 'desc'),
            limit(20)
        )
        return onSnapshot(q, (snap) => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })
    }, [user])

    const unreadCount = notifications.filter(n => !n.read).length

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const toggleDropdown = () => setIsOpen(!isOpen)

    const markAllRead = async () => {
        if (!user) return
        const unread = notifications.filter(n => !n.read)
        if (unread.length === 0) return

        const batch = writeBatch(db)
        unread.forEach(n => {
            batch.update(doc(db, 'notifications', user.uid, 'items', n.id), { read: true })
        })
        await batch.commit()
    }

    const markRead = async (id) => {
        if (!user) return
        await updateDoc(doc(db, 'notifications', user.uid, 'items', id), { read: true })
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="header-icon" style={{ position: 'relative', cursor: 'pointer' }} onClick={toggleDropdown}>
                <Bell size={20} color="#1A1A1A" />
                {unreadCount > 0 && (
                    <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#FF3B30', color: 'white', fontSize: '10px', fontWeight: '800', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                        {unreadCount}
                    </div>
                )}
            </div>

            {isOpen && (
                <div
                    style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '320px', background: '#FFFFFF', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden', animation: 'scaleIn 0.2s ease-out', transformOrigin: 'top right' }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Notificaciones</h3>
                        {unreadCount > 0 && (
                            <span onClick={markAllRead} style={{ fontSize: '12px', fontWeight: '800', color: '#9B72CF', cursor: 'pointer' }}>Marcar todas como leídas</span>
                        )}
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No tienes notificaciones.</div>
                        ) : (
                            notifications.map((notif) => {
                                const { icon: Icon, color, bg } = getIcon(notif.type)
                                const timeAgo = notif.createdAt?.toDate ? formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true, locale: es }) : 'hace un momento'

                                return (
                                    <div
                                        key={notif.id}
                                        style={{
                                            padding: '16px',
                                            borderBottom: '1px solid #F5F5F5',
                                            display: 'flex',
                                            gap: '12px',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                            background: notif.read ? 'white' : '#F0EBF833'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = notif.read ? 'white' : '#F0EBF833'}
                                        onClick={() => {
                                            markRead(notif.id)
                                            setIsOpen(false)
                                        }}
                                    >
                                        <div className={bg} style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon className={color} size={20} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                            <div style={{ fontSize: '13px', color: '#1A1A2E', lineHeight: '1.4', fontWeight: notif.read ? '500' : '800' }}>{notif.message}</div>
                                            <div style={{ fontSize: '11px', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: '700' }}>
                                                <Clock size={12} />
                                                {timeAgo}
                                            </div>
                                        </div>
                                        {!notif.read && <div style={{ width: '8px', height: '8px', background: '#9B72CF', borderRadius: '50%', flexShrink: 0, marginTop: '4px' }}></div>}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    <style>{`
                        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                    `}</style>
                </div>
            )}
        </div>
    )
}
