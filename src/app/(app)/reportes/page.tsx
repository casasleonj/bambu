import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReportesFilter } from './reportes-filter'

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

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>

      <ReportesFilter start={start} end={end} />

      <Card className="bg-muted">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{stats.pedidos}</div>
              <div className="text-sm text-muted-foreground">Pedidos</div>
            </div>
            <div>
              <div className="text-3xl font-bold">${stats.ventas.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Ventas</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">${stats.cobros.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Cobros</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">${stats.gastos.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Gastos</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance {start === end ? `del ${start}` : `${start} a ${end}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Ingresos (Cobros)</span>
              <span className="font-medium text-green-600">+${stats.cobros.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Egresos (Gastos)</span>
              <span className="font-medium text-red-600">-${stats.gastos.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Balance Neto</span>
              <span className={balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                ${balance.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.facturasPendientes}
            </div>
            <div className="text-sm text-muted-foreground">Facturas por cobrar</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas vs Cobros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Ventas:</span>
                <span>${stats.ventas.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cobrado:</span>
                <span className="text-green-600">${stats.cobros.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Pendiente:</span>
                <span className="text-yellow-600">
                  ${(stats.ventas - stats.cobros).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
