// src/pages/AdminPage.jsx
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Bell, Users, Laptop, FileText, Activity, Settings, Circle } from 'lucide-react'

// Dummy data for connected users
const LIVE_USERS = [
    { id: 1, name: 'Dra. María Vargas', role: 'Investigadora Principal' },
    { id: 2, name: 'Juan García', role: 'Estudiante PhD' },
    { id: 3, name: 'Ana Torres', role: 'Técnico de Laboratorio' },
]

export default function AdminPage() {
    const navigate = useNavigate()

    return (
        <div className="page-container" style={{ paddingBottom: '90px', background: '#F5F5F5', minHeight: '100vh', margin: 0, maxWidth: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '40px', height: '40px', background: '#9B72CF', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LayoutDashboard size={20} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0, lineHeight: '1.2' }}>Panel de</h1>
                        <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', margin: 0, lineHeight: '1.2' }}>Administración</h1>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', width: '40px', height: '40px', background: '#FFFFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
                        <Bell size={20} color="#1A1A2E" />
                        <div style={{ position: 'absolute', top: '8px', right: '10px', width: '8px', height: '8px', background: '#FF3B30', borderRadius: '50%', border: '2px solid white' }} />
                    </div>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#2D1B5E', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(45,27,94,0.2)' }}>
                        A
                    </div>
                </div>
            </div>

            {/* View As User (Utility) */}
            <button
                onClick={() => navigate('/')}
                style={{ width: '100%', marginBottom: '24px', padding: '12px', background: '#E8F4FF', border: '1px solid #007AFF', borderRadius: '12px', color: '#0055CC', fontSize: '13px', fontWeight: '700', textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}
            >
                Cambiar a Vista de Usuario normal
            </button>

            {/* 2x2 Grid Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
                {[
                    { label: 'Usuarios', count: '45', icon: Users, color: '#007AFF', bg: '#E8F4FF' },
                    { label: 'Equipos', count: '12', icon: Laptop, color: '#34C759', bg: '#E8F8ED' },
                    { label: 'Reportes', count: '3', icon: FileText, color: '#9B72CF', bg: '#F0EBF8' },
                    { label: 'Auditoría', count: '128', icon: Activity, color: '#FF9500', bg: '#FFF3E0' },
                ].map(stat => (
                    <div key={stat.label} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: stat.bg, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <stat.icon size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <div style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', lineHeight: '1' }}>{stat.count}</div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#666666', marginTop: '4px' }}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Live Users Section */}
            <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', marginBottom: '16px' }}>Usuarios Conectados Ahora</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {LIVE_USERS.map(u => (
                        <div key={u.id} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '800', color: '#9B72CF' }}>
                                    {u.name.charAt(0)}
                                </div>
                                <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#FFFFFF', borderRadius: '50%', padding: '2px' }}>
                                    <div style={{ width: '12px', height: '12px', background: '#34C759', borderRadius: '50%' }} />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A2E', marginBottom: '2px' }}>{u.name}</div>
                                <div style={{ fontSize: '13px', color: '#666666', fontWeight: '500' }}>{u.role}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Admin Bottom Nav */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', background: '#FFFFFF', borderTop: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {[
                    { icon: LayoutDashboard, label: 'Inicio', active: true },
                    { icon: Users, label: 'Usuarios', active: false },
                    { icon: Laptop, label: 'Equipos', active: false },
                    { icon: Settings, label: 'Ajustes', active: false },
                ].map(nav => (
                    <div key={nav.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <nav.icon size={24} color={nav.active ? '#9B72CF' : '#9CA3AF'} strokeWidth={nav.active ? 2.5 : 2} />
                        <span style={{ fontSize: '10px', fontWeight: nav.active ? '700' : '600', color: nav.active ? '#9B72CF' : '#9CA3AF' }}>{nav.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
