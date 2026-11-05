import { expect, it } from 'vitest'
import { repartirCobroFiado } from '../fiados-cobro'
it('limita el reparto al exigible sin reducir artificialmente el saldo contractual', () => {
  const r = repartirCobroFiado([{ id: 'p', numero: 1, fecha: '2031-01-01', total: 30000,
    totalPagado: 10000, saldo: 20000, exigible: 12500, estadoEntrega: 'PENDIENTE', factura: null }], 15000)
  expect(r).toMatchObject({ sobrante: 2500, aplicaciones: [{ montoAplicado: 12500, saldoRestante: 7500 }] })
})
