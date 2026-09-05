/**
 * GestionarPendienteUseCase (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.1).
 *
 * Única puerta de entrada para crear una `ObligacionPendiente`+`Actividad` a
 * partir del remanente de un `Pedido`/`PedidoItem` — nunca automática (decisión
 * N2 §1.3: "el sistema prepara, el usuario decide"). Un pedido parcialmente
 * entregado NO tiene ninguna `ObligacionPendiente` hasta que este caso de uso
 * se invoca explícitamente.
 *
 *   LOCK PEDIDO:{pedidoId}
 *     → leer Pedido/PedidoItem (snapshot del remanente)
 *     → validar cantidad <= remanente
 *     → dedup por offlineId
 *     → crear ObligacionPendiente + Actividad (modo = modoInicial)
 *     → si modoInicial != Pedido.canal → calcular y aplicar el diferencial
 *       (recalculado en esta misma transacción — nunca el valor de un
 *       preview mostrado antes, hallazgo adversarial #2 de la especificación)
 *     → COMMIT
 *
 * Corrección de implementación respecto al ALS: el ALS describía la entrada
 * como `itemsAGestionar: [{producto, cantidad}]` (multi-producto), pero
 * `ObligacionPendiente`/`Actividad` son de UN producto cada una (mismo
 * `producto: String` singular que el resto del dominio de Embarques,
 * ADR-OBLIGACION-001/ADR-ACTIVIDAD-001). Gestionar varios productos a la vez
 * es responsabilidad del *caller* (invocar este caso de uso una vez por
 * producto, cada uno con su propio `offlineId`) — no de este caso de uso, que
 * se mantiene de una sola responsabilidad y evita inventar una clave
 * `offlineId` compuesta (Plan Maestro V11.1 §14: "no asumir que un offlineId
 * compartido significa semántica idéntica para todas las filas").
 *
 * Lock `PEDIDO:{pedidoId}`, no `OBLIGACION:{id}`: la Obligación todavía no
 * existe en el momento de leer/validar el remanente — el agregado que hay que
 * proteger es el propio `Pedido`/`PedidoItem` (mismo lock que
 * `ActualizarPedidoUseCase`/`EntregarPedidoUseCase`, ADR-CONCURRENCIA-001).
 */

import { withAdvisoryLock } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { calcularDiferencial } from '../../domain/services/diferencial.service'
import { aplicarConsecuenciaEconomicaDiferencial } from '../services/aplicar-diferencial-economico.service'
import type { Canal, ProductCode } from '@/lib/pricing'

export interface GestionarPendienteInput {
  pedidoId: string
  producto: ProductCode
  cantidad: number
  modoInicial: Canal
  usuarioId: string
  offlineId?: string
  motivo?: string
}

export interface GestionarPendienteResult {
  obligacionId: string
  actividadId: string
  deduped: boolean
  diferencial?: { valorHistorico: number; valorActual: number; diferencial: number }
}

export class GestionarPendienteUseCase {
  async execute(input: GestionarPendienteInput): Promise<GestionarPendienteResult> {
    return withAdvisoryLock('PEDIDO', input.pedidoId, async (tx) => {
      // Dedup por offlineId DENTRO del lock (34C, mismo patrón que AsignarActividadUseCase).
      if (input.offlineId) {
        const existente = await tx.actividad.findUnique({
          where: { offlineId: input.offlineId },
          include: { obligacion: true },
        })
        if (existente) {
          return { obligacionId: existente.obligacionId, actividadId: existente.id, deduped: true }
        }
      }

      const pedido = await tx.pedido.findUnique({
        where: { id: input.pedidoId },
        select: { id: true, clienteId: true, negocioId: true, canal: true },
      })
      if (!pedido) {
        throw new Error('PEDIDO_NOT_FOUND')
      }

      const item = await tx.pedidoItem.findFirst({
        where: { pedidoId: input.pedidoId, producto: input.producto },
        select: { id: true, cantPedido: true, cantEntrega: true, precio: true },
      })
      if (!item) {
        throw new Error(`PEDIDO_ITEM_NOT_FOUND: ${input.producto}`)
      }

      const remanente = item.cantPedido - item.cantEntrega
      if (input.cantidad <= 0 || input.cantidad > remanente) {
        throw new Error(`CANTIDAD_EXCEDE_PENDIENTE: solicitado ${input.cantidad}, remanente ${remanente}`)
      }

      // Ya hay una gestión activa sobre este mismo remanente — no duplicar.
      const obligacionExistente = await tx.obligacionPendiente.findFirst({
        where: { pedidoId: input.pedidoId, producto: input.producto, estado: 'ABIERTA' },
      })
      if (obligacionExistente) {
        throw new Error(`OBLIGACION_YA_ACTIVA: ya existe una gestión abierta de ${input.producto} para este pedido`)
      }

      const obligacion = await tx.obligacionPendiente.create({
        data: {
          pedidoId: input.pedidoId,
          clienteId: pedido.clienteId,
          producto: input.producto,
          cantidadOriginal: input.cantidad,
          cantidadCumplida: 0,
          cantidadAsignada: 0,
          estado: 'ABIERTA',
          offlineId: input.offlineId ?? null,
        },
      })

      const actividad = await tx.actividad.create({
        data: {
          obligacionId: obligacion.id,
          tipo: 'ENTREGA',
          cantidad: input.cantidad,
          modo: input.modoInicial,
          estado: 'ASIGNADA',
          offlineId: input.offlineId ?? null,
        },
      })

      let diferencialResultado: GestionarPendienteResult['diferencial']
      if (input.modoInicial !== pedido.canal) {
        const calculo = await calcularDiferencial({
          producto: input.producto,
          precioHistorico: Number(item.precio),
          cantidadPendiente: input.cantidad,
          modoDestino: input.modoInicial,
          clienteId: pedido.clienteId,
          negocioId: pedido.negocioId,
        })
        diferencialResultado = calculo

        if (calculo.diferencial !== 0) {
          await aplicarConsecuenciaEconomicaDiferencial(tx, {
            pedidoId: input.pedidoId,
            clienteId: pedido.clienteId,
            obligacionId: obligacion.id,
            producto: input.producto,
            cantidadPendiente: input.cantidad,
            diferencial: calculo.diferencial,
            motivo: input.motivo
              ?? `Gestionar pendiente: modo ${input.modoInicial} (canal original ${pedido.canal})`,
            autorizadoPorId: input.usuarioId,
            offlineId: input.offlineId ? `${input.offlineId}:diferencial` : undefined,
          })
        }
      }

      await logAudit({
        entidad: 'ObligacionPendiente',
        registroId: obligacion.id,
        accion: 'CREATE',
        datos: {
          pedidoId: input.pedidoId,
          producto: input.producto,
          cantidad: input.cantidad,
          modoInicial: input.modoInicial,
          canalOriginal: pedido.canal,
          diferencial: diferencialResultado?.diferencial ?? 0,
        },
        usuarioId: input.usuarioId,
      }, tx)

      return {
        obligacionId: obligacion.id,
        actividadId: actividad.id,
        deduped: false,
        diferencial: diferencialResultado,
      }
    })
  }
}
