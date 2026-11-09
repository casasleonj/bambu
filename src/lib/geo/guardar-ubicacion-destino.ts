import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { mismaUbicacion, aPuntoGeo } from '@/lib/geo/misma-ubicacion'

/**
 * #426 — guardar la ubicación (link o GPS) de un pedido como ubicación del destino para los próximos pedidos.
 *
 * - Dónde: en la tienda/sucursal (`Negocio`) si el pedido es de una tienda; si no, en el cliente. Es la misma
 *   prioridad de `pickCoords` (el negocio gana). Nunca en el cliente anónimo.
 * - No pisa en silencio: si el destino ya tiene otra ubicación, se conserva la anterior salvo que se pida
 *   reemplazarla de forma explícita. Todo cambio se audita con lo anterior y lo nuevo.
 * - Es un efecto aparte del pedido: quien lo llama lo hace DESPUÉS de crear el pedido y tolera el error,
 *   para que un fallo aquí nunca pierda la venta.
 * - `Negocio` no tiene columnas de procedencia (decisión de AGENTS.md): la procedencia va en la auditoría.
 */

export type ResultadoGuardarUbicacion =
  | { resultado: 'GUARDADA' | 'REEMPLAZADA' | 'IGUAL' | 'CONSERVADA'; destino: 'NEGOCIO' | 'CLIENTE'; anterior: { lat: number; lng: number } | null }
  | { resultado: 'SIN_UBICACION' | 'SIN_DESTINO' }

const igual = mismaUbicacion
const aPunto = aPuntoGeo

export async function guardarUbicacionDestino(args: {
  clienteId: string
  negocioId?: string | null
  lat?: number | null
  lng?: number | null
  reemplazar?: boolean
  pedidoId: string
  usuarioId?: string | null
}, db: Pick<typeof prisma, 'cliente' | 'negocio'> = prisma): Promise<ResultadoGuardarUbicacion> {
  const nueva = aPunto(args.lat, args.lng)
  if (!nueva) return { resultado: 'SIN_UBICACION' }

  const auditar = (entidad: 'Negocio' | 'Cliente', registroId: string, anterior: { lat: number; lng: number } | null, resultado: string) =>
    logAudit({
      entidad, registroId, accion: 'UPDATE',
      datos: { evento: 'UBICACION_GUARDADA_DESDE_PEDIDO', resultado, pedidoId: args.pedidoId, anterior, nueva },
      usuarioId: args.usuarioId ?? undefined,
    }).catch(() => {})

  if (args.negocioId) {
    const negocio = await db.negocio.findFirst({ where: { id: args.negocioId, clienteId: args.clienteId }, select: { id: true, lat: true, lng: true } })
    if (!negocio) return { resultado: 'SIN_DESTINO' }
    const anterior = aPunto(negocio.lat, negocio.lng)
    if (anterior && igual(anterior, nueva)) return { resultado: 'IGUAL', destino: 'NEGOCIO', anterior }
    if (anterior && !args.reemplazar) return { resultado: 'CONSERVADA', destino: 'NEGOCIO', anterior }
    await db.negocio.update({ where: { id: negocio.id }, data: { lat: nueva.lat, lng: nueva.lng } })
    const resultado = anterior ? 'REEMPLAZADA' : 'GUARDADA'
    await auditar('Negocio', negocio.id, anterior, resultado)
    return { resultado, destino: 'NEGOCIO', anterior }
  }

  if (args.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID) return { resultado: 'SIN_DESTINO' }
  const cliente = await db.cliente.findUnique({ where: { id: args.clienteId }, select: { id: true, lat: true, lng: true } })
  if (!cliente) return { resultado: 'SIN_DESTINO' }
  const anterior = aPunto(cliente.lat, cliente.lng)
  if (anterior && igual(anterior, nueva)) return { resultado: 'IGUAL', destino: 'CLIENTE', anterior }
  if (anterior && !args.reemplazar) return { resultado: 'CONSERVADA', destino: 'CLIENTE', anterior }
  await db.cliente.update({ where: { id: cliente.id }, data: { lat: nueva.lat, lng: nueva.lng, geocodeOrigen: 'MANUAL', geocodeAt: new Date() } })
  const resultado = anterior ? 'REEMPLAZADA' : 'GUARDADA'
  await auditar('Cliente', cliente.id, anterior, resultado)
  return { resultado, destino: 'CLIENTE', anterior }
}
