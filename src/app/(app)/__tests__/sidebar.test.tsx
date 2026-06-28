// @tests unit/sidebar
// Verifica el fix de la regresion mobile 2026-06-10: el drawer debe PERMANECER
// abierto despues del click en el hamburguesa, no abrir-y-cerrar en el mismo
// ciclo de React (causado por el useEffect que cerraba el drawer cada vez
// que `mobileDrawerOpen` cambiaba, en vez de solo cuando cambiaba `pathname`).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act, waitFor, screen } from '@testing-library/react'
import { useAppStore } from '@/stores/app-store'
import { usePathname } from 'next/navigation'
import { reconcileMenuOrder } from '@/app/(app)/sidebar'

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
  useSession: () => ({ data: { user: { id: 'user-1', name: 'Admin', role: 'ADMIN' } } }),
  signOut: vi.fn(),
}))

// Mock de useBaseCaja
vi.mock('@/hooks/use-base-caja', () => ({
  useBaseCaja: () => ({ baseDia: 100000 }),
}))

// Mock CajaBaseHeader: no queremos que haga fetch ni dispare su logica
// en tests que solo verifican comportamiento del drawer.
vi.mock('@/components/caja-base-header', () => ({
  CajaBaseHeader: () => <div data-testid="caja-base-header-mock">Caja base $100.000</div>,
}))

// Mock de MoneyDisplay
vi.mock('@/components/money-display', () => ({
  MoneyDisplay: ({ value }: { value: number }) => <span>${value}</span>,
}))

// Mock de los modulos de permisos (necesarios para renderizar el sidebar)
vi.mock('@/lib/permissions', () => ({
  getUserPermissions: () => ['view:dashboard', 'view:clientes', 'view:pedidos', 'view:productos', 'view:casos'],
}))

vi.mock('@/lib/constants', () => ({
  Role: { ADMIN: 'ADMIN', ASISTENTE: 'ASISTENTE', CONTADOR: 'CONTADOR', REPARTIDOR: 'REPARTIDOR', SELLADOR: 'SELLADOR' },
}))

import { Sidebar } from '@/app/(app)/sidebar'
import { navSections, topLevelItems } from '@/app/(app)/nav-data'

describe('Sidebar — regresion mobile 2026-06-10: drawer permanece abierto tras click', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        mobileDrawerOpen: false,
        desktopCollapsed: false,
        sidebarOpen: true,
        menuOrderByUser: {},
        menuEditingByUser: {},
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

describe('Sidebar — menú reorganizable', () => {
  it('reconcileMenuOrder mantiene el orden guardado y agrega items nuevos al final de su sección', () => {
    const saved = [
      'top:/dashboard',
      'section:Ventas',
      '/clientes',
      '/pedidos',
      'section:Operaciones',
      '/produccion',
    ]
    const order = reconcileMenuOrder(saved, navSections, topLevelItems)

    expect(order.indexOf('top:/dashboard')).toBeLessThan(order.indexOf('section:Ventas'))
    expect(order.indexOf('section:Ventas')).toBeLessThan(order.indexOf('/clientes'))
    expect(order.indexOf('/clientes')).toBeLessThan(order.indexOf('/pedidos'))
    // Items nuevos de Ventas que no estaban en saved van al final de Ventas
    const ventasEnd = order.indexOf('section:Operaciones')
    const productosIndex = order.indexOf('/productos')
    const casosIndex = order.indexOf('/casos')
    expect(productosIndex).toBeGreaterThan(0)
    expect(productosIndex).toBeLessThan(ventasEnd)
    expect(casosIndex).toBeGreaterThan(0)
    expect(casosIndex).toBeLessThan(ventasEnd)
  })

  it('reconcileMenuOrder descarta items y secciones que ya no existen y promueve Dashboard a top-level', () => {
    const saved = [
      'section:Ventas',
      '/dashboard',
      '/clientes',
      '/ruta-fantasma',
      'section:Legacy',
    ]
    const order = reconcileMenuOrder(saved, navSections, topLevelItems)
    expect(order).not.toContain('/ruta-fantasma')
    expect(order).not.toContain('section:Legacy')
    // Dashboard se promueve automáticamente al bucket top-level.
    expect(order).toContain('top:/dashboard')
    expect(order.indexOf('top:/dashboard')).toBeLessThan(order.indexOf('section:Ventas'))
    expect(order).toContain('/clientes')
    expect(order.indexOf('section:Ventas')).toBeLessThan(order.indexOf('/clientes'))
  })

  it('reconcileMenuOrder agrega una sección nueva al final respetando el orden original de items dentro de ella', () => {
    // Simulamos que no teníamos la sección Admin guardada.
    const saved = [
      'section:Ventas',
      '/clientes',
      'section:Operaciones',
      '/produccion',
      'section:Finanzas',
      '/facturacion',
    ]
    const order = reconcileMenuOrder(saved, navSections, topLevelItems)
    const adminIndex = order.indexOf('section:Admin')
    expect(adminIndex).toBeGreaterThan(-1)
    expect(adminIndex).toBeGreaterThan(order.indexOf('section:Finanzas'))
    // Los items de Admin aparecen después del header Admin.
    expect(order.indexOf('/trabajadores')).toBeGreaterThan(adminIndex)
    // Dashboard (top-level) aparece antes que Ventas.
    expect(order.indexOf('top:/dashboard')).toBeLessThan(order.indexOf('section:Ventas'))
  })

  it('renderiza items en el orden guardado por el usuario y auto-promueve Dashboard a top-level', () => {
    act(() => {
      useAppStore.setState({
        menuOrderByUser: {
          // Orden legacy: Dashboard estaba dentro de Ventas. El Sidebar debe
          // auto-promoverlo a top-level sin perder el resto del orden.
          'user-1': ['section:Ventas', '/clientes', '/dashboard', '/pedidos', '/productos', '/casos'],
        },
        menuEditingByUser: { 'user-1': false },
        mobileDrawerOpen: true,
      })
    })

    render(<Sidebar />)
    const nav = screen.getByLabelText('Navegación principal')
    const links = nav.querySelectorAll('a')
    const firstLink = links[0]
    const secondLink = links[1]
    expect(firstLink?.textContent).toContain('Dashboard')
    expect(secondLink?.textContent).toContain('Clientes')
  })

  it('muestra drag handles solo cuando el modo edición está activo', () => {
    const { rerender } = render(<Sidebar />)

    // Fuera de modo edición no hay handles.
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0)

    act(() => {
      useAppStore.setState({ menuEditingByUser: { 'user-1': true }, mobileDrawerOpen: true })
    })
    rerender(<Sidebar />)

    // En modo edición hay al menos un handle por cada sección visible + item visible.
    const handles = screen.queryAllByTestId('drag-handle')
    expect(handles.length).toBeGreaterThan(0)
  })

  it('resetMenuOrder vuelve al orden por defecto con Dashboard arriba', () => {
    act(() => {
      useAppStore.setState({
        menuOrderByUser: {
          'user-1': ['section:Ventas', '/clientes', '/dashboard'],
        },
      })
    })

    render(<Sidebar />)
    const nav = screen.getByLabelText('Navegación principal')
    const links = nav.querySelectorAll('a')
    // Tras reconciliar, Dashboard es top-level y el primer link.
    expect(links[0]?.textContent).toContain('Dashboard')

    act(() => {
      useAppStore.getState().resetMenuOrder('user-1')
    })

    // Tras resetear, el orden guardado queda vacío y se usa el default.
    expect(useAppStore.getState().menuOrderByUser['user-1']).toEqual([])
  })

  it('reconcileMenuOrder mantiene top-level items al inicio aunque el guardado los ponga abajo', () => {
    // El usuario intentó guardar Dashboard abajo de todo (o legacy lo tenía ahí).
    const saved = [
      'section:Ventas',
      '/clientes',
      '/pedidos',
      '/productos',
      '/casos',
      '/dashboard',
    ]
    const order = reconcileMenuOrder(saved, navSections, topLevelItems)
    expect(order.indexOf('top:/dashboard')).toBe(0)
    expect(order.indexOf('section:Ventas')).toBeGreaterThan(order.indexOf('top:/dashboard'))
  })
})
