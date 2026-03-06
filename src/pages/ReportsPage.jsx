// src/pages/ReportsPage.jsx

import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, BarChart3, Download, Package, Calendar } from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const MOCK_DATA = [
    { name: 'Lun', uso: 12 },
    { name: 'Mar', uso: 18 },
    { name: 'Mie', uso: 15 },
    { name: 'Jue', uso: 24 },
    { name: 'Vie', uso: 22 },
    { name: 'Sab', uso: 8 },
    { name: 'Dom', uso: 4 },
]

export default function ReportsPage() {
    const navigate = useNavigate()

    return (
        <div className="page-container bg-white min-h-screen">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate(-1)} className="text-[#1A1A2E]">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-[24px]">Reportes</h1>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="card !p-4">
                    <div className="bg-[#EDE7F6] w-10 h-10 rounded-[12px] flex items-center justify-center text-[#9B72CF] mb-3">
                        <TrendingUp size={20} />
                    </div>
                    <p className="text-[20px] font-black text-[#1A1A2E]">84%</p>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Productividad</p>
                </div>
                <div className="card !p-4">
                    <div className="bg-[#E8F8ED] w-10 h-10 rounded-[12px] flex items-center justify-center text-[#34C759] mb-3">
                        <Package size={20} />
                    </div>
                    <p className="text-[20px] font-black text-[#1A1A2E]">4</p>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Alertas Stock</p>
                </div>
            </div>

            {/* Usage Chart */}
            <section className="card !p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[17px] flex items-center gap-2">
                        <BarChart3 size={18} className="text-[#9CA3AF]" />
                        Uso Semanal
                    </h3>
                    <span className="text-[12px] font-bold text-[#9B72CF]">MARZO 2026</span>
                </div>

                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={MOCK_DATA}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F5" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#9CA3AF' }}
                            />
                            <YAxis hide domain={[0, 'auto']} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="uso" radius={[6, 6, 0, 0]}>
                                {MOCK_DATA.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 3 ? '#9B72CF' : '#EDE7F6'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Exports */}
            <section className="mb-10">
                <h3 className="text-[17px] mb-4">Exportar Datos</h3>
                <div className="flex flex-col gap-3">
                    <button className="btn btn-ghost !justify-between !h-[64px] !rounded-[16px] border-2 border-[#F5F5F5]">
                        <div className="flex items-center gap-3">
                            <div className="bg-[#F5F5F5] w-10 h-10 rounded-[10px] flex items-center justify-center text-[#1A1A2E]">
                                <FileText size={20} />
                            </div>
                            <div className="text-left font-bold py-1">
                                <p className="text-[14px]">Inventario Completo</p>
                                <p className="text-[11px] text-[#9CA3AF]">FORMATO XLSX · 2.4MB</p>
                            </div>
                        </div>
                        <Download size={20} className="text-[#9CA3AF]" />
                    </button>

                    <button className="btn btn-ghost !justify-between !h-[64px] !rounded-[16px] border-2 border-[#F5F5F5]">
                        <div className="flex items-center gap-3">
                            <div className="bg-[#F5F5F5] w-10 h-10 rounded-[10px] flex items-center justify-center text-[#1A1A2E]">
                                <Calendar size={20} />
                            </div>
                            <div className="text-left font-bold py-1">
                                <p className="text-[14px]">Historial de Reservas</p>
                                <p className="text-[11px] text-[#9CA3AF]">FORMATO PDF · 1.1MB</p>
                            </div>
                        </div>
                        <Download size={20} className="text-[#9CA3AF]" />
                    </button>
                </div>
            </section>
        </div>
    )
}

function FileText(props) {
    return <Download {...props} /> // Simple replacement for missing icon in local scope
}
