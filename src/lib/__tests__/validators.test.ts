import { describe, it, expect } from 'vitest'
import { PedidoCreateSchema, ClienteCreateSchema, AbonoCreateSchema } from '@/lib/validators'

describe('PedidoCreateSchema', () => {
  it('validates minimum valid pedido', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(true)
  })

  it('fails without clienteId', () => {
    const result = PedidoCreateSchema.safeParse({
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('allows empty pagos (fiado orders)', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(result.success).toBe(true)
  })

  it('fails with negative product quantity', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: -1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple pagos', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [
        { metodo: 'EFECTIVO', monto: 50 },
        { metodo: 'NEQUI', monto: 50 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('fails with negative preciosManuales', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      preciosManuales: { pacaAgua: -5000 },
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts zero or positive preciosManuales', () => {
    const result = PedidoCreateSchema.safeParse({
      clienteId: 'test-cliente-id',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      preciosManuales: { pacaAgua: 0, pacaHielo: 8000 },
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
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
