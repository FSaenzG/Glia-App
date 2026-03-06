// src/components/EmergencyButton.jsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { db } from '../firebase'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { AlertTriangle, X, Phone, Wind, Flame, Syringe, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'

const EMERGENCY_PROTOCOLS = [
    { icon: Flame, color: '#FF3B30', title: 'Incendio', steps: ['Activa la alarma de incendios', 'Evacua por la salida más cercana', 'Llama al 123', 'No uses ascensores', 'Reúnete en el punto de encuentro B-201'] },
    { icon: Syringe, color: '#FF9500', title: 'Derrame Químico', steps: ['No toques el derrame', 'Evacua el área afectada', 'Cierra la puerta', 'Notifica al coordinador de bioseguridad', 'Llama al ext. 5200'] },
    { icon: Wind, color: '#007AFF', title: 'Gas / Vapores', steps: ['Apaga todas las fuentes de ignición', 'Abre ventanas y puertas', 'Evacua inmediatamente', 'Llama a bomberos: 119', 'No re-ingreses sin autorización'] },
    { icon: ShieldAlert, color: '#34C759', title: 'Accidente / Herida', steps: ['Mantén la calma', 'Activa el kit de primeros auxilios', 'Llama a la enfermería: ext. 4800', 'No muevas al herido si hay trauma', 'Llama al 125 si es grave'] },
]

export default function EmergencyButton() {
    const location = useLocation()
    const { user, userProfile } = useAuthStore()
    const [open, setOpen] = useState(false)
    const [triggered, setTriggered] = useState(false)
    const [selectedProtocol, setSelectedProtocol] = useState(null)

    // Don't show on auth pages
    if (['/login', '/regulations'].some(p => location.pathname.startsWith(p))) return null
    if (!user) return null

    const handleTrigger = async () => {
        if (triggered) return
        setTriggered(true)
        try {
            await addDoc(collection(db, 'emergencyAlerts'), {
                triggeredBy: user.uid,
                userName: userProfile?.displayName || user.email,
                timestamp: serverTimestamp(),
                location: 'Laboratorio Neurobioquímica',
                status: 'active',
            })
            toast.error('🚨 Alerta de emergencia enviada al administrador', { duration: 8000 })
        } catch {
            toast.error('Error al enviar la alerta')
        }
        setTimeout(() => setTriggered(false), 10000)
    }

    return (
        <>
            {/* Fixed emergency button */}
            <button
                className="emergency-btn"
                onClick={() => setOpen(true)}
                title="Botón de emergencia">
                <AlertTriangle size={18} />
                <span className="text-sm">SOS</span>
            </button>

            {/* Modal */}
            {open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
                    <div className="w-full max-w-2xl glass overflow-hidden" style={{ border: '1px solid rgba(255,59,48,0.4)' }}>
                        {/* Header */}
                        <div className="p-5 flex items-center justify-between"
                            style={{ background: 'linear-gradient(135deg, rgba(255,59,48,0.2), rgba(204,42,33,0.1))' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
                                    <AlertTriangle size={20} className="text-white" />
                                </div>
                                <div>
                                    <h2 className="text-white font-bold text-lg">PROTOCOLO DE EMERGENCIA</h2>
                                    <p className="text-white/60 text-xs">Laboratorio de Neurobioquímica · PUJ</p>
                                </div>
                            </div>
                            <button onClick={() => { setOpen(false); setSelectedProtocol(null) }}
                                className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5">
                            {/* Alert button */}
                            <button
                                onClick={handleTrigger}
                                disabled={triggered}
                                className={`w-full py-4 rounded-xl font-bold text-white text-base mb-5 transition-all ${triggered ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01]'}`}
                                style={{ background: triggered ? 'rgba(255,59,48,0.3)' : 'linear-gradient(135deg, #FF3B30, #CC2A21)', boxShadow: triggered ? 'none' : '0 8px 25px rgba(255,59,48,0.4)' }}>
                                {triggered ? '✓ Alerta enviada al administrador' : '🚨 ALERTAR AL ADMINISTRADOR'}
                            </button>

                            {/* Emergency numbers */}
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                {[['123', 'Policía'], ['119', 'Bomberos'], ['125', 'Ambulancia'], ['ext. 4800', 'Enfermería'], ['ext. 5200', 'Bioseguridad'], ['ext. 2800', 'Seguridad']].map(([num, label]) => (
                                    <div key={num} className="flex items-center gap-2 p-3 rounded-xl"
                                        style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
                                        <Phone size={14} className="text-red-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-white font-bold text-sm">{num}</p>
                                            <p className="text-white/50 text-xs">{label}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Protocol selector */}
                            <p className="text-white/60 text-xs font-medium mb-3 uppercase tracking-wider">Selecciona el tipo de emergencia:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {EMERGENCY_PROTOCOLS.map((protocol) => (
                                    <button
                                        key={protocol.title}
                                        onClick={() => setSelectedProtocol(selectedProtocol?.title === protocol.title ? null : protocol)}
                                        className="text-left p-3 rounded-xl transition-all"
                                        style={{
                                            background: selectedProtocol?.title === protocol.title ? `${protocol.color}20` : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${selectedProtocol?.title === protocol.title ? protocol.color + '50' : 'rgba(255,255,255,0.1)'}`,
                                        }}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <protocol.icon size={16} style={{ color: protocol.color }} />
                                            <span className="text-white font-semibold text-sm">{protocol.title}</span>
                                        </div>
                                        {selectedProtocol?.title === protocol.title && (
                                            <ol className="mt-2 flex flex-col gap-1">
                                                {protocol.steps.map((step, i) => (
                                                    <li key={i} className="text-white/70 text-xs flex items-start gap-1.5">
                                                        <span className="text-white/40 font-bold">{i + 1}.</span> {step}
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
