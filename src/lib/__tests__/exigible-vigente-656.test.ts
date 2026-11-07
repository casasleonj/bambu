import { describe, it, expect } from 'vitest'
import { calcularExigibleVigente, proyectarPagoFIFO } from '../entregas-exigibles'
const pedido = (pagado = 10000) => ({ total: 30000, totalPagado: pagado, saldo: 30000 - pagado,
  estadoEntrega: 'PENDIENTE', items: [{ producto: 'PACA_HIELO', cantEntrega: 15, precio: 1500 }],
  entregasExigibles: [{ valorEntregado: 22500, lineas: [{ producto: 'PACA_HIELO', cantidad: 15 }] }] })
describe('#656 exigible vigente', () => {
  it.each([[0, 22500], [10000, 12500], [22500, 0], [25000, 0]])('prepago %i → exigible %i', (pagado, exigible) => {
    expect(calcularExigibleVigente(pedido(pagado))).toBe(exigible)
  })
  it('revalora una rebaja sin modificar el hecho histórico', () => {
    const p = pedido(0); p.items[0].precio = 1000
    expect(calcularExigibleVigente(p)).toBe(15000)
    expect(p.entregasExigibles[0].valorEntregado).toBe(22500)
  })
  it('limita cantidades reducidas al cumplimiento actual', () => {
    const p = pedido(0); p.items[0].cantEntrega = 5
    expect(calcularExigibleVigente(p)).toBe(7500)
  })
  it('revertir pago recalcula la deuda sin asignaciones persistidas', () => {
    expect(calcularExigibleVigente(pedido(5000))).toBe(17500)
  })
  it.each(['ANULADO', 'CANCELADO'])('%s nunca genera exigible', estadoEntrega => {
    expect(calcularExigibleVigente({ ...pedido(0), estadoEntrega })).toBe(0)
  })
  it('completar un pedido con cobertura histórica parcial exige el saldo entero', () => {
    const p = pedido(0); p.estadoEntrega = 'ENTREGADO'; p.entregasExigibles[0].lineas[0].cantidad = 5
    expect(calcularExigibleVigente(p)).toBe(30000)
  })
  it('sin hechos no inventa deuda parcial antigua', () => {
    expect(calcularExigibleVigente({ ...pedido(0), entregasExigibles: [] })).toBe(0)
  })
  it('FIFO recompone un pago tras registrar una entrega retroactiva', () => {
    const e = (id: string, dia: number, asignado: number) => ({ id, entregadoAt: new Date(2031, 1, dia), valorEntregado: 10000, asignado })
    expect(proyectarPagoFIFO([e('reciente', 4, 10000), e('retroactiva', 3, 0)], 10000).map(e => [e.id, e.asignado]))
      .toEqual([['retroactiva', 10000], ['reciente', 0]])
  })
  it('una línea duplicada del mismo producto no duplica el hecho entregado', () => {
    const p = pedido(0)
    p.items.push({ ...p.items[0] })
    expect(calcularExigibleVigente(p)).toBe(22500)
  })

})
