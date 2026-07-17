// @tests M6 — source audit de eventos realtime publicados
// Verifica que las mutaciones documentadas publiquen los eventos esperados.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function readRoute(...segments: string[]): string {
  return readFileSync(join(process.cwd(), 'src', 'app', 'api', ...segments, 'route.ts'), 'utf-8')
}

describe('M6: realtime events source audit', () => {
  it('cliente.created se publica al crear cliente', () => {
    const source = readRoute('clientes')
    expect(source).toMatch(/publishRealtimeEvent\(['"]cliente\.created['"]/)
  })

  it('cliente.updated y cliente.deleted se publican al actualizar/eliminar cliente', () => {
    const source = readRoute('clientes', '[id]')
    expect(source).toMatch(/publishRealtimeEvent\(['"]cliente\.updated['"]/)
    expect(source).toMatch(/publishRealtimeEvent\(['"]cliente\.deleted['"]/)
  })

  it('pedido.created se publica al crear pedido', () => {
    const source = readRoute('pedidos')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.created['"]/)
  })

  it('pedido.created se publica en venta libre', () => {
    const source = readRoute('pedidos', 'venta-libre')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.created['"]/)
  })

  it('pedido.created se publica al generar recurrentes', () => {
    const source = readRoute('pedidos', 'recurrentes')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.created['"]/)
  })

  it('pedido.updated se publica al modificar pedido', () => {
    const source = readRoute('pedidos', '[id]')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('pedido.updated se publica al cancelar pedido', () => {
    const source = readRoute('pedidos', '[id]', 'cancelar')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('pedido.updated se publica al registrar entrega', () => {
    const source = readRoute('pedidos', '[id]', 'entrega')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('pedido.updated se publica al enviar pedido', () => {
    const source = readRoute('pedidos', '[id]', 'enviar')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('pedido.updated se publica al anular pedido', () => {
    const source = readRoute('pedidos', '[id]', 'anular')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('pedido.updated se publica al resolver disputa', () => {
    const source = readRoute('pedidos', '[id]', 'resolver-disputa')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })

  it('embarque.created y embarque.deleted se publican desde /embarques', () => {
    const source = readRoute('embarques')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.created['"]/)
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.deleted['"]/)
  })

  it('embarque.updated se publica al modificar embarque', () => {
    const source = readRoute('embarques', '[id]')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.updated['"]/)
  })

  it('embarque.updated se publica al enviar embarque', () => {
    const source = readRoute('embarques', '[id]', 'enviar')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.updated['"]/)
  })

  it('embarque.updated se publica al cerrar embarque', () => {
    const source = readRoute('embarques', '[id]', 'cerrar')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.updated['"]/)
  })

  it('embarque.updated se publica al agregar/quitar pedidos del embarque', () => {
    const source = readRoute('embarques', '[id]', 'pedidos', '[pedidoId]')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.updated['"]/)
  })

  it('embarque.updated se publica al optimizar orden', () => {
    const source = readRoute('embarques', '[id]', 'optimizar-orden')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.updated['"]/)
  })

  it('embarque.updated se publica al generar embarque automático', () => {
    const source = readRoute('embarques', 'auto')
    expect(source).toMatch(/publishRealtimeEvent\(['"]embarque\.created['"]/)
  })

  it('produccion.created se publica al registrar produccion', () => {
    const source = readRoute('produccion')
    expect(source).toMatch(/publishRealtimeEvent\(['"]produccion\.created['"]/)
  })

  it('pago.created se publica al pagar fiado', () => {
    const source = readRoute('pedidos', 'pagar-fiado')
    expect(source).toMatch(/publishRealtimeEvent\(['"]pago\.created['"]/)
  })

  it('gasto.created se publica al registrar gasto', () => {
    const source = readRoute('gastos')
    expect(source).toMatch(/publishRealtimeEvent\(['"]gasto\.created['"]/)
  })

  it('compra.created se publica al registrar compra', () => {
    const source = readRoute('compras')
    expect(source).toMatch(/publishRealtimeEvent\(['"]compra\.created['"]/)
  })

  it('trabajador.created, updated y deleted se publican', () => {
    const createSource = readRoute('trabajadores')
    const mutateSource = readRoute('trabajadores', '[id]')
    expect(createSource).toMatch(/publishRealtimeEvent\(['"]trabajador\.created['"]/)
    expect(mutateSource).toMatch(/publishRealtimeEvent\(['"]trabajador\.updated['"]/)
    expect(mutateSource).toMatch(/publishRealtimeEvent\(['"]trabajador\.deleted['"]/)
  })

  it('config.updated se publica al actualizar config', () => {
    const source = readRoute('config')
    expect(source).toMatch(/publishRealtimeEvent\(['"]config\.updated['"]/)
  })
})
