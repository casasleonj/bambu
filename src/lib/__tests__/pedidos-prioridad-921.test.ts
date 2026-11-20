import { describe, it, expect } from 'vitest'
import { ordenarPrioridadPedidos } from '../pedidos-prioridad-921'

const ahora = new Date('2026-11-20T14:30:00Z') // 09:30 Bogotá
function p(id: string, created: string, pago: number, hora: string | null = null, fecha = '2026-11-20', entregado = 0) {
  return {
    id, createdAt: new Date(created), total: 1000, totalPagado: pago, saldo: 1000 - pago,
    fechaEntrega: new Date(`${fecha}T08:00:00-05:00`), entregaNoAntesDe: hora,
    estadoEntrega: entregado === 10 ? 'ENTREGADO' : 'PENDIENTE',
    items: [{ cantPedido: 10, cantEntrega: entregado, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
  }
}
const ids = (x: ReturnType<typeof p>[]) => ordenarPrioridadPedidos(x, ahora).map(v => v.id)
describe('#921 prioridad por compromiso y pago', () => {
  it('promesa próxima supera pagado, anticipo y sin pago', () => {
    expect(ids([
      p('sin', '2026-11-20T12:00:00Z', 0),
      p('anticipo', '2026-11-20T13:00:00Z', 100),
      p('pagado', '2026-11-20T14:00:00Z', 1000),
      p('urgente', '2026-11-20T14:20:00Z', 0, '10:00'),
    ])).toEqual(['urgente', 'pagado', 'anticipo', 'sin'])
  })
  it('FIFO original y desempate id dentro del nivel', () => {
    expect(ids([p('b', '2026-11-20T13:00:00Z', 0), p('a', '2026-11-20T13:00:00Z', 0),
      p('viejo', '2026-11-19T13:00:00Z', 0)])).toEqual(['viejo', 'a', 'b'])
  })
  it('entregado con saldo precede a entregado pagado', () => {
    expect(ids([p('completo', '2026-11-20T12:00:00Z', 1000, null, '2026-11-20', 10),
      p('deuda', '2026-11-20T13:00:00Z', 0, null, '2026-11-20', 10)])).toEqual(['deuda', 'completo'])
  })
  it('pagado futuro no desplaza pendiente de hoy', () => {
    expect(ids([p('futuro', '2026-11-19T12:00:00Z', 1000, '09:00', '2026-11-21'),
      p('hoy', '2026-11-20T12:00:00Z', 0)])).toEqual(['hoy', 'futuro'])
  })
  it('no muta la lista original', () => {
    const x = [p('nuevo', '2026-11-20T14:00:00Z', 0), p('viejo', '2026-11-20T12:00:00Z', 0)]
    ids(x)
    expect(x.map(v => v.id)).toEqual(['nuevo', 'viejo'])
  })
})
