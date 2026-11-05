import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { acquireAdvisoryLockTx } from '@/lib/locks'
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
        const vencido = await prisma.$transaction(async (tx) => {
          await acquireAdvisoryLockTx(tx, 'PEDIDO', pedido.id)
          const vigente = await tx.pedido.findUnique({ where: { id: pedido.id },
            select: { promesaPagoFecha: true, estadoPago: true } })
          if (!vigente?.promesaPagoFecha || vigente.promesaPagoFecha >= ahora ||
              ['PAGADO', 'ANTICIPADO', 'VENCIDO', 'ANULADO'].includes(vigente.estadoPago)) return false
          const exigibles = await leerExigibles(tx, { id: pedido.id })
          const exigible = exigibles.get(pedido.id) ?? 0
          if (exigible <= 0) return false
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
                saldo: Number(pedido.saldo), exigible,
                clienteBloqueado: !pedido.cliente.bloqueado,
              }),
            },
          })
          return true
        })
        if (vencido) actualizados++
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
