import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CobrosDashboard } from '../cobros-dashboard'
import type { CobrosPeriodo } from '@/lib/cobros-periodo'
const vacio: CobrosPeriodo = {
  medios: [],
  movimientos: [],
  subtotalRegistrado: 0,
  creditoAplicado: 0,
  porConciliar: [],
}
const props = {
  deuda: 0,
  deudaHoy: 0,
  userRole: 'ADMIN',
  detalle: null,
  onDetalle: vi.fn(),
}
describe('medios y conciliación en dashboard', () => {
  it('no crea tarjetas digitales para medios sin actividad', () => {
    const { container } = render(<CobrosDashboard {...props} cobros={vacio} />)
    expect(container.querySelector('[data-testid^="medio-"]')).toBeNull()
  })
  it('neto cero con ajuste conserva el medio y su historia', () => {
    render(
      <CobrosDashboard
        {...props}
        cobros={{
          ...vacio,
          medios: [
            {
              metodo: 'NEQUI',
              movimientos: 1,
              bruto: 10000,
              ajustes: 10000,
              neto: 0,
              confirmado: 0,
              reportado: 0,
              discrepante: 0,
              sinEstadoVerificable: 0,
              pendienteConciliacion: false,
            },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('medio-NEQUI')).toHaveTextContent('Ajustes')
    expect(screen.queryByTestId('medio-DAVIPLATA')).toBeNull()
  })
  it('estado ausente de un abono no se presenta como confirmado', () => {
    render(
      <CobrosDashboard
        {...props}
        cobros={{
          ...vacio,
          subtotalRegistrado: 10000,
          medios: [
            {
              metodo: 'NEQUI',
              movimientos: 1,
              bruto: 10000,
              ajustes: 0,
              neto: 10000,
              confirmado: 0,
              reportado: 0,
              discrepante: 0,
              sinEstadoVerificable: 10000,
              pendienteConciliacion: false,
            },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('medio-NEQUI')).toHaveTextContent(
      'Sin estado verificable',
    )
    expect(screen.getByTestId('medio-NEQUI')).not.toHaveTextContent(
      '✓ Confirmado',
    )
  })
  it('fuente desconocida se presenta pendiente, sin tarjetas de cero', () => {
    render(<CobrosDashboard {...props} cobros={null} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'pendientes de consulta',
    )
    expect(screen.queryByTestId('medio-NEQUI')).toBeNull()
  })
  it('una conciliación de medio desconocido afecta también el subtotal digital', () => {
    render(
      <CobrosDashboard
        {...props}
        cobros={{
          ...vacio,
          porConciliar: [
            {
              id: 'a',
              referencia: 'ABO-1',
              pedidoId: null,
              metodo: null,
              importe: null,
              motivo: 'REGISTRO_INCOMPLETO',
            },
          ],
          medios: [
            {
              metodo: 'NEQUI',
              movimientos: 1,
              bruto: 10000,
              ajustes: 0,
              neto: 10000,
              confirmado: 10000,
              reportado: 0,
              discrepante: 0,
              sinEstadoVerificable: 0,
              pendienteConciliacion: false,
            },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('medio-NEQUI')).toHaveTextContent('Por conciliar')
  })
})
