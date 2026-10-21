// @tests P0-3 PR 2 (#357): aviso + ventana de decisión de excepciones de crédito
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { ExcepcionesPendientesBanner } from '../excepciones-pendientes-banner'
import { ExcepcionCreditoModal } from '../excepcion-credito-modal'
import { useExcepcionesPendientes } from '../use-excepciones-pendientes'

const pendiente = {
  id: 'ex1',
  motivoSolicitud: 'Cliente de confianza',
  solicitadoAt: new Date(Date.now() - 4 * 60000).toISOString(),
  operacionSaldoSnapshot: 12000,
  cliente: { id: 'c1', nombre: 'Ana Torres' },
  solicitadoPor: { id: 'u1', nombre: 'Laura' },
}

const detalle = (over: Record<string, unknown> = {}) => ({
  id: 'ex1', estado: 'PENDIENTE', motivoSolicitud: 'Cliente de confianza', notaSolicitud: null,
  solicitadoAt: new Date().toISOString(), limiteSnapshot: 1, fiadosAbiertosSnapshot: 1,
  saldoFiadoSnapshot: 18000, operacionSaldoSnapshot: 12000, saldoDespuesSnapshot: 30000,
  cliente: { id: 'c1', nombre: 'Ana Torres' }, solicitadoPor: { id: 'u1', nombre: 'Laura' },
  ...over,
})

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.useRealTimers() })

describe('ExcepcionesPendientesBanner', () => {
  it('no se pinta sin solicitudes', () => {
    const { container } = render(<ExcepcionesPendientesBanner excepciones={[]} onRevisar={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lista las solicitudes y abre la ventana desde el botón y desde la fila', () => {
    const onRevisar = vi.fn()
    render(<ExcepcionesPendientesBanner excepciones={[pendiente, { ...pendiente, id: 'ex2' }]} onRevisar={onRevisar} />)
    expect(screen.getByText(/2 solicitudes de excepción de crédito esperan/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('excepciones-revisar'))
    expect(onRevisar).toHaveBeenLastCalledWith('ex1')
    fireEvent.click(screen.getByTestId('excepcion-fila-ex2'))
    expect(onRevisar).toHaveBeenLastCalledWith('ex2')
  })
})

describe('ExcepcionCreditoModal', () => {
  it('con permiso: muestra los datos y autoriza con nota', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      llamadas.push({ url, init })
      if (init?.method === 'PATCH') return json({ success: true })
      const resuelta = llamadas.some((l) => l.init?.method === 'PATCH')
      return json({ excepcion: detalle(resuelta ? { estado: 'AUTORIZADA', autorizadoPor: { nombre: 'Carlos' } } : {}), puedeResolver: true })
    }))
    const onResuelta = vi.fn()
    render(<ExcepcionCreditoModal excepcionId="ex1" onClose={() => {}} onResuelta={onResuelta} />)
    await screen.findByTestId('excepcion-datos')
    expect(screen.getByTestId('excepcion-motivo')).toHaveTextContent('Cliente de confianza')
    fireEvent.change(screen.getByTestId('excepcion-nota'), { target: { value: 'solo hoy' } })
    fireEvent.click(screen.getByTestId('excepcion-autorizar'))
    await waitFor(() => expect(screen.getByTestId('excepcion-estado')).toHaveTextContent('Autorizada'))
    const patch = llamadas.find((l) => l.init?.method === 'PATCH')!
    expect(patch.url).toBe('/api/pedidos/excepciones-credito/ex1')
    expect(JSON.parse(String(patch.init?.body))).toEqual({ resolucion: 'AUTORIZAR', nota: 'solo hoy' })
    expect(onResuelta).toHaveBeenCalled()
    expect(screen.queryByTestId('excepcion-autorizar')).toBeNull()
  })

  it('sin permiso: ve el detalle pero no los botones', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ excepcion: detalle(), puedeResolver: false })))
    render(<ExcepcionCreditoModal excepcionId="ex1" onClose={() => {}} onResuelta={() => {}} />)
    await screen.findByTestId('excepcion-sin-permiso')
    expect(screen.queryByTestId('excepcion-autorizar')).toBeNull()
    expect(screen.queryByTestId('excepcion-rechazar')).toBeNull()
  })

  it('ya resuelta por otra persona: solo lectura', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ excepcion: detalle({ estado: 'RECHAZADA', rechazadoPor: { nombre: 'Carlos' }, notaRechazo: 'no' }), puedeResolver: true })))
    render(<ExcepcionCreditoModal excepcionId="ex1" onClose={() => {}} onResuelta={() => {}} />)
    await screen.findByTestId('excepcion-resuelta')
    expect(screen.getByTestId('excepcion-resuelta')).toHaveTextContent('Rechazada por Carlos')
    expect(screen.queryByTestId('excepcion-rechazar')).toBeNull()
  })

  it('enlace viejo (404): mensaje claro y se puede cerrar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ success: false, error: { message: 'x' } }, 404)))
    const onClose = vi.fn()
    render(<ExcepcionCreditoModal excepcionId="nope" onClose={onClose} onResuelta={() => {}} />)
    expect(await screen.findByTestId('excepcion-error-carga')).toHaveTextContent(/ya no existe/)
    fireEvent.click(screen.getByTestId('excepcion-cerrar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('si el servidor rechaza la decisión (403), muestra el error y recarga el estado real', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? json({ success: false, error: { message: 'No tienes autorización para resolver excepciones de crédito' } }, 403)
        : json({ excepcion: detalle(), puedeResolver: true })))
    render(<ExcepcionCreditoModal excepcionId="ex1" onClose={() => {}} onResuelta={() => {}} />)
    await screen.findByTestId('excepcion-autorizar')
    fireEvent.click(screen.getByTestId('excepcion-autorizar'))
    expect(await screen.findByTestId('excepcion-error')).toHaveTextContent(/No tienes autorización/)
  })
})

function Probe() {
  const { excepciones, puedeResolver } = useExcepcionesPendientes()
  return <p data-testid="probe">{String(puedeResolver)}:{excepciones.length}</p>
}

describe('useExcepcionesPendientes', () => {
  it('carga al montar y vuelve a consultar cada 30 s', async () => {
    vi.useFakeTimers()
    const f = vi.fn(() => json({ puedeResolver: true, excepciones: [pendiente] }))
    vi.stubGlobal('fetch', f)
    render(<Probe />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5) })
    expect(screen.getByTestId('probe')).toHaveTextContent('true:1')
    const n = f.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(f.mock.calls.length).toBeGreaterThan(n)
  })

  it('quien no puede autorizar recibe lista vacía', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => json({ puedeResolver: false, excepciones: [] })))
    render(<Probe />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5) })
    expect(screen.getByTestId('probe')).toHaveTextContent('false:0')
  })
})
