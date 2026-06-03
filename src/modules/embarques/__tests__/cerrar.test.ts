// @tests CierreEmbarqueService — calcularCaja, calcularComision, validarPagos
// Hallazgo cubierto: C-4 — calcularCaja no incluye baseDinero
import { describe, it, expect } from 'vitest'
import { CierreEmbarqueService } from '../domain/services/cierre-embarque.service'
import { Carga } from '../domain/value-objects/Carga'

describe('CierreEmbarqueService.calcularComision', () => {
  it('5% de 200,000 = 10,000', () => {
    const result = new CierreEmbarqueService().calcularComision(200000)
    expect(result.tasa).toBe(0.05)
    expect(result.monto).toBe(10000)
  })

  it('5% de 0 = 0', () => {
    const result = new CierreEmbarqueService().calcularComision(0)
    expect(result.monto).toBe(0)
  })
})

describe('CierreEmbarqueService.calcularCaja — REGRESIÓN C-4', () => {
  it('REGRESIÓN: efectivoReal = base + ventas - otrosPagos - gastos (debe incluir base)', () => {
    // Después del fix C-4, efectivoReal debe ser 250,000 (incluye base)
    const service = new CierreEmbarqueService()
    const result = service.calcularCaja(
      200000, // totalVentas
      [{ metodo: 'EFECTIVO', monto: 200000 }], // pagos
      50000, // baseDinero (este es el bug — antes era ignorado)
      0 // gastos
    )
    // ANTES del fix: result.efectivoReal = 200000 (incorrecto)
    // DESPUÉS del fix: result.efectivoReal = 250000 (correcto)
    // Este test fallará antes del fix y pasará después.
    expect(result.efectivoReal).toBe(250000)
  })

  it('efectivoReal resta otros pagos (transferencias)', () => {
    const service = new CierreEmbarqueService()
    const result = service.calcularCaja(
      200000,
      [
        { metodo: 'EFECTIVO', monto: 100000 },
        { metodo: 'TRANSFERENCIA', monto: 100000 },
      ],
      50000, // base
      0
    )
    // 50000 base + 200000 ventas - 100000 transferencias - 0 gastos = 150000
    expect(result.efectivoReal).toBe(150000)
  })

  it('efectivoReal resta gastos', () => {
    const service = new CierreEmbarqueService()
    const result = service.calcularCaja(
      200000,
      [{ metodo: 'EFECTIVO', monto: 200000 }],
      50000,
      30000 // gastos de gasolina
    )
    // 50000 + 200000 - 0 - 30000 = 220000
    expect(result.efectivoReal).toBe(220000)
  })
})

describe('CierreEmbarqueService.validarPagos', () => {
  it('rechaza pagos que exceden 101% del total', () => {
    const service = new CierreEmbarqueService()
    const result = service.validarPagos(100000, 105000)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/exceden/)
  })

  it('acepta pagos dentro del 1% de tolerancia', () => {
    const service = new CierreEmbarqueService()
    expect(service.validarPagos(100000, 100500).valid).toBe(true)
    expect(service.validarPagos(100000, 100000).valid).toBe(true)
  })
})

describe('CierreEmbarqueService.conciliarProductos', () => {
  it('detecta discrepancia cuando cargadas ≠ entregadas + devueltas + cambios + rotas', () => {
    const service = new CierreEmbarqueService()
    const carga = new Carga({ PACA_AGUA: 10, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const result = service.conciliarProductos(
      carga,
      {
        PACA_AGUA: { entregadas: 8, devueltas: 1, cambios: 0, rotas: 0 },
        PACA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOTELLON: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOLSA_AGUA: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOLSA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      }
    )
    // Discrepancia = 10 - 8 - 1 - 0 - 0 = 1
    const agua = result.find((r) => r.producto === 'PACA_AGUA')!
    expect(agua.discrepancia).toBe(1)
  })

  it('sin discrepancia cuando cuadran exactamente', () => {
    const service = new CierreEmbarqueService()
    const carga = new Carga({ PACA_AGUA: 10, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const result = service.conciliarProductos(
      carga,
      {
        PACA_AGUA: { entregadas: 8, devueltas: 2, cambios: 0, rotas: 0 },
        PACA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOTELLON: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOLSA_AGUA: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
        BOLSA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      }
    )
    const agua = result.find((r) => r.producto === 'PACA_AGUA')!
    expect(agua.discrepancia).toBe(0)
  })
})
