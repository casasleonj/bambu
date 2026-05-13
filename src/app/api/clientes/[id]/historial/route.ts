import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getPaginationParams, getPrismaPagination } from '@/lib/pagination'
import type { TimelineEvent } from '@/app/(app)/clientes/clientes-client/types'

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

    // Notas de crédito fallback
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
