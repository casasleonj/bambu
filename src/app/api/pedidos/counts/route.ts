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
import { exigiblesActivos } from '@/lib/exigibles-flag'
import { leerCierresOperativos } from '@/lib/fiados-corte-operativo-db'
import { desglosarPedidoConFIFO } from '@/lib/fiados-corte-operativo'
import { dayInBogota } from '@/lib/date-helpers'

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
        tx.pedido.findMany({ where, select: { id: true, clienteId: true, total: true, totalPagado: true,
          estadoEntrega: true, entregadoAt: true,
          ...(exigiblesActivos() ? { entregasExigibles: { select: { id: true, entregadoAt: true, valorEntregado: true } } } : {}),
        } }),
      ])
      const conDeuda = titulares.filter(p => (exigibles.get(p.id) ?? 0) > 0)
      const ahora = new Date()
      const entradas = conDeuda.map(p => ({
        p,
        entregas: 'entregasExigibles' in p && Array.isArray(p.entregasExigibles) && p.entregasExigibles.length
          ? p.entregasExigibles.map((e: { id: string; entregadoAt: Date; valorEntregado: unknown }) => ({
              id: e.id, entregadoAt: e.entregadoAt, valorEntregado: Number(e.valorEntregado),
            }))
          : p.estadoEntrega === 'ENTREGADO' && p.entregadoAt
            ? [{ id: p.id, entregadoAt: p.entregadoAt, valorEntregado: Number(p.total) }] : [],
      }))
      const cierresPorDia = await leerCierresOperativos(tx, entradas.flatMap(e => e.entregas.map(x => dayInBogota(x.entregadoAt))))
      const clientesFiados = new Set<string>()
      let fiado = 0, pendiente = 0, sinClasificar = 0, pedidosPendientes = 0
      for (const { p, entregas } of entradas) {
        const exigible = exigibles.get(p.id) ?? 0
        const d = desglosarPedidoConFIFO({ entregas, exigible, totalPagado: Number(p.totalPagado), cierresPorDia }, ahora)
        if (!d) { sinClasificar += Math.round(exigible * 100); continue }
        if (d.fiadoCentavos > 0) clientesFiados.add(p.clienteId)
        if (d.pendienteOperativoCentavos > 0) pedidosPendientes++
        fiado += d.fiadoCentavos
        pendiente += d.pendienteOperativoCentavos
      }
      return {
        corteOperativo: { clientesFiados: clientesFiados.size, pedidosPendientes,
          fiado: fiado / 100, pendiente: pendiente / 100, sinClasificar: sinClasificar / 100 },
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
      corteOperativo: cartera.corteOperativo,
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
