// src/App.jsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { useAuthListener } from './hooks/useAuth'
import i18n from './i18n'
import { seedDatabaseIfEmpty } from './utils/seedData'

// Layout
import AppShell from './components/layout/AppShell'

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RegulationsPage from './pages/RegulationsPage'
import Dashboard from './pages/Dashboard'
import ReservasPage from './pages/ReservasPage'
import InventoryPage from './pages/InventoryPage'
import ProfilePage from './pages/ProfilePage'
import ChatbotPage from './pages/ChatbotPage'
import DamageReportPage from './pages/DamageReportPage'
import CleaningPage from './pages/CleaningPage'
import AdminPanel from './pages/AdminPanel'
import SOSEmergencyPage from './pages/SOSEmergencyPage'

function AuthGate({ children }) {
  const { user, userProfile, loading } = useAuthStore()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#9B72CF] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#666666] font-medium">Cargando Glia...</p>
      </div>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (userProfile && userProfile.acceptedRegulations === false) {
    return <Navigate to="/regulations" replace />
  }

  return children
}

function AdminGuard({ children }) {
  const { userProfile } = useAuthStore()
  if (!userProfile || userProfile.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const { user } = useAuthStore()
  const { darkMode, language } = useUIStore()
  useAuthListener()

  useEffect(() => {
    seedDatabaseIfEmpty()
    document.body.classList.toggle('light-mode', !darkMode)
  }, [darkMode])

  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />

        {/* Protected Onboarding */}
        <Route path="/regulations" element={<RegulationsPage />} />

        {/* App Main Shell */}
        <Route path="/" element={<AuthGate><AppShell /></AuthGate>}>
          <Route index element={<Dashboard />} />
          <Route path="reservas" element={<ReservasPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="mi-lab" element={<AdminGuard><ProfilePage /></AdminGuard>} />
          <Route path="chatbot" element={<ChatbotPage />} />
          <Route path="damage-report" element={<DamageReportPage />} />
          <Route path="cleaning" element={<CleaningPage />} />
          <Route path="admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
          <Route path="sos" element={<SOSEmergencyPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
