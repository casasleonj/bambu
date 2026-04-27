import { describe, it, expect } from 'vitest'
import { PedidoCreateSchema, ClienteCreateSchema, AbonoCreateSchema } from '@/lib/validators'

describe('PedidoCreateSchema', () => {
  it('validates minimum valid pedido', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(true)
  })

  it('fails without clienteId', () => {
    const result = PedidoCreateSchema.safeParse({
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('fails without pagos', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
    })
    expect(result.success).toBe(false)
  })

  it('fails with negative product quantity', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      productos: { agua19L: -1 },
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple pagos', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      pagos: [
        { metodo: 'EFECTIVO', monto: 50 },
        { metodo: 'NEQUI', monto: 50 },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('ClienteCreateSchema', () => {
  it('validates minimum valid cliente', () => {
    const result = ClienteCreateSchema.safeParse({
      nombre: 'Juan Pérez',
      telefono: '3001234567',
    })
    expect(result.success).toBe(true)
  })

  it('fails without nombre', () => {
    const result = ClienteCreateSchema.safeParse({
      telefono: '3001234567',
    })
    expect(result.success).toBe(false)
  })
})

describe('AbonoCreateSchema', () => {
  it('validates minimum valid abono', () => {
    const result = AbonoCreateSchema.safeParse({
      facturaId: 'test-factura-id',
      clienteId: 'test-cliente-id',
      monto: 50,
      metodoPago: 'EFECTIVO',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid metodoPago', () => {
    const result = AbonoCreateSchema.safeParse({
      facturaId: 'test-factura-id',
      clienteId: 'test-cliente-id',
      monto: 50,
      metodoPago: 'INVALIDO',
    })
    expect(result.success).toBe(false)
  })
})
