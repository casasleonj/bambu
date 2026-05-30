import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { PESOS_KG } from '@/lib/embarque-capacidad'

const EmbarqueAutoSchema = z.object({
  rutaId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
})

const MAX_UNIDADES = 70

function unidadesPedido(p: {
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
}): number {
  return (
    (p.cPacaAguaPed || 0) +
    (p.cPacaHieloPed || 0) +
    (p.cBotellonFabPed || 0) +
    (p.cBotellonDomPed || 0) +
    (p.cBolsaAguaPed || 0) +
    (p.cBolsaHieloPed || 0)
  )
}

function pesoPedido(p: {
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
}): number {
  return (
    (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
    (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
    (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
    (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
    (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
    (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
  )
}

/**
 * Split a group of pedidos into chunks that don't exceed MAX_UNIDADES.
 * Uses a greedy approach: adds pedidos to current chunk until adding the next
 * would exceed the limit, then starts a new chunk.
 */
type PedidoConRuta = {
  id: string
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
  cliente?: { rutaId?: string | null; barrio?: string | null; nombre?: string | null } | null
  negocio?: { rutaId?: string | null; barrio?: string | null; nombre?: string | null } | null
}

function splitPedidosByCapacity(pedidos: PedidoConRuta[]): PedidoConRuta[][] {
  const chunks: PedidoConRuta[][] = []
  let chunkActual: PedidoConRuta[] = []
  let unidadesChunk = 0

  for (const pedido of pedidos) {
    const unidades = unidadesPedido(pedido)
    // If a single pedido exceeds MAX_UNIDADES, put it in its own chunk
    if (unidades > MAX_UNIDADES) {
      if (chunkActual.length > 0) {
        chunks.push(chunkActual)
        chunkActual = []
        unidadesChunk = 0
      }
      chunks.push([pedido])
      continue
    }
    // If adding this pedido would exceed the limit, start a new chunk
    if (unidadesChunk + unidades > MAX_UNIDADES && chunkActual.length > 0) {
      chunks.push(chunkActual)
      chunkActual = []
      unidadesChunk = 0
    }
    chunkActual.push(pedido)
    unidadesChunk += unidades
  }
  if (chunkActual.length > 0) {
    chunks.push(chunkActual)
  }
  return chunks
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const validation = EmbarqueAutoSchema.safeParse(body)
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400)
    }
    const result = await withAdvisoryLock('EMBARQUE', async (tx: any) => {
      // 1. Find all PENDIENTE pedidos without embarque
      const pedidosPendientes = await tx.pedido.findMany({
        where: {
          estado: 'PENDIENTE',
          embarqueId: null,
        },
        include: {
          cliente: {
            select: {
              rutaId: true,
              barrio: true,
              nombre: true,
            },
          },
          negocio: {
            select: {
              rutaId: true,
              barrio: true,
              nombre: true,
            },
          },
        },
      })

      if (pedidosPendientes.length === 0) {
        return { created: 0, message: 'No hay pedidos pendientes para embarcar' }
      }

      // 2. Group by ruta (negocio.rutaId > cliente.rutaId > negocio.barrio > cliente.barrio)
      const grupos = new Map<string, typeof pedidosPendientes>()
      for (const pedido of pedidosPendientes) {
        // NEGOCIO COMPATIBILITY: negocio fields take priority, fallback to cliente
        const rutaKey = pedido.negocio?.rutaId ?? pedido.cliente?.rutaId
        const barrioKey = pedido.negocio?.barrio ?? pedido.cliente?.barrio
        const key = rutaKey || barrioKey || 'SIN_RUTA'
        if (!grupos.has(key)) grupos.set(key, [])
        grupos.get(key)!.push(pedido)
      }

      // 3. Find available repartidores (exclude those with EN_RUTA embarque)
      const repartidores = await tx.trabajador.findMany({
        where: {
          rol: 'REPARTIDOR',
          activo: true,
          usaMoto: true,
        },
      })

      const repartidoresConEnRuta = await tx.embarque.findMany({
        where: { estado: 'EN_RUTA' },
        select: { trabajadorId: true },
        distinct: ['trabajadorId'],
      })
      const idsEnRuta = new Set(repartidoresConEnRuta.map((e: { trabajadorId: string }) => e.trabajadorId))
      const repartidoresDisponibles = repartidores.filter((r: { id: string }) => !idsEnRuta.has(r.id))

      if (repartidores.length === 0) {
        throw new Error('NO_REPARTIDORES')
      }

      // 4. Create embarques for each group, splitting if exceeds MAX_UNIDADES
      const embarquesCreados = []
      const gruposSinAsignar: Array<{ ruta: string; pedidosCount: number; unidades: number }> = []

      for (const [key, pedidosGrupo] of grupos) {
        const ruta = key !== 'SIN_RUTA'
          ? await tx.ruta.findUnique({ where: { id: key } })
          : null

        // Use route's repartidor if available and not EN_RUTA, otherwise round-robin
        let repartidor = repartidoresDisponibles.find((r: { id: string }) => r.id === ruta?.repartidorId)
        if (!repartidor && repartidoresDisponibles.length > 0) {
          // Fallback to round-robin based on hash of key for consistency
          const hash = key.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
          repartidor = repartidoresDisponibles[hash % repartidoresDisponibles.length]
        }

        if (!repartidor) {
          // No repartidor disponible para este grupo - dejar pedidos PENDIENTE
          const totalUnidadesGrupo = pedidosGrupo.reduce((s: number, p: PedidoConRuta) => s + unidadesPedido(p), 0)
          gruposSinAsignar.push({
            ruta: ruta?.nombre || key,
            pedidosCount: pedidosGrupo.length,
            unidades: totalUnidadesGrupo,
          })
          continue
        }

        // Split group into chunks that don't exceed MAX_UNIDADES
        const chunks = splitPedidosByCapacity(pedidosGrupo)

        for (const chunk of chunks) {
          const nextNum = await getNextNumero(tx, { model: 'embarque' })
          const totalUnidadesChunk = chunk.reduce((s, p) => s + unidadesPedido(p), 0)
          const totalPesoChunk = chunk.reduce((s, p) => s + pesoPedido(p), 0)

          const embarque = await tx.embarque.create({
            data: {
              numero: nextNum,
              trabajadorId: repartidor.id,
              rutaId: ruta?.id || null,
              estado: 'ABIERTO',
              obs: `Auto-generado: ${chunk.length} pedidos, ${totalUnidadesChunk} unidades, ${totalPesoChunk.toFixed(0)}kg`,
            },
          })

          // Assign pedidos to embarque
          await tx.pedido.updateMany({
            where: {
              id: { in: chunk.map((p: { id: string }) => p.id) },
            },
            data: {
              embarqueId: embarque.id,
              estado: 'EN_RUTA',
            },
          })

          embarquesCreados.push({
            embarque,
            pedidosCount: chunk.length,
            unidades: totalUnidadesChunk,
            pesoKg: totalPesoChunk,
            rutaNombre: ruta?.nombre || chunk[0].negocio?.nombre || chunk[0].cliente?.barrio || 'Sin ruta',
          })
        }
      }

      const pedidosAsignados = pedidosPendientes.length - gruposSinAsignar.reduce((s, g) => s + g.pedidosCount, 0)
      let message = `${embarquesCreados.length} embarque(s) creado(s) con ${pedidosAsignados} pedido(s)`
      if (gruposSinAsignar.length > 0) {
        message += `. ${gruposSinAsignar.length} grupo(s) sin repartidor disponible`
      }

      return {
        created: embarquesCreados.length,
        embarques: embarquesCreados,
        gruposSinAsignar,
        message,
      }
    })

    logAudit({
      entidad: 'Embarque',
      registroId: 'AUTO',
      accion: 'CREATE',
      datos: { auto: true, count: result.created },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_REPARTIDORES') {
      return apiError('No hay repartidores activos para generar embarques', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error auto-generating embarques:')
    return apiError('Error al generar embarques automáticos', 500)
  }
}
