/**
 * ProyectarAjusteCantidadUseCase (Fase 6-0 del rediseño de Pedidos —
 * docs/pedidos/fase6-g11-flujo-plan.md §2, P4/P7).
 *
 * **Proyección read-only** del impacto de una corrección de cantidad (G11
 * rama A) ANTES de ejecutarla. NUNCA muta: sin `withAdvisoryLock`, sin
 * `$transaction` de escritura, sin `tx.*.update/create/delete`, sin
 * `logAudit`, sin `incrementMetric`, sin realtime, sin efectos derivados.
 *
 * Replica exactamente la aritmética de `AjustarPedidoCantidadUseCase`
 * (precio histórico inmutable, `total`/`saldo`/`estadoPago` recalculados,
 * los 3 guards) usando solo lecturas. El commit real
 * (`POST /api/pedidos/[id]/ajustar-cantidad`) **revalida y recalcula todo**
 * dentro de su lock — esta proyección solo sirve para que el usuario
 * comprenda la consecuencia antes de decidir (semántica preview→confirm).
 */

import { prisma } from '@/lib/prisma'
import { calcularEstadoPago } from '../../domain/services/pagos-calculator.service'

export type AjusteGuardCode =
  | 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA'
  | 'CORRECCION_PEDIDO_CERRADO'
  | 'CORRECCION_GENERARIA_SOBREPAGO'

export type AjusteAllowedAction = 'confirmar-correccion' | 'ir-a-nueva-demanda' | 'ir-a-cartera'

export interface ProyectarAjusteCantidadInput {
  pedidoId: string
  producto: string
  cantidadNueva: number
}

export interface ProyectarAjusteCantidadResult {
  producto: string
  // cantidad
  cantidadOriginal: number
  cantidadEntregada: number
  cantidadNueva: number
  delta: number
  // precio / subtotales
  precioHistorico: number
  subtotalAntes: number
  subtotalDespues: number
  // pedido
  totalAntes: number
  totalDespues: number
  totalPagado: number
  saldoAntes: number
  saldoDespues: number
  estadoEntrega: string
  estadoPagoAntes: string
  estadoPagoDespues: string
  // impacto / señales
  sobrepagoProyectado: number
  bloqueadoPor: AjusteGuardCode | null
  warnings: Array<{ code: string; message: string }>
  allowedActions: AjusteAllowedAction[]
  puedeCorregir: boolean
}

export class ProyectarAjusteCantidadError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'ProyectarAjusteCantidadError'
  }
}

const ESTADOS_CERRADOS = ['ENTREGADO', 'CANCELADO', 'ANULADO']

export class ProyectarAjusteCantidadUseCase {
  async execute(input: ProyectarAjusteCantidadInput): Promise<ProyectarAjusteCantidadResult> {
    const pedido = await prisma.pedido.findUnique({
      where: { id: input.pedidoId },
      select: {
        estadoEntrega: true,
        estadoPago: true,
        total: true,
        totalPagado: true,
        saldo: true,
      },
    })
    if (!pedido) throw new ProyectarAjusteCantidadError('PEDIDO_NOT_FOUND')

    const item = await prisma.pedidoItem.findFirst({
      where: { pedidoId: input.pedidoId, producto: input.producto },
      select: { cantPedido: true, cantEntrega: true, precio: true, subtotal: true },
    })
    if (!item) throw new ProyectarAjusteCantidadError(`PEDIDO_ITEM_NOT_FOUND: ${input.producto}`)

    const cantidadOriginal = item.cantPedido
    const cantidadEntregada = item.cantEntrega
    const delta = input.cantidadNueva - cantidadOriginal
    const precioHistorico = Number(item.precio)
    const subtotalAntes = Number(item.subtotal)
    const subtotalDespues = input.cantidadNueva * precioHistorico
    const deltaSubtotal = subtotalDespues - subtotalAntes

    const totalAntes = Number(pedido.total)
    const totalPagado = Number(pedido.totalPagado)
    const saldoAntes = Number(pedido.saldo)
    const totalDespues = totalAntes + deltaSubtotal
    const saldoDespues = totalDespues - totalPagado
    const estadoPagoDespues = calcularEstadoPago(totalDespues, totalPagado, pedido.estadoEntrega)
    const sobrepagoProyectado = Math.max(0, totalPagado - totalDespues)

    // Guards en el MISMO orden en que los evalúa AjustarPedidoCantidadUseCase.
    let bloqueadoPor: AjusteGuardCode | null = null
    if (ESTADOS_CERRADOS.includes(pedido.estadoEntrega)) {
      bloqueadoPor = 'CORRECCION_PEDIDO_CERRADO'
    } else if (cantidadEntregada > 0) {
      bloqueadoPor = 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA'
    } else if (totalPagado > totalDespues) {
      bloqueadoPor = 'CORRECCION_GENERARIA_SOBREPAGO'
    }

    const warnings: ProyectarAjusteCantidadResult['warnings'] = []
    if (delta === 0) {
      warnings.push({ code: 'SIN_CAMBIO', message: 'La cantidad nueva es igual a la actual.' })
    }
    if (input.cantidadNueva < cantidadEntregada) {
      warnings.push({
        code: 'REDUCE_BAJO_ENTREGADO',
        message: `Ya se entregaron ${cantidadEntregada} unidades; la cantidad nueva (${input.cantidadNueva}) queda por debajo.`,
      })
    }

    const puedeCorregir = bloqueadoPor === null && delta !== 0

    let allowedActions: AjusteAllowedAction[]
    if (puedeCorregir) {
      allowedActions = ['confirmar-correccion']
    } else if (bloqueadoPor === 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA') {
      allowedActions = ['ir-a-nueva-demanda']
    } else if (bloqueadoPor === 'CORRECCION_PEDIDO_CERRADO' || bloqueadoPor === 'CORRECCION_GENERARIA_SOBREPAGO') {
      allowedActions = ['ir-a-cartera']
    } else {
      allowedActions = []
    }

    return {
      producto: input.producto,
      cantidadOriginal,
      cantidadEntregada,
      cantidadNueva: input.cantidadNueva,
      delta,
      precioHistorico,
      subtotalAntes,
      subtotalDespues,
      totalAntes,
      totalDespues,
      totalPagado,
      saldoAntes,
      saldoDespues,
      estadoEntrega: pedido.estadoEntrega,
      estadoPagoAntes: pedido.estadoPago,
      estadoPagoDespues,
      sobrepagoProyectado,
      bloqueadoPor,
      warnings,
      allowedActions,
      puedeCorregir,
    }
  }
}
