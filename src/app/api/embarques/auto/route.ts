import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { z } from 'zod'

const EmbarqueAutoSchema = z.object({
  rutaId: z.string().uuid().optional(),
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
      return NextResponse.json({ error: 'Parámetros inválidos', details: validation.error.flatten() }, { status: 400 })
    }
    const body = await request.json()
    const validation = EmbarqueAutoSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: validation.error.flatten() }, { status: 400 })
    }
    const result = await prisma.$transaction(async (tx) => {
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
        },
      })

      if (pedidosPendientes.length === 0) {
        return { created: 0, message: 'No hay pedidos pendientes para embarcar' }
      }

      // 2. Group by ruta (or barrio as fallback)
      const grupos = new Map<string, typeof pedidosPendientes>()
      for (const pedido of pedidosPendientes) {
        const key = pedido.cliente?.rutaId || pedido.cliente?.barrio || 'SIN_RUTA'
        if (!grupos.has(key)) grupos.set(key, [])
        grupos.get(key)!.push(pedido)
      }

      // 3. Find available repartidores
      const repartidores = await tx.trabajador.findMany({
        where: {
          rol: 'REPARTIDOR',
          activo: true,
        },
      })

      // 4. Create embarques for each group
      const embarquesCreados = []

      for (const [key, pedidosGrupo] of grupos) {
        const ruta = key !== 'SIN_RUTA'
          ? await tx.ruta.findUnique({ where: { id: key } })
          : null

        // Use route's repartidor if available, otherwise round-robin
        let repartidor = repartidores.find(r => r.id === ruta?.repartidorId)
        if (!repartidor) {
          // Fallback to round-robin based on hash of key for consistency
          const hash = key.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
          repartidor = repartidores[hash % repartidores.length]
        }
        if (!repartidor) break

        const lastEmbarque = await tx.embarque.findFirst({
          orderBy: { numero: 'desc' },
        })
        const nextNum = (lastEmbarque?.numero || 0) + 1

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
            id: { in: pedidosGrupo.map(p => p.id) },
          },
          data: {
            embarqueId: embarque.id,
            estado: 'EN_RUTA',
          },
        })

        embarquesCreados.push({
          embarque,
          pedidosCount: pedidosGrupo.length,
          rutaNombre: ruta?.nombre || pedidosGrupo[0].cliente?.barrio || 'Sin ruta',
        })
      }

      return {
        created: embarquesCreados.length,
        embarques: embarquesCreados,
        message: `${embarquesCreados.length} embarque(s) creado(s) con ${pedidosPendientes.length} pedido(s)`,
      }
    })

    await logAudit({
      entidad: 'Embarque',
      registroId: 'AUTO',
      accion: 'CREATE',
      datos: { auto: true, count: result.created },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Error auto-generating embarques:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json(
      { error: 'Error al generar embarques automáticos' },
      { status: 500 }
    )
  }
}
