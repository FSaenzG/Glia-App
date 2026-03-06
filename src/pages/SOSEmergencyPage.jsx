// src/pages/SOSEmergencyPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertTriangle, Phone, Loader2, HeartPulse, FlaskConical, Biohazard, Wrench, CircleEllipsis } from 'lucide-react'

export default function SOSEmergencyPage() {
    const navigate = useNavigate()
    const [step, setStep] = useState('screening') // 'screening' | 'active'
    const [selectedType, setSelectedType] = useState(null)

    const emergencyTypes = [
        { id: 'medical', label: 'Médica', icon: HeartPulse, color: '#FF3B30' },
        { id: 'chemical', label: 'Química', icon: FlaskConical, color: '#FF9500' },
        { id: 'biological', label: 'Biológica', icon: Biohazard, color: '#9B72CF' },
        { id: 'equipment', label: 'Equipos', icon: Wrench, color: '#007AFF' },
        { id: 'other', label: 'Otra', icon: CircleEllipsis, color: '#666666' },
    ]

    const handleConfirm = () => {
        if (selectedType) setStep('active')
    }

    if (step === 'screening') {
        return (
            <div className="page-container" style={{ minHeight: '100vh', background: '#F7F6F8' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', background: '#FF3B30', borderRadius: '50%' }} />
                        S.O.S. REPORTE
                    </h1>
                    <button onClick={() => navigate(-1)} style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <X size={20} color="#1A1A2E" />
                    </button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E', marginBottom: '8px' }}>¿Qué tipo de emergencia?</h2>
                    <p style={{ fontSize: '14px', color: '#666666' }}>Selecciona la opción que mejor describa la situación actual.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
                    {emergencyTypes.map(type => (
                        <div
                            key={type.id}
                            onClick={() => setSelectedType(type.id)}
                            style={{
                                background: selectedType === type.id ? `${type.color}15` : '#FFFFFF',
                                border: `2px solid ${selectedType === type.id ? type.color : 'transparent'}`,
                                borderRadius: '16px', padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.2s',
                                gridColumn: type.id === 'other' ? 'span 2' : 'span 1'
                            }}
                        >
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${type.color}20`, color: type.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                                <type.icon size={24} strokeWidth={2.5} />
                            </div>
                            <span style={{ fontSize: '15px', fontWeight: '700', color: '#1A1A2E' }}>{type.label}</span>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedType}
                        style={{ width: '100%', height: '56px', background: selectedType ? '#FF3B30' : '#E0E0E0', color: 'white', borderRadius: '16px', fontSize: '16px', fontWeight: '800', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: selectedType ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: selectedType ? '0 4px 16px rgba(255, 59, 48, 0.3)' : 'none' }}
                    >
                        Activar Alarma
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ width: '100%', height: '56px', background: 'transparent', color: '#666666', fontSize: '15px', fontWeight: '700', border: 'none', marginTop: '12px', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container" style={{ minHeight: '100vh', background: 'rgba(255,59,48,0.05)', position: 'relative', overflow: 'hidden', margin: 0, maxWidth: '100%' }}>
            {/* Red Tint Gradient */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40vh', background: 'linear-gradient(180deg, rgba(255,59,48,0.15) 0%, rgba(255,59,48,0) 100%)', zIndex: 0 }} />

            <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: '40px' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', background: '#FF3B30', borderRadius: '50%' }} />
                        S.O.S. GLIA
                    </h1>
                </div>

                {/* Main Action Area */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{
                        width: '120px', height: '120px', background: '#FF3B30', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                        boxShadow: '0 0 0 16px rgba(255,59,48,0.2)', marginBottom: '32px',
                        animation: 'pulse-red 2s infinite'
                    }}>
                        <AlertTriangle size={56} strokeWidth={2.5} />
                    </div>

                    <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#FF3B30', marginBottom: '16px', letterSpacing: '-0.5px' }}>EMERGENCIA ACTIVADA</h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', padding: '12px 24px', borderRadius: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
                        <Loader2 size={18} color="#FF3B30" className="animate-spin" />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A2E' }}>Notificando al administrador...</span>
                    </div>

                    <div style={{ width: '100%', maxWidth: '280px', height: '6px', background: '#F0F0F0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '85%', height: '100%', background: '#FF3B30', borderRadius: '3px' }} />
                    </div>
                </div>

                {/* Protocol Card */}
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#FF3B30', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Protocolo de Emergencia</div>
                    <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#1A1A2E', lineHeight: '1.6', fontWeight: '500' }}>
                        <li style={{ marginBottom: '8px' }}>Aléjese de la fuente de peligro (fuego, químicos, gas).</li>
                        <li style={{ marginBottom: '8px' }}>Si hay fuego, active la alarma sonora más cercana.</li>
                        <li>Espere instrucciones del administrador de área.</li>
                    </ul>
                </div>

                {/* Contacts */}
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '12px' }}>Contactos Rápidos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
                    {[
                        { name: 'Seguridad Universidad', detail: 'Extensión 1234', color: '#1A1A2E' },
                        { name: 'Línea de Vida', detail: '123', color: '#007AFF' }
                    ].map(c => (
                        <div key={c.name} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: '800', color: c.color, marginBottom: '2px' }}>{c.name}</div>
                                <div style={{ fontSize: '13px', color: '#666666', fontWeight: '500' }}>{c.detail}</div>
                            </div>
                            <button style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>
                                <Phone size={18} color={c.color} />
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 'auto', paddingBottom: '16px' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ width: '100%', height: '56px', background: 'transparent', border: '2px solid #E0E0E0', borderRadius: '16px', color: '#1A1A2E', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        Falsa Alarma / Cancelar
                    </button>
                </div>
            </div>

            <style>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}
