// @tests ADR-CIERRE-002 §5 — señales del cierre (avisos, nunca bloqueos)
import { describe, it, expect } from 'vitest'
import { calcularSenales } from '../senales-cierre.service'

const base = { discrepanciasPorProducto: [], ventasLibres: [], sobranteFaltanteCaja: 0, umbralCaja: 5000 }

describe('calcularSenales', () => {
  it('sin nada raro: sin señales', () => {
    expect(calcularSenales(base)).toEqual([])
  })

  it('venta libre fiada que tapa un faltante → señal con las unidades', () => {
    // Faltaban 5, el repartidor registró 5 pacas fiadas → discrepancia final 0.
    const s = calcularSenales({
      ...base,
      discrepanciasPorProducto: [{ producto: 'PACA_AGUA', discrepancia: 0 }],
      ventasLibres: [{ clienteId: 'c1', saldo: 11500, unidades: { PACA_AGUA: 5 } }],
    })
    expect(s).toHaveLength(1)
    expect(s[0].codigo).toBe('VENTA_LIBRE_FIADA_COMPENSA_FALTANTE')
    expect(s[0].mensaje).toContain('5 unidad')
  })

  it('venta fiada pero la mercancía cuadraba sin ella (sobrante): sin señal', () => {
    const s = calcularSenales({
      ...base,
      discrepanciasPorProducto: [{ producto: 'PACA_AGUA', discrepancia: -5 }],
      ventasLibres: [{ clienteId: 'c1', saldo: 11500, unidades: { PACA_AGUA: 5 } }],
    })
    expect(s).toEqual([])
  })

  it('venta pagada completo que tapa faltante: sin señal (no hay deuda que esconder)', () => {
    const s = calcularSenales({
      ...base,
      discrepanciasPorProducto: [{ producto: 'PACA_AGUA', discrepancia: 0 }],
      ventasLibres: [{ clienteId: 'c1', saldo: 0, unidades: { PACA_AGUA: 5 } }],
    })
    expect(s).toEqual([])
  })

  it('compensa solo una parte del faltante', () => {
    const s = calcularSenales({
      ...base,
      discrepanciasPorProducto: [{ producto: 'PACA_AGUA', discrepancia: 3 }], // aún faltan 3
      ventasLibres: [{ clienteId: 'c1', saldo: 4600, unidades: { PACA_AGUA: 2 } }],
    })
    expect(s[0].mensaje).toContain('2 unidad')
  })

  it('sobrante de caja en el umbral y sin nota → señal; con nota o por debajo → sin señal', () => {
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: 5000 })[0].codigo).toBe('SOBRANTE_CAJA_SIN_NOTA')
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: 9000 })[0].mensaje).toContain('9000')
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: 4999 })).toEqual([])
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: 9000, notaCaja: 'cobro de ayer' })).toEqual([])
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: 9000, notaCaja: '   ' })).toHaveLength(1)
  })

  it('un faltante de caja NO es sobrante (eso ya lo maneja la deuda con justificación)', () => {
    expect(calcularSenales({ ...base, sobranteFaltanteCaja: -9000 })).toEqual([])
  })
})
