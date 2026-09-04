// @tests Auditoría post-PR-2 — F-A: recurrentes.ts hace una transición prohibida.
//
// docs/pedidos/AUDITORIA_REGRESION_POST_PR2_PEDIDO_PAGO_CIERRE.md §F-A
//
// La rama APLICAR_CREDITO de `generarPedidosRecurrentes` (src/lib/recurrentes.ts,
// ~línea 739-747) hace `tx.pedido.update({ data: { estadoEntrega: 'ENTREGADO' } })`
// sobre pedidos consultados con `estadoEntrega: 'PENDIENTE'` — sin pasar por
// `canTransitionTo()`. La tabla canónica NO permite PENDIENTE → ENTREGADO.
//
// Este test fija la contradicción. Cuando se resuelva F-A (opción (a) del doc:
// esos pedidos deben ir a CANCELADO, como la rama hermana CON_PENDIENTES), este
// test se actualiza para verificar la ruta corregida.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EstadoEntregaVO, TRANSICIONES_ENTREGA } from '@/modules/pedidos/domain/value-objects/EstadoEntrega'

describe('F-A: la máquina de estados canónica prohíbe PENDIENTE → ENTREGADO', () => {
  it('TRANSICIONES_ENTREGA.PENDIENTE no incluye ENTREGADO', () => {
    expect(TRANSICIONES_ENTREGA.PENDIENTE).toEqual(['EN_RUTA', 'CANCELADO'])
  })

  it('canTransitionTo(PENDIENTE → ENTREGADO) === false', () => {
    const pendiente = EstadoEntregaVO.from('PENDIENTE')
    expect(pendiente.canTransitionTo(EstadoEntregaVO.from('ENTREGADO'))).toBe(false)
  })

  it('canTransitionTo(PENDIENTE → CANCELADO) === true (la ruta coherente para F-A)', () => {
    const pendiente = EstadoEntregaVO.from('PENDIENTE')
    expect(pendiente.canTransitionTo(EstadoEntregaVO.from('CANCELADO'))).toBe(true)
  })
})

describe('F-A: recurrentes.ts APLICAR_CREDITO ya no fabrica una entrega', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/recurrentes.ts'),
    'utf-8',
  )
  // El bloque desde el primer `APLICAR_CREDITO` hasta el `return { skipped: false`.
  const bloque = source.slice(
    source.indexOf("decision.decision === 'APLICAR_CREDITO'"),
    source.indexOf('return { skipped: false as const, creado }'),
  )

  it('cancela los prepagos consolidados (nunca ENTREGADO)', () => {
    expect(bloque).toMatch(/estadoEntrega:\s*'CANCELADO'/)
    expect(bloque).not.toMatch(/estadoEntrega:\s*'ENTREGADO'/)
    expect(bloque).not.toMatch(/cantEntrega:\s*item\.cantPedido/)
  })

  it('traspasa el dinero por NotaCredito + saldoFavor, no copiando totalPagado a ciegas', () => {
    expect(bloque).toMatch(/notaCredito\.create/)
    expect(bloque).toMatch(/saldoFavor:\s*\{\s*increment/)
    expect(bloque).toMatch(/saldoFavor:\s*\{\s*decrement/)
    expect(bloque).toMatch(/registrarReversionPedido/)
  })
})
