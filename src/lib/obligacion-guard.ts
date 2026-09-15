/**
 * Reconexión N2 — I-11 (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis +
 * decisiones del equipo sobre "cumplimiento acumulativo y fraccionable").
 *
 * El cumplimiento del PEDIDO sigue siendo la única autoridad de "cuánto se
 * entregó" (no se toca `Pedido`/`PedidoItem.cantEntrega` desde acá — eso lo
 * sigue haciendo el caller exactamente igual que antes). Esta función SOLO
 * resuelve qué porción de una entrega cae dentro de la zona reservada por una
 * `ObligacionPendiente` `ABIERTA` del mismo producto/pedido, y refleja esa
 * porción en `ObligacionPendiente.cantidadCumplida`/`Actividad.cantidadCumplida`
 * — nunca una segunda fuente de verdad física, solo un espejo acotado.
 *
 * Antes (I-11 original): cualquier entrega que invadiera la zona reservada
 * se RECHAZABA por completo (`SOBREPOSICION_CON_OBLIGACION_ACTIVA`). Eso
 * evitaba el doble cumplimiento, pero también bloqueaba el cumplimiento
 * LEGÍTIMO del remanente gestionado por N2 — la brecha real detectada.
 *
 * Ahora: la porción que cae en zona ordinaria se entrega como siempre; la
 * porción que cae en zona reservada se APLICA a la obligación (acotada a su
 * pendiente real, nunca más), en vez de rechazarse. Solo se rechaza si la
 * entrega excede TODO lo que el pedido+obligación pueden absorber en total
 * (dato mal capturado, no un caso legítimo).
 *
 * Acumulativo y fraccionable por diseño: cada llamada aplica solo lo que le
 * corresponde a ESTA entrega — repetir la operación N veces (100 → 20×5)
 * converge naturalmente a "obligación CUMPLIDA" sin ningún caso especial.
 *
 * Concurrencia: adquiere `OBLIGACION:{obligacionId}` DENTRO de la tx ya
 * abierta del caller (`PEDIDO:{pedidoId}` en `EntregarPedidoUseCase`,
 * `CIERRE:{embarqueId}` en el cierre de embarque) — mismo primitivo
 * (`acquireAdvisoryLockTx`) ya usado en otros multi-lock del repo (p.ej.
 * venta-libre `SECUENCIA:pedido → SECUENCIA:factura`). Serializa contra
 * `CambiarModoActividadUseCase`/`LiberarActividadUseCase`/
 * `ReprogramarObligacionPendienteUseCase`, que ya usan ese mismo namespace.
 *
 * Compartido entre los módulos `pedidos` y `embarques` — vive en `src/lib`
 * por eso, mismo patrón que `pago-confirmacion.ts`/`receivable-entry.ts`.
 */

import type { TransactionClient } from '@/lib/locks'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { logAudit } from '@/lib/audit'

export class EntregaExcedePendienteTotalError extends Error {
  constructor(public readonly producto: string) {
    super(`ENTREGA_EXCEDE_PENDIENTE_TOTAL: el producto ${producto} no tiene esa cantidad pendiente (ni en la vía ordinaria ni en la obligación gestionada)`)
    this.name = 'EntregaExcedePendienteTotalError'
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

export interface AplicacionObligacion {
  producto: string
  obligacionId: string
  aplicado: number
  obligacionCumplida: boolean
}

/**
 * Para cada entrega, si hay una `ObligacionPendiente` `ABIERTA` del mismo
 * producto/pedido, aplica la porción que corresponda a su cumplimiento
 * (nunca más de su pendiente real) y cierra Actividad(es)/Obligación cuando
 * llegan a 0. No toca `Pedido`/`PedidoItem` — responsabilidad exclusiva del
 * caller, sin cambios. Devuelve solo las aplicaciones que sí ocurrieron
 * (informativo — el caller no necesita interpretar nada, ver F3/F2 mismo
 * criterio de "autoridad única, consumidores solo leen el resultado").
 */
export async function aplicarEntregaConObligacion(
  tx: TransactionClient,
  pedidoId: string,
  entregas: EntregaAValidar[],
  actorId?: string,
): Promise<AplicacionObligacion[]> {
  const activas = await tx.obligacionPendiente.findMany({
    where: { pedidoId, estado: 'ABIERTA' },
    select: { id: true, producto: true, cantidadOriginal: true },
  })
  if (activas.length === 0) return []

  const activaPorProducto = new Map(activas.map(o => [o.producto, o]))
  const resultados: AplicacionObligacion[] = []

  for (const e of entregas) {
    const activa = activaPorProducto.get(e.producto)
    if (!activa) continue

    const limiteOrdinario = e.cantPedido - activa.cantidadOriginal
    const disponibleOrdinario = Math.max(0, limiteOrdinario - e.cantEntregaActual)
    const haciaObligacion = e.cantidadAEntregar - Math.min(e.cantidadAEntregar, disponibleOrdinario)
    if (haciaObligacion <= 0) continue

    // Lock OBLIGACION:{id} DENTRO de la tx ya abierta — serializa contra
    // cambiar-modo/liberar/reprogramar concurrentes sobre esta misma obligación.
    await acquireAdvisoryLockTx(tx, 'OBLIGACION', activa.id)

    // Re-lectura FRESCA bajo el lock — cantidadCumplida pudo cambiar entre
    // el findMany de arriba (fuera del lock) y este punto.
    const obligacion = await tx.obligacionPendiente.findUniqueOrThrow({ where: { id: activa.id } })
    const obligacionPendienteRestante = obligacion.cantidadOriginal - obligacion.cantidadCumplida

    if (haciaObligacion > obligacionPendienteRestante) {
      throw new EntregaExcedePendienteTotalError(e.producto)
    }

    const aplicarAObligacion = Math.min(haciaObligacion, obligacionPendienteRestante)
    if (aplicarAObligacion <= 0) continue

    // Distribuir sobre las Actividades abiertas (ASIGNADA/EN_PROGRESO) de
    // esta obligación, en orden de creación — llena cada una hasta su propio
    // `cantidad` antes de pasar a la siguiente. Caso común (una sola
    // Actividad = toda la obligación, creada por GestionarPendienteUseCase):
    // un solo ciclo.
    const actividadesAbiertas = await tx.actividad.findMany({
      where: { obligacionId: obligacion.id, estado: { in: ['ASIGNADA', 'EN_PROGRESO'] } },
      orderBy: { createdAt: 'asc' },
    })

    let restante = aplicarAObligacion
    for (const actividad of actividadesAbiertas) {
      if (restante <= 0) break
      const puedeAbsorber = actividad.cantidad - actividad.cantidadCumplida
      if (puedeAbsorber <= 0) continue
      const aplicarAActividad = Math.min(restante, puedeAbsorber)
      const nuevaCantidadCumplida = actividad.cantidadCumplida + aplicarAActividad
      await tx.actividad.update({
        where: { id: actividad.id },
        data: {
          cantidadCumplida: nuevaCantidadCumplida,
          estado: nuevaCantidadCumplida >= actividad.cantidad ? 'CUMPLIDA' : actividad.estado,
        },
      })
      restante -= aplicarAActividad
    }

    // Invariante (contrato §7, chk_obligacion_no_sobreconsumo): cumplida +
    // asignada <= original. Cumplir mueve unidades de "asignada" a
    // "cumplida" — la suma no cambia, nunca se libera capacidad de más.
    const nuevaCantidadCumplidaObligacion = obligacion.cantidadCumplida + aplicarAObligacion
    const nuevaCantidadAsignadaObligacion = Math.max(0, obligacion.cantidadAsignada - aplicarAObligacion)
    const obligacionCumplida = nuevaCantidadCumplidaObligacion >= obligacion.cantidadOriginal
    await tx.obligacionPendiente.update({
      where: { id: obligacion.id },
      data: {
        cantidadCumplida: nuevaCantidadCumplidaObligacion,
        cantidadAsignada: nuevaCantidadAsignadaObligacion,
        estado: obligacionCumplida ? 'CUMPLIDA' : obligacion.estado,
      },
    })

    await logAudit({
      entidad: 'ObligacionPendiente',
      registroId: obligacion.id,
      accion: 'UPDATE',
      datos: {
        reconexionCumplimiento: true,
        producto: e.producto,
        aplicado: aplicarAObligacion,
        cantidadCumplida: nuevaCantidadCumplidaObligacion,
        cantidadOriginal: obligacion.cantidadOriginal,
        cumplida: obligacionCumplida,
      },
      usuarioId: actorId,
    }, tx)

    resultados.push({
      producto: e.producto,
      obligacionId: obligacion.id,
      aplicado: aplicarAObligacion,
      obligacionCumplida,
    })
  }

  return resultados
}
