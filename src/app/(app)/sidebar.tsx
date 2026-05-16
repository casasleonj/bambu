'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { useAppStore } from '@/stores/app-store'
import { formatCurrency } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger, useCollapsible } from '@/components/ui/collapsible'
import { icons, navSections } from './nav-data'

function NavIcon({ name }: { name: string }) {
  return <>{icons[name] || null}</>
}

function ChevronIcon() {
  const { open } = useCollapsible()
  return (
    <svg 
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: string
  subItems?: { href: string; label: string; icon: string }[]
}

function SidebarMenuItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const hasSubItems = item.subItems && item.subItems.length > 0
  
  // Check if this item or any of its subitems is active
  const isItemActive = pathname === item.href
  const isSubItemActive = item.subItems?.some(sub => pathname === sub.href)
  const isActive = isItemActive || isSubItemActive
  const defaultOpen = isSubItemActive || isItemActive

  if (hasSubItems) {
    return (
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger
          className={`flex items-center justify-between w-full gap-3 py-2.5 px-4 rounded-lg transition text-sm ${
            isActive
              ? 'text-blue-600 font-semibold bg-blue-50'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </div>
          <ChevronIcon />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 pl-4 border-l border-gray-200 space-y-1 mt-1">
            {item.subItems!.map((subItem) => {
              const isSubActive = pathname === subItem.href
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  aria-current={isSubActive ? 'page' : undefined}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg transition text-sm ${
                    isSubActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <NavIcon name={subItem.icon} />
                  <span>{subItem.label}</span>
                </Link>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 py-2.5 px-4 rounded-lg transition text-sm ${
        isActive
          ? 'bg-blue-50 text-blue-600 font-semibold border-l-4 border-blue-500 pl-3'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  )
}

export function Sidebar() {
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const setSidebarOpen = useAppStore(s => s.toggleSidebar)
  const { baseDia } = useBaseCaja()

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
              {baseDia ? formatCurrency(Number(baseDia)) : '—'}
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
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href} item={item} />
                ))}
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
    <main className={`pt-14 print:pt-0 transition-all duration-300 ${sidebarOpen ? 'md:ml-64 print:ml-0' : 'md:ml-0'}`}>
      <div className="p-6 print:p-0">{children}</div>
    </main>
  )
}
