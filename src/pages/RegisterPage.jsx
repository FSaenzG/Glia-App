// src/pages/RegisterPage.jsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { registerWithInvite } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { Microscope, User, Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
    const { token } = useParams()
    const navigate = useNavigate()
    const [form, setForm] = useState({ displayName: '', email: '', password: '', confirm: '' })
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (form.password !== form.confirm) return toast.error('Las contraseñas no coinciden')
        if (form.password.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres')
        setLoading(true)
        try {
            await registerWithInvite(token, form.email, form.password, form.displayName)
            toast.success('Cuenta creada exitosamente')
            navigate('/regulations')
        } catch (err) {
            toast.error(err.message)
        } finally { setLoading(false) }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #9B72CF 0%, transparent 70%)', filter: 'blur(40px)' }} />
            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                        style={{ background: 'linear-gradient(135deg, #9B72CF, #7B52AF)', boxShadow: '0 8px 32px rgba(155,114,207,0.4)' }}>
                        <Microscope size={32} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">Glia</h1>
                    <p className="text-white/50 text-sm mt-1">Activar cuenta por invitación</p>
                </div>
                <div className="glass p-8">
                    <h2 className="text-xl font-semibold text-white mb-6 text-center">Crear cuenta</h2>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-3.5 text-white/40" />
                            <input type="text" required placeholder="Nombre completo" className="input pl-10"
                                value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
                        </div>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3 top-3.5 text-white/40" />
                            <input type="email" required placeholder="Correo electrónico" className="input pl-10"
                                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3 top-3.5 text-white/40" />
                            <input type={showPw ? 'text' : 'password'} required placeholder="Contraseña" className="input pl-10 pr-10"
                                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                            <button type="button" onClick={() => setShowPw(!showPw)}
                                className="absolute right-3 top-3.5 text-white/40 hover:text-white/80">
                                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3 top-3.5 text-white/40" />
                            <input type="password" required placeholder="Confirmar contraseña" className="input pl-10"
                                value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary justify-center w-full mt-2">
                            {loading
                                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : null}
                            Crear cuenta
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
