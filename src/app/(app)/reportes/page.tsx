import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReportesFilter } from './reportes-filter'
import { startOfDayBogota, endOfDayBogota, getTodayString, parseDateParam } from '@/lib/dates'
import { requirePagePermission } from '@/lib/auth-guard'

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  await requirePagePermission('view:reportes')

  const params = await searchParams

  const today = getTodayString()
  const start = parseDateParam(params.start, today)
  const end = parseDateParam(params.end, start)
  const startDate = startOfDayBogota(start)
  const endDate = endOfDayBogota(end)

  const dateRange = { gte: startDate, lte: endDate }

  const [pedidosCount, ventasAgg, facturasPendientes, facturasSaldoAgg, pagosAgg, gastosAgg] = await Promise.all([
    prisma.pedido.count({ where: { estado: { not: 'CANCELADO' }, fecha: dateRange } }),
    prisma.pedido.aggregate({
      where: { estado: { not: 'CANCELADO' }, fecha: dateRange },
      _sum: { total: true },
    }),
    prisma.factura.count({ where: { saldo: { gt: 0 }, fecha: dateRange } }),
    prisma.factura.aggregate({
      where: { saldo: { gt: 0 }, fecha: dateRange },
      _sum: { saldo: true },
    }),
    // Pagos hechos a pedidos del período (no abonos a facturas antiguas)
    prisma.pago.aggregate({
      where: { pedido: { fecha: dateRange } },
      _sum: { monto: true },
    }),
    prisma.gasto.aggregate({ where: { fecha: dateRange }, _sum: { monto: true } }),
  ])

  const stats = {
    pedidos: pedidosCount,
    ventas: Number(ventasAgg._sum.total ?? 0),
    cobros: Number(pagosAgg._sum.monto ?? 0), // Solo pagos a pedidos del período
    gastos: Number(gastosAgg._sum.monto ?? 0),
    facturasPendientes,
    facturasPendientesTotal: Number(facturasSaldoAgg._sum.saldo ?? 0),
  }

  const balance = stats.cobros - stats.gastos
  const pendiente = stats.ventas - stats.cobros // Ahora sí refleja lo faltante del período

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumen de ventas, cobros y gastos</p>
      </div>

      <ReportesFilter start={start} end={end} />

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.pedidos}</div>
              <div className="text-sm text-muted-foreground mt-1">Pedidos</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{formatCOP(stats.ventas)}</div>
              <div className="text-sm text-muted-foreground mt-1">Ventas</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{formatCOP(stats.cobros)}</div>
              <div className="text-sm text-muted-foreground mt-1">Cobros</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{formatCOP(stats.gastos)}</div>
              <div className="text-sm text-muted-foreground mt-1">Gastos</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance {start === end ? `del ${start}` : `${start} a ${end}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Ingresos (Cobros)</span>
              <span className="font-medium text-green-600">+{formatCOP(stats.cobros)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Egresos (Gastos)</span>
              <span className="font-medium text-red-600">-{formatCOP(stats.gastos)}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-3 text-lg font-bold">
              <span>Balance Neto</span>
              <span className={balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCOP(balance)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {formatCOP(stats.facturasPendientesTotal)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{stats.facturasPendientes} factura(s) por cobrar</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas vs Cobros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ventas:</span>
                <span className="font-medium">{formatCOP(stats.ventas)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Cobrado:</span>
                <span className="font-medium text-green-600">{formatCOP(stats.cobros)}</span>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-muted-foreground">Pendiente:</span>
                <span className={`font-semibold ${pendiente > 0 ? 'text-amber-600' : pendiente < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCOP(pendiente)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
