/**
 * GetFiadoStatusUseCase — Autoridad de Crédito (F1).
 *
 * ÚNICA autoridad de crédito del sistema: consulta de pedidos pendientes +
 * cálculo de exposición (conteo y monetaria) + decisión de elegibilidad.
 * Preview (PreviewPedidoUseCase), Commit (CrearPedidoUseCase) y Venta
 * Libre (venta-libre/route.ts) llaman a esta MISMA clase — ninguno debe
 * volver a implementar su propia consulta de pedidos pendientes ni su
 * propia llamada a `puedeCrearPedido`.
 *
 * Ver docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md.
 */

import { CANONICAL_CONSUMIDOR_FINAL_ID, LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'
import {
  resolverLimiteFiados,
  getEstadoFiados,
  puedeCrearPedido,
} from '../../domain/services/pedido-validation.service'
import type { FiadoStatus } from '../../domain/types'

export class ClienteNotFoundError extends Error {
  constructor(clienteId: string) {
    super(`Cliente not found: ${clienteId}`)
    this.name = 'ClienteNotFoundError'
  }
}

export interface GetFiadoStatusInput {
  clienteId: string
  /**
   * F1: operación concreta a evaluar (total/totalPagado del Pedido en
   * creación). Si se omite, se devuelve solo el estado actual del cliente
   * (uso: UI/consulta, sin decisión de bloqueo). Si se incluye y deja
   * saldo pendiente (`total > totalPagado`), se evalúa `errorDeuda`.
   */
  operacion?: { total: number; totalPagado: number }
  /**
   * F2 (Excepciones de Crédito): id de una `PedidoExcepcionCredito` que el
   * caller afirma tener para esta operación. Se VALIDA acá (solo lectura:
   * pertenece al mismo cliente, está AUTORIZADA, no fue consumida todavía)
   * y, si es válida, suprime `errorDeuda` — nunca marca la excepción como
   * consumida. El consumo (una sola vez) lo hace el commit real, atómico,
   * en su propia transacción — ver docs/AGUA_BAMBU_F2_MAPA_Y_DISENO_EXCEPCIONES_CREDITO_v1.0.md.
   */
  excepcionId?: string
  /** F1: para correr dentro de la transacción del caller (Commit/venta-libre). */
  tx?: TransactionClient
}

export class GetFiadoStatusUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private clienteRepo: IClienteRepository,
  ) {}

  async execute(input: GetFiadoStatusInput): Promise<FiadoStatus> {
    const { clienteId, operacion, excepcionId, tx } = input

    // Anonymous sales never have a fiado limit.
    if (clienteId === CANONICAL_CONSUMIDOR_FINAL_ID) {
      return {
        count: 0, limite: 0, nivel: 'ok', pedidos: [],
        outstandingAmount: 0, status: 'NOT_APPLICABLE', errorDeuda: null,
      }
    }

    const cliente = await this.clienteRepo.findById(clienteId, tx)
    if (!cliente) {
      throw new ClienteNotFoundError(clienteId)
    }

    const [pedidosPendientes, limiteGlobal] = await Promise.all([
      this.pedidoRepo.findPendingByCliente(clienteId, tx),
      getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', LIMITE_FIADOS_DEFAULT),
    ])

    const limite = resolverLimiteFiados(
      { limitePedidosFiados: cliente.limitePedidosFiados },
      String(limiteGlobal),
      LIMITE_FIADOS_DEFAULT,
    )

    const { count, nivel } = getEstadoFiados(pedidosPendientes, limite)
    const outstandingAmount = pedidosPendientes.reduce((sum, p) => sum + p.saldo, 0)
    // F1: AT_LIMIT vs OVER_LIMIT es más granular que `nivel` (que colapsa
    // ambos en 'limite' con `>=`) — no cambia el criterio de bloqueo.
    const status: FiadoStatus['status'] =
      count > limite ? 'OVER_LIMIT' : count === limite ? 'AT_LIMIT' : 'OK'

    let operationOutstanding: number | undefined
    let projectedOpenCount: number | undefined
    let projectedOutstandingAmount: number | undefined
    let errorDeuda: string | null = null
    let excepcionAplicada: FiadoStatus['excepcionAplicada']

    if (operacion) {
      operationOutstanding = Math.max(0, operacion.total - operacion.totalPagado)
      projectedOpenCount = count + (operationOutstanding > 0 ? 1 : 0)
      projectedOutstandingAmount = outstandingAmount + operationOutstanding

      // Mismo guard que ya existía en Commit/venta-libre: el límite de
      // fiados solo frena la operación si va a quedar con saldo pendiente.
      if (operationOutstanding > 0) {
        errorDeuda = puedeCrearPedido(
          { id: clienteId, bloqueado: cliente.bloqueado, verificado: cliente.verificado, creadoPorRol: cliente.creadoPorRol },
          pedidosPendientes,
          limite,
        )

        // F2: una excepción autorizada, válida para ESTE cliente y sin
        // consumir todavía, suprime el bloqueo — SOLO lectura, no se marca
        // como usada acá (eso es responsabilidad exclusiva del commit real).
        if (errorDeuda && excepcionId) {
          const client = tx ?? prisma
          const excepcion = await client.pedidoExcepcionCredito.findUnique({ where: { id: excepcionId } })
          if (
            excepcion &&
            excepcion.clienteId === clienteId &&
            excepcion.estado === 'AUTORIZADA' &&
            excepcion.pedidoId === null &&
            excepcion.autorizadoPorId
          ) {
            errorDeuda = null
            excepcionAplicada = {
              id: excepcion.id,
              motivoSolicitud: excepcion.motivoSolicitud,
              autorizadoPorId: excepcion.autorizadoPorId,
            }
          }
        }
      }
    }

    return {
      count,
      limite,
      nivel,
      pedidos: pedidosPendientes,
      outstandingAmount,
      operationOutstanding,
      projectedOpenCount,
      projectedOutstandingAmount,
      status,
      errorDeuda,
      excepcionAplicada,
    }
  }
}
