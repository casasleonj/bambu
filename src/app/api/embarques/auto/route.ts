import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

const EmbarqueAutoSchema = z.object({
  rutaId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
})

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

      // 3. Find available repartidores
      const repartidores = await tx.trabajador.findMany({
        where: {
          rol: 'REPARTIDOR',
          activo: true,
          usaMoto: true,
        },
      })

      if (repartidores.length === 0) {
        throw new Error('NO_REPARTIDORES')
      }

      // 4. Create embarques for each group
      const embarquesCreados = []

      for (const [key, pedidosGrupo] of grupos) {
        const ruta = key !== 'SIN_RUTA'
          ? await tx.ruta.findUnique({ where: { id: key } })
          : null

        // Use route's repartidor if available, otherwise round-robin
        let repartidor = repartidores.find((r: { id: string }) => r.id === ruta?.repartidorId)
        if (!repartidor) {
          // Fallback to round-robin based on hash of key for consistency
          const hash = key.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
          repartidor = repartidores[hash % repartidores.length]
        }
        if (!repartidor) break

        const nextNum = await getNextNumero(tx, { model: 'embarque' })

        const embarque = await tx.embarque.create({
          data: {
            numero: nextNum,
            trabajadorId: repartidor.id,
            rutaId: ruta?.id || null,
            estado: 'ABIERTO',
            obs: `Auto-generado: ${pedidosGrupo.length} pedidos`,
          },
        })

        // Assign pedidos to embarque
        await tx.pedido.updateMany({
          where: {
            id: { in: pedidosGrupo.map((p: { id: string }) => p.id) },
          },
          data: {
            embarqueId: embarque.id,
            estado: 'EN_RUTA',
          },
        })

        embarquesCreados.push({
          embarque,
          pedidosCount: pedidosGrupo.length,
          rutaNombre: ruta?.nombre || pedidosGrupo[0].negocio?.nombre || pedidosGrupo[0].cliente?.barrio || 'Sin ruta',
        })
      }

      return {
        created: embarquesCreados.length,
        embarques: embarquesCreados,
        message: `${embarquesCreados.length} embarque(s) creado(s) con ${pedidosPendientes.length} pedido(s)`,
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
