// @tests CrearPedidoUseCase — venta rápida con entrega posterior (source-level)
// ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001. La verificación de comportamiento vive
// en el test de integración `src/lib/__tests__/integration/venta-rapida-entrega-posterior.test.ts`;
// esto sólo fija el contrato de que la derivación existe y no vuelve a acoplarse
// a `origen.isVentaRapida()` directo para cantEntrega.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(__dirname, '../CrearPedidoUseCase.ts'),
  'utf-8',
)

describe('CrearPedidoUseCase: entrega posterior de venta rápida', () => {
  it('`entregaInmediata` = venta rápida sin `entregado: false`', () => {
    expect(source).toMatch(
      /entregaInmediata\s*=\s*origen\.isVentaRapida\(\)\s*&&\s*input\.entregado\s*!==\s*false/,
    )
  })

  it('estadoEntrega y cantEntrega derivan de `entregaInmediata` (no de isVentaRapida directo)', () => {
    expect(source).toMatch(/estadoEntrega\s*=\s*entregaInmediata/)
    expect(source).toMatch(/entregaInmediata\s*\?\s*pr\.cantidad\s*:\s*0/)
    expect(source).not.toMatch(/origen\.isVentaRapida\(\)\s*\?\s*pr\.cantidad\s*:\s*0/)
  })

  it('estadoPago se proyecta con el estadoEntrega real', () => {
    expect(source).toMatch(
      /EstadoPagoVO\.proyectar\(total,\s*totalPagado,\s*estadoEntrega\.get\(\)\)/,
    )
  })
})
