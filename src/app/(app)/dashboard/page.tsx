import { prisma } from '@/lib/prisma'
import { EstadoPago } from '@prisma/client'
import { getTodayRange, getYesterdayRange, getTodayString } from '@/lib/dates'
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
    pedidos, pedidosAyer, baseDiaConfig, baseDiaGlobal, lastCierre, gastosAgg, embarquesAbiertos, _clientesCount, stockAlertas,
    cuentasPorCobrarAgg, produccionHoy, configsStock,
    disputasAbiertas, clientesBloqueados, clientesConflictivos, promesasProximasVencer, clientesNoVerificados,
    casosAbiertos, casosCriticos, casosSinResolver48h,
    clientesConFiado
  ] = await Promise.all([
    prisma.pedido.findMany({ where: { fecha: { gte: startOfDay, lt: endOfDay } } }),
    prisma.pedido.findMany({ where: { fecha: { gte: yesterdayStart, lt: yesterdayEnd } } }),
    prisma.config.findUnique({ where: { clave: `BASE_DIA_${getTodayString()}` } }),
    prisma.config.findUnique({ where: { clave: 'BASE_DIA' } }),
    prisma.cierreDia.findFirst({ orderBy: { fecha: 'desc' } }),
    prisma.gasto.aggregate({ where: { fecha: { gte: startOfDay, lt: endOfDay } }, _sum: { monto: true } }),
    prisma.embarque.count({ where: { estado: 'ABIERTO' } }),
    prisma.cliente.count({ where: { activo: true } }),
    prisma.insumo.findMany({ where: { stock: { lte: prisma.insumo.fields.stockMin } }, take: 5 }),
    prisma.pedido.aggregate({ where: { saldo: { gt: 0 }, estadoEntrega: 'ENTREGADO' }, _sum: { saldo: true } }),
    prisma.produccion.aggregate({ where: { fecha: { gte: startOfDay, lt: endOfDay } }, _sum: { conteoAAgua: true, conteoBAgua: true, conteoAHielo: true, conteoBHielo: true, rotasAgua: true, rotasHielo: true, filtradasAgua: true, filtradasHielo: true, consumoInternoAgua: true, consumoInternoHielo: true } }),
    prisma.config.findMany({ where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON'] } } }),
    // Alertas de riesgo
    prisma.pedido.count({ where: { disputaAbierta: true } }),
    prisma.cliente.count({ where: { bloqueado: true, activo: true } }),
    prisma.cliente.count({ where: { reclamaciones: { gte: 3 }, activo: true } }),
    prisma.pedido.count({
      where: {
        promesaPagoFecha: { gte: new Date(), lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        estadoPago: { notIn: [EstadoPago.PAGADO, EstadoPago.ANULADO] },
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
    // Clientes reales con deuda
    prisma.cliente.count({
      where: {
        activo: true,
        pedidos: {
          some: {
            saldo: { gt: 0 },
            estadoEntrega: 'ENTREGADO',
          },
        },
      },
    }),
  ])

  const pedidosValidos = pedidos.filter(
    p => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO'
  )
  const ventas = pedidosValidos.reduce((acc, p) => acc + Number(p.total), 0)
  const fiadosHoy = pedidos
    .filter(p => Number(p.saldo) > 0 && p.estadoEntrega === 'ENTREGADO')
    .reduce((acc, p) => acc + Number(p.saldo), 0)
  const fiadosTotal = Number(cuentasPorCobrarAgg._sum.saldo) || 0
  const pedidosPendientes = pedidos.filter(p => p.estadoEntrega === 'PENDIENTE').length
  const pedidosEntregados = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO').length
  const baseDiaRaw = baseDiaConfig ? parseFloat(baseDiaConfig.valor) : (baseDiaGlobal ? parseFloat(baseDiaGlobal.valor) : 0)
  const baseDia = isNaN(baseDiaRaw) ? 0 : baseDiaRaw
  const totalGastos = Number(gastosAgg._sum.monto) || 0

  const pedidosAyerValidos = pedidosAyer.filter(
    p => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO'
  )
  const ventasAyer = pedidosAyerValidos.reduce((acc, p) => acc + Number(p.total), 0)
  const ventasTrend = ventasAyer > 0 ? ((ventas - ventasAyer) / ventasAyer) * 100 : 0
  const pedidosTrend = pedidosAyer.length > 0 ? ((pedidos.length - pedidosAyer.length) / pedidosAyer.length) * 100 : 0

  // Franjas horarias en lugar de 24 barras
  const franjas = [
    { label: 'Madrugada', range: [0, 5], count: 0 },
    { label: 'Mañana', range: [6, 11], count: 0 },
    { label: 'Tarde', range: [12, 17], count: 0 },
    { label: 'Noche', range: [18, 23], count: 0 },
  ]
  for (const p of pedidosValidos) {
    const hour = parseInt(
      new Date(p.fecha).toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }),
      10
    )
    const franja = franjas.find(f => hour >= f.range[0] && hour <= f.range[1])
    if (franja) franja.count++
  }
  const maxFranja = Math.max(...franjas.map(f => f.count), 1)

  const ventasPorPrecio = buildVentasPorPrecio(pedidosValidos)

  const aguaVendida = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO').reduce((acc, p) => acc + (p.cPacaAguaEnt || 0), 0)
  const hieloVendido = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO').reduce((acc, p) => acc + (p.cPacaHieloEnt || 0), 0)
  const botellonVendido = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO').reduce((acc, p) => acc + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0), 0)

  const prodAguaHoy = (produccionHoy?._sum?.conteoAAgua || 0) + (produccionHoy?._sum?.conteoBAgua || 0)
  const prodHieloHoy = (produccionHoy?._sum?.conteoAHielo || 0) + (produccionHoy?._sum?.conteoBHielo || 0)
  const perdidasAgua = (produccionHoy?._sum?.rotasAgua || 0) + (produccionHoy?._sum?.filtradasAgua || 0) + (produccionHoy?._sum?.consumoInternoAgua || 0)
  const perdidasHielo = (produccionHoy?._sum?.rotasHielo || 0) + (produccionHoy?._sum?.filtradasHielo || 0) + (produccionHoy?._sum?.consumoInternoHielo || 0)

  let stockIniAgua = lastCierre?.stockFinAgua || 0
  let stockIniHielo = lastCierre?.stockFinHielo || 0
  let stockIniBotellon = 0

  // Fallback solo si no hay cierre previo (no confundir stock 0 con "sin datos")
  if (!lastCierre) {
    const configMap = Object.fromEntries(configsStock.map(c => [c.clave, c.valor]))
    stockIniAgua = parseInt(configMap.STOCK_INI_AGUA) || 0
    stockIniHielo = parseInt(configMap.STOCK_INI_HIELO) || 0
    stockIniBotellon = parseInt(configMap.STOCK_INI_BOTELLON) || 0
  }

  const stockAgua = Math.max(0, stockIniAgua + prodAguaHoy - aguaVendida - perdidasAgua)
  const stockHielo = Math.max(0, stockIniHielo + prodHieloHoy - hieloVendido - perdidasHielo)
  const stockBotellon = Math.max(0, stockIniBotellon - botellonVendido)

  const fechaHoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const data = JSON.parse(JSON.stringify({
    pedidos, ventas, fiadosHoy, fiadosTotal, clientesConFiado,
    pedidosPendientes, pedidosEntregados, baseDia, totalGastos,
    ventasAyer, ventasTrend, pedidosTrend,
    franjas, maxFranja, ventasPorPrecio,
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
