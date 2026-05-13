import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReportesFilter } from './reportes-filter'

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const params = await searchParams

  const today = new Date().toISOString().split('T')[0]
  const start = params.start || today
  const end = params.end || start
  const startDate = new Date(start + 'T00:00:00-05:00')
  const endDate = new Date(end + 'T23:59:59.999-05:00')

  const dateRange = { gte: startDate, lte: endDate }

  const [pedidosCount, ventasAgg, facturasPendientes, abonosAgg, gastosAgg] = await Promise.all([
    prisma.pedido.count({ where: { estado: { not: 'CANCELADO' }, fecha: dateRange } }),
    prisma.pedido.aggregate({
      where: { estado: { not: 'CANCELADO' }, fecha: dateRange },
      _sum: { total: true },
    }),
    prisma.factura.count({ where: { saldo: { gt: 0 }, fecha: dateRange } }),
    prisma.abono.aggregate({ where: { fecha: dateRange }, _sum: { monto: true } }),
    prisma.gasto.aggregate({ where: { fecha: dateRange }, _sum: { monto: true } }),
  ])

  const stats = {
    pedidos: pedidosCount,
    ventas: Number(ventasAgg._sum.total ?? 0),
    cobros: Number(abonosAgg._sum.monto ?? 0),
    gastos: Number(gastosAgg._sum.monto ?? 0),
    facturasPendientes,
  }

  const balance = stats.cobros - stats.gastos
  const pendiente = stats.ventas - stats.cobros

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
              {stats.facturasPendientes}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Facturas por cobrar</div>
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
