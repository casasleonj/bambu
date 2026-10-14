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
  it('el estado de entrega al crear sale de `estadoEntregaAlCrear` (misma función que el preview)', () => {
    expect(source).toMatch(/estadoEntregaCreacion\s*=\s*estadoEntregaAlCrear\(\{\s*origen:\s*origenCreacion,\s*canal:\s*input\.canal,\s*entregado:\s*input\.entregado\s*\}\)/)
    // la regla en sí está cubierta por entrega-politica.service.test.ts
  })

  it('estadoEntrega y cantEntrega derivan de ese estado (no de isVentaRapida directo)', () => {
    expect(source).toMatch(/EstadoEntregaVO\.create\(estadoEntregaCreacion\)/)
    expect(source).toMatch(/estadoEntregaCreacion\s*===\s*'ENTREGADO'\s*\?\s*pr\.cantidad\s*:\s*0/)
    expect(source).not.toMatch(/origen\.isVentaRapida\(\)\s*\?\s*pr\.cantidad\s*:\s*0/)
  })

  it('estadoPago se proyecta con el estadoEntrega real', () => {
    expect(source).toMatch(
      /EstadoPagoVO\.proyectar\(total,\s*totalPagado,\s*estadoEntrega\.get\(\)\)/,
    )
  })
})
