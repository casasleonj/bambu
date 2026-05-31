import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/cron/vencimiento-promesas
 * Runs daily at 6am. Checks for pedidos with expired payment promises.
 * Protected by CRON_SECRET via x-cron-secret header.
 */
export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    const ahora = new Date()

    const pedidosVencidos = await prisma.pedido.findMany({
      where: {
        promesaPagoFecha: { lt: ahora },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'VENCIDO', 'ANULADO'] },
        estadoEntrega: { not: 'ANULADO' },
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
        promesaPagoFecha: true,
        estadoPago: true,
        saldo: true,
        cliente: { select: { nombre: true, bloqueado: true } },
      },
    })

    let actualizados = 0
    let clientesBloqueados = 0
    const fallos: string[] = []

    for (const pedido of pedidosVencidos) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Marcar pedido como vencido
          await tx.pedido.update({
            where: { id: pedido.id },
            data: { estadoPago: 'VENCIDO' },
          })

          // 2. Bloquear cliente si no está bloqueado
          if (!pedido.cliente.bloqueado) {
            await tx.cliente.update({
              where: { id: pedido.clienteId },
              data: { bloqueado: true },
            })
            clientesBloqueados++
          }

          // 3. Registrar en historial
          await tx.historial.create({
            data: {
              entidad: 'Pedido',
              registroId: pedido.id,
              accion: 'VENCIMIENTO_PROMESA',
              datos: JSON.stringify({
                numero: pedido.numero,
                promesaPagoFecha: pedido.promesaPagoFecha,
                saldo: Number(pedido.saldo),
                clienteBloqueado: !pedido.cliente.bloqueado,
              }),
            },
          })
        })
        actualizados++
      } catch (e) {
        logger.error({ err: e instanceof Error ? e.message : 'Unknown', pedidoId: pedido.id }, 'Error procesando vencimiento')
        fallos.push(`Pedido #${pedido.numero}`)
      }
    }

    logger.info({ actualizados, clientesBloqueados, fallos: fallos.length }, 'Cron vencimiento-promesas completado')

    return apiSuccess({
      actualizados,
      clientesBloqueados,
      fallos,
      mensaje: `${actualizados} pedido(s) marcado(s) como vencido, ${clientesBloqueados} cliente(s) bloqueado(s)`,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en cron vencimiento-promesas')
    return apiError('Error procesando vencimientos')
  }
}
