// src/store/uiStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
    persist(
        (set) => ({
            darkMode: true,
            language: 'es',
            sidebarOpen: true,
            setDarkMode: (v) => set({ darkMode: v }),
            setLanguage: (lang) => set({ language: lang }),
            setSidebarOpen: (v) => set({ sidebarOpen: v }),
            toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
        }),
        { name: 'glia-ui' }
    )
)
