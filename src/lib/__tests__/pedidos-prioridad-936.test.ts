import { describe, expect, it } from 'vitest'
import { ordenarPrioridadPedidos, type PedidoPrioridad } from '../pedidos-prioridad-921'

/**
 * #936: regresiones puras de #921, sin afirmar cobertura de PostgreSQL/E2E.
 * Estas pruebas NO aprueban una nueva política de negocio ni miden el rendimiento SQL.
 */
const ahora = new Date('2026-11-20T14:30:00.000Z') // 09:30 Colombia

function pedido(id: string, cambios: Partial<PedidoPrioridad> = {}): PedidoPrioridad {
  return {
    id,
    createdAt: new Date('2026-11-20T13:00:00.000Z'),
    total: 1000,
    totalPagado: 0,
    saldo: 1000,
    confirmado: 0,
    estadoEntrega: 'PENDIENTE',
    fechaEntrega: new Date('2026-11-20T13:00:00.000Z'),
    entregaNoAntesDe: null,
    items: [{ cantPedido: 10, cantEntrega: 0, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
    ...cambios,
  }
}
const pagado = { totalPagado: 1000, confirmado: 1000, saldo: 0 }
const ids = (pedidos: readonly PedidoPrioridad[]) =>
  ordenarPrioridadPedidos(pedidos, ahora).map(p => p.id)

describe('#936 · adversariales de la política de prioridad y FIFO (#921)', () => {
  it('una entrega parcial pagada conserva prioridad y creación original aun si hay un pendiente más antiguo sin pagar', () => {
    const parcial = pedido('parcial-ayer', {
      ...pagado,
      createdAt: new Date('2026-11-19T11:00:00.000Z'),
      estadoEntrega: 'PARCIAL',
      items: [{ cantPedido: 50, cantEntrega: 30, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
    })
    const pendiente = pedido('sin-pagar-anteayer', {
      createdAt: new Date('2026-11-18T11:00:00.000Z'),
    })
    const completo = pedido('completado', {
      ...pagado,
      items: [{ cantPedido: 10, cantEntrega: 10, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
      estadoEntrega: 'ENTREGADO',
    })
    expect(ids([completo, pendiente, parcial])).toEqual([
      'parcial-ayer', 'sin-pagar-anteayer', 'completado',
    ])
  })

  it('un pago digital reportado pero no confirmado no obtiene prioridad de pago completo', () => {
    const reportado = pedido('por-confirmar', {
      totalPagado: 1000,
      saldo: 0,
      confirmado: 0,
      createdAt: new Date('2026-11-20T12:00:00.000Z'),
    })
    const confirmado = pedido('confirmado', {
      ...pagado,
      createdAt: new Date('2026-11-20T14:00:00.000Z'),
    })
    expect(ids([reportado, confirmado])).toEqual(['confirmado', 'por-confirmar'])
  })

  it('regalos físicamente pendientes mantienen abierto el pedido aunque las unidades pagadas estén entregadas', () => {
    const regaloPendiente = pedido('regalo-pendiente', {
      ...pagado,
      items: [{ cantPedido: 60, cantEntrega: 60, cantRegaloPedido: 3, cantRegaloEntrega: 2 }],
    })
    const entregadoConSaldo = pedido('entregado-con-deuda', {
      estadoEntrega: 'ENTREGADO',
      items: [{ cantPedido: 10, cantEntrega: 10, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
    })
    const completo = pedido('terminado', {
      ...pagado,
      estadoEntrega: 'ENTREGADO',
      items: [{ cantPedido: 10, cantEntrega: 10, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
    })
    expect(ids([completo, entregadoConSaldo, regaloPendiente])).toEqual([
      'regalo-pendiente', 'entregado-con-deuda', 'terminado',
    ])
  })

  it('un pedido multiproducto pagado con hielo pendiente conserva prioridad de entrega', () => {
    const mixto = pedido('agua-lista-hielo-pendiente', {
      ...pagado,
      items: [
        { cantPedido: 10, cantEntrega: 10, cantRegaloPedido: 0, cantRegaloEntrega: 0 },
        { cantPedido: 2, cantEntrega: 1, cantRegaloPedido: 0, cantRegaloEntrega: 0 },
      ],
    })
    const noPagado = pedido('sin-pagar', {
      createdAt: new Date('2026-11-19T10:00:00.000Z'),
    })
    expect(ids([noPagado, mixto])).toEqual(['agua-lista-hielo-pendiente', 'sin-pagar'])
  })

  it('promesa próxima de hoy precede a un pedido pagado sin hora acordada', () => {
    const urgente = pedido('hora-10', { entregaNoAntesDe: '10:00' })
    const yaPagado = pedido('pagado-sin-hora', { ...pagado })
    expect(ids([yaPagado, urgente])).toEqual(['hora-10', 'pagado-sin-hora'])
  })

  it('un programado para mañana no desplaza a un pedido exigible hoy por estar pagado', () => {
    const futuro = pedido('pagado-futuro', {
      ...pagado,
      fechaEntrega: new Date('2026-11-21T13:00:00.000Z'),
      entregaNoAntesDe: '09:00',
      createdAt: new Date('2026-11-19T10:00:00.000Z'),
    })
    const hoy = pedido('hoy-sin-pago')
    expect(ids([futuro, hoy])).toEqual(['hoy-sin-pago', 'pagado-futuro'])
  })

  it('anulados y cancelados quedan después de completados, sin mutar los pedidos', () => {
    const cancelado = pedido('cancelado', {
      ...pagado, estadoEntrega: 'CANCELADO',
      createdAt: new Date('2026-11-19T08:00:00.000Z'),
    })
    const anulado = pedido('anulado', {
      estadoEntrega: 'ANULADO',
      createdAt: new Date('2026-11-20T08:00:00.000Z'),
    })
    const completado = pedido('completado', {
      ...pagado, estadoEntrega: 'ENTREGADO',
      items: [{ cantPedido: 10, cantEntrega: 10, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
    })
    const lista = [anulado, completado, cancelado]
    expect(ids(lista)).toEqual(['completado', 'cancelado', 'anulado'])
    expect(lista.map(p => p.id)).toEqual(['anulado', 'completado', 'cancelado'])
  })

  it('mantiene FIFO por createdAt y desempate por ID al cruzar tres páginas simuladas', () => {
    const lista = Array.from({ length: 27 }, (_, i) => pedido(
      'p-' + String(26 - i).padStart(2, '0'),
      { createdAt: new Date('2026-11-20T13:00:00.000Z') },
    ))
    const ordenados = ordenarPrioridadPedidos(lista, ahora)
    const paginas = [ordenados.slice(0, 10), ordenados.slice(10, 20), ordenados.slice(20, 30)]
    const todos = paginas.flat().map(p => p.id)
    expect(todos).toEqual(Array.from({ length: 27 }, (_, i) => 'p-' + String(i).padStart(2, '0')))
    expect(new Set(todos).size).toBe(27)
    // El lector de DB/paginación concurrente NO se prueba con esta simulación pura.
  })

  it('dataset sintético de 5000 elementos: clasificación sin pérdidas ni duplicados', () => {
    const base = Date.parse('2026-11-18T00:00:00.000Z')
    const lista = Array.from({ length: 5000 }, (_, i) => pedido(
      'pedido-' + String(4999 - i).padStart(4, '0'),
      { createdAt: new Date(base + (4999 - i) * 1000) },
    ))
    const ordenados = ordenarPrioridadPedidos(lista, ahora)
    expect(ordenados).toHaveLength(5000)
    expect(new Set(ordenados.map(p => p.id)).size).toBe(5000)
    expect(ordenados[0].id).toBe('pedido-0000')
    expect(ordenados[4999].id).toBe('pedido-4999')
    // No es un benchmark: no toca PostgreSQL, Prisma ni el endpoint.
  })
})
