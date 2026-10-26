// @tests ADR-MONETARIO-002 §1 (Fase D) — panel de corrección de precio: roles, precio raro, autorizar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CorreccionPrecioPanel } from '../correccion-precio-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const lineas = [{ producto: 'PACA_AGUA', cantPedido: 10, precio: 2500 }]
const pendiente = {
  id: 'c1', producto: 'PACA_AGUA', precioAnterior: 2500, precioNuevo: 2300, delta: -2000, precioRaro: false,
  motivo: 'cliente reclama', estado: 'PENDIENTE', solicitadoAt: '2026-10-26T10:00:00Z',
  solicitadoPor: { nombre: 'Ana' }, resueltoPor: null, notaResolucion: null, totalAntes: null, totalDespues: null,
}

function mockFetch(correcciones: unknown[], extra?: (url: string, init?: RequestInit) => Response | undefined) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const custom = extra?.(u, init)
    if (custom) return custom
    return new Response(JSON.stringify({ success: true, correcciones }), { status: 200 })
  }) as unknown as typeof fetch
}

describe('CorreccionPrecioPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('ADMIN ve el botón y puede autorizar una solicitud pendiente', async () => {
    const patches: string[] = []
    mockFetch([pendiente], (u, init) => {
      if (init?.method === 'PATCH') {
        patches.push(u)
        return new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 200 })
      }
      return undefined
    })
    render(<CorreccionPrecioPanel pedidoId="p1" lineas={lineas} userRole="ADMIN" corregible />)
    expect(screen.getByTestId('correccion-abrir')).toBeTruthy()
    const btn = await screen.findByTestId('correccion-autorizar')
    fireEvent.click(btn)
    await waitFor(() => expect(patches).toEqual(['/api/pedidos/correcciones-precio/c1']))
  })

  it('ASISTENTE pide autorización y no ve Autorizar', async () => {
    mockFetch([pendiente])
    render(<CorreccionPrecioPanel pedidoId="p1" lineas={lineas} userRole="ASISTENTE" corregible />)
    await screen.findByTestId('correccion-item')
    expect(screen.queryByTestId('correccion-autorizar')).toBeNull()
    fireEvent.click(screen.getByTestId('correccion-abrir'))
    expect(screen.getByTestId('correccion-enviar').textContent).toBe('Pedir autorización')
  })

  it('muestra el efecto en el total y avisa de un precio muy bajo', async () => {
    mockFetch([])
    render(<CorreccionPrecioPanel pedidoId="p1" lineas={lineas} userRole="ADMIN" corregible />)
    fireEvent.click(screen.getByTestId('correccion-abrir'))
    fireEvent.change(screen.getByTestId('correccion-precio'), { target: { value: '1500' } })
    expect(screen.getByTestId('correccion-efecto').textContent).toMatch(/baja/)
    expect(screen.getByTestId('correccion-raro')).toBeTruthy()
    expect((screen.getByTestId('correccion-enviar') as HTMLButtonElement).disabled).toBe(true) // falta el motivo
    fireEvent.change(screen.getByTestId('correccion-motivo'), { target: { value: 'regalo autorizado' } })
    expect((screen.getByTestId('correccion-enviar') as HTMLButtonElement).disabled).toBe(false)
  })

  it('un rol sin permiso y sin historial no ve nada', async () => {
    mockFetch([])
    const { container } = render(<CorreccionPrecioPanel pedidoId="p1" lineas={lineas} userRole="REPARTIDOR" corregible />)
    await waitFor(() => expect(container.querySelector('[data-testid="correccion-precio-panel"]')).toBeNull())
  })

  it('pedido cancelado: no ofrece corregir, pero conserva el historial', async () => {
    mockFetch([{ ...pendiente, estado: 'APLICADA', totalAntes: 25000, totalDespues: 23000 }])
    render(<CorreccionPrecioPanel pedidoId="p1" lineas={lineas} userRole="ADMIN" corregible={false} />)
    await screen.findByTestId('correccion-item')
    expect(screen.queryByTestId('correccion-abrir')).toBeNull()
  })
})
