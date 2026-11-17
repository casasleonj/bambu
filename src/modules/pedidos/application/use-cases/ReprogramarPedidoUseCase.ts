/**
 * ReprogramarPedidoUseCase (#836 F1) — cambia la fecha PROMETIDA (`Pedido.fechaEntrega`).
 *
 * Nunca toca `fecha`, `createdAt`, `entregadoAt`, importes, pagos, inventario ni comisiones:
 * es un cambio de compromiso, con historial append-only (quién, cuándo, anterior, nueva,
 * motivo, y si el compromiso ya estaba vencido al reprogramar — dato congelado).
 *
 * Señales, no bloqueos: reprogramar a una fecha pasada o muchas veces es visible, no
 * prohibido. Sí se rechaza un pedido ya entregado, cancelado o anulado.
 *
 * Concurrencia: lock `PEDIDO:{id}` (mismo agregado que entregar) + `fechaAnteriorEsperada`
 * opcional: si otra persona cambió la fecha entre medias → conflicto, no pisada silenciosa.
 * Offline: `offlineId` único → un reintento devuelve el mismo resultado sin duplicar.
 */
import { withAdvisoryLock } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { compromisoVencido } from '@/lib/pedidos-compromiso'

export class PedidoReprogramacionNotFoundError extends Error {
  constructor(id: string) {
    super(`PEDIDO_NOT_FOUND: ${id}`)
    this.name = 'PedidoReprogramacionNotFoundError'
  }
}
export class PedidoNoReprogramableError extends Error {
  constructor(estado: string) {
    super(`PEDIDO_NO_REPROGRAMABLE: estado actual ${estado}`)
    this.name = 'PedidoNoReprogramableError'
  }
}
export class PedidoFechaCambioConcurrenteError extends Error {
  constructor(public readonly fechaActual: Date | null) {
    super('PEDIDO_FECHA_CAMBIADA: otra persona cambió la fecha prometida')
    this.name = 'PedidoFechaCambioConcurrenteError'
  }
}

export interface ReprogramarPedidoInput {
  pedidoId: string
  fechaNueva: Date
  actorId: string
  motivo?: string
  offlineId?: string
  /** Fecha que la pantalla creía vigente (ISO). `null` = la pantalla veía «sin fecha». Omitida = no se comprueba. */
  fechaAnteriorEsperada?: Date | null
}

export interface ReprogramarPedidoResult {
  pedidoId: string
  fechaAnterior: Date | null
  fechaNueva: Date
  vencidaAlReprogramar: boolean
  vecesReprogramado: number
  fechaNuevaVencida: boolean
  deduped: boolean
}

export class ReprogramarPedidoUseCase {
  async execute(input: ReprogramarPedidoInput): Promise<ReprogramarPedidoResult> {
    return withAdvisoryLock('PEDIDO', input.pedidoId, async (tx) => {
      if (input.offlineId) {
        const previa = await tx.pedidoReprogramacion.findUnique({ where: { offlineId: input.offlineId } })
        if (previa) {
          return {
            pedidoId: previa.pedidoId,
            fechaAnterior: previa.fechaAnterior,
            fechaNueva: previa.fechaNueva,
            vencidaAlReprogramar: previa.vencidaAlReprogramar,
            vecesReprogramado: await tx.pedidoReprogramacion.count({ where: { pedidoId: previa.pedidoId } }),
            fechaNuevaVencida: compromisoVencido(previa.fechaNueva, new Date()),
            deduped: true,
          }
        }
      }

      const pedido = await tx.pedido.findUnique({
        where: { id: input.pedidoId },
        select: { id: true, estadoEntrega: true, fechaEntrega: true },
      })
      if (!pedido) throw new PedidoReprogramacionNotFoundError(input.pedidoId)
      if (['ENTREGADO', 'CANCELADO', 'ANULADO'].includes(pedido.estadoEntrega)) {
        throw new PedidoNoReprogramableError(pedido.estadoEntrega)
      }
      if (input.fechaAnteriorEsperada !== undefined) {
        const esperada = input.fechaAnteriorEsperada?.getTime() ?? null
        const actual = pedido.fechaEntrega?.getTime() ?? null
        if (esperada !== actual) throw new PedidoFechaCambioConcurrenteError(pedido.fechaEntrega)
      }

      const ahora = new Date()
      const fechaAnterior = pedido.fechaEntrega
      const vencidaAlReprogramar = compromisoVencido(fechaAnterior, ahora)

      await tx.pedidoReprogramacion.create({
        data: {
          pedidoId: pedido.id,
          fechaAnterior,
          fechaNueva: input.fechaNueva,
          motivo: input.motivo,
          vencidaAlReprogramar,
          reprogramadoPorId: input.actorId,
          offlineId: input.offlineId,
        },
      })
      // Única mutación del pedido: la fecha prometida.
      await tx.pedido.update({ where: { id: pedido.id }, data: { fechaEntrega: input.fechaNueva } })

      const vecesReprogramado = await tx.pedidoReprogramacion.count({ where: { pedidoId: pedido.id } })
      await logAudit({
        entidad: 'Pedido',
        registroId: pedido.id,
        accion: 'UPDATE',
        datos: { reprogramacion: true, fechaAnterior, fechaNueva: input.fechaNueva, motivo: input.motivo ?? null, vencidaAlReprogramar, vecesReprogramado },
        usuarioId: input.actorId,
      }, tx)

      return {
        pedidoId: pedido.id,
        fechaAnterior,
        fechaNueva: input.fechaNueva,
        vencidaAlReprogramar,
        vecesReprogramado,
        fechaNuevaVencida: compromisoVencido(input.fechaNueva, ahora),
        deduped: false,
      }
    })
  }
}
