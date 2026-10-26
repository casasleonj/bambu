// TEMPORAL-SIN-EMBARQUE(#472): el diálogo «Corregir canal» renderizado de verdad, con la red simulada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CorregirCanalDialog } from '../corregir-canal-dialog'

const PEDIDO = { id: 'ped1', numero: 351, canal: 'PUNTO', nombreCliente: 'Tienda La Esquina', total: 60000 }
const CAMBIO = {
  canalAntes: 'PUNTO', canalDespues: 'DOMICILIO', precios: 'CONSERVAR',
  totalAntes: 60000, totalDespues: 60000, totalPagado: 0, saldoDespues: 60000, estadoPagoDespues: 'PENDIENTE',
}
const mockFetch = vi.fn()

function abrir(onCorregido = vi.fn(), onClose = vi.fn(), pedido = PEDIDO) {
  render(<CorregirCanalDialog pedido={pedido} onClose={onClose} onCorregido={onCorregido} />)
  return { onCorregido, onClose }
}
const respuesta = (ok: boolean, json: unknown) => ({ ok, json: async () => json })
const cuerpo = (i: number) => JSON.parse((mockFetch.mock.calls[i][1] as { body: string }).body) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe('CorregirCanalDialog', () => {
  it('propone el canal opuesto, conserva precios por defecto y exige el motivo antes de revisar', () => {
    abrir()
    expect(screen.getByTestId('cc-canales')).toHaveTextContent('Hoy es de Punto de venta. Pasará a Domicilio.')
    expect((screen.getByTestId('cc-conservar') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByTestId('cc-revisar'))
    expect(screen.getByText(/Escribe el motivo de la corrección/)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('desde un domicilio propone pasar a punto de venta', () => {
    abrir(vi.fn(), vi.fn(), { ...PEDIDO, canal: 'DOMICILIO' })
    expect(screen.getByTestId('cc-canales')).toHaveTextContent('Hoy es de Domicilio. Pasará a Punto de venta.')
  })

  it('revisa con la vista previa del servidor y guarda con la MISMA clave', async () => {
    mockFetch
      .mockResolvedValueOnce(respuesta(true, { success: true, aplicado: false, cambio: CAMBIO }))
      .mockResolvedValueOnce(respuesta(true, { success: true, aplicado: true, deduped: false, cambio: CAMBIO }))
    const { onCorregido } = abrir()
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Se registró por error' } })
    fireEvent.click(screen.getByTestId('cc-revisar'))

    await waitFor(() => expect(screen.getByTestId('cc-resumen')).toBeInTheDocument())
    expect(screen.getByTestId('cc-resumen')).toHaveTextContent('pasa de Punto de venta a Domicilio')
    expect(screen.getByTestId('cc-resumen')).toHaveTextContent('Motivo: Se registró por error')
    expect(cuerpo(0)).toMatchObject({ canal: 'DOMICILIO', precios: 'CONSERVAR', motivo: 'Se registró por error', vistaPrevia: true })

    fireEvent.click(screen.getByTestId('cc-guardar'))
    await waitFor(() => expect(onCorregido).toHaveBeenCalledWith({ deduped: false, numero: 351, canalDespues: 'DOMICILIO' }))
    expect(cuerpo(1)).toMatchObject({ canal: 'DOMICILIO', vistaPrevia: false })
    expect(cuerpo(1).offlineId).toBe(cuerpo(0).offlineId)
    expect((mockFetch.mock.calls[1][0] as string)).toBe('/api/pedidos/ped1/gestion-admin/canal')
  })

  it('envía «recalcular» cuando se elige', async () => {
    mockFetch.mockResolvedValueOnce(respuesta(true, { success: true, aplicado: false, cambio: { ...CAMBIO, precios: 'RECALCULAR', totalDespues: 65000, saldoDespues: 65000 } }))
    abrir()
    fireEvent.click(screen.getByTestId('cc-recalcular'))
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Cambió la forma de entrega' } })
    fireEvent.click(screen.getByTestId('cc-revisar'))
    await waitFor(() => expect(screen.getByTestId('cc-resumen')).toHaveTextContent('sube $5.000'))
    expect(cuerpo(0)).toMatchObject({ precios: 'RECALCULAR' })
  })

  it('si el servidor rechaza, muestra su mensaje en palabras sencillas y no avanza', async () => {
    mockFetch.mockResolvedValueOnce(respuesta(false, { success: false, error: { message: 'Este pedido está en un embarque. Sácalo del embarque primero y luego corrige el canal.', code: 'PEDIDO_EN_EMBARQUE' } }))
    abrir()
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Error de registro' } })
    fireEvent.click(screen.getByTestId('cc-revisar'))
    await waitFor(() => expect(screen.getByTestId('cc-error')).toHaveTextContent('Sácalo del embarque primero'))
    expect(screen.queryByTestId('cc-resumen')).toBeNull()
  })

  it('un reintento ya aplicado se informa como tal', async () => {
    mockFetch
      .mockResolvedValueOnce(respuesta(true, { success: true, aplicado: false, cambio: CAMBIO }))
      .mockResolvedValueOnce(respuesta(true, { success: true, aplicado: true, deduped: true, cambio: CAMBIO }))
    const { onCorregido } = abrir()
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Error de registro' } })
    fireEvent.click(screen.getByTestId('cc-revisar'))
    await waitFor(() => screen.getByTestId('cc-guardar'))
    fireEvent.click(screen.getByTestId('cc-guardar'))
    await waitFor(() => expect(onCorregido).toHaveBeenCalledWith(expect.objectContaining({ deduped: true })))
  })

  it('sin conexión lo dice claro', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    abrir()
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Error de registro' } })
    fireEvent.click(screen.getByTestId('cc-revisar'))
    await waitFor(() => expect(screen.getByTestId('cc-error')).toHaveTextContent('No hay conexión'))
  })
})
