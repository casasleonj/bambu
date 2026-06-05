import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import { getDateRange } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id: clienteId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    const parsed = ResumenFacturasQuerySchema.safeParse({ clienteId, desde, hasta })
    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    const { startDate, endDate } = getDateRange(desde!, hasta!)

    // Período máximo 3 meses
    const diffMs = endDate.getTime() - startDate.getTime()
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30)
    if (diffMonths > 3) {
      return apiError('El período no puede exceder 3 meses', 400)
    }

    const [cliente, facturas, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true, barrio: true, nombreNegocio: true },
      }),
      prisma.factura.findMany({
        where: {
          clienteId,
          fecha: { gte: startDate, lt: endDate },
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
      periodo: { desde, hasta },
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
