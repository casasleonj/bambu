'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import { useEffect } from 'react'
import { purgeSWCache } from '@/lib/purge-sw-cache'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { useAppStore } from '@/stores/app-store'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { getUserPermissions, type Permission } from '@/lib/permissions'
import type { Role } from '@/lib/constants'
import { Collapsible, CollapsibleContent, CollapsibleTrigger, useCollapsible } from '@/components/ui/collapsible'
import { icons, navSections, type NavItem, type NavSubItem } from './nav-data'
import { MoneyDisplay } from '@/components/money-display'

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

function hasPermission(requiredPermission: Permission | undefined, permissions: Permission[]): boolean {
  if (!requiredPermission) return true
  return permissions.includes(requiredPermission)
}

function filterSubItems(subItems: NavSubItem[] | undefined, permissions: Permission[]): NavSubItem[] {
  if (!subItems) return []
  return subItems.filter(sub => hasPermission(sub.requiredPermission, permissions))
}

function filterItems(items: NavItem[], permissions: Permission[]): NavItem[] {
  const result: NavItem[] = []
  for (const item of items) {
    const visibleSubItems = filterSubItems(item.subItems, permissions)
    // Show item if it has permission OR any of its subItems are visible
    if (!hasPermission(item.requiredPermission, permissions) && visibleSubItems.length === 0) {
      continue
    }
    result.push({ ...item, subItems: visibleSubItems.length > 0 ? visibleSubItems : item.subItems })
  }
  return result
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
  // FIX Fase 4 §6.4: drawer responsive desacoplado.
  // - Móvil: drawer temporal (modal), controlado por `mobileDrawerOpen`
  //   (en memoria, no persistido). Cerrado por defecto.
  // - Desktop: drawer permanente, controlado por `desktopCollapsed`
  //   (persistido). Default: expandido.
  const isDesktop = useIsDesktop()
  const mobileDrawerOpen = useAppStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useAppStore((s) => s.setMobileDrawerOpen)
  const desktopCollapsed = useAppStore((s) => s.desktopCollapsed)
  const pathname = usePathname()

  // FIX §6.4: en móvil, cerrar el drawer al cambiar de ruta
  useEffect(() => {
    if (!isDesktop && mobileDrawerOpen) {
      setMobileDrawerOpen(false)
    }
  }, [pathname, isDesktop, mobileDrawerOpen, setMobileDrawerOpen])

  // FIX §6.4: scroll-lock del body mientras el drawer móvil está abierto
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!isDesktop && mobileDrawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [isDesktop, mobileDrawerOpen])

  const { baseDia } = useBaseCaja()
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: Role } | undefined)?.role
  const permissions = getUserPermissions(userRole)

  // Visibilidad derivada del breakpoint
  const isVisible = isDesktop ? !desktopCollapsed : mobileDrawerOpen
  const isInteractive = isDesktop ? !desktopCollapsed : mobileDrawerOpen

  // FIX §6.4: clase de ancho según variante
  // - Desktop expandido: w-64 (permanente, ocupa su espacio)
  // - Desktop colapsado: w-0 overflow-hidden (no se ve)
  // - Móvil abierto: w-64 fixed (drawer temporal, cubre contenido)
  // - Móvil cerrado: w-0 -invisible (no ocupa espacio, no es interactivo)
  const asideWidth = isDesktop
    ? desktopCollapsed
      ? 'w-0 overflow-hidden'
      : 'w-64'
    : mobileDrawerOpen
      ? 'w-64'
      : 'w-0 overflow-hidden -translate-x-full md:translate-x-0'

  return (
    <>
      {/* Scrim: solo en móvil cuando el drawer está abierto */}
      {!isDesktop && mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Navegación principal"
        inert={isInteractive ? undefined : true}
        aria-hidden={!isVisible}
        // FIX Fase 1 §6.5: 100dvh en vez de 100vh.
        // FIX Fase 4 §6.4: width y translate según variante.
        className={`fixed top-14 left-0 h-[calc(100dvh-3.5rem)] bg-white shadow-lg transition-all duration-300 z-40 flex flex-col ${asideWidth}`}
      >
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Caja base</span>
            <span className="text-sm font-semibold text-gray-800">
              {baseDia ? <MoneyDisplay value={Number(baseDia)} userRole={userRole} className="text-sm font-semibold text-gray-800" /> : '—'}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navSections.map((section) => {
            const visibleItems = filterItems(section.items, permissions)
            if (visibleItems.length === 0) return null

            return (
              <div key={section.title} className="mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">
                  {section.title}
                </h3>
                <div className="space-y-1 px-2">
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.href} item={item} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={async () => {
              await purgeSWCache()
              signOut({ callbackUrl: '/login' })
            }}
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
  // FIX Fase 4 §6.4: el margen izquierdo del main content SOLO aplica
  // en desktop (md:) y solo cuando el sidebar está expandido. En móvil,
  // el sidebar es un overlay, no empuja el contenido.
  const isDesktop = useIsDesktop()
  const desktopCollapsed = useAppStore((s) => s.desktopCollapsed)
  const shouldOffset = isDesktop && !desktopCollapsed
  return (
    <main className={`pt-14 print:pt-0 transition-all duration-300 ${shouldOffset ? 'md:ml-64 print:ml-0' : 'md:ml-0'}`}>
      <div className="p-6 print:p-0">{children}</div>
    </main>
  )
}
