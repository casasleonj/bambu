// @tests #511 #513 — el neto presentado antes de cerrar debe incluir la cartera.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CierreClient from '../index'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } } }) }))
vi.mock('@/hooks/use-polling-refetch', () => ({ usePollingRefetch: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/arqueo-caja', () => ({
  DENOMINACIONES: [],
  default: ({ netoTeorico, onChange }: { netoTeorico: number; onChange: (value: unknown) => void }) => <>
    <output data-testid="neto-antes-del-cierre">{netoTeorico}</output>
    <button onClick={() => onChange({ arqueo: { 10000: 1 }, totalContado: 10000, diferencia: 10000 - netoTeorico })}>Conteo de prueba</button>
  </>,
}))

const cierre = {
  fecha: '2026-03-14', numPedidos: 1, totalVentas: 90000, cobrado: 90000,
  cobroVentasHoy: 5000, cobroCartera: 5000, fiado: 0, totalNotasCredito: 0,
  efectivo: 5000, transferencia: 0, nequi: 0, daviplata: 0, bono: 0, totalGastos: 0,
  ventasPorOrigen: [], facturasEmitidas: 0, facturas: [], embarques: [],
  descuentosRepartidorCount: 0, clientesNuevos: 0,
  comisionesAuto: { total: 0, repartidores: [] },
}
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.startsWith('/api/config') ? { config: { valor: '10000' } }
      : url === '/api/cierre/last' ? { cierre: null }
      : { cierre, status: 'COMPLETO', embarquesPendientes: [] },
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('auditoría de la experiencia del cierre', () => {
  it('el neto previo incluye base + Pago + abono independiente, una sola vez', async () => {
    render(<CierreClient initialFecha="2026-03-14" />)
    await waitFor(() => expect(screen.getByLabelText('Base de Caja')).toHaveValue(10000))
    expect(await screen.findByTestId('neto-antes-del-cierre')).toHaveTextContent('20000')
  })

  it('una respuesta HTTP 500 con JSON válido muestra el error y permite reintentar', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: !url.startsWith('/api/cierre?'), status: url.startsWith('/api/cierre?') ? 500 : 200,
      json: async () => url.startsWith('/api/cierre?') ? { error: { message: 'Error de prueba' } }
        : url.startsWith('/api/config') ? { config: { valor: '10000' } } : { cierre: null },
    }))
    render(<CierreClient initialFecha="2026-03-14" />)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})

async function abrirConfirmacion() {
  render(<CierreClient initialFecha="2026-03-14" />)
  await waitFor(() => expect(screen.getByLabelText('Base de Caja')).toHaveValue(10000))
  fireEvent.click(screen.getByRole('button', { name: 'Conteo de prueba' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Día' }))
  return screen.findByRole('dialog', { name: 'Confirmar cierre del día' })
}
const envios = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')

describe('maqueta aprobada: confirmación y recuperación', () => {
  it('exige revisión explícita y cancelar conserva los datos sin enviar', async () => {
    const dialog = await abrirConfirmacion()
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled()
    expect(within(dialog).getByText(/incluye pagos digitales/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a revisar' })) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(envios()).toHaveLength(0)
    expect(screen.getByLabelText('Base de Caja')).toHaveValue(10000)
  })

  it('doble clic confirma una sola vez y vuelve a consultar el resultado registrado', async () => {
    const original = fetchMock.getMockImplementation()!
    let registrado = false
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        registrado = true
        return { ok: true, status: 201, json: async () => ({ cierre: { netoCaja: 20000 } }) }
      }
      if (registrado && url.startsWith('/api/cierre?')) return { ok: true, status: 200, json: async () => ({ cierre: { ...cierre, netoCaja: 20000 }, status: 'CERRADO' }) }
      return original(url, options)
    })
    const dialog = await abrirConfirmacion()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    const button = within(dialog).getByRole('button', { name: 'Confirmar cierre' })
    fireEvent.click(button); fireEvent.click(button)
    expect(await screen.findByRole('heading', { name: 'Día cerrado' })).toBeInTheDocument()
    expect(envios()).toHaveLength(1)
    expect(screen.getByTestId('cierre-kpi-neto')).toHaveTextContent('20.000')
  })

  it('una respuesta perdida consulta si el cierre quedó registrado sin reenviar', async () => {
    const original = fetchMock.getMockImplementation()!
    let registrado = false
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') { registrado = true; throw new TypeError('Respuesta perdida') }
      if (registrado && url.startsWith('/api/cierre?')) return { ok: true, status: 200, json: async () => ({ cierre: { ...cierre, netoCaja: 20000 }, status: 'CERRADO' }) }
      return original(url, options)
    })
    const dialog = await abrirConfirmacion()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }))
    expect(await screen.findByRole('heading', { name: 'Día cerrado' })).toBeInTheDocument()
    expect(envios()).toHaveLength(1)
  })

  it('muestra los cobros sin clasificar y bloquea solo la consulta afectada', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => url.startsWith('/api/cierre?')
      ? { ok: false, status: 409, json: async () => ({ error: { message: 'Origen sin verificar', code: 'COBROS_PENDIENTES_CONCILIACION', cobrosPendientes: [{ referencia: 'AB-PRUEBA', importe: 5000 }] } }) }
      : original(url, options))
    render(<CierreClient initialFecha="2026-03-14" />)
    expect(await screen.findByText('AB-PRUEBA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled()
    expect(screen.queryByTestId('cierre-kpi-neto')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Qué revisar' }))
    expect(screen.getByText(/Contrasta las referencias/)).toBeInTheDocument()
    expect(envios()).toHaveLength(0)
  })

  it('descarta la respuesta de una consulta abandonada y no reutiliza su conteo', async () => {
    let resolver: (value: unknown) => void = () => {}
    const original = fetchMock.getMockImplementation()!
    let consultas = 0
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/cierre?')) {
        consultas++
        if (consultas === 2) return new Promise(resolve => { resolver = resolve })
        const fecha = url.split('fecha=')[1]
        return { ok: true, status: 200, json: async () => ({ cierre: { ...cierre, fecha }, status: 'COMPLETO' }) }
      }
      return original(url, options)
    })
    render(<CierreClient initialFecha="2026-03-14" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Conteo de prueba' }))
    fireEvent.change(screen.getByLabelText('Fecha del cierre:'), { target: { value: '2026-03-13' } })
    await waitFor(() => expect(consultas).toBe(2))
    // El selector se oculta durante la consulta; remonta el componente para
    // simular también una tarea abandonada antes de recibir la respuesta.
    cleanup()
    render(<CierreClient initialFecha="2026-03-12" />)
    await screen.findByRole('button', { name: 'Conteo de prueba' })
    await act(async () => { resolver({ ok: true, status: 200, json: async () => ({ cierre: { ...cierre, fecha: '2026-03-13' }, status: 'COMPLETO' }) }) })
    expect(screen.getByLabelText('Fecha del cierre:')).toHaveValue('2026-03-12')
    expect(screen.getByRole('button', { name: 'Cerrar Día' })).toBeDisabled()
  })
})
