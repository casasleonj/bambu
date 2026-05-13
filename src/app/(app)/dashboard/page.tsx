import { prisma } from '@/lib/prisma'
import { getTodayRange, getYesterdayRange } from '@/lib/dates'
import { buildVentasPorPrecio } from './dashboard-client/types'
import { DashboardClient } from './dashboard-client'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { startOfDay, endOfDay } = getTodayRange()
  const { startOfDay: yesterdayStart, endOfDay: yesterdayEnd } = getYesterdayRange()

  const [
    pedidos, pedidosAyer, baseDiaConfig, lastCierre, gastosAgg, embarquesAbiertos, _clientesCount, stockAlertas,
    cuentasPorCobrarAgg, produccionHoy, configsStock,
    disputasAbiertas, clientesBloqueados, clientesConflictivos, promesasProximasVencer, clientesNoVerificados,
    casosAbiertos, casosCriticos, casosSinResolver48h
  ] = await Promise.all([
    prisma.pedido.findMany({ where: { fecha: { gte: startOfDay, lt: endOfDay } } }),
    prisma.pedido.findMany({ where: { fecha: { gte: yesterdayStart, lt: yesterdayEnd } } }),
    prisma.config.findUnique({ where: { clave: 'BASE_DIA' } }),
    prisma.cierreDia.findFirst({ orderBy: { fecha: 'desc' } }),
    prisma.gasto.aggregate({ where: { fecha: { gte: startOfDay, lt: endOfDay } }, _sum: { monto: true } }),
    prisma.embarque.count({ where: { estado: 'ABIERTO', fecha: { gte: startOfDay, lt: endOfDay } } }),
    prisma.cliente.count({ where: { activo: true } }),
    prisma.insumo.findMany({ where: { stock: { lte: prisma.insumo.fields.stockMin } }, take: 5 }),
    prisma.pedido.aggregate({ where: { saldo: { gt: 0 }, estado: { in: ['ENTREGADO', 'EN_RUTA'] } }, _sum: { saldo: true }, _count: true }),
    prisma.produccion.aggregate({ where: { fecha: { gte: startOfDay, lt: endOfDay } }, _sum: { conteoAAgua: true, conteoBAgua: true, conteoAHielo: true, conteoBHielo: true } }),
    prisma.config.findMany({ where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON'] } } }),
    // Alertas de riesgo
    prisma.pedido.count({ where: { disputaAbierta: true } }),
    prisma.cliente.count({ where: { bloqueado: true, activo: true } }),
    prisma.cliente.count({ where: { reclamaciones: { gte: 3 }, activo: true } }),
    prisma.pedido.count({
      where: {
        promesaPagoFecha: { gte: new Date(), lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        estadoPago: { not: 'PAGADO' },
      },
    }),
    prisma.cliente.count({
      where: {
        verificado: false,
        activo: true,
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    // Casos activos
    prisma.caso.count({ where: { status: { in: ['ABIERTO', 'EN_PROCESO'] } } }),
    prisma.caso.count({ where: { status: { in: ['ABIERTO', 'EN_PROCESO'] }, severidad: 'ALTA' } }),
    prisma.caso.count({ where: { status: { in: ['ABIERTO', 'EN_PROCESO'] }, createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } } }),
  ])

  const ventas = pedidos.reduce((acc, p) => acc + Number(p.total), 0)
  const fiadosHoy = pedidos.filter(p => Number(p.saldo) > 0).reduce((acc, p) => acc + Number(p.saldo), 0)
  const fiadosTotal = Number(cuentasPorCobrarAgg._sum.saldo) || 0
  const clientesConFiado = cuentasPorCobrarAgg._count
  const pedidosPendientes = pedidos.filter(p => p.estado === 'PENDIENTE').length
  const pedidosEntregados = pedidos.filter(p => p.estado === 'ENTREGADO').length
  const baseDia = baseDiaConfig ? parseFloat(baseDiaConfig.valor) : 0
  const totalGastos = Number(gastosAgg._sum.monto) || 0

  const ventasAyer = pedidosAyer.reduce((acc, p) => acc + Number(p.total), 0)
  const ventasTrend = ventasAyer > 0 ? ((ventas - ventasAyer) / ventasAyer) * 100 : 0
  const pedidosTrend = pedidosAyer.length > 0 ? ((pedidos.length - pedidosAyer.length) / pedidosAyer.length) * 100 : 0

  const hourlyPedidos = new Array(24).fill(0)
  for (const p of pedidos) {
    const hour = parseInt(
      new Date(p.fecha).toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }),
      10
    )
    hourlyPedidos[hour]++
  }
  const maxHourly = Math.max(...hourlyPedidos, 1)

  const ventasPorPrecio = buildVentasPorPrecio(pedidos)

  const aguaVendida = pedidos.filter(p => p.estado === 'ENTREGADO').reduce((acc, p) => acc + (p.cPacaAguaEnt || 0), 0)
  const hieloVendido = pedidos.filter(p => p.estado === 'ENTREGADO').reduce((acc, p) => acc + (p.cPacaHieloEnt || 0), 0)
  const botellonVendido = pedidos.filter(p => p.estado === 'ENTREGADO').reduce((acc, p) => acc + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0), 0)

  const prodAguaHoy = (produccionHoy?._sum?.conteoAAgua || 0) + (produccionHoy?._sum?.conteoBAgua || 0)
  const prodHieloHoy = (produccionHoy?._sum?.conteoAHielo || 0) + (produccionHoy?._sum?.conteoBHielo || 0)

  let stockIniAgua = lastCierre?.stockFinAgua || 0
  let stockIniHielo = lastCierre?.stockFinHielo || 0
  let stockIniBotellon = 0

  if (stockIniAgua === 0 && stockIniHielo === 0) {
    const configMap = Object.fromEntries(configsStock.map(c => [c.clave, c.valor]))
    stockIniAgua = parseInt(configMap.STOCK_INI_AGUA) || 0
    stockIniHielo = parseInt(configMap.STOCK_INI_HIELO) || 0
    stockIniBotellon = parseInt(configMap.STOCK_INI_BOTELLON) || 0
  }

  const stockAgua = Math.max(0, stockIniAgua + prodAguaHoy - aguaVendida)
  const stockHielo = Math.max(0, stockIniHielo + prodHieloHoy - hieloVendido)
  const stockBotellon = Math.max(0, stockIniBotellon - botellonVendido)

  const fechaHoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const data = JSON.parse(JSON.stringify({
    pedidos, ventas, fiadosHoy, fiadosTotal, clientesConFiado,
    pedidosPendientes, pedidosEntregados, baseDia, totalGastos,
    ventasAyer, ventasTrend, pedidosTrend,
    hourlyPedidos, maxHourly, ventasPorPrecio,
    aguaVendida, hieloVendido, botellonVendido,
    prodAguaHoy, prodHieloHoy,
    stockAgua, stockHielo, stockBotellon,
    embarquesAbiertos,
    stockAlertas: stockAlertas.map(s => ({ id: s.id, nombre: s.nombre, stock: Number(s.stock), unidad: s.unidad })),
    fechaHoy,
    alertasRiesgo: {
      disputasAbiertas,
      clientesBloqueados,
      clientesConflictivos,
      promesasProximasVencer,
      clientesNoVerificados,
    },
    casosActivos: {
      total: casosAbiertos,
      criticos: casosCriticos,
      sinResolver48h: casosSinResolver48h,
    },
  }))

  return <DashboardClient data={data} />
}
