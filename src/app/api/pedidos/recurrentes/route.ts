import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes, type DecisionGeneracion } from '@/lib/recurrentes'
import { z } from 'zod'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { logBulkAudit } from '@/lib/audit'

const DecisionSchema = z.object({
  recurrenteId: z.string().min(1),
  decision: z.enum(['NORMAL', 'CON_PENDIENTES', 'SOLO_PENDIENTES', 'SALTAR']),
})

const GenerarRecurrentesSchema = z.object({
  decisiones: z.array(DecisionSchema).min(1),
  fecha: z.string().datetime().optional(),
})

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const preview = await previewGeneracionRecurrentes()
    return apiSuccess({ preview })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error preview recurrentes:')
    return apiError('Error al generar preview', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = GenerarRecurrentesSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const decisiones: DecisionGeneracion[] = parsed.data.decisiones
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date()

    if (decisiones.length === 0) {
      return apiError('No se proporcionaron decisiones', 400)
    }

    // Race-guard: validate proxGeneracion hasn't shifted since preview
    const plantillasActuales = await prisma.plantillaRecurrente.findMany({
      where: { id: { in: decisiones.map(d => d.recurrenteId) } },
      include: {
        cliente: { select: { id: true, nombre: true, activo: true, bloqueado: true, limitePedidosFiados: true } },
      },
    })
    const cambiadas = plantillasActuales.filter(pt => !pt.proxGeneracion || pt.proxGeneracion > fecha)
    if (cambiadas.length > 0) {
      return apiError('Algunas plantillas ya fueron generadas o modificadas. Recarga el preview.', 409)
    }

    // A7: Check for inactive/blocked clients
    const inactivas = plantillasActuales.filter(pt => !pt.cliente.activo || pt.cliente.bloqueado)
    if (inactivas.length > 0) {
      const nombres = inactivas.map(pt => pt.clienteId).join(', ')
      return apiError(`Clientes inactivos o bloqueados: ${nombres}`, 400)
    }

    // A8: Check fiado limit for all clients
    const limiteConfig = await prisma.config.findUnique({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
    const limiteGlobal = limiteConfig ? parseInt(limiteConfig.valor, 10) || 3 : 3

    const limitesPorCliente = new Map<string, number>()
    for (const pt of plantillasActuales) {
      const limite = pt.cliente.limitePedidosFiados ?? limiteGlobal
      limitesPorCliente.set(pt.clienteId, limite)
    }

    const pedidosPendientesTodos = await prisma.pedido.findMany({
      where: {
        clienteId: { in: Array.from(limitesPorCliente.keys()) },
        estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
      },
      select: { clienteId: true, id: true, numero: true, saldo: true },
    })

    const pendientesPorCliente = new Map<string, number>()
    for (const p of pedidosPendientesTodos) {
      pendientesPorCliente.set(p.clienteId, (pendientesPorCliente.get(p.clienteId) || 0) + 1)
    }

    const clientesEnLimite: string[] = []
    for (const pt of plantillasActuales) {
      const limite = limitesPorCliente.get(pt.clienteId) || 3
      const count = pendientesPorCliente.get(pt.clienteId) || 0
      if (count >= limite) {
        clientesEnLimite.push(`${pt.cliente.nombre} (${count}/${limite})`)
      }
    }
    if (clientesEnLimite.length > 0) {
      return apiError(`Clientes con límite de fiados alcanzado: ${clientesEnLimite.join(', ')}`, 400)
    }

    // A6: Pre-check CON_PENDIENTES/SOLO_PENDIENTES for abonos
    const withPendingDecisions = decisiones.filter(d => d.decision === 'CON_PENDIENTES' || d.decision === 'SOLO_PENDIENTES')
    if (withPendingDecisions.length > 0) {
      const clienteIds = withPendingDecisions.map(d => {
        const pt = plantillasActuales.find(p => p.id === d.recurrenteId)
        return pt?.clienteId
      }).filter(Boolean) as string[]

      if (clienteIds.length > 0) {
        const pedidosConAbonos = await prisma.pedido.findMany({
          where: {
            clienteId: { in: clienteIds },
            estadoEntrega: 'PENDIENTE',
            origen: { not: 'RECURRENTE' },
            totalPagado: { gt: 0 },
          },
          select: { clienteId: true, numero: true },
        })
        if (pedidosConAbonos.length > 0) {
          return apiError('Hay pedidos pendientes con abonos. No se puede usar CON_PENDIENTES o SOLO_PENDIENTES.', 400)
        }
      }
    }

    const resultado = await generarPedidosRecurrentes(decisiones, fecha)

    if (resultado.generados.length > 0) {
      logBulkAudit(
        resultado.generados.map(g => ({
          entidad: 'Pedido',
          registroId: g.id,
          accion: 'CREATE' as const,
          datos: { numero: g.numero, tipo: g.tipo, generadoDesde: 'recurrentes' },
          usuarioId: (authResult.user as { id?: string } | undefined)?.id,
        }))
      ).catch(() => {})
    }

    return apiSuccess({
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      pedidos: resultado.generados,
      saltadosIds: resultado.saltados,
    }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error generando recurrentes:')
    return apiError('Error generando pedidos recurrentes', 500)
  }
}
