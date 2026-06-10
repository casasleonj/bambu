import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // FIX Fase 4 §6.4: drawer responsive desacoplado.
  // Antes: un solo `sidebarOpen: true` persistido controlaba móvil y
  // desktop, dejando el drawer móvil abierto sobre el contenido al
  // iniciar sesión. Ahora:
  // - mobileDrawerOpen: estado en memoria (NO persistido), cerrado por
  //   defecto. Drawer temporal que abre con el botón hamburguesa y
  //   cierra al navegar o tocar el scrim.
  // - desktopCollapsed: persistido, default `false`. Solo controla si
  //   el drawer permanente de desktop está contraído (icon-only) o
  //   expandido (icon+label).
  // El breakpoint se evalúa en el componente (md = 768px) para
  // derivar la visibilidad real.
  mobileDrawerOpen: boolean
  setMobileDrawerOpen: (open: boolean) => void
  desktopCollapsed: boolean
  toggleDesktopCollapsed: () => void
  // Legacy alias — el Sidebar y MainContent leían `sidebarOpen`.
  // Se deriva: en desktop = !desktopCollapsed, en móvil = mobileDrawerOpen.
  // El Sidebar mismo decide cuál usar según el media query.
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open?: boolean) => void
  currentDate: string
  setCurrentDate: (date: string) => void
  isOnline: boolean
  setIsOnline: (online: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mobileDrawerOpen: false,
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      desktopCollapsed: false,
      toggleDesktopCollapsed: () => set((s) => ({ desktopCollapsed: !s.desktopCollapsed })),
      // Compat: el Sidebar legacy usa sidebarOpen. Para no romper callers
      // existentes, lo mantenemos pero solo tiene sentido en desktop.
      // En móvil, se debe usar mobileDrawerOpen.
      sidebarOpen: true,
      toggleSidebar: () => {
        // Toggle genérico — el Sidebar decide si afecta desktop o móvil
        // según el breakpoint. Por default, togglea desktopCollapsed.
        set((s) => ({ desktopCollapsed: !s.desktopCollapsed }))
      },
      setSidebarOpen: (open) => {
        // Si se pasa explícito, ajustar desktopCollapsed. Si no, no-op.
        if (open === undefined) return
        set({ desktopCollapsed: !open })
      },
      currentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      setCurrentDate: (date) => set({ currentDate: date }),
      isOnline: true,
      setIsOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'bambu-app-storage',
      // FIX §6.4: solo persistir `desktopCollapsed` y datos de fecha/conectividad.
      // `mobileDrawerOpen` y `sidebarOpen` legacy NO se persisten.
      partialize: (state) => ({
        desktopCollapsed: state.desktopCollapsed,
        currentDate: state.currentDate,
        isOnline: state.isOnline,
      }),
    }
  )
)