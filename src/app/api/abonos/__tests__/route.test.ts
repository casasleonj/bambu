// @tests POST /api/abonos — guard de entrega
// Bug reportado por usuarios: la Factura se crea al mismo tiempo que el
// Pedido (CrearPedidoUseCase / recurrentes.ts), no cuando se entrega — un
// pedido PENDIENTE/EN_RUTA/NO_ENTREGADO ya tiene una factura EMITIDA
// visible en /facturas, y nada impedía registrar un abono (dinero cobrado)
// sobre mercancía que nunca salió de bodega. Este test verifica que el
// guard está DENTRO del lock CARTERA, ANTES de crear el Abono.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/abonos/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('FIX abono-sin-entrega: guard de estadoEntrega dentro del lock', () => {
  it('el guard busca el pedido vinculado a la factura', () => {
    expect(source).toMatch(/tx\.pedido\.findUnique\(\{\s*where:\s*\{\s*id:\s*factura\.pedidoId\s*\}/)
  })

  it('el guard rechaza si estadoEntrega !== ENTREGADO', () => {
    expect(source).toMatch(/pedido\.estadoEntrega\s*!==\s*['"]ENTREGADO['"]/)
  })

  it('el guard corre DENTRO de withAdvisoryLock y ANTES de crear el abono', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('CARTERA'")
    const guardCheck = source.indexOf("pedido.estadoEntrega !== 'ENTREGADO'")
    const abonoCreate = source.indexOf('tx.abono.create')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(guardCheck).toBeGreaterThan(lockOpen)
    expect(guardCheck).toBeLessThan(abonoCreate)
  })

  it('mapea PEDIDO_NO_ENTREGADO a un 400 con mensaje claro', () => {
    expect(source).toMatch(/error\.message\s*===\s*['"]PEDIDO_NO_ENTREGADO['"]/)
    const block = source.match(/error\.message\s*===\s*['"]PEDIDO_NO_ENTREGADO['"][\s\S]{0,120}/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/apiError\([\s\S]*?,\s*400\)/)
  })
})
