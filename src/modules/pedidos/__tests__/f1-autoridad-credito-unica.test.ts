import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * F1 — Autoridad de Crédito (docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md).
 *
 * Criterio de cierre pedido explícitamente por el equipo:
 *   "¿Preview, Commit y Venta Libre están utilizando efectivamente la
 *    misma autoridad de crédito y ya no contienen una segunda
 *    implementación de la consulta/decisión?"
 *
 * Este test responde esa pregunta con evidencia de código fuente — no
 * basta con que los 3 caminos "den el mismo resultado" (eso ya pasaba
 * antes de F1 y fue exactamente lo que el equipo señaló como
 * insuficiente: "resultado actual != autoridad consolidada").
 */
describe('F1: Preview, Commit y Venta Libre comparten UNA sola autoridad de crédito', () => {
  const preview = readFileSync(
    resolve(__dirname, '../application/use-cases/PreviewPedidoUseCase.ts'), 'utf-8',
  )
  const commit = readFileSync(
    resolve(__dirname, '../application/use-cases/CrearPedidoUseCase.ts'), 'utf-8',
  )
  const ventaLibre = readFileSync(
    resolve(process.cwd(), 'src/app/api/pedidos/venta-libre/route.ts'), 'utf-8',
  )
  const autoridad = readFileSync(
    resolve(__dirname, '../application/use-cases/GetFiadoStatusUseCase.ts'), 'utf-8',
  )

  it('los 3 consumidores invocan GetFiadoStatusUseCase (Preview y Commit vía dependencia inyectada, Venta Libre directo)', () => {
    expect(preview).toMatch(/this\.deps\.getFiadoStatusUseCase\.execute\(/)
    expect(commit).toMatch(/this\.getFiadoStatusUseCase\.execute\(/)
    expect(ventaLibre).toMatch(/fiadoAuthority\.execute\(/)
    expect(ventaLibre).toMatch(/new GetFiadoStatusUseCase\(/)
  })

  it('ninguno de los 3 consumidores reimplementa la consulta de pedidos pendientes', () => {
    // La única consulta real vive en PrismaPedidoRepository.findPendingByCliente
    // (usado desde adentro de la autoridad). Ningún consumidor debe volver a
    // escribir un `findMany`/`findPendingByCliente` propio para este propósito.
    expect(commit).not.toMatch(/\.findPendingByCliente\(/)
    expect(ventaLibre).not.toMatch(/tx\.pedido\.findMany\(/)
    // Preview nunca tuvo su propia query — siempre pasó por GetFiadoStatusUseCase.
    expect(preview).not.toMatch(/\.findPendingByCliente\(/)
  })

  it('ninguno de los 3 consumidores reimplementa la decisión (puedeCrearPedido)', () => {
    // `puedeCrearPedido` solo debe aparecer DENTRO de la autoridad y en el
    // dominio (pedido-validation.service.ts) — nunca en un consumidor.
    expect(preview).not.toMatch(/puedeCrearPedido\(/)
    expect(commit).not.toMatch(/puedeCrearPedido\(/)
    expect(ventaLibre).not.toMatch(/puedeCrearPedido\(/)
    expect(autoridad).toMatch(/puedeCrearPedido\(/)
  })

  it('ninguno de los 3 consumidores resuelve el límite de fiados por su cuenta (resolverLimiteFiados)', () => {
    expect(preview).not.toMatch(/resolverLimiteFiados\(/)
    expect(commit).not.toMatch(/resolverLimiteFiados\(/)
    expect(ventaLibre).not.toMatch(/resolverLimiteFiados\(/)
    expect(autoridad).toMatch(/resolverLimiteFiados\(/)
  })

  it('la autoridad expone exposición monetaria (outstandingAmount) — no solo conteo', () => {
    expect(autoridad).toMatch(/outstandingAmount/)
    expect(autoridad).toMatch(/projectedOutstandingAmount/)
  })

  it('el criterio de bloqueo sigue siendo por conteo — ningún consumidor ni la autoridad introducen un umbral monetario', () => {
    // F1 NO debía inventar una política "if deuda > $X → bloquear". La única
    // condición de bloqueo real (`pedidosPendientes.length >= limite`) vive
    // exclusivamente dentro de puedeCrearPedido (dominio), no se duplica.
    for (const source of [preview, commit, ventaLibre, autoridad]) {
      expect(source).not.toMatch(/outstandingAmount\s*[><]=?\s*\d/)
      expect(source).not.toMatch(/projectedOutstandingAmount\s*[><]=?\s*\d/)
    }
  })
})
