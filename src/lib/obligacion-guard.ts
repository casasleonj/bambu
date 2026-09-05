/**
 * Guard I-11 (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis) — hallazgo de la
 * revisión adversarial de N2, no estaba en ningún documento anterior:
 *
 * Mientras exista una `ObligacionPendiente` `ABIERTA` con cantidad reservada
 * sobre un producto de un `Pedido`, el flujo ORDINARIO de entrega
 * (`EntregarPedidoUseCase`, cierre de embarque) no puede entregar más de
 * `cantPedido - cantidadOriginal(Obligación)` de ese producto — evita que la
 * misma mercancía física se entregue dos veces: una vez por la vía ordinaria,
 * otra vez por el cumplimiento de la `Actividad` que la tiene bajo gestión.
 *
 * Compartido entre los módulos `pedidos` y `embarques` (ambos tienen un
 * flujo de entrega que debe respetar este invariante) — vive en `src/lib`
 * por eso, mismo patrón que `pago-confirmacion.ts`/`receivable-entry.ts`.
 */

import type { TransactionClient } from '@/lib/locks'

export class SobreposicionConObligacionActivaError extends Error {
  constructor(public readonly producto: string) {
    super(`SOBREPOSICION_CON_OBLIGACION_ACTIVA: el producto ${producto} tiene cantidad bajo gestión activa (ObligacionPendiente ABIERTA) — la entrega ordinaria no puede invadirla`)
    this.name = 'SobreposicionConObligacionActivaError'
  }
}

export interface EntregaAValidar {
  producto: string
  /** `PedidoItem.cantPedido` de ese producto. */
  cantPedido: number
  /** `PedidoItem.cantEntrega` ANTES de aplicar esta entrega. */
  cantEntregaActual: number
  /** Cantidad que esta operación intenta entregar (ya clampeada al resto, si aplica). */
  cantidadAEntregar: number
}

/**
 * Lanza `SobreposicionConObligacionActivaError` si alguna de las entregas
 * invade cantidad reservada por una `ObligacionPendiente` `ABIERTA` del mismo
 * pedido. No-op (sin queries extra relevantes) si el pedido no tiene ninguna
 * obligación activa — el caso común hoy, ya que nada crea `ObligacionPendiente`
 * fuera de `GestionarPendienteUseCase`.
 */
export async function validarSinSobreposicionConObligacionActiva(
  tx: Pick<TransactionClient, 'obligacionPendiente'>,
  pedidoId: string,
  entregas: EntregaAValidar[],
): Promise<void> {
  const activas = await tx.obligacionPendiente.findMany({
    where: { pedidoId, estado: 'ABIERTA' },
    select: { producto: true, cantidadOriginal: true },
  })
  if (activas.length === 0) return

  const reservadoPorProducto = new Map<string, number>()
  for (const o of activas) {
    reservadoPorProducto.set(o.producto, (reservadoPorProducto.get(o.producto) ?? 0) + o.cantidadOriginal)
  }

  for (const e of entregas) {
    const reservado = reservadoPorProducto.get(e.producto)
    if (!reservado) continue
    const limiteOrdinario = e.cantPedido - reservado
    if (e.cantEntregaActual + e.cantidadAEntregar > limiteOrdinario) {
      throw new SobreposicionConObligacionActivaError(e.producto)
    }
  }
}
