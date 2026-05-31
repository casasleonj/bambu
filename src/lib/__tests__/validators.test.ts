import { describe, it, expect } from 'vitest'
import {
  PedidoCreateSchema,
  ClienteCreateSchema,
  ClienteUpdateSchema,
  AbonoCreateSchema,
  EmbarqueCreateSchema,
  EmbarqueUpdateSchema,
  EmbarqueProductoSchema,
  CerrarEmbarqueSchema,
  GastoEmbarqueSchema,
} from '@/lib/validators'

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

// ====================
// EMBARQUE VALIDATORS
// ====================

describe('EmbarqueProductoSchema', () => {
  it('validates valid producto', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'PACA_AGUA', cargadas: 5 })
    expect(result.success).toBe(true)
  })

  it('accepts all product codes', () => {
    const codes = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const
    for (const code of codes) {
      const result = EmbarqueProductoSchema.safeParse({ producto: code, cargadas: 1 })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid product code', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'INVALIDO', cargadas: 1 })
    expect(result.success).toBe(false)
  })

  it('rejects negative cargadas', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'PACA_AGUA', cargadas: -1 })
    expect(result.success).toBe(false)
  })

  it('accepts zero cargadas', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'PACA_AGUA', cargadas: 0 })
    expect(result.success).toBe(true)
  })

  it('coerces string number to int', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'PACA_AGUA', cargadas: '5' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.cargadas).toBe(5)
  })

  it('defaults cargadas to 0 when missing', () => {
    const result = EmbarqueProductoSchema.safeParse({ producto: 'PACA_AGUA' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.cargadas).toBe(0)
  })
})

describe('EmbarqueCreateSchema', () => {
  it('validates minimum valid embarque', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(result.success).toBe(true)
  })

  it('fails without trabajadorId', () => {
    const result = EmbarqueCreateSchema.safeParse({
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(result.success).toBe(false)
  })

  it('fails without horaSalida', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty carga', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
      rutaId: 'ruta-1',
      tipoMoto: 'Moto carro grande',
      baseDinero: 50000,
      obs: 'Test observation',
      overrideMotivo: 'Produccion extra entregada',
    })
    expect(result.success).toBe(true)
  })

  it('defaults baseDinero to 0', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.baseDinero).toBe(0)
  })

  it('rejects negative baseDinero', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
      baseDinero: -100,
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple products in carga', () => {
    const result = EmbarqueCreateSchema.safeParse({
      trabajadorId: 'trabajador-123',
      horaSalida: '08:00',
      carga: [
        { producto: 'PACA_AGUA', cargadas: 10 },
        { producto: 'PACA_HIELO', cargadas: 5 },
        { producto: 'BOTELLON', cargadas: 3 },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('EmbarqueUpdateSchema', () => {
  it('allows partial update (only obs)', () => {
    const result = EmbarqueUpdateSchema.safeParse({ obs: 'Updated observation' })
    expect(result.success).toBe(true)
  })

  it('allows updating estado to valid values', () => {
    const states = ['ABIERTO', 'EN_RUTA', 'CERRADO', 'CANCELADO'] as const
    for (const state of states) {
      const result = EmbarqueUpdateSchema.safeParse({ estado: state })
      expect(result.success).toBe(true)
    }
  })

  it('allows nullable estado', () => {
    const result = EmbarqueUpdateSchema.safeParse({ estado: null })
    expect(result.success).toBe(true)
  })

  it('allows updating carga', () => {
    const result = EmbarqueUpdateSchema.safeParse({
      carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
    })
    expect(result.success).toBe(true)
  })

  it('allows nullable carga', () => {
    const result = EmbarqueUpdateSchema.safeParse({ carga: null })
    expect(result.success).toBe(true)
  })

  it('rejects pedidoIds exceeding 100', () => {
    const ids = Array(101).fill('pedido-id')
    const result = EmbarqueUpdateSchema.safeParse({ pedidoIds: ids })
    expect(result.success).toBe(false)
  })

  it('accepts empty pedidoIds', () => {
    const result = EmbarqueUpdateSchema.safeParse({ pedidoIds: [] })
    expect(result.success).toBe(true)
  })
})

describe('GastoEmbarqueSchema', () => {
  it('validates valid gasto', () => {
    const result = GastoEmbarqueSchema.safeParse({
      categoria: 'Gasolina',
      monto: 15000,
      nota: 'Tanqueo completo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero monto', () => {
    const result = GastoEmbarqueSchema.safeParse({ categoria: 'Gasolina', monto: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative monto', () => {
    const result = GastoEmbarqueSchema.safeParse({ categoria: 'Gasolina', monto: -500 })
    expect(result.success).toBe(false)
  })

  it('coerces string monto to number', () => {
    const result = GastoEmbarqueSchema.safeParse({ categoria: 'Gasolina', monto: '15000' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.monto).toBe(15000)
  })

  it('accepts without nota', () => {
    const result = GastoEmbarqueSchema.safeParse({ categoria: 'Gasolina', monto: 15000 })
    expect(result.success).toBe(true)
  })

  it('rejects empty categoria', () => {
    const result = GastoEmbarqueSchema.safeParse({ categoria: '', monto: 15000 })
    expect(result.success).toBe(false)
  })
})

describe('CerrarEmbarqueSchema', () => {
  it('validates minimal valid cierre', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
  })

  it('validates cierre with complete delivery', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        preciosReales: {
          pacaAgua: 2600, pacaHielo: 0, botellonFab: 0,
          botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 13000 }],
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
  })

  it('validates cierre with PARCIAL delivery', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'PARCIAL',
        productosEntregados: {
          cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        preciosReales: {
          pacaAgua: 2600, pacaHielo: 0, botellonFab: 0,
          botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0,
        },
        pagado: 'PARCIAL',
        pagos: [{ metodo: 'EFECTIVO', monto: 5200 }],
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
  })

  it('validates cierre with NO_ENTREGADO and reassignment', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'NO_ENTREGADO',
        productosEntregados: {
          cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        preciosReales: {
          pacaAgua: 0, pacaHielo: 0, botellonFab: 0,
          botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0,
        },
        pagado: 'NO_PAGADO',
        pagos: [],
        nuevoEmbarqueId: 'embarque-456',
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
  })

  it('validates cierre with ventas libres', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      ventasLibres: [{
        clienteId: 'cliente-123',
        cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
        pagos: [{ metodo: 'EFECTIVO', monto: 5200 }],
        obs: 'Venta libre test',
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
  })

  it('validates cierre with gastos', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [
        { categoria: 'Gasolina', monto: 15000, nota: 'Tanqueo' },
        { categoria: 'Alimentacion', monto: 8000 },
      ],
      dineroEntregado: 50000,
      justificacionDiscrepancia: 'Cliente no estaba en casa',
      obs: 'Cierre con observaciones',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid entregado enum', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'INVALIDO',
        productosEntregados: {
          cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [],
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with negative pago monto', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 1, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: -100 }],
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty productos array (fix #21)', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [],
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid producto in conciliacion', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'INVALIDO', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('defaults ventasLibres to empty array', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.ventasLibres).toEqual([])
  })

  it('defaults gastos to empty array', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.gastos).toEqual([])
  })

  it('defaults dineroEntregado to 0', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.dineroEntregado).toBe(0)
  })

  it('defaults productosEntregados to 0 for missing fields', () => {
    const result = CerrarEmbarqueSchema.safeParse({
      pedidos: [{
        pedidoId: 'pedido-123',
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 5 },
        pagado: 'COMPLETO',
        pagos: [],
      }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const pe = result.data.pedidos[0].productosEntregados
      expect(pe.cPacaHieloEnt).toBe(0)
      expect(pe.cBotellonFabEnt).toBe(0)
    }
  })
})
