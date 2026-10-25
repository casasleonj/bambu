/**
 * Cambios = Σ sustituciones registradas (#446, ADR-SUSTITUCION-001).
 *
 * Antes, «cambios» era un contador libre tecleado en el cierre: sin cliente, sin pedido y
 * sin evidencia, y bajaba el faltante. Ahora la única fuente es el ledger de sustituciones
 * del embarque; el cierre solo lo lee. Lógica pura (sin Prisma).
 */

export interface SustitucionResumen {
  producto: string
  /** Unidades de reemplazo entregadas (movimiento ENTREGA de la sustitución). */
  cantidad: number
  pedidoId?: string | null
  clienteId?: string | null
}

export interface ProductoRetornoInput {
  producto: string
  devueltas: number
  cambios: number
  rotas: number
}

export interface CambiosAgregados {
  porProducto: Record<string, number>
  /** Sustituciones sin pedido ni cliente (registradas antes de que se exigiera destino). */
  sinDestino: number
  /** Sustituciones a un cliente que no tiene pedido en la ruta. */
  aClienteSinPedido: number
}

export function agregarCambios(sustituciones: SustitucionResumen[]): CambiosAgregados {
  const porProducto: Record<string, number> = {}
  let sinDestino = 0
  let aClienteSinPedido = 0
  for (const s of sustituciones) {
    porProducto[s.producto] = (porProducto[s.producto] ?? 0) + s.cantidad
    if (!s.pedidoId && !s.clienteId) sinDestino += 1
    else if (!s.pedidoId && s.clienteId) aClienteSinPedido += 1
  }
  return { porProducto, sinDestino, aClienteSinPedido }
}

/**
 * Fuerza `cambios` = Σ sustituciones por producto.
 *
 * - Si el cliente tecleó un `cambios` distinto de la suma (aunque sea 0 con sustituciones
 *   registradas, o >0 sin ninguna) se rechaza con `CAMBIOS_NO_COINCIDEN`: no se corrige en
 *   silencio, porque el número tecleado suele ser un intento de tapar un faltante.
 * - Un producto con sustituciones que no venía en la lista se agrega (devueltas/rotas = 0).
 */
export function aplicarCambiosDeSustituciones(
  productosRetorno: ProductoRetornoInput[],
  porProducto: Record<string, number>,
): ProductoRetornoInput[] {
  const descuadres = productosRetorno
    .filter((p) => p.cambios !== (porProducto[p.producto] ?? 0))
    .map((p) => `${p.producto}: tecleaste ${p.cambios}, hay ${porProducto[p.producto] ?? 0} registrados`)
  if (descuadres.length > 0) {
    throw new Error(
      `CAMBIOS_NO_COINCIDEN: los cambios deben salir de las sustituciones registradas (${descuadres.join('; ')}). ` +
        'Registra el cambio con «Registrar cambio» en vez de teclearlo.',
    )
  }
  const presentes = new Set(productosRetorno.map((p) => p.producto))
  const faltantes = Object.entries(porProducto)
    .filter(([producto, cantidad]) => cantidad > 0 && !presentes.has(producto))
    .map(([producto, cantidad]) => ({ producto, devueltas: 0, cambios: cantidad, rotas: 0 }))
  return [...productosRetorno, ...faltantes]
}

/** Cliente mínimo de Prisma (o transacción) que necesita la lectura de sustituciones. */
interface SustitucionReader {
  sustitucion: {
    findMany(args: {
      where: { embarqueId: string }
      select: {
        pedidoId: true
        clienteId: true
        movimientoEntrega: { select: { producto: true; cantidad: true } }
      }
    }): Promise<
      Array<{
        pedidoId: string | null
        clienteId: string | null
        movimientoEntrega: { producto: string; cantidad: number }
      }>
    >
  }
}

/**
 * Lee las sustituciones del embarque y devuelve `productosRetorno` con `cambios` = Σ
 * sustituciones, junto con el desglose por destino para las señales.
 * Lanza `CAMBIOS_NO_COINCIDEN` si lo tecleado no cuadra.
 */
export async function resolverCambiosDelCierre(
  client: SustitucionReader,
  embarqueId: string,
  productosRetorno: ProductoRetornoInput[],
): Promise<{ productosRetorno: ProductoRetornoInput[]; cambios: CambiosAgregados }> {
  const filas = await client.sustitucion.findMany({
    where: { embarqueId },
    select: { pedidoId: true, clienteId: true, movimientoEntrega: { select: { producto: true, cantidad: true } } },
  })
  const cambios = agregarCambios(
    filas.map((f) => ({
      producto: f.movimientoEntrega.producto,
      cantidad: f.movimientoEntrega.cantidad,
      pedidoId: f.pedidoId,
      clienteId: f.clienteId,
    })),
  )
  return { productosRetorno: aplicarCambiosDeSustituciones(productosRetorno, cambios.porProducto), cambios }
}
