// @tests #644 — «Sueldos que tocan» en el cierre: se ven los sueldos cumplidos sin pagar, se paga con el medio elegido
// (el del administrador viene «por fuera de la caja») y quien no puede pagar o el día cerrado no ve el botón.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SueldosQueTocan } from '../sueldos-que-tocan'

const toastOk = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastOk(...a), error: (...a: unknown[]) => toastError(...a) } }))

const fetchMock = vi.fn()
const carlos = { trabajadorId: 'c1', nombre: 'Carlos Pérez', rol: 'SELLADOR', fecha: '2026-10-31', monto: 400000, fueraDeCaja: false }
const admin = { trabajadorId: 'a1', nombre: 'Administrador', rol: 'ADMIN', fecha: '2026-10-31', monto: 1500000, fueraDeCaja: true }

function montar(over: Partial<React.ComponentProps<typeof SueldosQueTocan>> = {}) {
  const onPagado = vi.fn()
  render(<SueldosQueTocan sueldos={[carlos, admin]} puedePagar diaCerrado={false} onPagado={onPagado} {...over} />)
  return { onPagado }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('SueldosQueTocan', () => {
  it('sin sueldos pendientes lo dice en palabras', () => {
    montar({ sueldos: [] })
    expect(screen.getByTestId('sueldos-vacio')).toBeInTheDocument()
  })

  it('el administrador viene «por fuera de la caja» y el resto en efectivo de la caja', () => {
    montar()
    expect((screen.getByTestId('sueldo-medio-a1') as HTMLSelectElement).value).toBe('FUERA_DE_CAJA')
    expect((screen.getByTestId('sueldo-medio-c1') as HTMLSelectElement).value).toBe('EFECTIVO')
  })

  it('pide confirmación y paga con el medio elegido; después refresca', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    const { onPagado } = montar()
    fireEvent.change(screen.getByTestId('sueldo-medio-c1'), { target: { value: 'NEQUI' } })
    fireEvent.click(screen.getByTestId('pagar-sueldo-c1'))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))

    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/nomina/sueldo/pagar')
    expect(JSON.parse(init.body)).toEqual({ trabajadorId: 'c1', fecha: '2026-10-31', metodo: 'NEQUI', fueraDeCaja: false })
    expect(toastOk).toHaveBeenCalled()
  })

  it('el pago «por fuera de la caja» viaja como efectivo fuera de la caja', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    montar()
    fireEvent.click(screen.getByTestId('pagar-sueldo-a1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ trabajadorId: 'a1', metodo: 'EFECTIVO', fueraDeCaja: true })
  })

  it('cancelar la confirmación no paga nada', async () => {
    montar()
    fireEvent.click(screen.getByTestId('pagar-sueldo-c1'))
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sí, pagar' })).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un error del servidor muestra su mensaje y refresca la pantalla', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { message: 'Ese sueldo no está pendiente' } }) })
    const { onPagado } = montar()
    fireEvent.click(screen.getByTestId('pagar-sueldo-c1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, pagar' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Ese sueldo no está pendiente'))
    expect(onPagado).toHaveBeenCalled()
  })

  it('sin permiso o con el día cerrado no ofrece pagar', () => {
    montar({ puedePagar: false })
    expect(screen.queryByTestId('pagar-sueldo-c1')).toBeNull()
  })
  it('con el día cerrado tampoco', () => {
    montar({ diaCerrado: true })
    expect(screen.queryByTestId('pagar-sueldo-c1')).toBeNull()
  })
})
