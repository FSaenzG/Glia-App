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
    Bot, AlertTriangle, LogOut, Shield, Wrench, Download, BookOpen, Share2, Layout, Heart, Activity
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
    const [installPrompt, setInstallPrompt] = useState(null)
    const [isInstalled, setIsInstalled] = useState(false)

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            setIsInstalled(true)
        }

        // Listen for the custom event from main.jsx
        const handlePrompt = () => {
            setInstallPrompt(window.deferredPrompt)
        }

        // If it was already set before this effect runs
        if (window.deferredPrompt) {
            setInstallPrompt(window.deferredPrompt)
        }

        window.addEventListener('pwa-prompt-available', handlePrompt)
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true)
            setInstallPrompt(null)
            window.deferredPrompt = null
        })

        return () => {
            clearInterval(timer)
            window.removeEventListener('pwa-prompt-available', handlePrompt)
        }
    }, [])

    const handleInstallClick = async () => {
        if (!installPrompt) return
        installPrompt.prompt()
        const { outcome } = await installPrompt.userChoice
        if (outcome === 'accepted') {
            setInstallPrompt(null)
            window.deferredPrompt = null
        }
    }

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
        { to: '/equipos', icon: Wrench, label: 'Equipos' },
        { to: '/documentos', icon: BookOpen, label: 'Biblioteca' },
        { to: '/feed', icon: Share2, label: 'Lab Feed' },
        { to: '/proyectos', icon: Layout, label: 'Proyectos' },
        { to: '/animales', icon: Heart, label: 'Bienestar' },
        { to: '/estadisticas', icon: Activity, label: 'Actividad' },
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
                <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '24px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="logo-icon">
                            <FlaskConical size={20} color="white" />
                        </div>
                        <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: '700', fontStyle: 'italic', fontSize: '24px', color: '#9B72CF' }}>Glia</span>
                    </div>
                    <span style={{ fontSize: '7px', fontFamily: 'Manrope, sans-serif', fontWeight: '800', color: '#9B72CF', letterSpacing: '1px', lineHeight: '1.2' }}>PONTIFICIA UNIVERSIDAD JAVERIANA<br />FACULTAD DE CIENCIAS</span>
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
                <div className="header" style={{ height: 'auto', padding: '12px 16px' }}>
                    <div className="header-logo lg:hidden" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '4px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ background: '#9a72cf', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FlaskConical size={18} color="white" />
                            </div>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: '700', fontStyle: 'italic', fontSize: '24px', color: '#9B72CF' }}>Glia</span>
                        </div>
                        <span style={{
                            fontSize: '9px',
                            fontFamily: 'Manrope, sans-serif',
                            fontWeight: '800',
                            color: '#9B72CF',
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            marginTop: '2px'
                        }}>
                            PONTIFICIA UNIVERSIDAD JAVERIANA · FACULTAD DE CIENCIAS
                        </span>
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

                    <div className="header-icons ml-auto" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {installPrompt && !isInstalled && (
                            <button
                                onClick={handleInstallClick}
                                className="install-app-btn"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#9B72CF',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(155,114,207,0.3)'
                                }}
                            >
                                <Download size={16} /> Instalar
                            </button>
                        )}
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
                    <span>🧬</span>
                </button>
            )}

            {/* Chat Overlay */}
            <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />

            {/* Design Credit */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                paddingBottom: '8px',
                position: 'fixed',
                bottom: '64px',
                left: '0',
                right: '0',
                zIndex: 90,
                pointerEvents: 'none',
                maxWidth: '480px',
                margin: '0 auto'
            }}>
                <span style={{ fontSize: '10px', color: '#BBBBBB', fontFamily: 'Manrope, sans-serif' }}>Designed by</span>
                <span style={{ fontSize: '11px', color: '#9B72CF', fontFamily: "'Playfair Display', serif", fontWeight: '700', fontStyle: 'italic' }}>Effe</span>
            </div>

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
