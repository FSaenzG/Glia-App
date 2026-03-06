// src/pages/CleaningPage.jsx
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, CalendarDays, Users } from 'lucide-react'

const MOCK_ROTATION = [
    { id: 1, user: 'Dr. Alejandro Navarro', area: 'Cabinas de Cultivo 1-3', status: 'done', photo: null },
    { id: 2, user: 'Maria Jose Gomez', area: 'Zona de Reactivos B', status: 'pending', photo: null },
    { id: 3, user: 'Andres Felipe (Tú)', area: 'Microscopios y Mesas', status: 'pending', isMe: true },
    { id: 4, user: 'Natalia Restrepo', area: 'Cabina de Bacterias', status: 'pending' },
]

export default function CleaningPage() {
    const navigate = useNavigate()

    return (
        <div className="page-container bg-white min-h-screen">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate(-1)} className="text-[#1A1A2E]">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-[24px]">Limpieza Semanal</h1>
            </div>

            <div className="card-dark !p-5 !rounded-[24px] mb-8 relative overflow-hidden">
                <Sparkles className="absolute top-[-10px] right-[-10px] text-white/10" size={100} />
                <div className="relative z-10">
                    <span className="text-[#9B72CF] text-[11px] font-bold uppercase tracking-widest mb-3 block">
                        Semana 10: Marzo 03 - 09
                    </span>
                    <h2 className="text-white text-[20px] mb-2">Rotación Actual</h2>
                    <p className="text-white/70 text-[14px]">
                        La limpieza debe realizarse antes del viernes a las 18:00.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-4 mb-10">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-[17px] flex items-center gap-2">
                        <Users size={18} className="text-[#9CA3AF]" />
                        Personal Asignado
                    </h3>
                    <span className="text-[12px] bg-[#F5F5F5] px-3 py-1 rounded-full font-bold text-[#666666]">
                        4 Usuarios
                    </span>
                </div>

                <div className="flex flex-col gap-3">
                    {MOCK_ROTATION.map((item) => (
                        <div
                            key={item.id}
                            className={`card flex items-center justify-between border-2 transition-all ${item.isMe ? 'border-[#9B72CF] shadow-lg bg-[#F9F7FF]' : 'border-transparent'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#9CA3AF] font-bold">
                                    {item.user.charAt(0)}
                                </div>
                                <div>
                                    <h4 className={`text-[15px] font-bold ${item.isMe ? 'text-[#9B72CF]' : 'text-[#1A1A2E]'}`}>
                                        {item.user}
                                    </h4>
                                    <p className="text-[12px] text-[#9CA3AF]">{item.area}</p>
                                </div>
                            </div>

                            {item.status === 'done' ? (
                                <CheckCircle2 className="text-[#34C759]" size={24} />
                            ) : item.isMe ? (
                                <button
                                    onClick={() => {
                                        toast.success('¡Limpieza completada! +20 puntos.')
                                        setTimeout(() => navigate('/mi-lab'), 1000)
                                    }}
                                    className="bg-[#9B72CF] text-white px-4 py-2 rounded-[10px] text-[12px] font-bold uppercase active:scale-95 transition-transform">
                                    Completar
                                </button>
                            ) : (
                                <div className="w-6 h-6 rounded-full border-2 border-[#E0E0E0]" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <section className="bg-[#FFF3E0] p-6 rounded-[24px] border border-[#FFE0B2]">
                <h4 className="flex items-center gap-2 text-[#FF9500] font-bold text-[14px] mb-2">
                    <AlertTriangle size={18} />
                    Importante
                </h4>
                <p className="text-[13px] text-[#856404] leading-relaxed">
                    Las asignaciones se generan automáticamente cada lunes basadas en tu uso del laboratorio la semana anterior. El incumplimiento resta <span className="font-bold">20 puntos</span> de tu perfil.
                </p>
            </section>
        </div>
    )
}
