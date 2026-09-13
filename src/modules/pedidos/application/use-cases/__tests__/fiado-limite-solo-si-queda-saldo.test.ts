import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Anti-regression: el límite de pedidos fiados solo debe bloquear la
 * creación cuando el pedido nuevo va a quedar con saldo pendiente
 * (totalPagado < total). Un pedido pagado de contado (o cubierto por
 * saldo a favor) no debe bloquearse por deuda histórica del cliente —
 * eso rompía Venta Rápida ("paga en el momento") para clientes que ya
 * estaban al límite de fiados, aunque la venta se pagara completa.
 *
 * F1 (Autoridad de Crédito, docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md):
 * el guard ya NO vive como `if (totalPagado < total)` inline en
 * CrearPedidoUseCase — se movió DENTRO de GetFiadoStatusUseCase
 * (`operationOutstanding > 0`), la misma autoridad que usan
 * PreviewPedidoUseCase y venta-libre. Este test verifica que
 * CrearPedidoUseCase DELEGA la decisión (no la reimplementa) y que la
 * autoridad misma sigue aplicando el guard correcto.
 */
describe('CrearPedidoUseCase: límite de fiados solo si el pedido queda fiado', () => {
  const crearSource = readFileSync(resolve(__dirname, '../CrearPedidoUseCase.ts'), 'utf-8')
  const autoridadSource = readFileSync(resolve(__dirname, '../GetFiadoStatusUseCase.ts'), 'utf-8')

  it('CrearPedidoUseCase NO reimplementa el guard ni la decisión — delega en la autoridad', () => {
    expect(crearSource).not.toMatch(/if\s*\(totalPagado\s*<\s*total\)\s*\{/)
    expect(crearSource).not.toMatch(/puedeCrearPedido\(/)
    expect(crearSource).not.toMatch(/\.findPendingByCliente\(/)
  })

  it('CrearPedidoUseCase llama a getFiadoStatusUseCase.execute con la operación evaluada', () => {
    const callIdx = crearSource.indexOf('this.getFiadoStatusUseCase.execute(')
    expect(callIdx).toBeGreaterThan(-1)

    // Debe pasarle `operacion: { total, totalPagado }` — sin eso la
    // autoridad no puede aplicar el guard "solo si queda saldo".
    const block = crearSource.slice(callIdx, callIdx + 200)
    expect(block).toMatch(/operacion:\s*\{\s*total,\s*totalPagado\s*\}/)

    // El resultado (errorDeuda) se evalúa después de la llamada, antes de
    // persistir — no antes de calcular totalPagado.
    const totalPagadoIdx = crearSource.indexOf('const totalPagado =')
    const throwIdx = crearSource.indexOf('CLIENTE_DEBE', callIdx)
    expect(totalPagadoIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(totalPagadoIdx)
    expect(throwIdx).toBeGreaterThan(callIdx)
  })

  it('el chequeo de crédito corre antes de persistir el pedido', () => {
    const callIdx = crearSource.indexOf('this.getFiadoStatusUseCase.execute(')
    const persistIdx = crearSource.indexOf('Pedido.create(')
    expect(callIdx).toBeGreaterThan(-1)
    expect(persistIdx).toBeGreaterThan(callIdx)
  })

  it('la autoridad (GetFiadoStatusUseCase) aplica el guard: solo evalúa errorDeuda si operationOutstanding > 0', () => {
    const guardIdx = autoridadSource.indexOf('if (operationOutstanding > 0)')
    const checkIdx = autoridadSource.indexOf('puedeCrearPedido(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(guardIdx)
  })
})
