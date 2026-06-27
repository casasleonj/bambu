import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

function getSafeStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // localStorage puede no estar disponible (e.g. modo privado Safari iOS)
  }
  return noopStorage
}

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
  setDesktopCollapsed: (collapsed: boolean) => void
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
  // Menú reorganizable: se guarda por userId para no mezclar entre usuarios
  // que compartan el mismo navegador (kiosko / PC compartida).
  menuOrderByUser: Record<string, string[]>
  menuEditingByUser: Record<string, boolean>
  setMenuOrder: (userId: string, order: string[]) => void
  getMenuOrder: (userId: string | undefined) => string[]
  setMenuEditing: (userId: string, editing: boolean) => void
  getMenuEditing: (userId: string | undefined) => boolean
  resetMenuOrder: (userId: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mobileDrawerOpen: false,
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      desktopCollapsed: false,
      toggleDesktopCollapsed: () => set((s) => ({ desktopCollapsed: !s.desktopCollapsed })),
      setDesktopCollapsed: (collapsed) => set({ desktopCollapsed: collapsed }),
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
      menuOrderByUser: {},
      menuEditingByUser: {},
      setMenuOrder: (userId, order) =>
        set((s) => ({
          menuOrderByUser: { ...s.menuOrderByUser, [userId]: order },
        })),
      getMenuOrder: (userId) =>
        userId ? get().menuOrderByUser[userId] ?? [] : [],
      setMenuEditing: (userId, editing) =>
        set((s) => ({
          menuEditingByUser: { ...s.menuEditingByUser, [userId]: editing },
        })),
      getMenuEditing: (userId) =>
        userId ? get().menuEditingByUser[userId] ?? false : false,
      resetMenuOrder: (userId) =>
        set((s) => ({
          menuOrderByUser: { ...s.menuOrderByUser, [userId]: [] },
        })),
    }),
    {
      name: 'bambu-app-storage',
      storage: createJSONStorage(getSafeStorage),
      // FIX menú reorganizable: guardar el orden por usuario para no
      // mezclar preferencias entre sesiones en el mismo browser.
      partialize: (state) => ({
        desktopCollapsed: state.desktopCollapsed,
        currentDate: state.currentDate,
        isOnline: state.isOnline,
        menuOrderByUser: state.menuOrderByUser,
        menuEditingByUser: state.menuEditingByUser,
      }),
      version: 2,
      migrate: (persisted, version) => {
        const base =
          persisted && typeof persisted === 'object'
            ? (persisted as Record<string, unknown>)
            : {}
        if (version < 2) {
          return {
            desktopCollapsed: base.desktopCollapsed ?? false,
            currentDate:
              base.currentDate ??
              new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
            isOnline: base.isOnline ?? true,
            menuOrderByUser: {},
            menuEditingByUser: {},
          }
        }
        return base
      },
    }
  )
)
