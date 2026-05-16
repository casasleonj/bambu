'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { ConnectivityIndicator } from '@/components/connectivity-indicator'
import { useAppStore } from '@/stores/app-store'

const ROL_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN: { label: 'Admin', color: 'bg-yellow-400 text-yellow-900' },
  ASISTENTE: { label: 'Asistente', color: 'bg-green-300 text-green-900' },
  CONTADOR: { label: 'Contador', color: 'bg-purple-300 text-purple-900' },
  REPARTIDOR: { label: 'Repartidor', color: 'bg-orange-300 text-orange-900' },
  SELLADOR: { label: 'Sellador', color: 'bg-blue-300 text-blue-900' },
}

export function Header() {
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const userName = session?.user?.name || session?.user?.email || 'U'
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const rolInfo = userRole ? (ROL_LABELS[userRole] || { label: userRole, color: 'bg-gray-400 text-gray-900' }) : null

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            data-testid="user-menu"
            className="flex items-center gap-2 bg-blue-700/40 hover:bg-blue-700/60 rounded-lg px-2 py-1.5 transition"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            <svg className={`w-4 h-4 transition ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg py-2 text-gray-700 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-semibold">{userName}</p>
                {rolInfo && (
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${rolInfo.color}`}>
                    {rolInfo.label}
                  </span>
                )}
              </div>
              <Link
                href="/mi-perfil"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Mi Perfil
              </Link>
              <hr className="border-gray-100" />
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
