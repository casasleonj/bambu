// @tests CrearPedidoUseCase — venta rápida con entrega posterior (source-level)
// ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001. La verificación de comportamiento vive
// en el test de integración `src/lib/__tests__/integration/venta-rapida-entrega-posterior.test.ts`.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(__dirname, '../CrearPedidoUseCase.ts'),
  'utf-8',
)

describe('CrearPedidoUseCase: entrega posterior de venta rápida', () => {
  it('`entregaInmediata` solo es true para venta rápida sin `entregado: false`', () => {
    expect(source).toMatch(
      /const entregaInmediata = origen\.isVentaRapida\(\) && input\.entregado !== false/,
    )
  })

  it('estadoEntrega deriva de `entregaInmediata` (ENTREGADO vs PENDIENTE)', () => {
    const idx = source.indexOf('const estadoEntrega = entregaInmediata')
    expect(idx).toBeGreaterThan(-1)
    const block = source.slice(idx, idx + 140)
    expect(block).toMatch(/EstadoEntregaVO\.create\('ENTREGADO'\)/)
    expect(block).toMatch(/EstadoEntregaVO\.create\('PENDIENTE'\)/)
  })

  it('cantEntrega del item usa `entregaInmediata`, no `origen.isVentaRapida()` directo', () => {
    const idx = source.indexOf('new PedidoItem(')
    const block = source.slice(idx, idx + 260)
    expect(block).toMatch(/entregaInmediata \? pr\.cantidad : 0/)
    expect(block).not.toMatch(/origen\.isVentaRapida\(\) \? pr\.cantidad : 0/)
  })

  it('estadoPago sigue proyectándose con estadoEntrega real (ANTICIPADO si prepago + PENDIENTE)', () => {
    expect(source).toMatch(
      /EstadoPagoVO\.proyectar\(total, totalPagado, estadoEntrega\.get\(\)\)/,
    )
  })
})
