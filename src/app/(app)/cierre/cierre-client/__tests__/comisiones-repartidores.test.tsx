// @tests #499 — comisión de repartidores en el cierre: se ve el estado, se paga con un toque
// confirmado y el monto esperado viaja para detectar una pantalla desactualizada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ComisionesRepartidores } from '../comisiones-repartidores'
import { todayStringBogota } from '@/lib/dates'

const toastOk = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastError(...a) } }))

const fetchMock = vi.fn()
const recibo = (monto = 6400, metodo = 'EFECTIVO') => ({ success: true, pago: { monto, metodo, fechaPagoReal: todayStringBogota() } })

const germain = { trabajadorId: 'g1', nombre: 'Germain León', total: 6400, pagado: 0, pendiente: 6400 }
const yesid = { trabajadorId: 'y1', nombre: 'Yesid Ramírez', total: 800, pagado: 800, pendiente: 0 }

function montar(over: Partial<React.ComponentProps<typeof ComisionesRepartidores>> = {}) {
  const onPagado = vi.fn()
  render(<ComisionesRepartidores fecha="2026-10-26" repartidores={[germain, yesid]} puedePagar diaCerrado={false} onPagado={onPagado} {...over} />)
  return { onPagado }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('ComisionesRepartidores', () => {
  it('#673 selecciona el día real sin cambiar el día trabajado', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ pago: { monto: 6400, metodo: 'EFECTIVO', fechaPagoReal: '2026-10-27' } }) })
    montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.change(screen.getByTestId('comision-fecha-pago'), { target: { value: '2026-10-27' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(toastOk).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ fecha: '2026-10-26', fechaPagoReal: '2026-10-27' })
  })

  it('#673 una respuesta de otro medio no se presenta como pago confirmado', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo(6400, 'NEQUI') })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos comprobar'))
    expect(toastOk).not.toHaveBeenCalled()
    expect(onPagado).not.toHaveBeenCalled()
  })

  it('#673 cambiar de fecha de consulta con la confirmación abierta no cambia el trabajo del intento', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo() })
    const onPagado = vi.fn()
    const props = { repartidores: [germain], puedePagar: true, diaCerrado: false, onPagado }
    const vista = render(<ComisionesRepartidores {...props} fecha="2026-10-26" />)
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    vista.rerender(<ComisionesRepartidores {...props} fecha="2026-10-27" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).fecha).toBe('2026-10-26')
  })

  it('muestra lo pagado y lo pendiente de cada repartidor', () => {
    montar()
    expect(screen.getByTestId('comision-g1')).toHaveTextContent('Pendiente')
    expect(screen.getByTestId('comision-y1')).toHaveTextContent('Pagado')
    expect(screen.getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('se paga con la nómina')
  })

  it('sin comisión en el día lo dice en palabras', () => {
    montar({ repartidores: [{ trabajadorId: 'z', nombre: 'Z', total: 0, pagado: 0, pendiente: 0 }] })
    expect(screen.getByTestId('comisiones-vacio')).toBeInTheDocument()
  })

  it('quien no puede pagar (asistente) ve el pendiente pero no el botón', () => {
    montar({ puedePagar: false })
    expect(screen.queryByTestId('pagar-comision-g1')).toBeNull()
    expect(screen.getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('Un administrador debe pagar')
  })

  it('con el día ya cerrado no ofrece pagar y explica que va por la nómina', () => {
    montar({ diaCerrado: true })
    expect(screen.queryByTestId('pagar-comision-g1')).toBeNull()
    expect(screen.getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('no salió de la caja de este día')
  })

  it('pide confirmación y paga con el monto esperado; después refresca', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo() })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))

    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/nomina/dia/pagar')
    const cuerpo = JSON.parse(init.body)
    expect(cuerpo).toMatchObject({ trabajadorId: 'g1', fecha: '2026-10-26', montoEsperado: 6400, concepto: 'REPARTO' })
    expect(cuerpo.offlineId).toMatch(/^cp-/)
    expect(toastOk).toHaveBeenCalled()
  })

  it('cancelar la confirmación no paga nada', async () => {
    montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ })).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una respuesta 409 (la comisión cambió) muestra el mensaje y refresca la pantalla', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'MONTO_CAMBIO', message: 'La comisión cambió mientras mirabas la pantalla. Revisa el valor nuevo' } }) })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cambió'))
    expect(onPagado).toHaveBeenCalled()
  })

  it('#673 conserva visible el motivo del rechazo por caja cerrada hasta que la persona vuelve', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'DIA_CERRADO', message: 'Ese día ya está cerrado. El pago requiere conciliación.' } }) })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('requiere conciliación'))
    expect(onPagado).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onPagado).toHaveBeenCalledOnce()
  })

  it('sin respuesta conserva resultado incierto y no afirma que el dinero no se registró', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no sabemos si se guardó'))
    expect(screen.getByTestId('comision-fecha-pago')).toBeDisabled()
    expect(onPagado).not.toHaveBeenCalled()
  })

  it('reintentar tras una falla de red reusa la misma clave (no paga dos veces)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ ok: true, status: 200, json: async () => recibo() })
    montar()
    for (let i = 0; i < 2; i++) {
      fireEvent.click(await screen.findByTestId('pagar-comision-g1'))
      fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(i + 1))
    }
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).offlineId)
    expect(ids[0]).toBe(ids[1])
  })

  it('#645: el sellador se paga con el mismo botón y la confirmación habla de lo producido', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo(10890) })
    const { onPagado } = montar({ tipo: 'sellador', repartidores: [{ trabajadorId: 's1', nombre: 'Carlos Sellador', total: 10890, pagado: 0, pendiente: 10890 }] })
    expect(screen.getByTestId('comisiones-selladores')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pagar-comision-s1'))
    expect(await screen.findByText(/botellones llenados/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ trabajadorId: 's1', fecha: '2026-10-26', montoEsperado: 10890, concepto: 'PRODUCCION' })
  })
})

it('la revisión es visible incluso con subtotal cero; no permite pagar al afectado', () => {
  montar({ repartidores: [
    { ...germain, total: 0, pendiente: 0, revisiones: [{ embarqueId: 'e1', motivo: 'Entrega sin identidad' }] }, yesid,
  ] })
  expect(screen.getByTestId('comision-g1')).toHaveTextContent('Por conciliar')
  expect(screen.queryByTestId('pagar-comision-g1')).toBeNull()
  expect(screen.getByTestId('comision-y1')).toHaveTextContent('Pagado')
  expect(screen.queryByTestId('comisiones-vacio')).toBeNull()
})

describe('#305 medio de pago de la comisión', () => {
  it('«Efectivo» sale marcado de entrada y el pago viaja como EFECTIVO', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo() })
    montar()
    expect(screen.getByTestId('comision-medio-g1-EFECTIVO')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('pagar-comision-g1')).toHaveTextContent('Pagar $ 6.400')
    expect(screen.getByTestId('comision-aviso-medio-g1')).toHaveTextContent('Confirmarás de qué día salió el efectivo')
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).metodo).toBe('EFECTIVO')
  })

  it('con Nequi el botón lo dice, avisa que no resta de la caja y el medio viaja al servidor', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo(6400, 'NEQUI') })
    montar()
    fireEvent.click(screen.getByTestId('comision-medio-g1-NEQUI'))
    expect(screen.getByTestId('comision-medio-g1-NEQUI')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('pagar-comision-g1')).toHaveTextContent('por Nequi')
    expect(screen.getByTestId('comision-aviso-medio-g1')).toHaveTextContent('Solo el efectivo se resta de la caja del día')
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    expect(await screen.findByText('No se descuenta del efectivo de la caja')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(toastOk).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ trabajadorId: 'g1', metodo: 'NEQUI', montoEsperado: 6400 })
    expect(toastOk.mock.calls[0][0]).toContain('por Nequi')
  })

  it('la lista desplegable de escritorio comparte el medio con las opciones de móvil', () => {
    montar()
    fireEvent.change(screen.getByTestId('comision-medio-select-g1'), { target: { value: 'DAVIPLATA' } })
    expect(screen.getByTestId('comision-medio-g1-DAVIPLATA')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('pagar-comision-g1')).toHaveTextContent('por Daviplata')
  })

  it('el sellador también elige el medio y conserva su concepto', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => recibo(10890, 'TRANSFERENCIA') })
    montar({ tipo: 'sellador', repartidores: [{ trabajadorId: 's1', nombre: 'Carlos Sellador', total: 10890, pagado: 0, pendiente: 10890 }] })
    fireEvent.click(screen.getByTestId('comision-medio-s1-TRANSFERENCIA'))
    fireEvent.click(screen.getByTestId('pagar-comision-s1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ metodo: 'TRANSFERENCIA', concepto: 'PRODUCCION' })
  })

  it('con resultado incierto, cambiar el selector no crea otro desembolso: se comprueba el intento original', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ ok: true, status: 200, json: async () => recibo() })
    montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no sabemos'))
    fireEvent.click(screen.getByRole('button', { name: /^Volver$/ }))
    fireEvent.click(screen.getByTestId('comision-medio-g1-NEQUI'))
    fireEvent.click(await screen.findByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /Sí, ya le pagué|Comprobar el mismo pago/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [a, b] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body))
    expect(a.metodo).toBe('EFECTIVO')
    expect(b).toEqual(a)
  })
})
