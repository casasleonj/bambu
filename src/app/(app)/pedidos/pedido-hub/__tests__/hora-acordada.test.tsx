// @tests #836 F2b: hora acordada. Chip con tiempo restante, «Para hoy» por franjas (Ya toca / Normales /
// Más tarde hoy, plegado, sin ocultar nada), cambio de hora al reprogramar y «Programar entrega» al crear.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HoraAcordadaChip } from '../compromiso-chip'
import { OperacionList } from '../operacion-list'
import { PedidoReprogramar } from '../pedido-reprogramar'
import { ProgramarEntrega } from '@/components/pedido-form-unified/programar-entrega'
import type { Pedido } from '../../pedidos-client/types'

vi.mock('../operacion-consulta', () => ({
  OperacionConsulta: ({ pedidos }: { pedidos: Array<{ id: string }> }) => (
    <ul>{pedidos.map((p) => <li key={p.id} data-testid={`fila-${p.id}`}>{p.id}</li>)}</ul>
  ),
}))

const HOY = '2026-11-18'
const MEDIODIA = `${HOY}T17:00:00.000Z`
const reloj = (hhmm: string) => { vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(new Date(`${HOY}T${hhmm}:00-05:00`)) }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('HoraAcordadaChip', () => {
  const p = (o = {}) => ({ fechaEntrega: MEDIODIA, estadoEntrega: 'PENDIENTE', entregaNoAntesDe: '16:00', ...o })
  it('muestra la hora y el tiempo restante hoy', () => {
    reloj('06:10')
    render(<HoraAcordadaChip id="a" pedido={p()} />)
    expect(screen.getByTestId('operacion-hora-a')).toHaveTextContent('Hora 16:00 · Faltan 9 h 50 min')
  })
  it('cerca de la hora dice «En 40 min»', () => {
    reloj('15:20')
    render(<HoraAcordadaChip id="a" pedido={p()} />)
    expect(screen.getByTestId('operacion-hora-a')).toHaveTextContent('En 40 min')
  })
  it('otro día: solo la hora, sin tiempo restante', () => {
    reloj('06:10')
    render(<HoraAcordadaChip id="a" pedido={p({ fechaEntrega: '2026-11-21T17:00:00.000Z' })} />)
    expect(screen.getByTestId('operacion-hora-a').textContent).toBe('🕐 Hora 16:00')
  })
  it('sin hora, entregado, cancelado o anulado: no muestra nada', () => {
    reloj('06:10')
    for (const o of [{ entregaNoAntesDe: null }, { estadoEntrega: 'ENTREGADO' }, { estadoEntrega: 'CANCELADO' }, { estadoEntrega: 'ANULADO' }]) {
      const { container, unmount } = render(<HoraAcordadaChip id="a" pedido={p(o)} />)
      expect(container).toBeEmptyDOMElement(); unmount()
    }
  })
})

describe('«Para hoy» por franjas', () => {
  const mk = (id: string, hora: string | null) => ({ id, numero: Number(id.replace(/\D/g, '') || 1), estadoEntrega: 'PENDIENTE', fechaEntrega: MEDIODIA, entregaNoAntesDe: hora }) as unknown as Pedido
  const consulta = (franjas: boolean) => ({ userRole: 'ADMIN', gestionDirecta: false, volver: '/pedidos', onVerPedido: vi.fn(), onVerFactura: vi.fn(), franjas })
  const lista = [mk('sin1', null), mk('t1600', '16:00'), mk('a0630', '06:30'), mk('c0800', '08:00'), mk('t1730', '17:30')]
  const pintar = (franjas = true, pedidos = lista) =>
    render(<OperacionList pedidos={pedidos} viewport="desktop" hoyBogota={HOY} onAccion={vi.fn()} onOpen={vi.fn()} consulta={consulta(franjas)} />)
  const orden = () => screen.getAllByTestId(/^fila-/).map((n) => n.textContent)

  it('6:10: ya toca arriba, normales en medio, y «Más tarde» plegado pero contado (no se oculta)', () => {
    reloj('06:10')
    pintar()
    expect(screen.getByTestId('franja-ya_toca')).toHaveTextContent('Ya toca · 1')
    expect(screen.getByTestId('franja-normal')).toHaveTextContent('Normales · 2')
    expect(screen.getByTestId('franja-mas_tarde')).toHaveTextContent('Más tarde hoy · 2')
    expect(orden()).toEqual(['a0630', 'sin1', 'c0800']) // los de más tarde están plegados
    fireEvent.click(screen.getByTestId('franja-mas-tarde-toggle'))
    expect(orden()).toEqual(['a0630', 'sin1', 'c0800', 't1600', 't1730'])
  })
  it('15:20: el de las 16:00 ya está en «Ya toca», primero que los normales', () => {
    reloj('15:20')
    pintar()
    expect(orden().slice(0, 4)).toEqual(['a0630', 'c0800', 't1600', 'sin1'])
  })
  it('sin la opción de franjas, o sin ninguna hora, la lista queda como siempre (sin encabezados)', () => {
    reloj('06:10')
    const a = pintar(false)
    expect(screen.queryByTestId('pedidos-por-franja')).toBeNull(); a.unmount()
    pintar(true, [mk('x1', null), mk('x2', null)])
    expect(screen.queryByTestId('pedidos-por-franja')).toBeNull()
  })
})

describe('Cambiar fecha prometida: hora acordada', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) }) })
  const base = { id: 'p1', numero: 1050, estadoEntrega: 'PENDIENTE', fechaEntrega: '2026-11-20T17:00:00.000Z' as string | null }
  const abrir = (hora: string | null) => {
    render(<PedidoReprogramar pedido={{ ...base, entregaNoAntesDe: hora }} hoyBogota="2026-11-17" onMutado={vi.fn()} />)
    fireEvent.click(screen.getByTestId('reprogramar-abrir'))
    fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: '2026-11-21' } })
  }
  const cuerpo = () => JSON.parse(fetchMock.mock.calls[0][1].body as string)

  it('precarga la hora actual y, sin tocarla, no la envía', async () => {
    abrir('06:00')
    expect((screen.getByTestId('reprogramar-hora') as HTMLInputElement).value).toBe('06:00')
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect('horaNueva' in cuerpo()).toBe(false)
  })
  it('cambiar la hora la envía; vaciarla manda null (quitar)', async () => {
    abrir('06:00')
    fireEvent.change(screen.getByTestId('reprogramar-hora'), { target: { value: '16:30' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().horaNueva).toBe('16:30')
  })
  it('vaciar la hora manda null', async () => {
    abrir('06:00')
    fireEvent.change(screen.getByTestId('reprogramar-hora'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().horaNueva).toBeNull()
  })
  it('sin hora previa y sin poner ninguna: no manda el campo', async () => {
    abrir(null)
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect('horaNueva' in cuerpo()).toBe(false)
  })
})

describe('ProgramarEntrega (crear pedido)', () => {
  const pintar = (o: Partial<Parameters<typeof ProgramarEntrega>[0]> = {}) =>
    render(<ProgramarEntrega fecha="" hora="" onFecha={vi.fn()} onHora={vi.fn()} hoyBogota={HOY} {...o} />)
  it('cerrado por defecto: solo el enlace discreto, sin campos', () => {
    pintar()
    expect(screen.getByTestId('programar-entrega-toggle')).toHaveTextContent('Programar entrega (fecha u hora)')
    expect(screen.queryByTestId('programar-fecha')).toBeNull()
    expect(screen.queryByTestId('programar-hora')).toBeNull()
  })
  it('al abrir muestra fecha (mínimo hoy, vacía = hoy) y hora, y reporta los cambios', () => {
    const onHora = vi.fn(); const onFecha = vi.fn()
    pintar({ onHora, onFecha })
    fireEvent.click(screen.getByTestId('programar-entrega-toggle'))
    expect((screen.getByTestId('programar-fecha') as HTMLInputElement).min).toBe(HOY)
    fireEvent.change(screen.getByTestId('programar-hora'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByTestId('programar-fecha'), { target: { value: '2026-11-21' } })
    expect(onHora).toHaveBeenCalledWith('16:00'); expect(onFecha).toHaveBeenCalledWith('2026-11-21')
  })
  it('si ya trae valores arranca abierto y muestra el error', () => {
    pintar({ fecha: '2026-11-10', hora: '06:00', error: 'La fecha ya pasó. Elige hoy o una fecha futura.' })
    expect(screen.getByTestId('programar-error')).toHaveTextContent('La fecha ya pasó')
  })
})
