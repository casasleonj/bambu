// @tests #446 — SustitucionEmbarqueSchema: destino por cliente exige motivo.
import { describe, it, expect } from 'vitest'
import { SustitucionEmbarqueSchema } from '@/lib/validators'

const base = { producto: 'PACA_AGUA', cantidad: 1 }

describe('SustitucionEmbarqueSchema (#446)', () => {
  it('acepta pedidoId sin motivo (compat.)', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, pedidoId: 'p1' }).success).toBe(true)
  })
  it('acepta cliente sin pedido SOLO con motivo', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, clienteId: 'c1' }).success).toBe(false)
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, clienteId: 'c1', motivo: '   ' }).success).toBe(false)
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, clienteId: 'c1', motivo: 'botella rota' }).success).toBe(true)
  })
  it('con pedido y cliente no exige motivo', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, pedidoId: 'p1', clienteId: 'c1' }).success).toBe(true)
  })
  it('cantidad con tope', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ ...base, pedidoId: 'p1', cantidad: 100_001 }).success).toBe(false)
  })
})
