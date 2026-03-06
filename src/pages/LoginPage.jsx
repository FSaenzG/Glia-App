// src/pages/LoginPage.jsx
import { useState } from 'react'

import { loginWithEmail, loginWithGoogle, resetPassword } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import toast from 'react-hot-toast'
import { FlaskConical, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [resetMode, setResetMode] = useState(false)
    const [success, setSuccess] = useState(false)

    const handleEmail = async (e) => {
        e.preventDefault()
        if (resetMode) {
            setLoading(true)
            try {
                await resetPassword(email)
                setSuccess(true)
                toast.success('Enlace de recuperación enviado')
            } catch (err) {
                toast.error('No se pudo enviar el correo de recuperación')
                console.error(err)
            } finally {
                setLoading(false)
            }
            return
        }
        setLoading(true)
        try {
            await loginWithEmail(email, password)
            // AuthListener takes over
        } catch {
            toast.error('Credenciales incorrectas')
        } finally {
            setLoading(false)
        }
    }

    const handleGoogle = async () => {
        setLoading(true)
        try {
            await loginWithGoogle()
            // AuthListener takes over
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                toast.error('Error al iniciar con Google. Verifica que localhost esté autorizado en Firebase.')
                console.error(err)
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                {/* Logo Section */}
                <div className="login-logo-container">
                    <div className="login-logo-icon">
                        <FlaskConical size={40} color="#9B72CF" />
                    </div>
                    <h1 className="login-title">Glia</h1>
                    <p className="login-subtitle">Sistema de Gestión de Laboratorio</p>
                </div>

                {!resetMode ? (
                    <>
                        {/* Google Sign-In */}
                        <button
                            onClick={handleGoogle}
                            disabled={loading}
                            className="google-button"
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-[18px] h-[18px]" alt="" style={{ width: '18px', height: '18px' }} />
                            <span>Continuar con Google</span>
                        </button>

                        <div className="divider">
                            <div className="divider-line" />
                            <span className="divider-text">O INGRESAR CON</span>
                            <div className="divider-line" />
                        </div>

                        <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>Correo Institucional</label>
                                <input
                                    type="email"
                                    placeholder="usuario@javeriana.edu.co"
                                    required
                                    className="input-field"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '4px', paddingRight: '4px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contraseña</label>
                                    <button
                                        type="button"
                                        onClick={() => setResetMode(true)}
                                        style={{ color: '#9B72CF', fontSize: '11px', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}
                                    >
                                        ¿OLVIDASTE TU CLAVE?
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        required
                                        className="input-field"
                                        style={{ paddingRight: '48px' }}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPw(!showPw)}
                                        style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                                    >
                                        {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="submit-button"
                            >
                                {loading ? 'Verificando...' : 'Ingresar'}
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate('/register')}
                                style={{
                                    marginTop: '8px',
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    background: '#F0EBF8',
                                    color: '#9B72CF',
                                    fontSize: '15px',
                                    fontWeight: '800',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(155, 114, 207, 0.1)',
                                }}
                            >
                                ¿Fuiste invitado? Regístrate aquí
                            </button>
                        </form>
                    </>
                ) : (
                    /* Forgot Password Redesign */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        {success ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '16px 0' }}>
                                <div style={{ width: '80px', height: '80px', background: '#E8F8ED', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34C759' }}>
                                    <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#2D1B5E', margin: '0 0 8px 0' }}>Revisa tu correo</h2>
                                    <p style={{ color: '#666666', fontSize: '14px', lineHeight: '1.5', margin: '0' }}>
                                        Hemos enviado un enlace de recuperación a: <br />
                                        <b style={{ color: '#1A1A2E' }}>{email}</b>
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setResetMode(false); setSuccess(false); }}
                                    style={{ color: '#9B72CF', fontWeight: '700', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', marginTop: '16px' }}
                                >
                                    ← Volver al inicio de sesión
                                </button>
                            </div>
                        ) : (
                            <>
                                <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#2D1B5E', margin: '0 0 8px 0' }}>Recuperar Acceso</h2>
                                <p style={{ color: '#666666', fontSize: '14px', lineHeight: '1.5', margin: '0 0 32px 0' }}>
                                    Te enviaremos un enlace para restablecer <br /> tu contraseña de forma segura.
                                </p>

                                <form onSubmit={handleEmail} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', paddingLeft: '4px' }}>Correo Electrónico</label>
                                        <input
                                            type="email"
                                            placeholder="ejemplo@javeriana.edu.co"
                                            required
                                            className="input-field"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="submit-button"
                                        style={{ height: '56px', borderRadius: '16px' }}
                                    >
                                        {loading ? 'Enviando...' : 'Enviar enlace'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setResetMode(false)}
                                        style={{ color: '#9B72CF', fontWeight: '700', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px' }}
                                    >
                                        ← Volver al inicio de sesión
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                )}

                <div className="login-footer">
                    ¿No tienes acceso? Solicita una invitación al administrador
                </div>
            </div>
        </div>
    )
}
