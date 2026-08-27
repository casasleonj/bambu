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
 * `/api/pedidos/venta-libre` ya tenía este guard desde mayo (commit
 * 004f1b13); CrearPedidoUseCase (usado por /api/pedidos, incluida Venta
 * Rápida) nunca lo tuvo — no fue una regresión, fue un fix cuyo alcance
 * nunca se extendió a este flujo.
 */
describe('CrearPedidoUseCase: límite de fiados solo si el pedido queda fiado', () => {
  const sourcePath = resolve(__dirname, '../CrearPedidoUseCase.ts')
  const source = readFileSync(sourcePath, 'utf-8')

  it('el chequeo de límite de fiados corre dentro de un guard totalPagado < total', () => {
    const guardIdx = source.indexOf('if (totalPagado < total) {')
    expect(guardIdx).toBeGreaterThan(-1)

    const checkIdx = source.indexOf('puedeCrearPedido(')
    expect(checkIdx).toBeGreaterThan(guardIdx)

    // El cierre del bloque `if` debe venir después del throw CLIENTE_DEBE,
    // es decir el check completo (fetch pendientes + resolverLimiteFiados +
    // puedeCrearPedido + throw) vive DENTRO del guard, no antes.
    const throwIdx = source.indexOf('CLIENTE_DEBE', checkIdx)
    expect(throwIdx).toBeGreaterThan(checkIdx)
  })

  it('totalPagado se calcula antes del chequeo de límite (el guard puede evaluarlo)', () => {
    const totalPagadoIdx = source.indexOf('const totalPagado =')
    const guardIdx = source.indexOf('if (totalPagado < total) {')
    expect(totalPagadoIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(totalPagadoIdx)
  })

  it('el chequeo de límite corre antes de persistir el pedido', () => {
    const guardIdx = source.indexOf('if (totalPagado < total) {')
    const persistIdx = source.indexOf('this.pedidoRepo.save(')
    expect(persistIdx).toBeGreaterThan(guardIdx)
  })
})
