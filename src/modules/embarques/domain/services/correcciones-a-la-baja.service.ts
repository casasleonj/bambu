/**
 * Pedidos corregidos a la baja después de que el embarque salió (#712, ADR-CIERRE-002 §5).
 *
 * Cuenta las reducciones comerciales y las correcciones de precio APLICADAS (resueltas) desde que
 * el embarque salió, sobre pedidos de ese embarque. Es un AVISO para revisar el cierre: nunca
 * bloquea ni cambia dinero. Una corrección al alza (delta ≥ 0) no cuenta.
 */

export interface CorreccionesALaBaja {
  pedidos: number
  /** Cuánto bajó el total entre todas (valor positivo). */
  monto: number
}

export function agregarCorreccionesALaBaja(
  filas: Array<{ pedidoId: string; baja: number }>,
): CorreccionesALaBaja {
  const pedidos = new Set<string>()
  let monto = 0
  for (const f of filas) {
    if (!(f.baja > 0)) continue
    pedidos.add(f.pedidoId)
    monto += f.baja
  }
  return { pedidos: pedidos.size, monto: Math.round(monto * 100) / 100 }
}

/** Cliente mínimo de Prisma (o transacción) que necesita la lectura. */
export interface CorreccionesReader {
  pedidoReduccionComercial: {
    findMany(args: {
      where: { estado: 'APLICADA'; resueltoAt: { gte: Date }; pedido: { embarqueId: string } }
      select: { pedidoId: true; monto: true }
    }): Promise<Array<{ pedidoId: string; monto: unknown }>>
  }
  pedidoCorreccionPrecio: {
    findMany(args: {
      where: {
        estado: 'APLICADA'
        resueltoAt: { gte: Date }
        delta: { lt: 0 }
        pedido: { embarqueId: string }
      }
      select: { pedidoId: true; delta: true }
    }): Promise<Array<{ pedidoId: string; delta: unknown }>>
  }
}

export async function leerCorreccionesALaBaja(
  client: CorreccionesReader,
  embarqueId: string,
  desde: Date,
): Promise<CorreccionesALaBaja> {
  const [reducciones, correcciones] = await Promise.all([
    client.pedidoReduccionComercial.findMany({
      where: { estado: 'APLICADA', resueltoAt: { gte: desde }, pedido: { embarqueId } },
      select: { pedidoId: true, monto: true },
    }),
    client.pedidoCorreccionPrecio.findMany({
      where: { estado: 'APLICADA', resueltoAt: { gte: desde }, delta: { lt: 0 }, pedido: { embarqueId } },
      select: { pedidoId: true, delta: true },
    }),
  ])
  return agregarCorreccionesALaBaja([
    ...reducciones.map((r) => ({ pedidoId: r.pedidoId, baja: Number(r.monto) })),
    ...correcciones.map((c) => ({ pedidoId: c.pedidoId, baja: -Number(c.delta) })),
  ])
}
