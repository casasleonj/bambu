import { describe, it, expect } from 'vitest'
import { PreviewPedidoSchema } from '../validators'

describe('PreviewPedidoSchema', () => {
  it('acepta el caso mínimo (clienteId + 1 item) con defaults', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.canal).toBe('DOMICILIO')
      expect(r.data.origen).toBe('PEDIDO')
    }
  })

  it('acepta origen VENTA_RAPIDA pero NO VENTA_LIBRE (fuera de alcance)', () => {
    expect(PreviewPedidoSchema.safeParse({
      clienteId: 'c1', origen: 'VENTA_RAPIDA', items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    }).success).toBe(true)
    expect(PreviewPedidoSchema.safeParse({
      clienteId: 'c1', origen: 'VENTA_LIBRE', items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    }).success).toBe(false)
  })

  it('rechaza items vacío y clienteId en blanco', () => {
    expect(PreviewPedidoSchema.safeParse({ clienteId: 'c1', items: [] }).success).toBe(false)
    expect(PreviewPedidoSchema.safeParse({ clienteId: '  ', items: [{ producto: 'PACA_AGUA', cantidad: 1 }] }).success).toBe(false)
  })

  it('descarta campos de persistencia (offlineId, clienteNuevo, direccionEntrega)', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      offlineId: 'x', clienteNuevo: { nombre: 'x', telefono: '1234567' }, direccionEntrega: 'Calle 1',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect('offlineId' in r.data).toBe(false)
      expect('clienteNuevo' in r.data).toBe(false)
      expect('direccionEntrega' in r.data).toBe(false)
    }
  })

  it('acepta pagos, entregado, pedidoOrigenId, precioManual', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 5000 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      entregado: true, pedidoOrigenId: 'p99',
    })
    expect(r.success).toBe(true)
  })
})
