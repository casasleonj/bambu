// @tests #306 — selector de días pendientes del cierre: no se salta un día con movimientos; los vacíos son opcionales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CierreClient from '../index'
import { DiasPendientes, diaQueBloquea, etiquetaDia, etiquetaDiaLarga } from '../dias-pendientes'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } } }) }))
vi.mock('@/hooks/use-polling-refetch', () => ({ usePollingRefetch: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/dates', async (orig) => ({ ...(await orig<typeof import('@/lib/dates')>()), getTodayString: () => '2026-11-02' }))
vi.mock('@/components/arqueo-caja', () => ({
  DENOMINACIONES: [],
  default: ({ onChange }: { onChange: (v: unknown) => void }) =>
    <button onClick={() => onChange({ arqueo: { 10000: 1 }, totalContado: 10000, diferencia: 0 })}>Conteo de prueba</button>,
}))

const DIAS = [
  { fecha: '2026-10-31', operaciones: 12, obligatorio: true },
  { fecha: '2026-11-01', operaciones: 0, obligatorio: false },
  { fecha: '2026-11-02', operaciones: 0, obligatorio: false },
]

describe('helpers', () => {
  it('etiquetas en español', () => {
    expect(etiquetaDia('2026-10-31')).toBe('sáb 31 oct')
    expect(etiquetaDiaLarga('2026-10-31')).toBe('sábado 31 de octubre')
  })
  it('diaQueBloquea: el más antiguo con movimientos anterior a la fecha; los vacíos no bloquean', () => {
    expect(diaQueBloquea(DIAS, '2026-11-02')?.fecha).toBe('2026-10-31')
    expect(diaQueBloquea(DIAS, '2026-10-31')).toBeNull()
    expect(diaQueBloquea(DIAS.slice(1), '2026-11-02')).toBeNull()
  })
})

describe('DiasPendientes (presentación)', () => {
  afterEach(cleanup)
  const base = { fecha: '2026-11-02', hoy: '2026-11-02', deshabilitado: false, onElegir: vi.fn(), onReintentar: vi.fn() }
  it('cargando y error con «Reintentar»', () => {
    const { rerender } = render(<DiasPendientes {...base} estado="cargando" dias={[]} />)
    expect(screen.getByText('Revisando días pendientes…')).toBeInTheDocument()
    rerender(<DiasPendientes {...base} estado="error" dias={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(base.onReintentar).toHaveBeenCalled()
  })
  it('con un día de movimientos antes: bloqueo con una sola salida «Ir a cerrar»', () => {
    const onElegir = vi.fn()
    render(<DiasPendientes {...base} onElegir={onElegir} estado="ok" dias={DIAS} />)
    expect(screen.getByTestId('dias-pendientes-bloqueo')).toHaveTextContent('12 movimientos')
    expect(screen.queryByText(/saltar/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ir a cerrar el sábado 31 de octubre/ }))
    expect(onElegir).toHaveBeenCalledWith('2026-10-31')
  })
  it('elegir el día con movimientos o uno vacío, sin bloqueo', () => {
    const onElegir = vi.fn()
    render(<DiasPendientes {...base} onElegir={onElegir} fecha="2026-10-31" estado="ok" dias={DIAS} />)
    expect(screen.queryByTestId('dias-pendientes-bloqueo')).toBeNull()
    expect(screen.getByTestId('dia-pendiente-2026-11-01')).toHaveTextContent('Sin movimientos · opcional')
    fireEvent.click(screen.getByTestId('dia-pendiente-2026-11-01'))
    expect(onElegir).toHaveBeenCalledWith('2026-11-01')
  })
  it('sin días pendientes no muestra nada', () => {
    const { container } = render(<DiasPendientes {...base} estado="ok" dias={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CierreClient con días pendientes', () => {
  const cierre = {
    fecha: '2026-11-02', numPedidos: 0, totalVentas: 0, cobrado: 0, cobroVentasHoy: 0, cobroCartera: 0, fiado: 0,
    totalNotasCredito: 0, efectivo: 0, transferencia: 0, nequi: 0, daviplata: 0, bono: 0, totalGastos: 0,
    ventasPorOrigen: [], facturasEmitidas: 0, facturas: [], embarques: [], descuentosRepartidorCount: 0,
    clientesNuevos: 0, comisionesAuto: { total: 0, repartidores: [] },
  }
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, status: 200,
      json: async () => url.startsWith('/api/config') ? { config: { valor: '10000' } }
        : url === '/api/cierre/last' ? { cierre: null }
        : url === '/api/cierre/pendientes' ? { hoy: '2026-11-02', dias: DIAS }
        : { cierre: { ...cierre, fecha: new URL(url, 'http://x').searchParams.get('fecha') ?? cierre.fecha }, status: 'COMPLETO', embarquesPendientes: [] },
    }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('«Cerrar Día» queda apagado con un día de movimientos pendiente; ir a cerrarlo cambia la fecha y lo habilita', async () => {
    render(<CierreClient initialFecha="2026-11-02" />)
    await screen.findByTestId('dias-pendientes-bloqueo')
    fireEvent.click(await screen.findByRole('button', { name: 'Conteo de prueba' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar Día' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /Ir a cerrar el sábado 31 de octubre/ }))
    await waitFor(() => expect(screen.queryByTestId('dias-pendientes-bloqueo')).toBeNull())
    expect(screen.getByTestId('dia-pendiente-2026-10-31')).toHaveAttribute('aria-checked', 'true')
  })

  it('si no se pudo revisar los días, el cierre no se habilita y se puede reintentar', async () => {
    fetchMock.mockImplementation(async (url: string) => url === '/api/cierre/pendientes'
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => url.startsWith('/api/config') ? { config: { valor: '10000' } } : url === '/api/cierre/last' ? { cierre: null } : { cierre, status: 'COMPLETO', embarquesPendientes: [] } })
    render(<CierreClient initialFecha="2026-11-02" />)
    await screen.findByTestId('dias-pendientes-error')
    fireEvent.click(await screen.findByRole('button', { name: 'Conteo de prueba' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar Día' })).toBeDisabled())
  })
})
