import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePagePermission } from '@/lib/auth-guard'
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'
import { runValidation } from '../../../../../prisma/validate-data'

/**
 * commit 5 plan antifraude: panel de salud del sistema antifraude.
 * Muestra:
 *  - Resumen de Casos por status + top tipos de alerta
 *  - Top 5 repartidores / clientes con mas Casos abiertos
 *  - Tendencia 14 dias
 *  - Resultados de validate-data (23 checks de integridad)
 *
 * Acceso: solo ADMIN/CONTADOR. requirePagePermission ya enforcea.
 */
export default async function SaludAntifraudePage() {
  await requirePagePermission('view:reportes')

  const now = new Date()
  const hace30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const hace14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const [porTipo, porStatus, topRepartidores, topClientes, tendencia, validationResults] =
    await Promise.all([
      prisma.caso.groupBy({
        by: ['alertaTipo'],
        where: { createdAt: { gte: hace30d } },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.caso.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.caso.groupBy({
        by: ['repartidorId'],
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          repartidorId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.caso.groupBy({
        by: ['clienteId'],
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          clienteId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.caso.findMany({
        where: { createdAt: { gte: hace14d } },
        select: { createdAt: true },
      }),
      // validate-data: 23 checks pesados pero se ejecutan en el mismo
      // request. Si la DB es pequena (< 10k pedidos) tarda < 1s.
      runValidation().catch((e) => {
        console.error('validate-data fallo en page:', e)
        return []
      }),
    ])

  // Hidratar nombres
  const repartidorIds = topRepartidores
    .map((g) => g.repartidorId)
    .filter((id): id is string => id !== null)
  const clienteIds = topClientes
    .map((g) => g.clienteId)
    .filter((id): id is string => id !== null)

  const [repartidores, clientes] = await Promise.all([
    repartidorIds.length > 0
      ? prisma.trabajador.findMany({
          where: { id: { in: repartidorIds } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([] as { id: string; nombre: string }[]),
    clienteIds.length > 0
      ? prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([] as { id: string; nombre: string }[]),
  ])

  const repartidorMap = new Map(repartidores.map((r) => [r.id, r.nombre]))
  const clienteMap = new Map(clientes.map((c) => [c.id, c.nombre]))

  // Tendencia: agrupar por dia (14 puntos, 0s incluidos)
  const tendenciaPorDia = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    tendenciaPorDia.set(d.toISOString().slice(0, 10), 0)
  }
  for (const c of tendencia) {
    const dia = c.createdAt.toISOString().slice(0, 10)
    tendenciaPorDia.set(dia, (tendenciaPorDia.get(dia) ?? 0) + 1)
  }

  // Totales validate-data
  const valTotals = {
    pass: validationResults.filter((r) => r.status === 'PASS').length,
    fail: validationResults.filter((r) => r.status === 'FAIL').length,
    warn: validationResults.filter((r) => r.status === 'WARN').length,
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Salud Antifraude</h1>
        <p className="text-sm text-muted-foreground">
          Ultimos 30 dias — {now.toLocaleDateString('es-CO')}
        </p>
      </div>

      {/* ── Resumen validate-data ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Integridad de datos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{valTotals.pass}</div>
                <div className="text-xs text-muted-foreground">PASS</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold">{valTotals.fail}</div>
                <div className="text-xs text-muted-foreground">FAIL</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold">{valTotals.warn}</div>
                <div className="text-xs text-muted-foreground">WARN</div>
              </div>
            </div>
          </div>
          {validationResults.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Ver detalle ({validationResults.length} checks)</summary>
              <ul className="mt-2 space-y-1">
                {validationResults.map((r, i) => {
                  const Icon =
                    r.status === 'PASS' ? CheckCircle2 : r.status === 'FAIL' ? AlertCircle : AlertTriangle
                  const color =
                    r.status === 'PASS'
                      ? 'text-green-600'
                      : r.status === 'FAIL'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                  return (
                    <li key={i} className="flex gap-2">
                      <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
                      <div>
                        <div className="font-medium">{r.check}</div>
                        <div className="text-xs text-muted-foreground">{r.details}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ── Top tipos de alerta ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Casos por tipo de alerta (30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {porTipo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin Casos en los ultimos 30 dias.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Tipo</th>
                  <th className="py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {porTipo.map((g) => (
                  <tr key={g.alertaTipo} className="border-b">
                    <td className="py-2 font-mono text-xs">{g.alertaTipo}</td>
                    <td className="py-2 text-right">{g._count._all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Status distribution ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Casos por status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {porStatus.map((g) => (
              <div key={g.status} className="border rounded p-3">
                <div className="text-xs text-muted-foreground">{g.status}</div>
                <div className="text-2xl font-bold">{g._count._all}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Top 5 repartidores + clientes ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top repartidores con Casos abiertos</CardTitle>
          </CardHeader>
          <CardContent>
            {topRepartidores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topRepartidores.map((g) => (
                  <li key={g.repartidorId} className="flex justify-between border-b pb-1">
                    <span>{g.repartidorId ? (repartidorMap.get(g.repartidorId) ?? 'Desconocido') : '-'}</span>
                    <span className="font-bold">{g._count._all}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top clientes con Casos abiertos</CardTitle>
          </CardHeader>
          <CardContent>
            {topClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topClientes.map((g) => (
                  <li key={g.clienteId} className="flex justify-between border-b pb-1">
                    <span>{g.clienteId ? (clienteMap.get(g.clienteId) ?? 'Desconocido') : '-'}</span>
                    <span className="font-bold">{g._count._all}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tendencia 14 dias ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Tendencia (14 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {Array.from(tendenciaPorDia.entries()).map(([fecha, count]) => {
              const max = Math.max(...Array.from(tendenciaPorDia.values()), 1)
              const heightPct = (count / max) * 100
              return (
                <div key={fecha} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${heightPct}%`, minHeight: count > 0 ? '4px' : '0' }}
                    title={`${fecha}: ${count}`}
                  />
                  <div className="text-[10px] text-muted-foreground">{fecha.slice(5)}</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
