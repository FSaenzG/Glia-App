import { useState, useRef, useEffect } from 'react'
import { Bell, Clock, AlertTriangle, FlaskConical, Calendar } from 'lucide-react'

const MOCK_NOTIFICATIONS = [
    {
        id: 1, type: 'alert', title: 'Alerta de Temperatura',
        desc: 'Incubadora CO2 reporta fluctuaciones inusuales.', time: 'hace 10 min',
        icon: AlertTriangle, colorClass: 'text-[#FF3B30]', bgClass: 'bg-[#FFF0EF]'
    },
    {
        id: 2, type: 'success', title: 'Reserva Confirmada',
        desc: 'Tu reserva para Cabina 1 fue aprobada.', time: 'hace 1 hora',
        icon: Calendar, colorClass: 'text-[#34C759]', bgClass: 'bg-[#E8FFF0]'
    },
    {
        id: 3, type: 'info', title: 'Mantenimiento Programado',
        desc: 'Autoclave fuera de servicio mañana por mantenimiento.', time: 'hace 3 horas',
        icon: FlaskConical, colorClass: 'text-[#007AFF]', bgClass: 'bg-[#E8F4FF]'
    }
]

export default function NotificationsDropdown() {
    const [isOpen, setIsOpen] = useState(false)
    const [hasUnread, setHasUnread] = useState(true)
    const dropdownRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const toggleDropdown = () => {
        setIsOpen(!isOpen)
        if (!isOpen) {
            setHasUnread(false) // Mark as read when opening
        }
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="header-icon" style={{ position: 'relative', cursor: 'pointer' }} onClick={toggleDropdown}>
                <Bell size={20} color="#1A1A1A" />
                {hasUnread && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', width: '8px', height: '8px', background: '#FF3B30', borderRadius: '50%', border: '2px solid #fff' }}></div>
                )}
            </div>

            {isOpen && (
                <div
                    style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '320px', background: '#FFFFFF', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden', animation: 'scaleIn 0.2s ease-out', transformOrigin: 'top right' }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Notificaciones</h3>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#9B72CF', cursor: 'pointer' }}>Marcar leídas</span>
                    </div>

                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                        {MOCK_NOTIFICATIONS.map((notif) => (
                            <div
                                key={notif.id}
                                style={{ padding: '16px', borderBottom: '1px solid #F5F5F5', display: 'flex', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                                onClick={() => {
                                    setIsOpen(false)
                                    // Could navigate or open related ticket
                                }}
                            >
                                <div className={notif.bgClass} style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <notif.icon className={notif.colorClass} size={20} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A2E' }}>{notif.title}</div>
                                    <div style={{ fontSize: '13px', color: '#666666', lineHeight: '1.4' }}>{notif.desc}</div>
                                    <div style={{ fontSize: '11px', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                        <Clock size={12} />
                                        {notif.time}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: '12px', background: '#F8F8F8', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: '#666666', cursor: 'pointer', borderTop: '1px solid #F0F0F0' }}>
                        Ver todas las notificaciones
                    </div>

                    <style>{`
                        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                    `}</style>
                </div>
            )}
        </div>
    )
}
