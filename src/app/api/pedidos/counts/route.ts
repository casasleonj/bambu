import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { calcularAlertas } from '@/lib/alertas-detector'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { subDaysBogota } from '@/lib/dates'
import { countPedidosAtrasadosSinAsignar, countPedidosHoyEnRiesgo } from '@/lib/pedidos-sin-asignar'
import { leerExigibles } from '@/lib/entregas-exigibles-db'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    // #656: clientes, pedidos e importe salen de la misma deuda entregada global.
    const cartera = await prisma.$transaction(async tx => {
      const where: Prisma.PedidoWhereInput = { saldo: { gt: 0 },
        estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] },
        clienteId: { not: CANONICAL_CONSUMIDOR_FINAL_ID } }
      const [exigibles, titulares] = await Promise.all([
        leerExigibles(tx, where),
        tx.pedido.findMany({ where, select: { id: true, clienteId: true } }),
      ])
      const conDeuda = titulares.filter(p => (exigibles.get(p.id) ?? 0) > 0)
      return {
        clientes: new Set(conDeuda.map(p => p.clienteId)).size,
        pedidos: conDeuda.length,
        total: conDeuda.reduce((s, p) => s + Math.round((exigibles.get(p.id) ?? 0) * 100), 0) / 100,
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 })

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

    const [atrasadosCount, enRiesgoCount, porPlanificarCount, enRutaCount, pendientesN2Count] = await Promise.all([
      countPedidosAtrasadosSinAsignar(),
      countPedidosHoyEnRiesgo(),
      // Foco "Por planificar" — PENDIENTE sin embarque (hoy o atrasados) (blueprint §2.2)
      prisma.pedido.count({ where: { estadoEntrega: 'PENDIENTE', embarqueId: null } }),
      // Foco "En ruta" (blueprint §2.2)
      prisma.pedido.count({ where: { estadoEntrega: 'EN_RUTA' } }),
      // Foco "Pendientes (N2)" — obligaciones de cumplimiento parcial activas
      prisma.obligacionPendiente.count({ where: { estado: 'ABIERTA' } }),
    ])

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
      fiadosCount: cartera.clientes,
      alertasCount: alertas.length,
      atrasadosCount,
      enRiesgoCount,
      porPlanificarCount,
      enRutaCount,
      esperandoPagoCount: cartera.pedidos,
      esperandoPagoTotal: cartera.total,
      pendientesN2Count,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching pedidos counts:')
    return apiError('Error cargando contadores', 500)
  }
}
