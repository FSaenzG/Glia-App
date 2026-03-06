// src/components/NuevaReservaModal.jsx
import { useState } from 'react'
import { X, Calendar as CalendarIcon, ArrowRight, Clock } from 'lucide-react'

const EQUIPMENT_LIST = [
    'Cabina Cultivo 1', 'Cabina Cultivo 2', 'Microscopio Fluorescencia',
    'Termociclador PCR', 'Centrífuga Refrigerada', 'Espectrofotómetro',
    'Incubadora CO2', 'Campana de Extracción', 'Autoclave', 'Microscopio Óptico'
]

export default function NuevaReservaModal({ isOpen, onClose }) {
    const [selectedEq, setSelectedEq] = useState(EQUIPMENT_LIST[0])
    const [startTime, setStartTime] = useState(8) // 8:00 to 18:00
    const [duration, setDuration] = useState(1) // 1h to 4h

    if (!isOpen) return null

    const formatTime = (hour) => {
        const h = Math.floor(hour)
        const m = hour % 1 === 0.5 ? '30' : '00'
        return `${h.toString().padStart(2, '0')}:${m}`
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 999,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                padding: '24px', maxHeight: '90vh', overflowY: 'auto',
                animation: 'slideUp 0.3s ease-out', position: 'relative'
            }} className="modal-desktop-override">
                {/* Drag Handle */}
                <div style={{ width: '40px', height: '4px', background: '#E0E0E0', borderRadius: '4px', margin: '0 auto 20px auto' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E' }}>Nueva Reserva</h2>
                    <button onClick={onClose} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={18} color="#666666" />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Equipment Dropdown */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E', marginBottom: '8px', display: 'block' }}>Equipo</label>
                        <select
                            className="input-field"
                            style={{ background: '#F7F6F8', border: '1px solid #E0E0E0', appearance: 'auto', outline: 'none', cursor: 'pointer' }}
                            value={selectedEq}
                            onChange={(e) => setSelectedEq(e.target.value)}
                        >
                            {EQUIPMENT_LIST.map(eq => (
                                <option key={eq} value={eq}>{eq}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Picker (Simplified Grid) */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CalendarIcon size={16} color="#9B72CF" />
                            Fecha de Reserva
                        </label>
                        <div style={{ background: '#F7F6F8', borderRadius: '16px', padding: '16px', border: '1px solid #E0E0E0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontWeight: '700', fontSize: '14px' }}>
                                <span>Noviembre 2023</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{'<'}</button>
                                    <button style={{ color: '#1A1A2E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{'>'}</button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' }}>
                                <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>
                                <span style={{ color: '#D1D5DB' }}>30</span><span style={{ color: '#D1D5DB' }}>31</span>
                                <span>1</span><span>2</span><span>3</span>
                                <span style={{ background: '#9B72CF', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>4</span>
                                <span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span>
                            </div>
                        </div>
                    </div>

                    {/* Time Slider */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Clock size={16} color="#9B72CF" />
                                Hora de Inicio
                            </label>
                            <span style={{ fontSize: '16px', fontWeight: '800', color: '#9B72CF' }}>
                                {formatTime(startTime)}
                            </span>
                        </div>
                        <div style={{ background: '#F7F6F8', borderRadius: '16px', padding: '16px', border: '1px solid #E0E0E0' }}>
                            <input
                                type="range"
                                min="8"
                                max="18"
                                step="0.5"
                                value={startTime}
                                onChange={(e) => setStartTime(parseFloat(e.target.value))}
                                style={{
                                    width: '100%',
                                    accentColor: '#9B72CF',
                                    height: '6px',
                                    borderRadius: '3px',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#9CA3AF', fontWeight: '600' }}>
                                <span>08:00</span>
                                <span>13:00</span>
                                <span>18:00</span>
                            </div>
                        </div>
                    </div>

                    {/* Duration Pills */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A2E', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Duración de Reserva</span>
                            <span style={{ color: '#666', fontWeight: '600' }}>
                                Fin: <span style={{ color: '#1A1A2E' }}>{formatTime(startTime + duration)}</span>
                            </span>
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[1, 2, 3, 4].map(d => (
                                <div
                                    key={d}
                                    onClick={() => setDuration(d)}
                                    style={{
                                        flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
                                        background: duration === d ? '#F0EBF8' : '#F7F6F8',
                                        color: duration === d ? '#9B72CF' : '#666666',
                                        border: duration === d ? '1px solid #9B72CF' : '1px solid #E0E0E0'
                                    }}
                                >
                                    {d}h
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        onClick={() => {
                            // Mock submit validation could go here
                            onClose()
                        }}
                        style={{
                            marginTop: '16px', width: '100%', height: '54px', background: '#9B72CF', color: 'white', borderRadius: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', fontWeight: '700', border: 'none', cursor: 'pointer'
                        }}
                    >
                        Confirmar Reserva
                        <ArrowRight size={20} />
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                
                @media (min-width: 1024px) {
                    .modal-desktop-override {
                        max-width: 500px;
                        margin: auto;
                        border-radius: 24px !important;
                        height: auto;
                        max-height: 85vh;
                    }
                }
            `}</style>
        </div>
    )
}
