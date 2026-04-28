'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import BaseCajaModal from '@/components/base-caja-modal'
import { ConnectivityIndicator } from '@/components/connectivity-indicator'
import { signOut } from 'next-auth/react'
import { UpdateNotification } from '@/components/update-notification'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/pedidos', label: 'Pedidos', icon: '📦' },
  { href: '/clientes', label: 'Clientes', icon: '👥' },
  { href: '/embarques', label: 'Embarques', icon: '🚚' },
  { href: '/produccion', label: 'Producción', icon: '🏭' },
  { href: '/cierre', label: 'Cierre', icon: '📊' },
  { href: '/facturas', label: 'Facturas', icon: '🧾' },
  { href: '/gastos', label: 'Gastos', icon: '💰' },
  { href: '/nomina', label: 'Nómina', icon: '👷' },
  { href: '/trabajadores', label: 'Trabajadores', icon: '👷' },
  { href: '/proveedores', label: 'Proveedores', icon: '🏭' },
  { href: '/compras', label: 'Compras', icon: '🛒' },
  { href: '/insumos', label: 'Insumos', icon: '📦' },
  { href: '/reportes', label: 'Reportes', icon: '📈' },
  { href: '/precios', label: 'Precios', icon: '💲' },
]

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [baseDia, setBaseDia] = useState<string | null>(null)
  const [fechaStr, setFechaStr] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const saved = localStorage.getItem('baseDia')
    if (saved) setBaseDia(saved)
    setFechaStr(new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-blue-700 rounded-lg"
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
              {fechaStr || '—'}
            </span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-14 left-0 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 z-40 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Info de caja */}
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Caja base</span>
            <span className="text-sm font-semibold text-gray-800">
              {baseDia ? `$${Number(baseDia).toLocaleString()}` : '—'}
            </span>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        
        {/* Logout */}
        <div className="p-4 border-t">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition w-full"
          >
            <span className="text-xl">🚪</span>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`pt-14 transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-0'
        }`}
      >
        <div className="p-6">{children}</div>
      </main>

      {/* Modal Base de Caja */}
      <BaseCajaModal onSave={(val) => setBaseDia(val)} />

      {/* Update Notification */}
      <UpdateNotification />
      {mounted && <Toaster />}
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppContent>{children}</AppContent>
    </Providers>
  )
}
