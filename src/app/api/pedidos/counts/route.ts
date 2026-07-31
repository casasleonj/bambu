import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { calcularAlertas } from '@/lib/alertas-detector'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { subDaysBogota } from '@/lib/dates'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    // Fiados: pedidos entregados con saldo pendiente, agrupados por cliente.
    const fiados = await prisma.pedido.findMany({
      where: {
        estadoEntrega: 'ENTREGADO',
        saldo: { gt: 0 },
        clienteId: { not: CANONICAL_CONSUMIDOR_FINAL_ID },
      },
      select: { clienteId: true },
      distinct: ['clienteId'],
    })

    // Alertas: detector necesita un subconjunto de campos. Limitamos a 365 días
    // para evitar full table scan en producción mientras mantenemos casi total
    // paridad con el tab Alertas (que usa historial completo). Las reglas de
    // ventanas ≤30 días (hoy, 7d fiado, 30d repetido) están cubiertas. Reglas que
    // miran el historial completo (mediana últimos 5 pedidos, último precio)
    // pueden tener un drift residual para clientes con pedidos >365 días.
    const hace365Dias = subDaysBogota(365)
    const pedidos = await prisma.pedido.findMany({
      where: {
        clienteId: { not: CANONICAL_CONSUMIDOR_FINAL_ID },
        fecha: { gte: hace365Dias },
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
        fecha: true,
        total: true,
        saldo: true,
        estadoEntrega: true,
        estadoPago: true,
        disputaAbierta: true,
        promesaPagoFecha: true,
        cPacaAguaPed: true,
        cPacaHieloPed: true,
        cBotellonFabPed: true,
        cBotellonDomPed: true,
        cBolsaAguaPed: true,
        cBolsaHieloPed: true,
        precioPacaAgua: true,
        precioPacaHielo: true,
        precioBotellonFab: true,
        precioBotellonDom: true,
        precioBolsaAgua: true,
        precioBolsaHielo: true,
        items: {
          select: {
            producto: true,
            cantPedido: true,
            precio: true,
            precioOrigen: true,
            autorizadoPorAdmin: true,
          },
        },
      },
      orderBy: { fecha: 'desc' },
    })

    const alertas = calcularAlertas(
      pedidos.map((p) => ({
        id: p.id,
        numero: p.numero,
        clienteId: p.clienteId,
        fecha: p.fecha.toISOString(),
        total: Number(p.total),
        saldo: Number(p.saldo),
        estadoEntrega: p.estadoEntrega,
        estadoPago: p.estadoPago,
        disputaAbierta: p.disputaAbierta ?? undefined,
        promesaPagoFecha: p.promesaPagoFecha?.toISOString() ?? undefined,
        items: p.items.map((i) => ({
          producto: i.producto,
          cantPedido: i.cantPedido,
          precio: Number(i.precio),
          precioOrigen: i.precioOrigen ?? undefined,
          autorizadoPorAdmin: i.autorizadoPorAdmin ?? undefined,
        })),
        cPacaAguaPed: p.cPacaAguaPed,
        cPacaHieloPed: p.cPacaHieloPed,
        cBotellonFabPed: p.cBotellonFabPed,
        cBotellonDomPed: p.cBotellonDomPed,
        cBolsaAguaPed: p.cBolsaAguaPed,
        cBolsaHieloPed: p.cBolsaHieloPed,
        precioPacaAgua: Number(p.precioPacaAgua),
        precioPacaHielo: Number(p.precioPacaHielo),
        precioBotellonFab: Number(p.precioBotellonFab),
        precioBotellonDom: Number(p.precioBotellonDom),
        precioBolsaAgua: Number(p.precioBolsaAgua),
        precioBolsaHielo: Number(p.precioBolsaHielo),
      })),
    )

    return apiSuccess({
      fiadosCount: fiados.length,
      alertasCount: alertas.length,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching pedidos counts:')
    return apiError('Error cargando contadores', 500)
  }
}
