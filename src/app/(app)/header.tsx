'use client'

import { useState, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { Pencil, Check } from 'lucide-react'
import { purgeSWCache } from '@/lib/purge-sw-cache'
import { unsubscribePushOnLogout } from '@/lib/push-cleanup'
import { revokeSessionOnLogout } from '@/lib/session-cleanup'
import { ConnectivityIndicator } from '@/components/connectivity-indicator'
import { PushSettings } from '@/components/push-settings'
import { useAppStore } from '@/stores/app-store'
import { useIsDesktop } from '@/hooks/use-is-desktop'

const ROL_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN: { label: 'Admin', color: 'bg-yellow-400 text-yellow-900' },
  ASISTENTE: { label: 'Asistente', color: 'bg-green-300 text-green-900' },
  CONTADOR: { label: 'Contador', color: 'bg-purple-300 text-purple-900' },
  REPARTIDOR: { label: 'Repartidor', color: 'bg-orange-300 text-orange-900' },
  SELLADOR: { label: 'Sellador', color: 'bg-blue-300 text-blue-900' },
}

export function Header() {
  // FIX Fase 4 §6.4: el botón hamburguesa del header decide según el
  // breakpoint qué estado toggle:
  // - Móvil: abre/cierra el drawer temporal (mobileDrawerOpen)
  // - Desktop: colapsa/expande el drawer permanente (desktopCollapsed)
  const isDesktop = useIsDesktop()
  const mobileDrawerOpen = useAppStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useAppStore((s) => s.setMobileDrawerOpen)
  const desktopCollapsed = useAppStore((s) => s.desktopCollapsed)
  const setDesktopCollapsed = useAppStore((s) => s.setDesktopCollapsed)
  const toggleDesktopCollapsed = useAppStore((s) => s.toggleDesktopCollapsed)
  const setMenuEditing = useAppStore((s) => s.setMenuEditing)
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const userId = (session?.user as { id?: string } | undefined)?.id
  const effectiveUserId = userId ?? 'anonymous'
  const menuEditing = useAppStore((s) => s.menuEditingByUser[effectiveUserId] ?? false)

  const sidebarOpen = isDesktop ? !desktopCollapsed : mobileDrawerOpen
  const onToggleSidebar = () => {
    if (isDesktop) {
      toggleDesktopCollapsed()
    } else {
      setMobileDrawerOpen(!mobileDrawerOpen)
    }
  }

  const onToggleMenuEditing = () => {
    const next = !menuEditing
    setMenuEditing(effectiveUserId, next)
    if (next) {
      // En modo edición el sidebar debe estar visible.
      if (isDesktop) {
        setDesktopCollapsed(false)
      } else {
        setMobileDrawerOpen(true)
      }
    }
  }

  const userName = session?.user?.name || session?.user?.email || 'U'
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const rolInfo = userRole ? (ROL_LABELS[userRole] || { label: userRole, color: 'bg-gray-400 text-gray-900' }) : null

  // FIX mobile UX: cerrar el dropdown al click/touch fuera.
  // Antes: listener en `document` con `mousedown` o `click`. Causaba un bug
  // muy raro en React 19 + Playwright iPhone emulation: cuando el user hacia
  // click en el boton hamburguesa del header, el `mousedown` (o `click`)
  // listener global se ejecutaba primero, llamaba `setDropdownOpen(false)`,
  // y el re-render resultante REMPLAZABA el `onClick` del button antes de
  // que el evento `click` llegara al handler de React. Resultado: el drawer
  // nunca se abria.
  //
  // Solucion: NO usar listener global. En su lugar:
  // 1. El boton del user-menu usa `onClick` que alterna el dropdown.
  // 2. El dropdown mismo cierra con `onClick` en su backdrop scrim.
  // 3. Para cerrar al click fuera, usamos un elemento invisible que cubre
  //    la pantalla solo cuando el dropdown esta abierto y captura el click
  //    (patron "click catcher"). Esto es 100% React, sin listeners nativos.
  //
  // Ademas: el hamburger button del header ahora usa `onClick` y un patron
  // de toggle explicito sin closures que dependan de variables de render.
  // (Los closures se re-crean en cada render, lo cual combinado con
  // re-renders disparados por Zustand podia hacer que el handler quedara
  // apuntando a un state stale.)
  // Ver e2e/mobile-menu.spec.ts para tests de regresion.

  // FIX mobile UX: formatear la fecha según el viewport.
  // - Móvil: "10 jun" (corto, ~50px)
  // - sm+ (≥640px): "mié, 10 jun 2026" (largo, ~110px)
  const fechaLarga = new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const fechaCorta = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  return (
    // FIX REGRESION mobile 2026-06-10: el `<header>` NO tiene `overflow-x-hidden`
    // (a diferencia de la version anterior). Razon:
    //
    // Segun la CSS Overflow Module Level 3 spec (MDN), si una dimension tiene
    // un valor distinto de `visible` o `clip` (e.g. `overflow-x: hidden`),
    // la OTRA dimension se computa implicitamente a `auto`. Esto significa
    // que `overflow-x-hidden` en el header forzaba `overflow-y: auto`,
    // convirtiendo el header en un scroll container vertical.
    //
    // Consecuencia: el dropdown del user-menu (posicionado `absolute mt-2`
    // = 8px debajo del button, ~120px de alto) quedaba atrapado y
    // clipeado por el scroll context del header (que solo mide ~56px de
    // alto). El usuario veia "el perfil aparece en el background" porque
    // solo se veia la sombra superior del card.
    //
    // La proteccion contra overflow horizontal SIGUE activa via:
    // - `min-w-0` + `truncate` en el h1 (linea siguiente)
    // - `flex-1` en el contenedor izquierdo, `flex-shrink-0` en el derecho
    // - `flex-shrink-0` en cada item interno (button, fecha, avatar, indicator)
    // - `whitespace-nowrap` en el bloque fecha
    <header className="bg-blue-600 text-white px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3 fixed top-0 left-0 right-0 z-50 pt-safe">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-blue-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
          aria-label={isDesktop ? 'Colapsar/expandir menú' : 'Abrir menú'}
          aria-expanded={sidebarOpen}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={onToggleMenuEditing}
          data-testid="edit-menu-button"
          className="p-2 hover:bg-blue-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
          aria-pressed={menuEditing}
          aria-label={menuEditing ? 'Listo' : 'Editar menú'}
          title={menuEditing ? 'Listo' : 'Editar menú'}
          type="button"
        >
          {menuEditing ? <Check className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
        </button>
        <h1 className="text-base sm:text-lg md:text-xl font-bold truncate">Agua Bambú</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
        <ConnectivityIndicator />
        <div className="flex items-center gap-1.5 bg-blue-700/40 px-2 sm:px-3 py-1.5 rounded-lg whitespace-nowrap">
          <svg className="w-3.5 h-3.5 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs sm:text-sm font-medium text-white/90 sm:hidden">
            {fechaCorta}
          </span>
          <span className="text-xs sm:text-sm font-medium text-white/90 hidden sm:inline">
            {fechaLarga}
          </span>
        </div>

        <div ref={dropdownRef} className="relative flex-shrink-0">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            data-testid="user-menu"
            className="flex items-center gap-2 bg-blue-700/40 hover:bg-blue-700/60 rounded-lg px-2 py-1.5 transition min-h-[44px]"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            <svg className={`w-4 h-4 transition ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              {/* FIX mobile UX (regresion header mobile): "click catcher" que
                  cierra el dropdown al click/touch fuera, sin usar un listener
                  global en `document`. Antes, ese listener global
                  (`document.addEventListener('mousedown', ...)`) re-renderizaba
                  el Header antes de que el `click` del boton hamburguesa fuera
                  procesado por el delegado de React, dejando el drawer sin
                  abrir. El click catcher es 100% React: un `<div>` invisible
                  fixed a la pantalla que captura el click y cierra el
                  dropdown. Su z-index (z-40) esta por debajo del dropdown
                  (z-50) para que los items internos sigan siendo clickeables. */}
              <div
                data-testid="user-menu-backdrop"
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
                aria-hidden="true"
              />
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
                <div className="px-4 py-3 border-b border-gray-100">
                  <PushSettings />
                </div>
                  <button
                    data-testid="logout-button"
                    onClick={async () => {
                      await revokeSessionOnLogout()
                      await unsubscribePushOnLogout()
                      await purgeSWCache()
                      signOut({ callbackUrl: '/login' })
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Cerrar Sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
