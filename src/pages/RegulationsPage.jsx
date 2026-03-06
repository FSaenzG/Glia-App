// src/pages/RegulationsPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import toast from 'react-hot-toast'
import { FileText, CheckCircle2 } from 'lucide-react'

const REGULATIONS_TEXT = `
REGLAMENTO DEL LABORATORIO DE NEUROBIOQUÍMICA

1. ACCESO Y HORARIOS
- El laboratorio está disponible 24/7/365.
- El acceso es personal e intransferible mediante carné institucional.
- Se debe registrar toda entrada y salida en el sistema Glia.

2. SEGURIDAD Y VESTIMENTA
- Uso obligatorio de bata blanca abrochada, guantes y gafas de seguridad según el protocolo.
- Prohibido el ingreso de alimentos, bebidas o fumar dentro del laboratorio.
- En caso de emergencia, presione el botón SOS en la aplicación y siga el protocolo de evacuación.

3. USO DE EQUIPOS Y RESERVAS
- Todo equipo debe ser reservado previamente en Glia.
- El tiempo máximo por reserva para estudiantes es de 4 horas.
- Equipos especializados (Microscopio de Fluorescencia, Termociclador) requieren certificación previa del administrador.
- Cualquier daño debe ser reportado inmediatamente mediante el botón "Reportar Daño".

4. REACTIVOS Y MATERIALES
- Registrar toda entrada y salida de reactivos en el inventario.
- No retirar materiales del laboratorio sin autorización del administrador.
- Consultar las fichas SDS antes de manipular sustancias desconocidas.

5. LIMPIEZA Y ORDEN
- El área de trabajo debe quedar limpia al finalizar la sesión.
- Se asignará un turno de aseo semanal basado en el uso de los equipos.
- El incumplimiento de las normas de limpieza resultará en penalización de puntos.
`

export default function RegulationsPage() {
    const [accepted, setAccepted] = useState(false)
    const [loading, setLoading] = useState(false)
    const { user, setUserProfile } = useAuthStore()
    const navigate = useNavigate()

    const handleContinue = async () => {
        if (!accepted || !user) return
        setLoading(true)
        try {
            const userRef = doc(db, 'users', user.uid)
            await updateDoc(userRef, {
                acceptedRegulations: true,
                acceptedRegulationsAt: serverTimestamp()
            })
            setUserProfile({ ...useAuthStore.getState().userProfile, acceptedRegulations: true })
            toast.success('Reglamento aceptado')
            navigate('/')
        } catch {
            toast.error('Error al guardar la aceptación')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-white flex flex-col p-6 max-w-[600px] mx-auto">
            <header className="mb-8">
                <h1 className="text-[24px] font-bold text-[#1A1A2E] mb-2">Reglamento del Laboratorio</h1>
                <p className="text-[#666666] text-[14px]">
                    Por favor lee y acepta las normas antes de continuar.
                </p>
            </header>

            <div className="flex-1 bg-[#F5F5F5] rounded-[16px] p-6 overflow-y-auto border border-[#E0E0E0] mb-8">
                <div className="flex items-center gap-2 mb-4 text-[#9B72CF]">
                    <FileText size={20} />
                    <span className="font-bold uppercase text-[12px] tracking-wider">Documento Oficial</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[#1A1A2E]">
                    {REGULATIONS_TEXT}
                </pre>
            </div>

            <div className="flex flex-col gap-4">
                <label htmlFor="regulations-checkbox" className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-1">
                        <input
                            id="regulations-checkbox"
                            type="checkbox"
                            className="peer hidden"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                        />
                        <div className="w-5 h-5 border-2 border-[#E0E0E0] rounded-[4px] peer-checked:bg-[#9B72CF] peer-checked:border-[#9B72CF] transition-all" />
                        <CheckCircle2
                            size={12}
                            className="absolute top-1 left-1 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                        />
                    </div>
                    <span className="text-[14px] text-[#666666] leading-snug">
                        He leído y acepto el reglamento del laboratorio de Neurobioquímica.
                    </span>
                </label>

                <button
                    onClick={handleContinue}
                    disabled={!accepted || loading}
                    className="btn btn-primary w-full disabled:opacity-50 disabled:grayscale transition-all h-[52px]"
                >
                    {loading ? 'Guardando...' : 'Continuar al Dashboard'}
                </button>
            </div>
        </div>
    )
}
