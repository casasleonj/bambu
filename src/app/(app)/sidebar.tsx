'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { useAppStore } from '@/stores/app-store'
import { icons, navSections } from './nav-data'

function NavIcon({ name }: { name: string }) {
  return <>{icons[name] || null}</>
}

export function Sidebar() {
  const pathname = usePathname()
  const { baseDia } = useBaseCaja()
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const setSidebarOpen = useAppStore(s => s.toggleSidebar)

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen()}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Navegación principal"
        inert={sidebarOpen ? undefined : true}
        className={`fixed top-14 left-0 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 z-40 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Caja base</span>
            <span className="text-sm font-semibold text-gray-800">
              {baseDia ? `$${Number(baseDia).toLocaleString()}` : '—'}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">
                {section.title}
              </h3>
              <div className="space-y-1 px-2">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 py-3 rounded-lg transition ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 font-semibold border-l-4 border-blue-500 pl-3 pr-4'
                          : 'text-gray-700 hover:bg-gray-50 px-4'
                      }`}
                    >
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition w-full"
            aria-label="Cerrar sesión"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  return (
    <main className={`pt-14 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-0'}`}>
      <div className="p-6">{children}</div>
    </main>
  )
}
