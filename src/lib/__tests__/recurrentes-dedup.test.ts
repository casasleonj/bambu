// @tests #515 #407 — los antiguos checks de cadenas pasaban con el dedup roto.
// La escritura/reintento/concurrencia se comprueban ahora en PostgreSQL real:
// integration/habituales-intento-515.test.ts. Aquí se prueba la frontera JSON.
import { describe, it, expect } from 'vitest'
import {
  ConfirmarHabitualesSchema,
  EstadoHabitualesSchema,
  firmaDecisiones,
} from '@/lib/habituales-contrato'
const d = {
  recurrenteId: 'r1',
  decision: 'NORMAL' as const,
  proximaFecha: '2026-09-01T12:00:00.000Z',
  version: '2026-09-01T00:00:00.000Z',
}
const estado = {
  offlineId: 'intento',
  estado: 'COMPLETO',
  pendientes: 0,
  decisiones: [d],
  items: [
    {
      recurrenteId: 'r1',
      decision: 'NORMAL',
      estado: 'GENERADO',
      pedidoId: 'p1',
      numero: 1,
    },
  ],
}
describe('Contrato de confirmación y recuperación', () => {
  it('rechaza una recurrencia repetida para no duplicar cantidades ni resultados', () => {
    expect(
      ConfirmarHabitualesSchema.safeParse({
        decisiones: [d, d],
        offlineId: 'intento',
      }).success,
    ).toBe(false)
  })
  it('rechaza selección vacía y decisiones que no pertenecen al dominio', () => {
    expect(
      ConfirmarHabitualesSchema.safeParse({ decisiones: [] }).success,
    ).toBe(false)
    expect(
      ConfirmarHabitualesSchema.safeParse({
        decisiones: [{ ...d, decision: 'FORZAR' }],
      }).success,
    ).toBe(false)
  })
  it('conserva el objetivo y versión originales, sin quitar las cinco decisiones existentes', () => {
    for (const decision of [
      'NORMAL',
      'CON_PENDIENTES',
      'SOLO_PENDIENTES',
      'APLICAR_CREDITO',
      'SALTAR',
    ]) {
      const parsed = ConfirmarHabitualesSchema.parse({
        decisiones: [{ ...d, decision }],
        offlineId: 'intento',
      })
      expect(parsed.decisiones[0]).toMatchObject({
        proximaFecha: d.proximaFecha,
        version: d.version,
        decision,
      })
    }
  })
  it('el orden de las propiedades y de la selección no cambia su identidad', () => {
    const b = { ...d, recurrenteId: 'r2' }
    expect(firmaDecisiones([d, b])).toBe(
      firmaDecisiones([
        {
          decision: b.decision,
          version: b.version,
          recurrenteId: b.recurrenteId,
          proximaFecha: b.proximaFecha,
        },
        d,
      ]),
    )
  })
  it('no acepta COMPLETO cuando todavía queda una recurrencia pendiente', () => {
    expect(
      EstadoHabitualesSchema.safeParse({
        ...estado,
        pendientes: 1,
        items: [
          { recurrenteId: 'r1', decision: 'NORMAL', estado: 'PENDIENTE' },
        ],
      }).success,
    ).toBe(false)
  })
  it('no acepta un pedido creado sin su ID verificable', () => {
    expect(
      EstadoHabitualesSchema.safeParse({
        ...estado,
        items: [
          {
            recurrenteId: 'r1',
            decision: 'NORMAL',
            estado: 'GENERADO',
            numero: 1,
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('no atribuye un resultado a otra recurrencia ni cuenta dos veces el mismo ID', () => {
    expect(
      EstadoHabitualesSchema.safeParse({
        ...estado,
        items: [{ ...estado.items[0], recurrenteId: 'ajeno' }],
      }).success,
    ).toBe(false)
    expect(
      EstadoHabitualesSchema.safeParse({
        ...estado,
        items: [estado.items[0], estado.items[0]],
      }).success,
    ).toBe(false)
  })
  it('rechaza conteos negativos y estados que ocultan la parcialidad', () => {
    expect(
      EstadoHabitualesSchema.safeParse({ ...estado, pendientes: -1 }).success,
    ).toBe(false)
    expect(
      EstadoHabitualesSchema.safeParse({ ...estado, estado: 'PARCIAL' })
        .success,
    ).toBe(false)
  })
})
