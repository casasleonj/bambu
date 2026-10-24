import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import { buildDateRangeFilter } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Mismo alcance que GET /api/facturas: es información financiera.
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult

  const { id: clienteId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde') || undefined
    const hasta = searchParams.get('hasta') || undefined

    const parsed = ResumenFacturasQuerySchema.safeParse({ clienteId, desde, hasta })
    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    // Sin fechas = historial completo; sin tope de meses (lo limita el rango).
    const fecha = buildDateRangeFilter(desde, hasta)

    const [cliente, facturas, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true, barrio: true },
      }),
      prisma.factura.findMany({
        where: {
          clienteId,
          ...(fecha ? { fecha } : {}),
          estado: { not: 'ANULADA' },
        },
        orderBy: { fecha: 'asc' },
        include: {
          pedido: { select: { id: true, numero: true, fecha: true, saldo: true, totalPagado: true } },
        },
      }),
      prisma.config.findMany({
        where: {
          clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono', 'empresa_email'] },
        },
      }),
    ])

    if (!cliente) {
      return apiError('Cliente no encontrado', 404)
    }

    const empresaMap: Record<string, string> = {}
    empresaConfigs.forEach((c) => { empresaMap[c.clave] = c.valor })

    function formatFechaISO(d: Date): string {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    }

    const total = facturas.reduce((sum, f) => sum + Number(f.total), 0)
    const totalPagado = facturas.reduce((sum, f) => sum + Number(f.montoPagado || 0), 0)
    const saldoTotal = facturas.reduce((sum, f) => sum + Number(f.saldo), 0)

    return apiSuccess({
      cliente,
      periodo: { desde: desde ?? null, hasta: hasta ?? null },
        facturas: facturas.map((f) => {
          const saldo = Number(f.saldo)
          const montoPagado = Number(f.montoPagado || 0)
          const estadoDerivado = saldo <= 0 ? 'PAGADA' : (montoPagado > 0 ? 'PARCIAL' : 'EMITIDA')

          const pedidoSaldo = f.pedido ? Number(f.pedido.saldo) : null
          const pedidoPagado = f.pedido ? Number(f.pedido.totalPagado) : null
          const tieneDesfase = (pedidoSaldo !== null && pedidoSaldo !== saldo) ||
                               (pedidoPagado !== null && pedidoPagado !== montoPagado)

          return {
            id: f.id,
            numero: f.numero,
            fecha: formatFechaISO(f.fecha),
            total: Number(f.total),
            montoPagado,
            saldo,
            estado: estadoDerivado,
            pedidoNumero: f.pedido?.numero ?? null,
            pedidoId: f.pedido?.id ?? null,
            desfase: tieneDesfase ? {
              facturaSaldo: saldo,
              pedidoSaldo,
              facturaPagado: montoPagado,
              pedidoPagado,
            } : null,
          }
        }),
      totales: { total, totalPagado, saldo: saldoTotal, count: facturas.length },
      empresa: {
        nombre: empresaMap.empresa_nombre || 'Agua Bambú SAS',
        nit: empresaMap.empresa_nit || '900.123.456-7',
        direccion: empresaMap.empresa_direccion || '',
        telefono: empresaMap.empresa_telefono || '',
        email: empresaMap.empresa_email || '',
      },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error generando resumen de facturas')
    return apiError('Error generando resumen', 500)
  }
}
