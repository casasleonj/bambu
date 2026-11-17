import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const props: Array<Record<string, unknown>> = []
vi.mock('sonner', () => ({ Toaster: (p: Record<string, unknown>) => { props.push(p); return null } }))
let ruta: string | null = '/pedidos'
vi.mock('next/navigation', () => ({ usePathname: () => ruta }))

import { AppToaster, avisosArriba } from '../app-toaster'

describe('AppToaster (#828)', () => {
  beforeEach(() => { props.length = 0 })

  it('solo Pedidos pone los avisos arriba', () => {
    expect(avisosArriba('/pedidos')).toBe(true)
    for (const r of ['/pedidos/abc', '/clientes', '/dashboard', '/fiados', null]) expect(avisosArriba(r)).toBe(false)
  })
  it('en Pedidos: arriba a la derecha, bajo el encabezado (escritorio y móvil)', () => {
    ruta = '/pedidos'
    render(<AppToaster />)
    expect(props[0]).toMatchObject({ position: 'top-right', offset: { top: 64, right: 16 }, mobileOffset: { top: 64, left: 12, right: 12 } })
  })
  it('en las demás pantallas: abajo a la derecha, como antes', () => {
    ruta = '/clientes'
    render(<AppToaster />)
    expect(props[0]).toMatchObject({ position: 'bottom-right' })
    expect(props[0]).not.toHaveProperty('offset')
  })
})
