import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/** Format currency for display */
function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Build tier label from cantMin/cantMax */
function tierLabel(cantMin: number, cantMax: number | null): string {
  if (cantMax === null) return `${cantMin}+`
  if (cantMin === cantMax) return `${cantMin}`
  return `${cantMin}-${cantMax}`
}

/**
 * GET /api/precios/historial
 * GET /api/precios/historial?producto=PACA_AGUA
 * GET /api/precios/historial?productoId=clxxx...
 *
 * Returns unified price history combining PrecioHistorial (price changes)
 * and Historial (tier lifecycle: CREATE, UPDATE, DELETE, RESTORE).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const permCheck = await requirePermission('view:productos', authResult)
  if (permCheck instanceof Response) return permCheck

  try {
    const url = new URL(request.url)
    const producto = url.searchParams.get('producto')
    const productoId = url.searchParams.get('productoId')

    if (!producto && !productoId) {
      return apiError('Debe proporcionar producto o productoId', 400)
    }

    // 1. Fetch PrecioHistorial entries (price changes)
    const precioHistorial = await prisma.precioHistorial.findMany({
      where: producto ? { producto } : {},
      orderBy: { vigenteDesde: 'desc' },
    })

    // 2. Fetch all Historial entries for PrecioVolumen
    const auditEntries = await prisma.historial.findMany({
      where: { entidad: 'PrecioVolumen' },
      orderBy: { fecha: 'desc' },
    })

    // 3. Build map: registroId -> tier data from existing PrecioVolumen rows
    const allTiers = await prisma.precioVolumen.findMany({
      select: { id: true, productoId: true, cantMin: true, cantMax: true, precio: true },
    })
    const tierMap = new Map<string, { productoId: string; cantMin: number; cantMax: number | null; precio: string }>()
    for (const t of allTiers) {
      tierMap.set(t.id, { productoId: t.productoId, cantMin: t.cantMin, cantMax: t.cantMax, precio: t.precio.toString() })
    }

    // 4. Build user map to avoid N+1 queries
    const userIds = [...new Set(auditEntries.map(e => e.usuarioId).filter((id): id is string => Boolean(id)))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    })
    const userMap = new Map<string, string>()
    for (const u of users) {
      userMap.set(u.id, u.username || 'Sistema')
    }

    // 4. Process audit entries, filter by productoId if provided
    type UnifiedEntry = {
      id: string
      fecha: string
      tipo: 'price_change' | 'tier_create' | 'tier_update' | 'tier_delete' | 'tier_restore'
      mensaje: string
      usuario: string
      tierId?: string
      tierExiste?: boolean
      precioAnterior?: number
      precioNuevo?: number
    }

    const unified: UnifiedEntry[] = []

    // Add PrecioHistorial entries
    for (const entry of precioHistorial) {
      unified.push({
        id: entry.id,
        fecha: entry.vigenteDesde.toISOString(),
        tipo: 'price_change',
        mensaje: `Precio cambiado a ${formatCOP(Number(entry.precio))}`,
        usuario: entry.creadoPor,
        precioNuevo: Number(entry.precio),
      })
    }

    // Add Historial entries
    for (const entry of auditEntries) {
      let datos: Record<string, unknown> = {}
      try {
        datos = JSON.parse(entry.datos)
      } catch {
        logger.warn({ registroId: entry.registroId }, 'Failed to parse Historial datos')
      }

      // Resolve productoId for this entry
      const entryProductoId = (datos.productoId as string) || tierMap.get(entry.registroId)?.productoId
      if (productoId && entryProductoId !== productoId) continue

      // Resolve tier context
      const cantMin = datos.cantMin as number | undefined
      const cantMax = datos.cantMax as number | null | undefined
      const precio = datos.precio as number | undefined
      const tierLabelStr = (cantMin !== undefined && cantMax !== undefined) ? tierLabel(cantMin, cantMax) : undefined

      // Check if tier still exists in DB
      const tierExists = tierMap.has(entry.registroId)

      const accion = entry.accion

      let tipo: UnifiedEntry['tipo']
      let mensaje: string
      let tierId: string | undefined
      let tierExiste: boolean | undefined
      let precioAnterior: number | undefined
      let precioNuevo: number | undefined

      switch (accion) {
        case 'CREATE':
          tipo = 'tier_create'
          mensaje = tierLabelStr
            ? `Rango ${tierLabelStr} creado a ${formatCOP(precio ?? 0)}`
            : `Rango creado (ID: ${entry.registroId.slice(-6)})`
          tierId = entry.registroId
          tierExiste = tierExists
          precioNuevo = precio
          break

        case 'UPDATE':
          tipo = 'tier_update'
          precioAnterior = datos.precioAnterior as number | undefined
          precioNuevo = datos.precioNuevo as number | undefined
          mensaje = tierLabelStr
            ? `Rango ${tierLabelStr} precio: ${precioAnterior !== undefined ? formatCOP(precioAnterior) : '?'} → ${precioNuevo !== undefined ? formatCOP(precioNuevo) : '?'}`
            : `Precio de rango actualizado`
          tierId = entry.registroId
          tierExiste = tierExists
          break

        case 'DELETE':
          tipo = 'tier_delete'
          mensaje = tierLabelStr
            ? `Rango ${tierLabelStr} eliminado`
            : `Rango eliminado (ID: ${entry.registroId.slice(-6)})`
          tierId = entry.registroId
          tierExiste = tierExists
          break

        case 'RESTORE':
          tipo = 'tier_restore'
          mensaje = tierLabelStr
            ? `Rango ${tierLabelStr} restaurado`
            : `Rango restaurado (ID: ${entry.registroId.slice(-6)})`
          tierId = entry.registroId
          tierExiste = true
          break

        default:
          tipo = 'tier_create'
          mensaje = `Acción ${accion} en rango ${entry.registroId.slice(-6)}`
          tierId = entry.registroId
          tierExiste = tierExists
      }

      // Resolve usuario from userMap
      const usuarioFinal = (entry.usuarioId && userMap.has(entry.usuarioId))
        ? userMap.get(entry.usuarioId)!
        : 'Sistema'

      unified.push({
        id: entry.id,
        fecha: entry.fecha.toISOString(),
        tipo,
        mensaje,
        usuario: usuarioFinal,
        tierId,
        tierExiste,
        precioAnterior,
        precioNuevo,
      })
    }

    // Sort by date descending
    unified.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    return apiSuccess({ historial: unified })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching unified precio historial:')
    return apiError('Error cargando historial de precios')
  }
}
