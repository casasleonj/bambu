import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  currentDate: string
  setCurrentDate: (date: string) => void
  isOnline: boolean
  setIsOnline: (online: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      currentDate: new Date().toISOString().split('T')[0],
      setCurrentDate: (date) => set({ currentDate: date }),
      isOnline: true,
      setIsOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'bambu-app-storage',
    }
  )
)