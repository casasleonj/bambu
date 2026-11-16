// @tests #673 punto 2 — «Sueldos que tocan» con «Lo pagué otro día» (maqueta aprobada por el PO): opcional, sin cambiar el pago normal.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SueldosQueTocan } from '../sueldos-que-tocan'

vi.mock('@/lib/dates', () => ({ getTodayString: () => '2026-11-04' }))
const toastOk = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastError(...a) } }))

const fetchMock = vi.fn()
const carlos = { trabajadorId: 'c1', nombre: 'Carlos Pérez', rol: 'SELLADOR', fecha: '2026-10-31', monto: 400000, fueraDeCaja: false }
const ID = 'c1-2026-10-31'

function montar(over: Partial<React.ComponentProps<typeof SueldosQueTocan>> = {}) {
  const onPagado = vi.fn()
  render(<SueldosQueTocan sueldos={[carlos]} puedePagar diaCerrado={false} onPagado={onPagado} {...over} />)
  return { onPagado }
}
const abrir = () => fireEvent.click(screen.getByTestId(`sueldo-otro-dia-${ID}`))
const elegir = (fecha: string, motivo = '') => {
  fireEvent.change(screen.getByTestId(`sueldo-fecha-${ID}`), { target: { value: fecha } })
  if (motivo) fireEvent.change(screen.getByTestId(`sueldo-motivo-${ID}`), { target: { value: motivo } })
}
const pagar = () => fireEvent.click(screen.getByTestId('pagar-sueldo-c1'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('SueldosQueTocan — fecha de pago opcional', () => {
  it('recogido por defecto: solo un enlace; los campos no estorban el pago de siempre', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Lo pagué otro día' })).toBeInTheDocument()
    expect(screen.queryByTestId(`sueldo-fecha-${ID}`)).toBeNull()
    expect(screen.getByText('Sale de la caja de hoy (efectivo)')).toBeInTheDocument()
  })

  it('al abrirlo aparecen la fecha (hasta hoy) y el motivo, con la nota de que el periodo no cambia', () => {
    montar()
    abrir()
    expect(screen.getByLabelText('¿Qué día lo pagaste?')).toHaveAttribute('max', '2026-11-04')
    expect(screen.getByLabelText('¿Por qué se anota con otra fecha?')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No cambia el periodo que cubre este sueldo')
  })

  it('elegir un día actualiza el aviso de la caja', () => {
    montar()
    abrir()
    elegir('2026-11-02', 'Se pagó antes de lo previsto')
    expect(screen.getByText(/Sale de la caja del 2 de noviembre \(efectivo\)/)).toBeInTheDocument()
  })

  it('sin motivo en una fecha pasada: lo dice junto al campo y no confirma ni envía nada', async () => {
    montar()
    abrir()
    elegir('2026-11-02')
    pagar()
    expect(await screen.findByText('Cuéntanos por qué se anota con otra fecha.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sí, pagar' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una fecha que no ha llegado o vacía se rechaza en pantalla', async () => {
    montar()
    abrir()
    pagar()
    expect(await screen.findByText('Elige el día en que lo pagaste.')).toBeInTheDocument()
    elegir('2026-11-05', 'prueba')
    pagar()
    expect(await screen.findByText('No puedes elegir un día que no ha llegado. Elige hoy o uno anterior.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con día y motivo: la confirmación lo explica y el pago viaja con fechaPago y motivoFecha', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    const { onPagado } = montar()
    abrir()
    elegir('2026-11-02', 'Se pagó antes de lo previsto')
    pagar()
    expect(await screen.findByText(/Se anota como pagado el 2 de noviembre/)).toHaveTextContent('Motivo: Se pagó antes de lo previsto.')
    fireEvent.click(screen.getByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      trabajadorId: 'c1', fecha: '2026-10-31', metodo: 'EFECTIVO', fueraDeCaja: false, fechaPago: '2026-11-02', motivoFecha: 'Se pagó antes de lo previsto',
    })
    expect(toastOk).toHaveBeenCalledWith('Sueldo pagado a Carlos Pérez. Resta de la caja del 2 de noviembre.')
  })

  it('elegir la fecha de hoy es el pago normal: no pide motivo ni envía campos nuevos', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    montar()
    abrir()
    elegir('2026-11-04')
    pagar()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ trabajadorId: 'c1', fecha: '2026-10-31', metodo: 'EFECTIVO', fueraDeCaja: false })
  })

  it('«Volver a hoy» cierra los campos y el pago vuelve a ser el de siempre', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    montar()
    abrir()
    elegir('2026-11-02', 'Motivo')
    fireEvent.click(screen.getByTestId(`sueldo-volver-hoy-${ID}`))
    expect(screen.queryByTestId(`sueldo-fecha-${ID}`)).toBeNull()
    pagar()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('fechaPago')
  })

  it('un pago por otro medio no promete restar de la caja de ese día', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    montar()
    fireEvent.change(screen.getByTestId('sueldo-medio-c1'), { target: { value: 'NEQUI' } })
    abrir()
    elegir('2026-11-02', 'Pagado por Nequi antes')
    pagar()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith('Sueldo pagado a Carlos Pérez'))
  })

  it('si el servidor rechaza la fecha, el mensaje sale junto al campo; no hay aviso de error ni refresco', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { code: 'MOTIVO_FECHA_REQUERIDO', message: 'x' } }) })
    const { onPagado } = montar()
    abrir()
    elegir('2026-11-02', 'Motivo válido')
    pagar()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    expect(await screen.findByText('Cuéntanos por qué se anota con otra fecha.')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
    expect(onPagado).not.toHaveBeenCalled()
  })

  it('mientras se guarda, los campos quedan desactivados', async () => {
    let resolver: (v: unknown) => void = () => undefined
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r }))
    montar()
    abrir()
    elegir('2026-11-02', 'Motivo')
    pagar()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(screen.getByTestId(`sueldo-fecha-${ID}`)).toBeDisabled())
    expect(screen.getByTestId(`sueldo-motivo-${ID}`)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pagando…' })).toBeDisabled()
    resolver({ ok: true, status: 201, json: async () => ({ success: true }) })
  })

  it('sin permiso o con el día cerrado no ofrece el enlace', () => {
    montar({ puedePagar: false })
    expect(screen.queryByTestId(`sueldo-otro-dia-${ID}`)).toBeNull()
  })

  it('con el día cerrado tampoco', () => {
    montar({ diaCerrado: true })
    expect(screen.queryByTestId(`sueldo-otro-dia-${ID}`)).toBeNull()
  })
})
