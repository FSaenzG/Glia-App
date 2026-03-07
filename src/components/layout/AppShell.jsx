// src/components/layout/AppShell.jsx
import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { logoutUser } from '../../hooks/useAuth'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import toast from 'react-hot-toast'
import {
    Home, Calendar, FlaskConical,
    Bot, AlertTriangle, LogOut, Shield
} from 'lucide-react'

// Components
import ChatDrawer from '../ChatDrawer'
import NotificationsDropdown from '../NotificationsDropdown'

export default function AppShell() {
    const { userProfile, user } = useAuthStore()
    const navigate = useNavigate()
    const location = useLocation()
    const [chatOpen, setChatOpen] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (user) {
            try {
                updateDoc(doc(db, 'users', user.uid), {
                    lastActiveAt: serverTimestamp()
                }).catch(() => { })
            } catch (error) {
                // Ignore silent update errors
            }
        }
    }, [location.pathname, user])

    const handleLogout = async () => {
        try {
            await logoutUser()
            toast.success('Sesión cerrada')
        } catch {
            navigate('/login')
        }
    }

    const tabs = [
        { to: '/', icon: Home, label: 'Inicio' },
        { to: '/reservas', icon: Calendar, label: 'Reservas' },
        { to: '/inventario', icon: FlaskConical, label: 'Inventario' },
        ...(userProfile?.role === 'admin' ? [{ to: '/mi-lab', icon: Shield, label: 'Mi Lab' }] : []),
    ]

    const hideShellPaths = ['/login', '/regulations']
    if (hideShellPaths.includes(location.pathname)) return <Outlet />

    const {
        displayName = 'Miembro',
        group = 'Grupo de Investigación',
        role = 'Investigador'
    } = userProfile || {}

    return (
        <div className="app-layout">
            {/* Desktop Sidebar */}
            <aside className="desktop-sidebar">
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        <FlaskConical size={24} color="white" />
                    </div>
                    <span>Glia CRM</span>
                </div>

                <nav className="sidebar-nav">
                    {tabs.map((tab) => (
                        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                            <tab.icon size={20} />
                            <span>{tab.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="sos-sidebar-btn" onClick={() => navigate('/sos')}>
                        <AlertTriangle size={20} /> Emergencia SOS
                    </button>
                    <button className="sidebar-link" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <div className="main-area">
                {/* Sticky Header */}
                <div className="header">
                    <div className="header-logo lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: '#9a72cf', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FlaskConical size={20} color="white" />
                        </div>
                        Glia
                    </div>

                    {/* Desktop header left content */}
                    <div className="hidden lg:flex items-center text-[#666] font-medium text-[14px] gap-2">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="font-bold text-[#1A1A2E]">{displayName}</span>
                            <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                {currentTime.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} Bogotá (UTC-5)
                            </span>
                        </div>
                        <span className="text-[#E5E7EB]">—</span>
                        <span style={{ fontSize: '12px', background: '#F0EBF8', color: '#9B72CF', padding: '3px 8px', borderRadius: '8px', fontWeight: '800' }}>{group}</span>
                    </div>

                    <div className="header-icons ml-auto" style={{ marginLeft: 'auto' }}>
                        <NotificationsDropdown />
                        <div className="header-icon lg:hidden" onClick={handleLogout}>
                            <LogOut size={20} color="#1A1A1A" />
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <main className="main-content-scroll">
                    <Outlet />
                </main>
            </div>

            {/* Floating Buttons */}
            <button
                className="sos-button lg:hidden"
                onClick={() => navigate('/sos')}
                title="Emergencia SOS"
            >
                <AlertTriangle size={28} color="white" />
            </button>

            {!chatOpen && (
                <button
                    className="chatbot-button"
                    onClick={() => setChatOpen(true)}
                    title="Glia AI Chatbot"
                >
                    <Bot size={28} color="white" />
                </button>
            )}

            {/* Chat Overlay */}
            <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />

            {/* Bottom Navigation */}
            <nav className="bottom-nav lg:hidden">
                {tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        className={({ isActive }) => `nav-item ${isActive && !chatOpen ? 'active' : ''}`}
                        style={{ textDecoration: 'none' }}
                    >
                        <tab.icon strokeWidth={2.5} />
                        <span>{tab.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    )
}
