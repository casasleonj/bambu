// @tests #511 #513 #601 — el efectivo que debe haber incluye el efectivo de la cartera y excluye lo digital.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CierreClient from '../index'
import { CierreConfirmacion } from '@/components/cierre/cierre-confirmacion'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } } }) }))
vi.mock('@/hooks/use-polling-refetch', () => ({ usePollingRefetch: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/arqueo-caja', () => ({
  DENOMINACIONES: [],
  default: ({ efectivoEsperado, onChange }: { efectivoEsperado: number; onChange: (value: unknown) => void }) => <>
    <output data-testid="neto-antes-del-cierre">{efectivoEsperado}</output>
    <button onClick={() => onChange({ arqueo: { 10000: 1 }, totalContado: 10000, diferencia: 10000 - efectivoEsperado })}>Conteo de prueba</button>
  </>,
}))

const cierre = {
  fecha: '2026-03-14', numPedidos: 1, totalVentas: 90000, cobrado: 90000,
  cobroVentasHoy: 5000, cobroCartera: 5000, cobroCarteraEfectivo: 5000, cobroEfectivoHoy: 10000, cobroDigitalHoy: 0,
  fiado: 0, totalNotasCredito: 0,
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
  it('el efectivo que debe haber incluye base + Pago + abono en efectivo, una sola vez', async () => {
    render(<CierreClient initialFecha="2026-03-14" />)
    await waitFor(() => expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/))
    expect(await screen.findByTestId('neto-antes-del-cierre')).toHaveTextContent('20000')
    expect(within(screen.getByTestId('cierre-efectivo-esperado')).getByTestId('efectivo-debe-haber')).toHaveTextContent(/\$\s*20\.000/)
  })

  it('#601: Nequi y demás pagos digitales no entran al efectivo que debe haber, pero se informan aparte', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => url.startsWith('/api/cierre?')
      ? { ok: true, status: 200, json: async () => ({ cierre: { ...cierre, nequi: 3000, cobroVentasHoy: 8000, cobroDigitalHoy: 3000 }, status: 'COMPLETO', embarquesPendientes: [] }) }
      : original(url, options))
    render(<CierreClient initialFecha="2026-03-14" />)
    await waitFor(() => expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/))
    // base 10.000 + efectivo 5.000 + abono en efectivo 5.000 = 20.000 (los 3.000 de Nequi no cuentan).
    expect(await screen.findByTestId('neto-antes-del-cierre')).toHaveTextContent('20000')
    expect(screen.getByTestId('cierre-pagos-digitales')).toHaveTextContent(/\$\s*3\.000/)
    // «Cobrado hoy» sí los incluye (8.000 de pagos + 5.000 de abono en efectivo) y la pantalla ya no muestra el «neto».
    expect(screen.getByTestId('cierre-kpi-cobros')).toHaveTextContent('13.000')
    expect(screen.queryByTestId('cierre-kpi-neto')).not.toBeInTheDocument()
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
  await waitFor(() => expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/))
  fireEvent.click(screen.getByRole('button', { name: 'Conteo de prueba' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Día' }))
  return screen.findByRole('dialog', { name: 'Confirmar cierre del día' })
}
const envios = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')

describe('maqueta aprobada: confirmación y recuperación', () => {
  it('muestra lo que debe haber, lo contado y la diferencia en palabras sencillas', () => {
    render(<CierreConfirmacion resumen={{ fecha: '2026-03-14', debeHaber: 151700, contado: 150000, diferencia: -1700 }} onResolver={vi.fn()} />)
    expect(screen.getByText('Efectivo que debe haber').closest('div')).toHaveTextContent(/\$\s*151\.700/)
    expect(screen.getByText('Efectivo contado').closest('div')).toHaveTextContent(/\$\s*150\.000/)
    expect(screen.getByText('Diferencia').closest('div')).toHaveTextContent(/Falta\s*\$\s*1\.700/)
  })

  it('dice «Cuadra» o «Sobra» según el conteo', () => {
    const { unmount } = render(<CierreConfirmacion resumen={{ fecha: '2026-03-14', debeHaber: 100000, contado: 100000, diferencia: 0 }} onResolver={vi.fn()} />)
    expect(screen.getByText('Diferencia').closest('div')).toHaveTextContent('Cuadra')
    unmount()
    render(<CierreConfirmacion resumen={{ fecha: '2026-03-14', debeHaber: 100000, contado: 108300, diferencia: 8300 }} onResolver={vi.fn()} />)
    expect(screen.getByText('Diferencia').closest('div')).toHaveTextContent(/Sobra\s*\$\s*8\.300/)
  })

  it('exige revisión explícita y cancelar conserva los datos sin enviar', async () => {
    const dialog = await abrirConfirmacion()
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled()
    expect(within(dialog).getByText(/Después de cerrar no podrás cambiar/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a revisar' })) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(envios()).toHaveLength(0)
    expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/)
    expect(screen.queryByLabelText('Efectivo con el que empezó el día')).not.toBeInTheDocument() // #666: ya no hay segundo campo
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
    expect(screen.getByTestId('cierre-kpi-cobros')).toBeInTheDocument()
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

// #688 — la base de caja la ingresa «Caja base»; el cierre solo la lee, la mantiene actualizada y no cierra con una vieja o inexistente.
describe('#688 base de caja en el cierre', () => {
  const configCon = (valor: string | null) => async (url: string, options?: RequestInit) => {
    const original = fetchMock.getMockImplementation()
    void original
    if (url.startsWith('/api/config?clave=BASE_DIA_')) {
      return valor === null
        ? { ok: false, status: 404, json: async () => ({ success: false }) }
        : { ok: true, status: 200, json: async () => ({ config: { valor, updatedAt: '2026-03-14T12:42:00.000Z' } }) }
    }
    if (options?.method === 'POST') return { ok: true, status: 201, json: async () => ({ cierre: { netoCaja: 20000 } }) }
    return {
      ok: true, status: 200,
      json: async () => url === '/api/cierre/last' ? { cierre: null } : { cierre, status: 'COMPLETO', embarquesPendientes: [] },
    }
  }

  it('sin base de ese día no inventa un valor: «—», aviso para ingresarla y «Cerrar Día» bloqueado, sin consultar el valor por defecto', async () => {
    fetchMock.mockImplementation(configCon(null))
    render(<CierreClient initialFecha="2026-03-14" />)
    expect(await screen.findByTestId('base-caja-faltante')).toHaveTextContent('Falta la base de caja del 14 mar')
    expect(screen.getByTestId('efectivo-debe-haber')).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: 'Conteo de prueba' }))
    expect(screen.getByRole('button', { name: 'Cerrar Día' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('clave=BASE_DIA'))).toBe(false)
    expect(envios()).toHaveLength(0)
  })

  it('con base ingresada la ficha dice su fuente y el cierre no ofrece ningún campo para escribirla', async () => {
    fetchMock.mockImplementation(configCon('10000'))
    render(<CierreClient initialFecha="2026-03-14" />)
    await waitFor(() => expect(screen.getByTestId('base-caja-fuente')).toHaveTextContent('Base de caja del 14 mar · actualizada'))
    expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/)
    expect(screen.queryByLabelText('Efectivo con el que empezó el día')).toBeNull()
    expect(screen.queryByTestId('base-caja-faltante')).toBeNull()
  })

  it('si la base cambió antes de confirmar, no se abre la confirmación ni se envía: se avisa antes → ahora y se actualiza lo que debe haber', async () => {
    let valor = '10000'
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => configCon(valor)(url, options))
    render(<CierreClient initialFecha="2026-03-14" />)
    await waitFor(() => expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*10\.000/))
    fireEvent.click(screen.getByRole('button', { name: 'Conteo de prueba' }))
    valor = '15000' // alguien editó la base en «Caja base»
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Día' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo).toHaveTextContent('La base de caja cambió')
    expect(dialogo).toHaveTextContent(/\$\s*10\.000/); expect(dialogo).toHaveTextContent(/\$\s*15\.000/)
    expect(screen.queryByRole('dialog', { name: 'Confirmar cierre del día' })).toBeNull()
    expect(envios()).toHaveLength(0)
    fireEvent.click(screen.getByTestId('base-caja-revisar'))
    expect(screen.getByTestId('cierre-efectivo-esperado')).toHaveTextContent(/Empezó con\s*\$\s*15\.000/)
    expect(screen.getByTestId('base-caja-aviso')).toHaveTextContent('Base de caja actualizada')
    expect(screen.getByTestId('efectivo-debe-haber')).toHaveTextContent(/\$\s*25\.000/) // 15.000 + 5.000 + 5.000
  })

  it('si el servidor rechaza con BASE_CAMBIO no se cierra y se pide revisar con el valor vigente', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => options?.method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ error: { code: 'BASE_CAMBIO', message: 'La base cambió', impacto: { baseVigente: 15000, baseEnviada: 10000 } } }) }
      : configCon('10000')(url, options))
    const dialog = await abrirConfirmacion()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }))
    const aviso = await screen.findByRole('alertdialog')
    expect(aviso).toHaveTextContent('La base de caja cambió')
    expect(aviso).toHaveTextContent(/\$\s*15\.000/)
    expect(screen.queryByRole('heading', { name: 'Día cerrado' })).toBeNull()
    expect(envios()).toHaveLength(1)
  })

  it('un día ya cerrado no pide ingresar la base ni la lee de nuevo (usa lo que quedó en su cierre)', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => url.startsWith('/api/cierre?')
      ? { ok: true, status: 200, json: async () => ({ cierre: { ...cierre, baseDia: 40000, netoCaja: 20000 }, status: 'CERRADO' }) }
      : configCon(null)(url, options))
    render(<CierreClient initialFecha="2026-03-14" />)
    expect(await screen.findByRole('heading', { name: 'Día cerrado' })).toBeInTheDocument()
    expect(screen.queryByTestId('base-caja-faltante')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
