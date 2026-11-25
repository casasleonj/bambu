// #614: el detalle separa quién creó, quién entregó y quién cobró; lo desconocido se declara.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FiadosActoresDetalle } from '../fiados-actores-detalle'
import type { Pedido } from '../types'

const base = { id: 'p1', numero: 684 } as Pedido
const actores = {
  creadoPor: 'Lilia Ruiz', createdAt: '2026-11-03T13:05:00.000Z', entregasSinDetalle: false,
  responsablesEntrega: [{ id: 't1', nombre: 'Pedro Gómez' }],
  entregas: [{ id: 'e1', fecha: '2026-11-03T15:40:00.000Z', soloDia: false, responsable: { id: 't1', nombre: 'Pedro Gómez' },
    cantidades: [{ producto: 'PACA_AGUA', cantidad: 10 }, { producto: 'PACA_HIELO', cantidad: 2 }] }],
  pagos: [{ id: 'g1', fecha: '2026-11-05T20:12:00.000Z', metodo: 'EFECTIVO', monto: 20000, recibidoPor: { id: 't2', nombre: 'Ana Soto' } }],
}
describe('FiadosActoresDetalle', () => {
  it('muestra a las tres personas distintas, el total físico, sin fila de autorizador (el dato no se guarda)', () => {
    render(<FiadosActoresDetalle p={{ ...base, actores }} userRole="ADMIN" />)
    const caja = within(screen.getByTestId('fiado-actores-p1'))
    for (const n of ['Lilia Ruiz', 'Pedro Gómez', 'Ana Soto']) expect(caja.getByText(n)).toBeTruthy()
    expect(caja.getByText('12')).toBeTruthy()
    expect(caja.queryByText('Autorizó el fiado')).toBeNull()
    expect(caja.queryByText('El sistema aún no guarda este dato.')).toBeNull()
  })
  it('entrega sin responsable ni cantidades: «Sin registro», sin inventar', () => {
    const a = { ...actores, responsablesEntrega: [], pagos: [], entregas: [{ id: 'e1', fecha: actores.createdAt, soloDia: true, responsable: null, cantidades: null }] }
    render(<FiadosActoresDetalle p={{ ...base, actores: a }} userRole="ADMIN" />)
    expect(screen.getByText('Cantidades sin registrar')).toBeTruthy()
    expect(screen.getAllByText('Sin registro').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/hora sin verificar/)).toBeTruthy()
  })
  it('pedido compartido lo rotula como saldo del pedido', () => {
    const a = { ...actores, responsablesEntrega: [...actores.responsablesEntrega, { id: 't3', nombre: 'Mario Díaz' }] }
    render(<FiadosActoresDetalle p={{ ...base, actores: a }} userRole="ADMIN" />)
    expect(screen.getByText(/Entrega compartida/)).toBeTruthy()
  })
  it('sin actores por error de carga: avisa sin romper', () => {
    render(<FiadosActoresDetalle p={{ ...base, actores: null, actoresError: true }} userRole="ADMIN" />)
    expect(screen.getByText('No se pudo cargar quién entregó y cobró.')).toBeTruthy()
  })
})
