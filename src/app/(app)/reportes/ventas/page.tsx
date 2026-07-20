import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePagePermission } from '@/lib/auth-guard'
import { EstadoPedido } from '@prisma/client'
import { startOfDayBogota, endOfDayBogota, getTodayString, parseDateParam } from '@/lib/dates'
import Link from 'next/link'

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

const PRODUCT_LABELS: Record<string, string> = {
  pacaAgua: 'Paca Agua',
  pacaHielo: 'Paca Hielo',
  botellonFab: 'Botellón Fábrica',
  botellonDom: 'Botellón Domicilio',
  bolsaAgua: 'Bolsa Agua',
  bolsaHielo: 'Bolsa Hielo',
}

const METODO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  TRANSFERENCIA: 'Transferencia',
  BONO: 'Bono',
  FIADO: 'Fiado',
}

export default async function ReporteVentasPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; page?: string }>
}) {
  await requirePagePermission('view:reportes')

  const params = await searchParams
  const today = getTodayString()
  const start = parseDateParam(params.start, today)
  const end = parseDateParam(params.end, today)
  const rawPage = Number(params.page || '1')
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const pageSize = 20

  const dateFilter = {
    gte: startOfDayBogota(start),
    lte: endOfDayBogota(end),
  }

  const where = {
    fecha: dateFilter,
    estado: { not: EstadoPedido.CANCELADO },
  }

  const [pedidos, total, ventasAgg, pagosPorMetodo, fiadoAgg] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: { cliente: { select: { id: true, nombre: true, apellido: true } }, pagos: true },
      orderBy: { fecha: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pedido.count({ where }),
    prisma.pedido.aggregate({
      where,
      _sum: {
        total: true,
        totalPagado: true,
        cPacaAguaPed: true,
        cPacaHieloPed: true,
        cBotellonFabPed: true,
        cBotellonDomPed: true,
        cBolsaAguaPed: true,
        cBolsaHieloPed: true,
      },
    }),
    prisma.pago.groupBy({
      by: ['metodo'],
      where: {
        pedido: {
          fecha: dateFilter,
          estado: { not: EstadoPedido.CANCELADO },
        },
      },
      _sum: { monto: true },
    }),
    prisma.pedido.aggregate({
      where: { ...where, saldo: { gt: 0 } },
      _sum: { saldo: true },
    }),
  ])

  const resumen = {
    totalPedidos: total,
    totalVentas: Number(ventasAgg._sum.total ?? 0),
    totalPagado: Number(ventasAgg._sum.totalPagado ?? 0),
    totalFiado: Number(fiadoAgg._sum.saldo ?? 0),
    porProducto: {
      pacaAgua: Number(ventasAgg._sum.cPacaAguaPed ?? 0),
      pacaHielo: Number(ventasAgg._sum.cPacaHieloPed ?? 0),
      botellonFab: Number(ventasAgg._sum.cBotellonFabPed ?? 0),
      botellonDom: Number(ventasAgg._sum.cBotellonDomPed ?? 0),
      bolsaAgua: Number(ventasAgg._sum.cBolsaAguaPed ?? 0),
      bolsaHielo: Number(ventasAgg._sum.cBolsaHieloPed ?? 0),
    },
    porMetodoPago: Object.fromEntries(
      pagosPorMetodo.map((p) => [p.metodo, Number(p._sum.monto ?? 0)])
    ),
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reporte de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">Detalle de pedidos y métodos de pago</p>
        </div>
        <Link href="/reportes" className="text-sm text-blue-600 hover:underline">← Volver a reportes</Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white p-4 rounded-xl shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
          <input type="date" name="start" defaultValue={start} className="border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
          <input type="date" name="end" defaultValue={end} className="border rounded px-3 py-2" />
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Filtrar</button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{resumen.totalPedidos}</div><div className="text-sm text-muted-foreground">Pedidos</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{formatCOP(resumen.totalVentas)}</div><div className="text-sm text-muted-foreground">Ventas</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-600">{formatCOP(resumen.totalPagado)}</div><div className="text-sm text-muted-foreground">Pagado</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-600">{formatCOP(resumen.totalFiado)}</div><div className="text-sm text-muted-foreground">Fiado</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Por producto</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(resumen.porProducto).map(([key, value]) => (
                <div key={key} className="flex justify-between"><span>{PRODUCT_LABELS[key]}</span><span className="font-medium">{value}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por método de pago</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(resumen.porMetodoPago).length === 0 ? (
                <div className="text-muted-foreground text-sm">Sin pagos registrados</div>
              ) : (
                Object.entries(resumen.porMetodoPago).map(([key, value]) => (
                  <div key={key} className="flex justify-between"><span>{METODO_LABELS[key] || key}</span><span className="font-medium">{formatCOP(value)}</span></div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pedidos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Pagado</th>
                  <th className="text-right p-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2">{p.numero}</td>
                    <td className="p-2">{new Date(p.fecha).toLocaleDateString('es-CO')}</td>
                    <td className="p-2">{p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido || ''}`.trim() : 'Anónimo'}</td>
                    <td className="p-2 text-right">{formatCOP(Number(p.total))}</td>
                    <td className="p-2 text-right">{formatCOP(Number(p.totalPagado))}</td>
                    <td className="p-2 text-right">{formatCOP(Number(p.saldo))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted-foreground">Página {page} de {totalPages || 1} ({total} total)</div>
            <div className="flex gap-2">
              {page > 1 && <Link href={`/reportes/ventas?start=${start}&end=${end}&page=${page - 1}`} className="px-3 py-1 border rounded hover:bg-gray-50">Anterior</Link>}
              {page < totalPages && <Link href={`/reportes/ventas?start=${start}&end=${end}&page=${page + 1}`} className="px-3 py-1 border rounded hover:bg-gray-50">Siguiente</Link>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
