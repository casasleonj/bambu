// @tests #451 — panel «Reducir el pedido»: validación, efecto en el total, sobrepago, permisos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReduccionComercialPanel } from '../reduccion-comercial-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const lineas = [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500 }]
const pendiente = {
  id: 'r1', producto: 'PACA_AGUA', cantidadReducida: 5, cantPedidoAntes: 20, cantPedidoDespues: 15, monto: 12500,
  motivo: 'ya no quiere', aceptadoPor: 'Don Pedro', medio: 'TELEFONO', estado: 'PENDIENTE',
  solicitadoPor: { nombre: 'Ana' }, resueltoPor: null, notaCredito: null, totalAntes: null, totalDespues: null,
}

function mockFetch(reducciones: unknown[], puedeAutorizar: boolean, extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = []
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    llamadas.push({ url: u, init })
    const custom = extra?.(u, init)
    if (custom) return custom
    return new Response(JSON.stringify({ success: true, reducciones, puedeAutorizar }), { status: 200 })
  }) as unknown as typeof fetch
  return llamadas
}

const props = { pedidoId: 'p1', lineas, userRole: 'ASISTENTE', reducible: true, total: 50000, totalPagado: 0 }

describe('ReduccionComercialPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('muestra el efecto exacto en el total y la nota de crédito', async () => {
    mockFetch([], false)
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-abrir'))
    fireEvent.change(screen.getByTestId('reduccion-cantidad'), { target: { value: '5' } })
    const efecto = screen.getByTestId('reduccion-efecto').textContent ?? ''
    expect(efecto).toMatch(/12\.500/)
    expect(efecto).toMatch(/37\.500/)
    expect(efecto).toMatch(/nota de crédito/)
  })

  it('no deja quitar más de lo pendiente ni decimales', async () => {
    mockFetch([], false)
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-abrir'))
    for (const v of ['6', '0', '1.5']) {
      fireEvent.change(screen.getByTestId('reduccion-cantidad'), { target: { value: v } })
      expect(screen.getByTestId('reduccion-cantidad-error').textContent).toMatch(/entre 1 y 5/)
      expect(screen.queryByTestId('reduccion-efecto')).toBeNull()
    }
  })

  it('avisa del sobrepago y bloquea el envío', async () => {
    mockFetch([], false)
    render(<ReduccionComercialPanel {...props} totalPagado={40000} />)
    fireEvent.click(await screen.findByTestId('reduccion-abrir'))
    fireEvent.change(screen.getByTestId('reduccion-cantidad'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('reduccion-aceptado-por'), { target: { value: 'Don Pedro' } })
    fireEvent.change(screen.getByTestId('reduccion-motivo'), { target: { value: 'ya no quiere' } })
    expect(screen.getByTestId('reduccion-sobrepago')).toBeTruthy()
    expect((screen.getByTestId('reduccion-enviar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('exige quién aceptó y motivo; quien no autoriza ve «Pedir autorización»', async () => {
    mockFetch([], false)
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-abrir'))
    fireEvent.change(screen.getByTestId('reduccion-cantidad'), { target: { value: '5' } })
    const enviar = screen.getByTestId('reduccion-enviar') as HTMLButtonElement
    expect(enviar.textContent).toBe('Pedir autorización')
    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('reduccion-aceptado-por'), { target: { value: 'Don Pedro' } })
    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('reduccion-motivo'), { target: { value: 'ya no quiere' } })
    expect(enviar.disabled).toBe(false)
  })

  it('envía el cuerpo esperado con una clave offlineId', async () => {
    const llamadas = mockFetch([], true, (_u, init) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 201 })
      return undefined
    })
    render(<ReduccionComercialPanel {...props} userRole="ADMIN" />)
    fireEvent.click(await screen.findByTestId('reduccion-abrir'))
    fireEvent.change(screen.getByTestId('reduccion-cantidad'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('reduccion-aceptado-por'), { target: { value: 'Don Pedro' } })
    fireEvent.change(screen.getByTestId('reduccion-motivo'), { target: { value: 'ya no quiere' } })
    await waitFor(() => expect((screen.getByTestId('reduccion-enviar') as HTMLButtonElement).textContent).toBe('Aplicar'))
    fireEvent.click(screen.getByTestId('reduccion-enviar'))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'POST')).toBe(true))
    const post = llamadas.find((l) => l.init?.method === 'POST')!
    expect(post.url).toBe('/api/pedidos/p1/reducir-pedido')
    expect(JSON.parse(String(post.init?.body))).toMatchObject({
      producto: 'PACA_AGUA', cantidadReducida: 5, motivo: 'ya no quiere', aceptadoPor: 'Don Pedro', medio: 'TELEFONO',
      offlineId: expect.any(String),
    })
  })

  it('solo quien tiene el permiso ve Autorizar/Rechazar; un ADMIN sin permiso no los ve', async () => {
    mockFetch([pendiente], false)
    const { unmount } = render(<ReduccionComercialPanel {...props} userRole="ADMIN" />)
    await screen.findByTestId('reduccion-item')
    expect(screen.queryByTestId('reduccion-autorizar')).toBeNull()
    unmount()

    const llamadas = mockFetch([pendiente], true, (_u, init) => {
      if (init?.method === 'PATCH') return new Response(JSON.stringify({ success: true, estado: 'APLICADA' }), { status: 200 })
      return undefined
    })
    render(<ReduccionComercialPanel {...props} />)
    fireEvent.click(await screen.findByTestId('reduccion-autorizar'))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'PATCH')).toBe(true))
    expect(llamadas.find((l) => l.init?.method === 'PATCH')!.url).toBe('/api/pedidos/reducciones-comerciales/r1')
  })

  it('un pedido cancelado solo muestra el historial; sin historial y sin nada pendiente no muestra nada', async () => {
    mockFetch([], false)
    const { container } = render(<ReduccionComercialPanel {...props} reducible={false} />)
    await waitFor(() => expect(container.querySelector('[data-testid="reduccion-panel"]')).toBeNull())
  })

  it('con todo entregado no ofrece reducir', async () => {
    mockFetch([], false)
    const { container } = render(<ReduccionComercialPanel {...props} lineas={[{ ...lineas[0], cantEntrega: 20 }]} />)
    await waitFor(() => expect(container.querySelector('[data-testid="reduccion-panel"]')).toBeNull())
  })
})
