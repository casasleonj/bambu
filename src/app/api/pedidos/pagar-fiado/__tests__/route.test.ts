// #515: los antiguos regex de nombres/orden de variables no probaban dinero.
// F-N11/D.6 ahora se verifican ejecutando el handler con PostgreSQL en
// cobro-revisado-mixto-515.test.ts y pagar-fiado-deuda-exigible.test.ts:
// simultaneidad, replay original, crédito sin duplicar y rollback de auditoría.
import { describe, it, expect } from 'vitest'
import { PagarFiadoSchema } from '@/lib/validators'
import { randomUUID } from 'node:crypto'
const clienteId = randomUUID(), offlineId = randomUUID(), versionDeuda = 'a'.repeat(64)
const mixed = { clienteId, offlineId, versionDeuda, pagos: [{ metodo: 'EFECTIVO', monto: 10 }, { metodo: 'NEQUI', monto: 5.25 }] }
describe('contrato público de registrar fiados', () => {
  it('conserva el cuerpo legacy y normaliza un solo medio sin inventar revisión', () => {
    const r = PagarFiadoSchema.parse({ clienteId, monto: 15, metodo: 'EFECTIVO', offlineId })
    expect(r.pagos).toEqual([{ metodo: 'EFECTIVO', monto: 15 }])
    expect(r.versionDeuda).toBeUndefined()
  })
  it('el cuerpo mixto conserva medios y suma centavos exactos', () => {
    const r = PagarFiadoSchema.parse(mixed)
    expect(r.pagos).toEqual(mixed.pagos)
    expect(r.monto).toBe(15.25)
  })
  it('un pago mixto requiere referencia y revisión verificable', () => {
    expect(PagarFiadoSchema.safeParse({ ...mixed, offlineId: undefined }).success).toBe(false)
    expect(PagarFiadoSchema.safeParse({ ...mixed, versionDeuda: undefined }).success).toBe(false)
  })
  it.each([0, -1, 1.234, 100000000])('rechaza importe inválido %s antes de escribir', monto => {
    expect(PagarFiadoSchema.safeParse({ ...mixed, pagos: [{ metodo: 'EFECTIVO', monto }] }).success).toBe(false)
  })
  it('rechaza medios desconocidos, arreglo vacío y más de diez medios', () => {
    expect(PagarFiadoSchema.safeParse({ ...mixed, pagos: [{ metodo: 'OTRO', monto: 1 }] }).success).toBe(false)
    expect(PagarFiadoSchema.safeParse({ ...mixed, pagos: [] }).success).toBe(false)
    expect(PagarFiadoSchema.safeParse({ ...mixed, pagos: Array.from({ length: 11 }, () => ({ metodo: 'EFECTIVO', monto: 1 })) }).success).toBe(false)
  })
  it('no admite dos interpretaciones del importe en un mismo cuerpo', () => {
    expect(PagarFiadoSchema.safeParse({ ...mixed, monto: 99, metodo: 'EFECTIVO' }).success).toBe(false)
  })
})
