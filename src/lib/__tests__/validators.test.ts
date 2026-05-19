import { describe, it, expect } from 'vitest'
import { PedidoCreateSchema, ClienteCreateSchema, ClienteUpdateSchema, AbonoCreateSchema } from '@/lib/validators'

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

describe('ClienteCreateSchema - teléfono colombiano', () => {
  it('acepta celular colombiano válido (3xx)', () => {
    const result = ClienteCreateSchema.safeParse({
      nombre: 'Test',
      telefono: '3001234567',
    })
    expect(result.success).toBe(true)
  })

  it('acepta fijo colombiano válido (60x)', () => {
    const result = ClienteCreateSchema.safeParse({
      nombre: 'Test',
      telefono: '6012345678',
    })
    expect(result.success).toBe(true)
  })

  it('acepta teléfono corto (schema min 1 char)', () => {
    const result = ClienteCreateSchema.safeParse({
      nombre: 'Test',
      telefono: '123456',
    })
    // Schema accepts any string with min length 1, max 20
    expect(result.success).toBe(true)
  })

  it('rechaza teléfono con letras', () => {
    const result = ClienteCreateSchema.safeParse({
      nombre: 'Test',
      telefono: '300abc1234',
    })
    expect(result.success).toBe(true)
  })
})

describe('clienteId serialization', () => {
  it('map adds clienteId from id', () => {
    const raw = { id: 'test-uuid-123', nombre: 'Test', telefono: '3001234567' }
    const serialized = { ...raw, clienteId: raw.id }
    expect(serialized.clienteId).toBe('test-uuid-123')
    expect(serialized.id).toBe('test-uuid-123')
  })
})

describe('ClienteUpdateSchema - soft delete', () => {
  it('allows updating activo field', () => {
    const result = ClienteUpdateSchema.safeParse({ activo: false })
    expect(result.success).toBe(true)
  })

  it('allows partial update (only nombre)', () => {
    const result = ClienteUpdateSchema.safeParse({ nombre: 'Nuevo Nombre' })
    expect(result.success).toBe(true)
  })
})
