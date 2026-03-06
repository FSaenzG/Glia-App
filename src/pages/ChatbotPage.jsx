// src/pages/ChatbotPage.jsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { ArrowLeft, Send, Mic } from 'lucide-react'

const GEMINI_KEY = 'AIzaSyCnTyXEg2JEoj3AuCEv3xrEJkeBRROYuVw'

const QUICK = [
    '¿Cuánto etanol hay disponible?',
    '¿Qué reactivos están por vencer?',
    '¿Cómo se prepara un gel de poliacrilamida?',
]

const WELCOME = 'Hola, soy Glia 🧬\n\nPuedo ayudarte con preguntas sobre el inventario del laboratorio y consultas científicas.\n\n¿En qué te puedo ayudar hoy?'

export default function ChatbotPage() {
    const navigate = useNavigate()
    const [msgs, setMsgs] = useState([{ role: 'bot', text: WELCOME, time: new Date() }])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef(null)
    const genAI = useRef(null)

    useEffect(() => {
        try { genAI.current = new GoogleGenerativeAI(GEMINI_KEY) } catch (e) { console.error(e) }
    }, [])

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

    const getInventoryCtx = async (msg) => {
        const kw = ['reactivo', 'inventario', 'stock', 'disponible', 'cuánto', 'queda', 'venc', 'etanol', 'hipoclorito', 'sds', 'puntas']
        if (!kw.some(k => msg.toLowerCase().includes(k))) return null
        try {
            const snap = await getDocs(query(collection(db, 'inventory'), orderBy('name')))
            const lines = snap.docs.map(d => { const r = d.data(); return `${r.name}: ${r.quantity}${r.unit}${r.expirationDate ? `, vence ${r.expirationDate}` : ''}${r.quantity <= r.minStock ? ' (STOCK BAJO)' : ''}` })
            if (lines.length) return `INVENTARIO DEL LABORATORIO:\n${lines.join('\n')}`
        } catch (e) { console.error(e) }
        // Mock fallback
        return `INVENTARIO DEL LABORATORIO (datos de ejemplo):
Hipoclorito de Sodio: 2.5L, vence 2025-06-30 (STOCK BAJO)
Etanol 70%: 15L, vence 2026-12-01
Puntas 200uL: 1caja (STOCK BAJO)
SDS: 200g
Acrilamida 30%: 500mL, vence 2025-03-31
TRIS Base: 150g`
    }

    const send = async (text = input.trim()) => {
        if (!text || loading) return
        setInput('')
        setMsgs(prev => [...prev, { role: 'user', text, time: new Date() }])
        setLoading(true)
        try {
            const ctx = await getInventoryCtx(text)
            const model = genAI.current?.getGenerativeModel({ model: 'gemini-1.5-flash' })
            const prompt = `Eres el asistente de laboratorio Glia del Laboratorio de Neurobioquímica de la PUJ Bogotá. Responde en español, de forma concisa y científica.\n${ctx ? ctx + '\n\n' : ''}Pregunta: ${text}`
            const result = await model.generateContent(prompt)
            setMsgs(prev => [...prev, { role: 'bot', text: result.response.text(), time: new Date() }])
        } catch {
            // Fallback
            const ctx = await getInventoryCtx(text)
            setMsgs(prev => [...prev, { role: 'bot', text: ctx ? `📦 **Inventario actual:**\n\n${ctx}` : 'Lo siento, no pude conectarme en este momento. Intenta de nuevo.', time: new Date() }])
        }
        setLoading(false)
    }

    return (
        <div style={{ minHeight: '100vh', background: '#F5F5F5', display: 'flex', flexDirection: 'column' }}>
            <div className="top-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #9B72CF, #7B52AF)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'white', fontWeight: '800', fontSize: '14px' }}>G</span>
                        </div>
                        <div>
                            <p style={{ fontWeight: '700', fontSize: '15px', color: '#1A1A2E', margin: 0, lineHeight: 1.2 }}>Glia AI</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span className="status-dot" style={{ background: '#34C759', width: '6px', height: '6px' }} />
                                <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>En línea · Gemini</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '160px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
                {/* Quick suggestions (only at start) */}
                {msgs.length === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                        {QUICK.map(q => (
                            <button key={q} onClick={() => send(q)}
                                style={{ background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '12px', padding: '12px 16px', textAlign: 'left', fontSize: '14px', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {msgs.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '4px' }}>
                        <div className={m.role === 'user' ? 'bubble-user' : 'bubble-bot'} style={{ whiteSpace: 'pre-wrap' }}>
                            {m.text}
                        </div>
                        <span style={{ fontSize: '11px', color: '#9CA3AF', padding: '0 4px' }}>
                            {m.time?.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}

                {loading && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                        <div className="bubble-bot" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px 16px' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#9B72CF', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={{ position: 'fixed', bottom: 'var(--bottom-nav-h)', left: 0, right: 0, background: 'white', borderTop: '1px solid #E5E7EB', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '480px', margin: '0 auto' }}>
                <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Escribe tu pregunta..."
                    style={{ flex: 1, border: '1.5px solid #E5E7EB', borderRadius: '24px', padding: '12px 16px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', background: '#F5F5F5' }}
                />
                <button onClick={() => send()} disabled={!input.trim() || loading}
                    style={{ width: '46px', height: '46px', borderRadius: '50%', background: input.trim() ? '#9B72CF' : '#E5E7EB', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}>
                    <Send size={20} color={input.trim() ? 'white' : '#9CA3AF'} />
                </button>
            </div>

            <style>{`
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
        </div>
    )
}
