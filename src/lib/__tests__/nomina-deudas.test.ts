import { describe, it, expect } from 'vitest'
import { calcularDeduccionesDeuda, DeudaPendiente } from '@/lib/nomina-deudas'

function makeDeuda(overrides: Partial<DeudaPendiente> = {}): DeudaPendiente {
  return {
    id: 'd1',
    tipo: 'PRESTAMO',
    montoOriginal: 100000,
    montoPendiente: 100000,
    plazoNominas: null,
    porcentajePorNomina: null,
    fecha: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  }
}

describe('calcularDeduccionesDeuda', () => {
  it('retorna 0 si no hay deudas', () => {
    const r = calcularDeduccionesDeuda([], 500000)
    expect(r.descuentoDeudas).toBe(0)
    expect(r.deducciones).toEqual([])
  })

  it('retorna 0 si no hay disponible', () => {
    const r = calcularDeduccionesDeuda([makeDeuda()], 0)
    expect(r.descuentoDeudas).toBe(0)
  })

  it('deduce ADELANTO_NOMINA 100% primero', () => {
    const deudas = [
      makeDeuda({ id: 'prestamo', tipo: 'PRESTAMO', montoPendiente: 50000, fecha: new Date('2026-01-01') }),
      makeDeuda({ id: 'adelanto', tipo: 'ADELANTO_NOMINA', montoPendiente: 30000, fecha: new Date('2026-01-02') }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 100000)
    expect(r.deducciones[0]).toEqual({ deudaId: 'adelanto', monto: 30000 })
    expect(r.deducciones[1]).toEqual({ deudaId: 'prestamo', monto: 50000 })
    expect(r.descuentoDeudas).toBe(80000)
  })

  it('respeta tope por plazoNominas', () => {
    const deudas = [
      makeDeuda({ montoOriginal: 120000, montoPendiente: 120000, plazoNominas: 3 }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 500000)
    // 120000 / 3 = 40000 por nomina
    expect(r.deducciones[0].monto).toBe(40000)
  })

  it('respeta tope por porcentajePorNomina', () => {
    const deudas = [
      makeDeuda({ montoOriginal: 100000, montoPendiente: 100000, porcentajePorNomina: 20 }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 100000)
    // 20% de 100000 = 20000
    expect(r.deducciones[0].monto).toBe(20000)
  })

  it('respeta el menor de pendiente, plazo y porcentaje', () => {
    const deudas = [
      makeDeuda({
        montoOriginal: 100000,
        montoPendiente: 100000,
        plazoNominas: 2,
        porcentajePorNomina: 10,
      }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 100000)
    // plazo: 50000, porcentaje: 10000, pendiente: 100000 -> gana 10000
    expect(r.deducciones[0].monto).toBe(10000)
  })

  it('no descuenta mas del disponible', () => {
    const deudas = [
      makeDeuda({ tipo: 'ADELANTO_NOMINA', montoPendiente: 200000 }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 150000)
    expect(r.deducciones[0].monto).toBe(150000)
    expect(r.descuentoDeudas).toBe(150000)
  })

  it('ordena FIFO por fecha entre deudas normales', () => {
    const deudas = [
      makeDeuda({ id: 'd2', montoPendiente: 10000, fecha: new Date('2026-01-05') }),
      makeDeuda({ id: 'd1', montoPendiente: 10000, fecha: new Date('2026-01-01') }),
    ]
    const r = calcularDeduccionesDeuda(deudas, 50000)
    expect(r.deducciones[0].deudaId).toBe('d1')
    expect(r.deducciones[1].deudaId).toBe('d2')
  })
})
