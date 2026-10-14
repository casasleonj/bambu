import { describe, it, expect } from 'vitest'
import { PreviewPedidoSchema, PedidoCreateSchema } from '@/lib/validators'

const items = [{ producto: 'PACA_AGUA', cantidad: 1 }]

describe('PreviewPedidoSchema — cliente o cliente nuevo (B-19, #346)', () => {
  it('acepta clienteId solo', () => {
    expect(PreviewPedidoSchema.safeParse({ clienteId: 'c1', items }).success).toBe(true)
  })
  it('acepta clienteNuevo con nombre y teléfono', () => {
    expect(PreviewPedidoSchema.safeParse({ clienteNuevo: { nombre: 'Zulma', telefono: '3015550000' }, items }).success).toBe(true)
  })
  it('rechaza si no hay ni clienteId ni clienteNuevo', () => {
    expect(PreviewPedidoSchema.safeParse({ items }).success).toBe(false)
  })
  it('normaliza el teléfono igual que el commit (dedup coincide)', () => {
    const preview = PreviewPedidoSchema.safeParse({ clienteNuevo: { nombre: 'Zulma', telefono: '301 555 0000' }, items })
    const commit = PedidoCreateSchema.safeParse({ clienteId: 'CONSUMIDOR_FINAL', clienteNuevo: { nombre: 'Zulma', telefono: '301 555 0000' }, items })
    expect(preview.success && commit.success).toBe(true)
    if (preview.success && commit.success) {
      expect(preview.data.clienteNuevo?.telefono).toBe('573015550000')
      expect(preview.data.clienteNuevo?.telefono).toBe(commit.data.clienteNuevo?.telefono)
    }
  })
  it('rechaza un clienteNuevo sin teléfono', () => {
    expect(PreviewPedidoSchema.safeParse({ clienteNuevo: { nombre: 'Zulma', telefono: '' }, items }).success).toBe(false)
  })
})
