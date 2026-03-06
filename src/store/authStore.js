// src/store/authStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
    persist(
        (set) => ({
            user: null,
            userProfile: null,
            loading: true,
            regulationsAccepted: false,
            setUser: (user) => set({ user }),
            setUserProfile: (profile) => set({ userProfile: profile }),
            setLoading: (loading) => set({ loading }),
            setRegulationsAccepted: (v) => set({ regulationsAccepted: v }),
            logout: () => set({ user: null, userProfile: null }),
        }),
        {
            name: 'glia-auth',
            partialize: (s) => ({ regulationsAccepted: s.regulationsAccepted }),
        }
    )
)
