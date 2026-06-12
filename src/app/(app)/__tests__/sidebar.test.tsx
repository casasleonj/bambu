// @tests unit/sidebar
// Verifica el fix de la regresion mobile 2026-06-10: el drawer debe PERMANECER
// abierto despues del click en el hamburguesa, no abrir-y-cerrar en el mismo
// ciclo de React (causado por el useEffect que cerraba el drawer cada vez
// que `mobileDrawerOpen` cambiaba, en vez de solo cuando cambiaba `pathname`).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useAppStore } from '@/stores/app-store'
import { usePathname } from 'next/navigation'

// Mock useIsDesktop para forzar mobile
vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: vi.fn(() => false),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}))

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Admin', role: 'ADMIN' } } }),
  signOut: vi.fn(),
}))

// Mock de useBaseCaja
vi.mock('@/hooks/use-base-caja', () => ({
  useBaseCaja: () => ({ baseDia: 100000 }),
}))

// Mock de MoneyDisplay
vi.mock('@/components/money-display', () => ({
  MoneyDisplay: ({ value }: { value: number }) => <span>${value}</span>,
}))

// Mock de los modulos de permisos (necesarios para renderizar el sidebar)
vi.mock('@/lib/permissions', () => ({
  getUserPermissions: () => ['view:dashboard', 'view:clientes'],
}))

vi.mock('@/lib/constants', () => ({
  Role: { ADMIN: 'ADMIN', ASISTENTE: 'ASISTENTE', CONTADOR: 'CONTADOR', REPARTIDOR: 'REPARTIDOR', SELLADOR: 'SELLADOR' },
}))

import { Sidebar } from '@/app/(app)/sidebar'

describe('Sidebar — regresion mobile 2026-06-10: drawer permanece abierto tras click', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        mobileDrawerOpen: false,
        desktopCollapsed: false,
        sidebarOpen: true,
      })
    })
  })

  it('mobileDrawerOpen se mantiene true despues del setState (no se cierra por useEffect)', async () => {
    render(<Sidebar />)
    // Inicialmente: el aside NO esta en el DOM (showAside=false en mobile cerrado)
    expect(document.querySelector('aside[aria-label="Navegación principal"]')).toBeNull()

    // Simular el click en hamburguesa: el handler del header llama a
    // setMobileDrawerOpen(true). Lo hacemos directo en el test.
    act(() => {
      useAppStore.getState().setMobileDrawerOpen(true)
    })

    // Tras el set, el aside DEBE estar en el DOM. Con el bug, el useEffect
    // lo cerraba inmediatamente; con el fix, permanece abierto.
    await waitFor(() => {
      expect(useAppStore.getState().mobileDrawerOpen).toBe(true)
    })

    // Esperar un microtask mas para asegurar que el useEffect no se dispara
    // y cierra el drawer.
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verificar que el state sigue siendo true
    expect(useAppStore.getState().mobileDrawerOpen).toBe(true)

    // Verificar que el aside esta en el DOM
    expect(document.querySelector('aside[aria-label="Navegación principal"]')).not.toBeNull()
  })

  it('mobileDrawerOpen permanece true tras multiples setState (no loop infinito)', async () => {
    render(<Sidebar />)

    act(() => {
      useAppStore.getState().setMobileDrawerOpen(true)
    })

    // Forzar varios re-renders
    act(() => {
      useAppStore.setState({ sidebarOpen: false })
    })
    act(() => {
      useAppStore.setState({ sidebarOpen: true })
    })
    act(() => {
      useAppStore.setState({ currentDate: '2026-06-11' })
    })

    // Tras multiples re-renders, mobileDrawerOpen debe seguir true
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(useAppStore.getState().mobileDrawerOpen).toBe(true)
  })

  it('mobileDrawerOpen se cierra cuando cambia el pathname (comportamiento deseado)', async () => {
    const { useIsDesktop } = await import('@/hooks/use-is-desktop')
    const mockedUseIsDesktop = useIsDesktop as ReturnType<typeof vi.fn>
    const mockedUsePathname = usePathname as ReturnType<typeof vi.fn>

    // Estado inicial: mobile + drawer cerrado + pathname /dashboard
    mockedUseIsDesktop.mockReturnValue(false)
    mockedUsePathname.mockReturnValue('/dashboard')
    act(() => {
      useAppStore.setState({ mobileDrawerOpen: false })
    })

    const { rerender } = render(<Sidebar />)

    // Abrir el drawer (simular click en hamburguesa)
    act(() => {
      useAppStore.getState().setMobileDrawerOpen(true)
    })

    // El aside debe estar en el DOM
    await waitFor(() => {
      expect(document.querySelector('aside[aria-label="Navegación principal"]')).not.toBeNull()
    })
    expect(useAppStore.getState().mobileDrawerOpen).toBe(true)

    // Simular navegacion: cambiar pathname Y forzar re-render
    mockedUsePathname.mockReturnValue('/clientes')
    rerender(<Sidebar />)

    // Tras el cambio de pathname, el useEffect debe cerrar el drawer
    await waitFor(() => {
      expect(useAppStore.getState().mobileDrawerOpen).toBe(false)
    })
  })

  it('mobileDrawerOpen NO se cierra si solo cambia isDesktop (no es navegacion)', async () => {
    const { useIsDesktop } = await import('@/hooks/use-is-desktop')
    const mockedUseIsDesktop = useIsDesktop as ReturnType<typeof vi.fn>

    // Estado inicial: mobile + drawer cerrado
    mockedUseIsDesktop.mockReturnValue(false)
    act(() => {
      useAppStore.setState({ mobileDrawerOpen: false })
    })

    render(<Sidebar />)

    // Abrir el drawer
    act(() => {
      useAppStore.getState().setMobileDrawerOpen(true)
    })

    expect(useAppStore.getState().mobileDrawerOpen).toBe(true)

    // Cambiar isDesktop a true (resize a desktop). El pathname sigue igual,
    // asi que el useEffect no debe disparar el cierre del drawer.
    mockedUseIsDesktop.mockReturnValue(true)

    // Forzar re-render
    act(() => {
      useAppStore.setState({ sidebarOpen: false })
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    // El useEffect no debe cerrar el drawer porque !isDesktop es false ahora.
    expect(useAppStore.getState().mobileDrawerOpen).toBe(true)
  })
})
