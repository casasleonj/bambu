import { describe, it, expect } from 'vitest'
import { resumenCobro, textoAvisoCobro } from '../cobro-aviso'

describe('resumenCobro (#828)', () => {
  it('efectivo anotado mayor que lo aplicado: recibido es lo anotado y hay cambio', () => {
    expect(resumenCobro(8400, [{ metodo: 'EFECTIVO', monto: 8400 }], { recibidoEfectivo: 10000 }))
      .toEqual({ importe: 8400, recibido: 10000, cambio: 1600, pendiente: 0 })
  })
  it('sin efectivo anotado no se inventa cambio: recibido = lo aplicado', () => {
    expect(resumenCobro(8400, [{ metodo: 'EFECTIVO', monto: 8400 }]))
      .toEqual({ importe: 8400, recibido: 8400, cambio: 0, pendiente: 0 })
  })
  it('efectivo anotado insuficiente para lo aplicado: se ignora (no hay cambio negativo)', () => {
    expect(resumenCobro(8400, [{ metodo: 'EFECTIVO', monto: 8400 }], { recibidoEfectivo: 5000 }))
      .toEqual({ importe: 8400, recibido: 8400, cambio: 0, pendiente: 0 })
  })
  it('pago mixto: el cambio sale solo del efectivo; lo digital se suma tal cual', () => {
    expect(resumenCobro(20000, [{ metodo: 'EFECTIVO', monto: 12000 }, { metodo: 'NEQUI', monto: 8000 }], { recibidoEfectivo: 15000 }))
      .toEqual({ importe: 20000, recibido: 23000, cambio: 3000, pendiente: 0 })
  })
  it('pago solo digital: no hay efectivo ni cambio aunque se haya anotado un valor', () => {
    expect(resumenCobro(8000, [{ metodo: 'NEQUI', monto: 8000 }], { recibidoEfectivo: 10000 }))
      .toEqual({ importe: 8000, recibido: 8000, cambio: 0, pendiente: 0 })
  })
  it('pago parcial: informa lo pendiente', () => {
    expect(resumenCobro(10000, [{ metodo: 'EFECTIVO', monto: 4000 }], { recibidoEfectivo: 5000 }))
      .toEqual({ importe: 10000, recibido: 5000, cambio: 1000, pendiente: 6000 })
  })
  it('sin errores de coma flotante', () => {
    expect(resumenCobro(0.3, [{ metodo: 'EFECTIVO', monto: 0.3 }], { recibidoEfectivo: 0.5 }).cambio).toBe(0.2)
  })
})

describe('textoAvisoCobro (#828)', () => {
  it('lleva número, importe, recibido y cambio', () => {
    const r = resumenCobro(8400, [{ metodo: 'EFECTIVO', monto: 8400 }], { recibidoEfectivo: 10000 })
    const t = textoAvisoCobro(1287, r)
    expect(t.titulo).toBe('Venta cobrada · #1287')
    expect(t.detalle).toMatch(/Importe \$\s?8\.400 · Recibido \$\s?10\.000 · Cambio \$\s?1\.600/)
    expect(t.detalle).not.toMatch(/Pendiente/)
  })
  it('sin número queda solo el título base; con saldo agrega «Pendiente»', () => {
    const r = resumenCobro(10000, [{ metodo: 'EFECTIVO', monto: 4000 }])
    const t = textoAvisoCobro(null, r)
    expect(t.titulo).toBe('Venta cobrada')
    expect(t.detalle).toMatch(/Pendiente \$\s?6\.000/)
  })
})
