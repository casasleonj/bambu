// @tests #499 — comisión de repartidores en el cierre: se ve el estado, se paga con un toque
// confirmado y el monto esperado viaja para detectar una pantalla desactualizada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ComisionesRepartidores } from '../comisiones-repartidores'

const toastOk = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastError(...a) } }))

const fetchMock = vi.fn()

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
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, ya le pagué' }))

    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/nomina/dia/pagar')
    const cuerpo = JSON.parse(init.body)
    expect(cuerpo).toMatchObject({ trabajadorId: 'g1', fecha: '2026-10-26', montoEsperado: 6400 })
    expect(cuerpo.offlineId).toMatch(/^cp-/)
    expect(toastOk).toHaveBeenCalled()
  })

  it('cancelar la confirmación no paga nada', async () => {
    montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sí, ya le pagué' })).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una respuesta 409 (la comisión cambió) muestra el mensaje y refresca la pantalla', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { message: 'La comisión cambió mientras mirabas la pantalla. Revisa el valor nuevo' } }) })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('cambió')))
    expect(onPagado).toHaveBeenCalled()
  })

  it('sin conexión avisa que no se registró y no refresca como si hubiera pagado', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-comision-g1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('no se registró')))
    expect(onPagado).not.toHaveBeenCalled()
  })

  it('reintentar tras una falla de red reusa la misma clave (no paga dos veces)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    montar()
    for (let i = 0; i < 2; i++) {
      fireEvent.click(await screen.findByTestId('pagar-comision-g1'))
      fireEvent.click(await screen.findByRole('button', { name: 'Sí, ya le pagué' }))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(i + 1))
    }
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).offlineId)
    expect(ids[0]).toBe(ids[1])
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
