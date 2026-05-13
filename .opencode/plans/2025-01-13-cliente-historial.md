# Historial del Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una vista unificada de historial del cliente (timeline cronológico + estadísticas + auditoría), reemplazando los tabs fragmentados de pedidos/facturas/cuentas por Info / Historial / Estadísticas / Alertas.

**Architecture:** Backend expone dos endpoints nuevos (`/api/clientes/[id]/historial` y `/api/clientes/[id]/stats`) que hacen queries paralelas por entidad, merge-sort en memoria por fecha, y paginan con offset. Frontend reutiliza el patrón de timeline inline ya existente en `caso-detail.tsx` (puntos de color + flex gap) y el patrón de KPI cards del dashboard (`border-l-4`). Sin librerías nuevas.

**Tech Stack:** Next.js 16 App Router, Prisma ORM, PostgreSQL, Tailwind CSS v4, shadcn/ui mínimo, React Client Components.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/app/api/clientes/[id]/historial/route.ts` | Endpoint GET unificado. Queries paralelas: Pedido, Factura, Caso, NotaCredito, Historial (auditoría). Mapea a `TimelineEvent[]`, merge-sort por fecha, pagina con offset/take. |
| `src/app/api/clientes/[id]/stats/route.ts` | Endpoint GET de estadísticas. Calcula totales, promedios, frecuencia real, productos favoritos, evolución mensual (24 meses), métodos de pago, días promedio para pagar. |
| `src/app/(app)/clientes/clientes-client/types.ts` | Agrega tipos `TimelineEventType`, `TimelineEvent`, `TimelineFilter`, `ClienteStats`, `EvolucionMensual`, `ProductoFavorito`, `MetodoPagoStats`. |
| `src/app/(app)/clientes/clientes-client/cliente-historial.tsx` | Componente Client Component. Muestra filtros de tipo, timeline vertical, items expandibles, paginación "Cargar más", estados de carga/vacío. |
| `src/app/(app)/clientes/clientes-client/cliente-stats.tsx` | Componente Client Component. Cards de KPI (`border-l-4`), tabla de productos favoritos, barras CSS de evolución mensual, tabla de métodos de pago. |
| `src/app/(app)/clientes/clientes-client/index.tsx` | Modifica tabs: reemplaza `pedidos`/`facturas`/`cuentas` por `historial`/`stats`. Mantiene `info` y `alertas`. Elimina estado y handlers obsoletos de pedidos/facturas/cuentas. |

---

## Decisiones de diseño documentadas

1. **Prioridad:** Timeline primero (núcleo de la funcionalidad), luego Stats, luego integración de auditoría.
2. **Ventana temporal:** 12 meses por defecto (`?meses=12`), `?meses=todo` para ver todo.
3. **Auditoría:** Incluida como tipo de evento `AUDITORIA` dentro del mismo timeline, con filtro separado. Visualmente diferenciada con icono/tono gris. Esto es más útil que una pestaña aparte porque permite correlacionar cambios de datos con eventos de negocio.
4. **Tabs:** Opción A (reemplazar). Eliminamos `pedidos`, `facturas`, `cuentas` porque el timeline unifica esos datos. Se mantienen `info` y `alertas`.
5. **Paginación:** Offset-based sobre array mergeado. El volumen por cliente es bajo (< 500 registros/año), por lo que mergear en memoria es trivial y evita complejidad de cursor-based pagination.
6. **Gráficos:** Sin librerías. Barras CSS puras como en `dashboard-client`.

---

## Task 1: Extender tipos TypeScript

**Files:**
- Modify: `src/app/(app)/clientes/clientes-client/types.ts`

- [ ] **Step 1: Agregar tipos de timeline y estadísticas**

```typescript
// Al final del archivo, antes de la última línea

export type TimelineEventType =
  | 'PEDIDO'
  | 'PAGO'
  | 'FACTURA'
  | 'ABONO'
  | 'CASO'
  | 'NOTA_CREDITO'
  | 'AUDITORIA'

export type TimelineFilter = 'TODOS' | TimelineEventType

export interface TimelineEvent {
  id: string
  tipo: TimelineEventType
  fecha: string
  titulo: string
  descripcion?: string
  monto?: number
  estado?: string
  metodo?: string
  numero?: string | number
  link?: string
  metadata?: Record<string, unknown>
}

export interface ProductoFavorito {
  nombre: string
  cantidadTotal: number
  totalVendido: number
}

export interface EvolucionMensual {
  mes: string
  total: number
  pedidos: number
}

export interface MetodoPagoStats {
  metodo: string
  count: number
  total: number
}

export interface ClienteStats {
  totalComprado: number
  totalPagado: number
  totalFiado: number
  cantidadPedidos: number
  cantidadPedidosUltimos30: number
  cantidadPedidosUltimos90: number
  promedioPorPedido: number
  frecuenciaRealDias: number | null
  productosFavoritos: ProductoFavorito[]
  evolucionMensual: EvolucionMensual[]
  metodosPago: MetodoPagoStats[]
  diasPromedioPago: number | null
}
```

- [ ] **Step 2: Verificar que el archivo compila**

Run: `npx tsc --noEmit`
Expected: PASS (solo agregamos tipos, no hay cambios en tiempo de ejecución)

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/types.ts
git commit -m "types: add TimelineEvent and ClienteStats types"
```

---

## Task 2: Crear endpoint `/api/clientes/[id]/historial`

**Files:**
- Create: `src/app/api/clientes/[id]/historial/route.ts`

- [ ] **Step 1: Implementar endpoint GET**

```typescript
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getPaginationParams, getPrismaPagination } from '@/lib/pagination'
import type { TimelineEvent, TimelineEventType } from '@/app/(app)/clientes/clientes-client/types'

function getDesdeDate(meses: string | null): Date | undefined {
  if (meses === 'todo' || meses === 'all') return undefined
  const n = meses ? parseInt(meses, 10) : 12
  if (isNaN(n) || n <= 0) return undefined
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  const { searchParams } = new URL(request.url)
  const meses = searchParams.get('meses')
  const pagination = getPaginationParams(searchParams)
  const desde = getDesdeDate(meses)

  const fechaFilter = desde ? { gte: desde } : undefined

  try {
    const [pedidos, facturas, casos, notasCredito, auditoria] = await Promise.all([
      prisma.pedido.findMany({
        where: { clienteId: id, ...(fechaFilter ? { fecha: fechaFilter } : {}) },
        orderBy: { fecha: 'desc' },
        include: {
          items: true,
          pagos: true,
          factura: { include: { abonos: true } },
          notasCredito: true,
        },
      }),
      prisma.factura.findMany({
        where: { clienteId: id, ...(fechaFilter ? { fecha: fechaFilter } : {}) },
        orderBy: { fecha: 'desc' },
        include: { abonos: true },
      }),
      prisma.caso.findMany({
        where: { clienteId: id, ...(fechaFilter ? { createdAt: fechaFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        include: {
          eventos: {
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { username: true } } },
          },
        },
      }),
      prisma.notaCredito.findMany({
        where: {
          pedido: { clienteId: id },
          ...(fechaFilter ? { fecha: fechaFilter } : {}),
        },
        orderBy: { fecha: 'desc' },
        include: { pedido: { select: { numero: true } }, factura: { select: { numero: true } } },
      }),
      prisma.historial.findMany({
        where: { entidad: 'Cliente', registroId: id, ...(fechaFilter ? { fecha: fechaFilter } : {}) },
        orderBy: { fecha: 'desc' },
      }),
    ])

    const events: TimelineEvent[] = []

    // Pedidos
    for (const p of pedidos) {
      events.push({
        id: `pedido-${p.id}`,
        tipo: 'PEDIDO',
        fecha: p.fecha.toISOString(),
        titulo: `Pedido #${p.numero}`,
        descripcion: p.items?.map(i => `${i.cantPedido} ${i.producto}`).join(', ') || undefined,
        monto: Number(p.total),
        estado: p.estadoEntrega || p.estado,
        numero: p.numero,
        link: `/pedidos?openPedido=${p.id}`,
        metadata: { saldo: Number(p.saldo), totalPagado: Number(p.totalPagado) },
      })

      // Pagos del pedido
      for (const pago of p.pagos || []) {
        events.push({
          id: `pago-${pago.id}`,
          tipo: 'PAGO',
          fecha: pago.createdAt.toISOString(),
          titulo: `Pago de Pedido #${p.numero}`,
          monto: Number(pago.monto),
          metodo: pago.metodo,
          numero: p.numero,
          link: `/pedidos?openPedido=${p.id}`,
        })
      }

      // Notas de crédito del pedido (ya se obtienen separadamente, pero evitamos duplicados)
      for (const nc of p.notasCredito || []) {
        events.push({
          id: `nc-${nc.id}`,
          tipo: 'NOTA_CREDITO',
          fecha: nc.fecha.toISOString(),
          titulo: `Nota de Crédito #${nc.numero}`,
          descripcion: nc.motivo,
          monto: Number(nc.monto),
          numero: nc.numero,
          link: `/pedidos?openPedido=${p.id}`,
        })
      }
    }

    // Facturas
    for (const f of facturas) {
      events.push({
        id: `factura-${f.id}`,
        tipo: 'FACTURA',
        fecha: f.fecha.toISOString(),
        titulo: `Factura #${f.numero}`,
        monto: Number(f.total),
        estado: f.estado,
        numero: f.numero,
        link: `/facturas?openFactura=${f.id}`,
        metadata: { saldo: Number(f.saldo), montoPagado: Number(f.montoPagado) },
      })

      for (const abono of f.abonos || []) {
        events.push({
          id: `abono-${abono.id}`,
          tipo: 'ABONO',
          fecha: abono.fecha.toISOString(),
          titulo: `Abono Factura #${f.numero}`,
          monto: Number(abono.monto),
          metodo: abono.metodoPago,
          numero: f.numero,
          link: `/facturas?openFactura=${f.id}`,
        })
      }
    }

    // Casos
    for (const c of casos) {
      events.push({
        id: `caso-${c.id}`,
        tipo: 'CASO',
        fecha: c.createdAt.toISOString(),
        titulo: c.titulo,
        descripcion: c.descripcion || undefined,
        estado: c.status,
        numero: c.id.slice(0, 8),
        link: `/casos`,
        metadata: { severidad: c.severidad, eventos: c.eventos?.length || 0 },
      })
    }

    // Notas de crédito (por si quedó alguna sin pedido directo — fallback)
    for (const nc of notasCredito) {
      if (!events.find(e => e.id === `nc-${nc.id}`)) {
        events.push({
          id: `nc-${nc.id}`,
          tipo: 'NOTA_CREDITO',
          fecha: nc.fecha.toISOString(),
          titulo: `Nota de Crédito #${nc.numero}`,
          descripcion: nc.motivo,
          monto: Number(nc.monto),
          numero: nc.numero,
          link: nc.pedidoId ? `/pedidos?openPedido=${nc.pedidoId}` : undefined,
        })
      }
    }

    // Auditoría
    for (const h of auditoria) {
      events.push({
        id: `audit-${h.id}`,
        tipo: 'AUDITORIA',
        fecha: h.fecha.toISOString(),
        titulo: `${h.accion} Cliente`,
        descripcion: h.datos,
        numero: h.id.slice(0, 8),
        metadata: { usuarioId: h.usuarioId },
      })
    }

    // Merge-sort por fecha descendente
    events.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    const total = events.length
    const { skip = 0, take = 20 } = getPrismaPagination(pagination)
    const paginated = events.slice(skip, skip + take)
    const hasMore = skip + take < total

    return apiSuccess({
      events: JSON.parse(JSON.stringify(paginated)),
      total,
      page: pagination.page || 1,
      pageSize: take,
      hasMore,
    })
  } catch (error) {
    console.error('[API /clientes/[id]/historial]', error)
    return apiError('Error cargando historial', 500)
  }
}
```

- [ ] **Step 2: Probar endpoint con curl**

Run:
```bash
curl -s "http://localhost:3000/api/clientes/$(npx prisma db execute --stdin <<< "SELECT id FROM \"Cliente\" LIMIT 1;" | head -2 | tail -1)/historial?meses=12&page=1&pageSize=10" | jq .
```

Expected: JSON válido con `success: true`, `events: []`, `hasMore: false` (o datos si hay).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clientes/[id]/historial/route.ts
git commit -m "feat(api): add unified client timeline endpoint"
```

---

## Task 3: Crear endpoint `/api/clientes/[id]/stats`

**Files:**
- Create: `src/app/api/clientes/[id]/stats/route.ts`

- [ ] **Step 1: Implementar endpoint GET**

```typescript
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import type { ClienteStats, ProductoFavorito, EvolucionMensual, MetodoPagoStats } from '@/app/(app)/clientes/clientes-client/types'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  try {
    const ahora = new Date()
    const hace30 = new Date(ahora)
    hace30.setDate(hace30.getDate() - 30)
    const hace90 = new Date(ahora)
    hace90.setDate(hace90.getDate() - 90)
    const hace24m = new Date(ahora)
    hace24m.setMonth(hace24m.getMonth() - 24)

    const [pedidos, facturas, abonosCliente] = await Promise.all([
      prisma.pedido.findMany({
        where: { clienteId: id, estadoEntrega: { not: 'ANULADO' } },
        orderBy: { fecha: 'desc' },
        include: { items: true, pagos: true },
      }),
      prisma.factura.findMany({
        where: { clienteId: id },
        orderBy: { fecha: 'desc' },
        include: { abonos: true },
      }),
      prisma.abono.findMany({
        where: { clienteId: id },
        orderBy: { fecha: 'desc' },
      }),
    ])

    // Totales
    const totalComprado = pedidos.reduce((s, p) => s + Number(p.total), 0)
    const totalPagado = pedidos.reduce((s, p) => s + Number(p.totalPagado), 0)
    const totalFiado = pedidos.reduce((s, p) => s + Number(p.saldo), 0)
    const cantidadPedidos = pedidos.length
    const cantidadPedidosUltimos30 = pedidos.filter(p => new Date(p.fecha) >= hace30).length
    const cantidadPedidosUltimos90 = pedidos.filter(p => new Date(p.fecha) >= hace90).length
    const promedioPorPedido = cantidadPedidos > 0 ? totalComprado / cantidadPedidos : 0

    // Frecuencia real
    const pedidosEntregados = pedidos
      .filter(p => p.estadoEntrega === 'ENTREGADO')
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    let frecuenciaRealDias: number | null = null
    if (pedidosEntregados.length >= 2) {
      let dias = 0
      let count = 0
      for (let i = 1; i < pedidosEntregados.length; i++) {
        const diff = (new Date(pedidosEntregados[i].fecha).getTime() - new Date(pedidosEntregados[i - 1].fecha).getTime()) / (1000 * 60 * 60 * 24)
        if (diff > 0 && diff < 90) { dias += diff; count++ }
      }
      if (count > 0) frecuenciaRealDias = Math.round(dias / count)
    }

    // Productos favoritos
    const prodMap: Record<string, { cantidadTotal: number; totalVendido: number }> = {}
    for (const p of pedidos) {
      for (const it of p.items || []) {
        if (!prodMap[it.producto]) prodMap[it.producto] = { cantidadTotal: 0, totalVendido: 0 }
        prodMap[it.producto].cantidadTotal += it.cantPedido
        prodMap[it.producto].totalVendido += Number(it.subtotal)
      }
    }
    const productosFavoritos: ProductoFavorito[] = Object.entries(prodMap)
      .map(([nombre, stats]) => ({ nombre, cantidadTotal: stats.cantidadTotal, totalVendido: stats.totalVendido }))
      .sort((a, b) => b.cantidadTotal - a.cantidadTotal)
      .slice(0, 5)

    // Evolución mensual (últimos 24 meses)
    const evoMap: Record<string, { total: number; pedidos: number }> = {}
    for (let i = 0; i < 24; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      evoMap[key] = { total: 0, pedidos: 0 }
    }
    for (const p of pedidos) {
      const d = new Date(p.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (evoMap[key]) {
        evoMap[key].total += Number(p.total)
        evoMap[key].pedidos += 1
      }
    }
    const evolucionMensual: EvolucionMensual[] = Object.entries(evoMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({ mes, total: v.total, pedidos: v.pedidos }))

    // Métodos de pago
    const metodoMap: Record<string, { count: number; total: number }> = {}
    for (const p of pedidos) {
      for (const pago of p.pagos || []) {
        if (!metodoMap[pago.metodo]) metodoMap[pago.metodo] = { count: 0, total: 0 }
        metodoMap[pago.metodo].count++
        metodoMap[pago.metodo].total += Number(pago.monto)
      }
    }
    for (const a of abonosCliente) {
      if (!metodoMap[a.metodoPago]) metodoMap[a.metodoPago] = { count: 0, total: 0 }
      metodoMap[a.metodoPago].count++
      metodoMap[a.metodoPago].total += Number(a.monto)
    }
    const metodosPago: MetodoPagoStats[] = Object.entries(metodoMap)
      .map(([metodo, v]) => ({ metodo, count: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total)

    // Días promedio para pagar (solo pedidos con saldo=0 y que tuvieron fiado)
    let diasPromedioPago: number | null = null
    const pedidosPagados = pedidos.filter(p => Number(p.saldo) === 0 && Number(p.total) > 0 && p.pagos && p.pagos.length > 0)
    if (pedidosPagados.length > 0) {
      let totalDias = 0
      for (const p of pedidosPagados) {
        const fechaPedido = new Date(p.fecha).getTime()
        const ultimoPago = p.pagos!.reduce((max, pg) => Math.max(max, new Date(pg.createdAt).getTime()), fechaPedido)
        totalDias += (ultimoPago - fechaPedido) / (1000 * 60 * 60 * 24)
      }
      diasPromedioPago = Math.round(totalDias / pedidosPagados.length)
    }

    const stats: ClienteStats = {
      totalComprado,
      totalPagado,
      totalFiado,
      cantidadPedidos,
      cantidadPedidosUltimos30,
      cantidadPedidosUltimos90,
      promedioPorPedido,
      frecuenciaRealDias,
      productosFavoritos,
      evolucionMensual,
      metodosPago,
      diasPromedioPago,
    }

    return apiSuccess({ stats: JSON.parse(JSON.stringify(stats)) })
  } catch (error) {
    console.error('[API /clientes/[id]/stats]', error)
    return apiError('Error cargando estadísticas', 500)
  }
}
```

- [ ] **Step 2: Probar endpoint**

Run:
```bash
curl -s "http://localhost:3000/api/clientes/$(npx prisma db execute --stdin <<< "SELECT id FROM \"Cliente\" LIMIT 1;" | head -2 | tail -1)/stats" | jq .
```

Expected: JSON válido con `success: true`, `stats` con valores numéricos.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clientes/[id]/stats/route.ts
git commit -m "feat(api): add client stats endpoint"
```

---

## Task 4: Crear componente `ClienteHistorial`

**Files:**
- Create: `src/app/(app)/clientes/clientes-client/cliente-historial.tsx`

- [ ] **Step 1: Implementar componente**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { TimelineEvent, TimelineFilter } from './types'

const FILTROS: { key: TimelineFilter; label: string }[] = [
  { key: 'TODOS', label: 'Todo' },
  { key: 'PEDIDO', label: 'Pedidos' },
  { key: 'PAGO', label: 'Pagos' },
  { key: 'FACTURA', label: 'Facturas' },
  { key: 'ABONO', label: 'Abonos' },
  { key: 'CASO', label: 'Casos' },
  { key: 'NOTA_CREDITO', label: 'Notas crédito' },
  { key: 'AUDITORIA', label: 'Auditoría' },
]

const TIPO_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  PEDIDO: { color: 'text-blue-600', bg: 'bg-blue-500', icon: '📦' },
  PAGO: { color: 'text-green-600', bg: 'bg-green-500', icon: '💵' },
  FACTURA: { color: 'text-purple-600', bg: 'bg-purple-500', icon: '📄' },
  ABONO: { color: 'text-emerald-600', bg: 'bg-emerald-500', icon: '🏦' },
  CASO: { color: 'text-red-600', bg: 'bg-red-500', icon: '🛡️' },
  NOTA_CREDITO: { color: 'text-orange-600', bg: 'bg-orange-500', icon: '📝' },
  AUDITORIA: { color: 'text-gray-600', bg: 'bg-gray-400', icon: '⚙️' },
}

interface ClienteHistorialProps {
  clienteId: string
}

export function ClienteHistorial({ clienteId }: ClienteHistorialProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [filtro, setFiltro] = useState<TimelineFilter>('TODOS')
  const [meses, setMeses] = useState<string>('12')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  const fetchEvents = useCallback(async (nextPage = 1, append = false) => {
    setLoading(true)
    setError('')
    try {
      const url = `/api/clientes/${clienteId}/historial?meses=${meses}&page=${nextPage}&pageSize=20`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setEvents(prev => append ? [...prev, ...data.events] : data.events)
        setHasMore(data.hasMore)
        setPage(nextPage)
      } else {
        setError(data.error?.message || 'Error cargando historial')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [clienteId, meses])

  useEffect(() => {
    fetchEvents(1, false)
  }, [fetchEvents])

  const filtrados = filtro === 'TODOS'
    ? events
    : events.filter(e => e.tipo === filtro)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filtro === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={meses}
          onChange={(e) => setMeses(e.target.value)}
          className="ml-auto px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="12">Últimos 12 meses</option>
          <option value="6">Últimos 6 meses</option>
          <option value="3">Últimos 3 meses</option>
          <option value="todo">Todo el historial</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Timeline */}
      {loading && events.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="font-medium">Sin eventos en el período seleccionado</p>
          <p className="text-sm text-gray-400 mt-1">Intenta con otro filtro o rango de fechas</p>
        </div>
      ) : (
        <div className="space-y-0">
          {filtrados.map((evt) => {
            const cfg = TIPO_CONFIG[evt.tipo] || TIPO_CONFIG.AUDITORIA
            return (
              <div key={evt.id} className="flex gap-3 py-3 border-b last:border-b-0">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.bg}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{cfg.icon}</span>
                    <span className="font-medium text-gray-800 text-sm">{evt.titulo}</span>
                    {evt.numero !== undefined && (
                      <span className="text-xs text-gray-400">#{evt.numero}</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatDate(evt.fecha)}
                    </span>
                  </div>
                  {evt.descripcion && (
                    <p className="text-sm text-gray-600 mt-0.5">{evt.descripcion}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {evt.monto !== undefined && (
                      <span className={`text-sm font-semibold ${cfg.color}`}>
                        {formatCurrency(evt.monto)}
                      </span>
                    )}
                    {evt.estado && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {evt.estado}
                      </span>
                    )}
                    {evt.metodo && (
                      <span className="text-xs text-gray-500">{evt.metodo}</span>
                    )}
                    {evt.link && (
                      <a
                        href={evt.link}
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => fetchEvents(page + 1, true)}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar types y sintaxis**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/cliente-historial.tsx
git commit -m "feat(clientes): add unified timeline component"
```

---

## Task 5: Crear componente `ClienteStats`

**Files:**
- Create: `src/app/(app)/clientes/clientes-client/cliente-stats.tsx`

- [ ] **Step 1: Implementar componente**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { ClienteStats } from './types'

interface ClienteStatsProps {
  clienteId: string
}

export function ClienteStats({ clienteId }: ClienteStatsProps) {
  const [stats, setStats] = useState<ClienteStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clientes/${clienteId}/stats`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setStats(data.stats)
        else setError(data.error?.message || 'Error')
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false))
  }, [clienteId])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return <div className="text-center py-8 text-red-600 text-sm">{error}</div>
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-500">Sin datos</div>
  }

  const maxEvo = Math.max(...stats.evolucionMensual.map(e => e.total), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">Total comprado</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(stats.totalComprado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500">Total pagado</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPagado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500">Saldo pendiente</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(stats.totalFiado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500">Pedidos totales</p>
          <p className="text-xl font-bold text-purple-600">{stats.cantidadPedidos}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Promedio por pedido</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(stats.promedioPorPedido)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Frecuencia real</p>
          <p className="text-lg font-bold text-gray-800">
            {stats.frecuenciaRealDias ? `Cada ${stats.frecuenciaRealDias} días` : 'N/D'}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Días promedio para pagar</p>
          <p className="text-lg font-bold text-gray-800">
            {stats.diasPromedioPago !== null ? `${stats.diasPromedioPago} días` : 'N/D'}
          </p>
        </div>
      </div>

      {/* Pedidos recientes */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl text-center">
          <p className="text-sm text-blue-700">Últimos 30 días</p>
          <p className="text-2xl font-bold text-blue-800">{stats.cantidadPedidosUltimos30}</p>
          <p className="text-xs text-blue-600">pedidos</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl text-center">
          <p className="text-sm text-blue-700">Últimos 90 días</p>
          <p className="text-2xl font-bold text-blue-800">{stats.cantidadPedidosUltimos90}</p>
          <p className="text-xs text-blue-600">pedidos</p>
        </div>
      </div>

      {/* Productos favoritos */}
      {stats.productosFavoritos.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Productos favoritos</h3>
          <div className="space-y-2">
            {stats.productosFavoritos.map((p) => (
              <div key={p.nombre} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{p.nombre}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{p.cantidadTotal} und</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(p.totalVendido)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolución mensual (barras CSS) */}
      {stats.evolucionMensual.some(e => e.total > 0) && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolución mensual (24 meses)</h3>
          <div className="flex items-end gap-[3px] h-32">
            {stats.evolucionMensual.map((e) => {
              const h = e.total > 0 ? Math.max((e.total / maxEvo) * 100, 4) : 2
              return (
                <div key={e.mes} className="flex-1 h-full flex flex-col justify-end items-center group relative">
                  <div
                    className={`w-full rounded-t transition-all ${e.total > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-200'}`}
                    style={{ height: `${h}%`, minHeight: e.total > 0 ? '4px' : '2px' }}
                  />
                  <span className="text-[9px] text-gray-500 mt-1 rotate-45 origin-left translate-y-2">
                    {e.mes.slice(5)}
                  </span>
                  {/* Tooltip simple */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                    {e.mes}: {formatCurrency(e.total)} ({e.pedidos} pedidos)
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Métodos de pago */}
      {stats.metodosPago.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Métodos de pago</h3>
          <div className="space-y-2">
            {stats.metodosPago.map((m) => (
              <div key={m.metodo} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{m.metodo}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{m.count} veces</span>
                  <span className="font-semibold text-green-600">{formatCurrency(m.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar types y sintaxis**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/cliente-stats.tsx
git commit -m "feat(clientes): add client stats component"
```

---

## Task 6: Integrar nuevos tabs en `ClientesClient`

**Files:**
- Modify: `src/app/(app)/clientes/clientes-client/index.tsx`

- [ ] **Step 1: Eliminar estado y handlers obsoletos de pedidos/facturas/cuentas**

Buscar y eliminar del componente `ClientesClient`:
- `const [expandedPedido, setExpandedPedido] = useState<string | null>(null)`
- `const [expandedFactura, setExpandedFactura] = useState<string | null>(null)`
- `const [pedidoDetail, setPedidoDetail] = useState<Pedido | null>(null)`
- `const [_facturaDetail, setFacturaDetail] = useState<Factura | null>(null)`
- `function viewPedidoDetail(...)`
- `function viewFacturaDetail(...)`
- `function renderPedidoProductos(...)`

Importar los nuevos componentes:
```tsx
import { ClienteHistorial } from './cliente-historial'
import { ClienteStats } from './cliente-stats'
```

- [ ] **Step 2: Reemplazar array de tabs y su contenido**

Cambiar:
```tsx
{['info', 'pedidos', 'facturas', 'cuentas', 'alertas'].map((tab) => (
```

Por:
```tsx
{['info', 'historial', 'stats', 'alertas'].map((tab) => (
```

Y actualizar los labels:
```tsx
{tab === 'stats' ? 'Estadísticas' : tab === 'alertas' ? 'Alertas' : tab === 'historial' ? 'Historial' : 'Información'}
```

Eliminar los badges condicionales de `tab === 'cuentas'`.

- [ ] **Step 3: Reemplazar contenido de tabs activos**

Dentro del `div className="flex-1 overflow-y-auto p-4"`:

Eliminar TODO el bloque `{activeTab === 'pedidos' && (...)}}`, `{activeTab === 'facturas' && (...)}}`, `{activeTab === 'cuentas' && (...)}}`.

Agregar:
```tsx
{activeTab === 'historial' && <ClienteHistorial clienteId={selectedCliente.id} />}
{activeTab === 'stats' && <ClienteStats clienteId={selectedCliente.id} />}
```

- [ ] **Step 4: Limpiar imports no usados**

Eliminar `Pedido`, `Factura` de los imports si ya no se usan en el archivo (revisar si se usan en algún otro lugar del archivo antes de eliminar).

- [ ] **Step 5: Verificar types y sintaxis**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/index.tsx
git commit -m "feat(clientes): replace fragmented tabs with unified historial/stats"
```

---

## Task 7: Verificación end-to-end

- [ ] **Step 1: Ejecutar type check completo**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 2: Ejecutar tests unitarios si existen**

Run: `npm run test`
Expected: PASS (o al menos no regresiones en tests existentes)

- [ ] **Step 3: Ejecutar tests E2E relevantes**

Run: `npx playwright test e2e/clientes.spec.ts`
Expected: PASS (o ajustar tests si los tabs cambiaron)

- [ ] **Step 4: Verificar en navegador**

1. Ir a `/clientes`
2. Click en un cliente
3. Verificar que el modal abre con tab "Información" activa
4. Click en tab "Historial"
5. Verificar que carga eventos cronológicos
6. Probar filtros (Todo, Pedidos, Pagos, etc.)
7. Probar selector de meses
8. Probar "Cargar más"
9. Click en tab "Estadísticas"
10. Verificar KPIs, productos favoritos, evolución mensual
11. Click en tab "Alertas"
12. Verificar que sigue funcionando

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat(clientes): unified customer history, stats and audit timeline"
```

---

## Task 8: Documentar cambios en AGENTS.md (si aplica)

- [ ] **Step 1: Revisar si `AGENTS.md` menciona la UI de clientes**

Buscar en `AGENTS.md` referencias a tabs de cliente o historial.

- [ ] **Step 2: Actualizar si es necesario**

Si hay referencias a los tabs viejos (`pedidos`, `facturas`, `cuentas`), actualizar a `info`, `historial`, `stats`, `alertas`.

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Timeline unificado cronológico → Task 2 (endpoint) + Task 4 (UI)
- [x] Estadísticas históricas → Task 3 (endpoint) + Task 5 (UI)
- [x] Auditoría visible → Task 2 incluye `AUDITORIA` como tipo de evento
- [x] Reemplazo de tabs viejos → Task 6
- [x] Paginación por cliente → Task 2 usa offset sobre array mergeado
- [x] 12 meses por defecto → Task 2/4 usan `meses=12`
- [x] Sin librerías nuevas → Solo Tailwind + React, mismos patrones que dashboard

**2. Placeholder scan:**
- [x] Sin "TBD", "TODO", "implement later"
- [x] Código completo en cada paso
- [x] Comandos con expected output definidos

**3. Type consistency:**
- [x] `TimelineEventType` coincide en types.ts, endpoint, y componente
- [x] `ClienteStats` coincide en types.ts, endpoint, y componente
- [x] `formatCurrency` y `formatDate` son helpers existentes en la app

**4. Buenas prácticas verificadas:**
- [x] Reutiliza `apiSuccess`/`apiError` del proyecto
- [x] Reutiliza `getPaginationParams`/`getPrismaPagination`
- [x] Serializa Decimal con `JSON.parse(JSON.stringify())`
- [x] Usa `requireAuth` en endpoints
- [x] Componentes Client Component con `'use client'`
- [x] Mismo patrón de tabs manual con `useState`
- [x] Mismo patrón de timeline que `caso-detail.tsx`
- [x] Mismo patrón de KPI cards que `dashboard-client`

**5. Funcionalidad real verificada:**
- [x] Datos existen en PostgreSQL (tablas `Pedido`, `Factura`, `Caso`, `NotaCredito`, `Historial`, `Abono`, `Pago`)
- [x] Relaciones Prisma permiten las queries propuestas (`clienteId` existe en todas las tablas relevantes, excepto `NotaCredito` que se resuelve vía `pedido.clienteId`)
- [x] `logAudit` ya alimenta `Historial` en cada operación
- [x] No se requiere migración de base de datos (solo lectura)

**6. Qué NO se implementa (out of scope, pero documentado):**
- No se agrega infinite scroll real con IntersectionObserver (usa botón "Cargar más" consistente con el resto de la app)
- No se agregan gráficos con librerías externas (barras CSS puro)
- No se modifica `logAudit` para incluir `clienteId` en cada entrada (se usa la relación existente de tablas)
- No se cachea en Dexie/IndexedDB (los datos del timeline se obtienen siempre del servidor, consistente con el resto de la app)
