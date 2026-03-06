// src/i18n.js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

const resources = {
    es: {
        translation: {
            // Navigation
            dashboard: 'Panel Principal',
            calendar: 'Calendario',
            inventory: 'Inventario',
            reports: 'Reportes',
            admin: 'Administración',
            profile: 'Perfil',
            logout: 'Cerrar Sesión',
            chatbot: 'Asistente IA',

            // Auth
            login: 'Iniciar Sesión',
            register: 'Registrarse',
            email: 'Correo Electrónico',
            password: 'Contraseña',
            signInGoogle: 'Continuar con Google',
            forgotPassword: '¿Olvidaste tu contraseña?',
            noAccount: '¿No tienes cuenta?',
            inviteOnly: 'Solo por invitación',

            // Dashboard
            labHealth: 'Salud del Laboratorio',
            available: 'Disponible',
            occupied: 'Ocupado',
            reserved: 'Reservado',
            maintenance: 'Mantenimiento',
            cabin: 'Cabina',
            microscope: 'Microscopio',
            topUsers: 'Usuarios Destacados',
            points: 'Puntos',
            emergency: '¡EMERGENCIA!',
            emergencyProtocol: 'Protocolo de Emergencia',

            // Calendar
            newReservation: 'Nueva Reserva',
            myReservations: 'Mis Reservas',
            confirm: 'Confirmar',
            cancel: 'Cancelar',
            waitingList: 'Lista de Espera',
            duration: 'Duración',
            equipment: 'Equipo',

            // Inventory
            reagents: 'Reactivos',
            addReagent: 'Nuevo Reactivo',
            stock: 'Stock',
            unit: 'Unidad',
            expiration: 'Vencimiento',
            category: 'Categoría',
            search: 'Buscar',
            lowStock: 'Stock Bajo',
            expired: 'Vencido',
            registerUsage: 'Registrar Uso',

            // Reports
            exportExcel: 'Exportar Excel',
            exportPDF: 'Exportar PDF',
            consumption: 'Consumo',
            period: 'Período',

            // Profile
            bio: 'Biografía',
            researchArea: 'Área de Investigación',
            currentProject: 'Proyecto Actual',
            orcid: 'ORCID',
            linkedin: 'LinkedIn',
            language: 'Idioma',
            darkMode: 'Modo Oscuro',
            notifications: 'Notificaciones',
            badges: 'Insignias',
            achievements: 'Logros',

            // Admin
            users: 'Usuarios',
            inviteUser: 'Invitar Usuario',
            auditLog: 'Registro de Auditoría',
            connectedUsers: 'Usuarios Conectados',
            suspend: 'Suspender',
            activate: 'Activar',
            certifications: 'Certificaciones',

            // Messages
            saved: 'Guardado exitosamente',
            error: 'Ocurrió un error',
            loading: 'Cargando...',
            noData: 'Sin datos',
            accept: 'Aceptar',
            decline: 'Rechazar',

            // Lab Regulations
            labRegulations: 'Reglamento del Laboratorio',
            regulationsText: 'Al ingresar al laboratorio de neurobioquímica de la PUJ, acepto cumplir las normas de bioseguridad, uso responsable de equipos y reactivos, y las políticas de la institución.',
            iAccept: 'Acepto el Reglamento',

            // Points
            ranking: 'Ranking Mensual',
            myPoints: 'Mis Puntos',
            earnPoints: 'Gana puntos por comportamiento responsable',

            // Chatbot
            askQuestion: '¿Qué deseas saber?',
            chatPlaceholder: 'Ej: ¿Cuánto hipoclorito hay disponible?',
            send: 'Enviar',
        }
    },
    en: {
        translation: {
            dashboard: 'Dashboard',
            calendar: 'Calendar',
            inventory: 'Inventory',
            reports: 'Reports',
            admin: 'Administration',
            profile: 'Profile',
            logout: 'Log Out',
            chatbot: 'AI Assistant',
            login: 'Log In',
            register: 'Sign Up',
            email: 'Email',
            password: 'Password',
            signInGoogle: 'Continue with Google',
            forgotPassword: 'Forgot your password?',
            noAccount: "Don't have an account?",
            inviteOnly: 'By invitation only',
            labHealth: 'Lab Health',
            available: 'Available',
            occupied: 'Occupied',
            reserved: 'Reserved',
            maintenance: 'Maintenance',
            cabin: 'Cabin',
            microscope: 'Microscope',
            topUsers: 'Top Users',
            points: 'Points',
            emergency: 'EMERGENCY!',
            emergencyProtocol: 'Emergency Protocol',
            newReservation: 'New Reservation',
            myReservations: 'My Reservations',
            confirm: 'Confirm',
            cancel: 'Cancel',
            waitingList: 'Waiting List',
            duration: 'Duration',
            equipment: 'Equipment',
            reagents: 'Reagents',
            addReagent: 'New Reagent',
            stock: 'Stock',
            unit: 'Unit',
            expiration: 'Expiration',
            category: 'Category',
            search: 'Search',
            lowStock: 'Low Stock',
            expired: 'Expired',
            registerUsage: 'Register Usage',
            exportExcel: 'Export Excel',
            exportPDF: 'Export PDF',
            consumption: 'Consumption',
            period: 'Period',
            bio: 'Biography',
            researchArea: 'Research Area',
            currentProject: 'Current Project',
            orcid: 'ORCID',
            linkedin: 'LinkedIn',
            language: 'Language',
            darkMode: 'Dark Mode',
            notifications: 'Notifications',
            badges: 'Badges',
            achievements: 'Achievements',
            users: 'Users',
            inviteUser: 'Invite User',
            auditLog: 'Audit Log',
            connectedUsers: 'Connected Users',
            suspend: 'Suspend',
            activate: 'Activate',
            certifications: 'Certifications',
            saved: 'Saved successfully',
            error: 'An error occurred',
            loading: 'Loading...',
            noData: 'No data',
            accept: 'Accept',
            decline: 'Decline',
            labRegulations: 'Lab Regulations',
            regulationsText: 'By entering the PUJ neurobiochemistry laboratory, I agree to comply with biosafety standards, responsible use of equipment and reagents, and institutional policies.',
            iAccept: 'I Accept the Regulations',
            ranking: 'Monthly Ranking',
            myPoints: 'My Points',
            earnPoints: 'Earn points for responsible behavior',
            askQuestion: 'What would you like to know?',
            chatPlaceholder: 'E.g.: How much hypochlorite is left?',
            send: 'Send',
        }
    }
}

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'es',
        lng: 'es',
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        }
    })

export default i18n
