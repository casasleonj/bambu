import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCronSecret } from '@/lib/cron-auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * POST /api/cron/generar-deudas-trabajador
 *
 * B4: Fiado → DeudaTrabajador automático.
 *
 * Lógica:
 * 1. Buscar Pedidos con:
 *    - estadoPago = 'PARCIAL'
 *    - estadoEntrega = 'ENTREGADO'
 *    - saldo > 0
 *    - embarqueId IS NOT NULL (ignorar ventas rápidas)
 *    - createdAt < NOW() - N days (default 7, configurable via env DIAS_VENCIMIENTO_FIADO)
 * 2. Para cada uno, verificar que NO exista DeudaTrabajador con el mismo embarqueId + descripcion
 *    (dedup via description match)
 * 3. Crear DeudaTrabajador con:
 *    - trabajadorId = embarque.trabajadorId (asignar al último repartidor)
 *    - tipo = 'DEFICIT_EFECTIVO'
 *    - montoOriginal = saldo
 *    - montoPendiente = saldo
 *    - descripcion = `Fiado no cobrado: Pedido #N (Cliente X)`
 *    - embarqueId = X
 *
 * Idempotente: corre diario, dedup via description match.
 * Auth: requireCronSecret.
 */
export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    const diasVencimiento = parseInt(process.env.DIAS_VENCIMIENTO_FIADO || '7', 10)
    const fechaLimite = new Date(Date.now() - diasVencimiento * 24 * 60 * 60 * 1000)

    // 1. Buscar pedidos fiados entregados con saldo, con embarque, antiguos
    const pedidosCandidatos = await prisma.pedido.findMany({
      where: {
        estadoPago: 'PARCIAL',
        estadoEntrega: 'ENTREGADO',
        embarqueId: { not: null },
        createdAt: { lt: fechaLimite },
        saldo: { gt: 0 },
      },
      include: {
        cliente: { select: { nombre: true, apellido: true } },
        embarque: {
          select: {
            id: true,
            trabajadorId: true,
            trabajador: { select: { nombre: true } },
          },
        },
      },
      take: 100, // límite para no procesar miles en una corrida
    })

    logger.info({
      count: pedidosCandidatos.length,
      diasVencimiento,
    }, 'Cron deudas-trabajador: candidatos encontrados')

    // 2. Filtrar los que ya tienen DeudaTrabajador
    const embarqueIds = pedidosCandidatos
      .map((p) => p.embarqueId)
      .filter((id): id is string => id !== null)
    const deudasExistentes = await prisma.deudaTrabajador.findMany({
      where: {
        embarqueId: { in: embarqueIds },
        descripcion: { startsWith: 'Fiado no cobrado' },
      },
      select: { embarqueId: true, descripcion: true },
    })
    const setExistentes = new Set(
      deudasExistentes.map((d) => `${d.embarqueId}::${d.descripcion}`)
    )

    // 3. Crear deudas nuevas
    const nuevasDeudas: any[] = []
    const saltados: any[] = []
    for (const p of pedidosCandidatos) {
      if (!p.embarqueId || !p.embarque) {
        saltados.push({ pedidoId: p.id, motivo: 'sin embarque' })
        continue
      }
      const descripcion = `Fiado no cobrado: Pedido #${p.numero} (Cliente ${p.cliente.nombre}${p.cliente.apellido ? ' ' + p.cliente.apellido : ''})`
      const key = `${p.embarqueId}::${descripcion}`
      if (setExistentes.has(key)) {
        saltados.push({ pedidoId: p.id, motivo: 'ya existe deuda' })
        continue
      }
      const monto = Number(p.saldo)
      if (monto <= 0) {
        saltados.push({ pedidoId: p.id, motivo: 'saldo 0' })
        continue
      }
      try {
        const deuda = await prisma.deudaTrabajador.create({
          data: {
            trabajadorId: p.embarque.trabajadorId,
            tipo: 'DEFICIT_EFECTIVO',
            montoOriginal: monto,
            montoPendiente: monto,
            descripcion,
            embarqueId: p.embarqueId,
          },
        })
        nuevasDeudas.push({
          id: deuda.id,
          pedidoId: p.id,
          trabajadorId: p.embarque.trabajadorId,
          monto,
        })
      } catch (err) {
        // Si falla por unique constraint, continuar
        saltados.push({ pedidoId: p.id, motivo: `error: ${err instanceof Error ? err.message : 'unknown'}` })
      }
    }

    logger.info({
      nuevas: nuevasDeudas.length,
      saltados: saltados.length,
    }, 'Cron deudas-trabajador: ejecución completa')

    return apiSuccess({
      message: `${nuevasDeudas.length} deudas creadas, ${saltados.length} saltadas`,
      candidatas: pedidosCandidatos.length,
      nuevas: nuevasDeudas,
      saltados,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Cron error generando deudas:')
    return apiError('Error en generacion automatica', 500)
  }
}
