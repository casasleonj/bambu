'use client'

import { ConnectivityIndicator } from '@/components/connectivity-indicator'
import { useAppStore } from '@/stores/app-store'

export function Header() {
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)

  const fechaStr = new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-blue-700 rounded-lg"
          aria-label="Abrir menú"
          aria-expanded={sidebarOpen}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Agua Bambú</h1>
      </div>
      <div className="flex items-center gap-3">
        <ConnectivityIndicator />
        <div className="flex items-center gap-1.5 bg-blue-700/40 px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium text-white/90">
            {fechaStr}
          </span>
        </div>
      </div>
    </header>
  )
}
