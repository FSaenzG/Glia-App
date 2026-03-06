// src/components/ChatDrawer.jsx
import { useState } from 'react'
import { X, Send, Bot } from 'lucide-react'

export default function ChatDrawer({ isOpen, onClose }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'bot', text: '¡Hola! Soy Glia 🧪 ¿En qué te ayudo hoy?' }
    ])
    const [input, setInput] = useState('')

    const handleSend = (e) => {
        e.preventDefault()
        if (!input.trim()) return
        setMessages([...messages, { id: Date.now(), sender: 'user', text: input }])
        setInput('')
        // Simulate bot reply
        setTimeout(() => {
            setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: 'Entendido. Procesando tu solicitud...' }])
        }, 1000)
    }

    if (!isOpen) return null

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            pointerEvents: 'none'
        }}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', pointerEvents: 'auto', animation: 'fadeIn 0.2s ease-out' }}
            />

            {/* Bottom Sheet */}
            <div style={{
                background: '#F7F6F8', height: '75vh', width: '100%', maxWidth: '480px', margin: '0 auto',
                borderTopLeftRadius: '24px', borderTopRightRadius: '24px', position: 'relative',
                pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{
                    background: '#9B72CF', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                    padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bot size={24} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'white', margin: 0 }}>Glia 🧪</h2>
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0, fontWeight: '600' }}>Asistente de Laboratorio</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={18} color="white" />
                    </button>
                </div>

                {/* Messages Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {messages.map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                            {m.sender === 'bot' && (
                                <div style={{ width: '28px', height: '28px', background: '#9B72CF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0, marginTop: 'auto' }}>
                                    <Bot size={14} color="white" />
                                </div>
                            )}
                            <div style={{
                                background: m.sender === 'user' ? '#9B72CF' : '#FFFFFF',
                                color: m.sender === 'user' ? 'white' : '#1A1A2E',
                                padding: '12px 16px', borderRadius: '16px', fontSize: '14px', fontWeight: '500', lineHeight: '1.4',
                                borderBottomRightRadius: m.sender === 'user' ? '4px' : '16px',
                                borderBottomLeftRadius: m.sender === 'bot' ? '4px' : '16px',
                                boxShadow: m.sender === 'bot' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                                maxWidth: '80%'
                            }}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input Area */}
                <div style={{ padding: '16px 20px', background: '#FFFFFF', borderTop: '1px solid #E0E0E0' }}>
                    <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                            type="text"
                            placeholder="Escribe un mensaje..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            style={{ flex: 1, background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: '24px', padding: '12px 20px', fontSize: '14px', outline: 'none' }}
                        />
                        <button type="submit" disabled={!input.trim()} style={{
                            width: '44px', height: '44px', borderRadius: '50%', background: input.trim() ? '#9B72CF' : '#E0E0E0',
                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'not-allowed',
                            color: 'white', transition: 'background 0.2s'
                        }}>
                            <Send size={18} style={{ transform: 'translateX(-2px)' }} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
