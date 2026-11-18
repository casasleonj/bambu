import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import {
  buildFacturasBaseWhere,
  buildFacturasListWhere,
  type FacturaEstado,
  type FacturasFiltros,
} from '@/lib/facturas-filtros'
import { conteosPorEstado, totalizarResumen } from '@/lib/resumen-facturas'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Mismo alcance que GET /api/facturas (decisión del PO #556): ADMIN, CONTADOR
  // y ASISTENTE leen facturas. Es información financiera; el servidor decide.
  const authResult = await requireRole(['ADMIN', 'CONTADOR', 'ASISTENTE'])
  if (authResult instanceof Response) return authResult

  const { id: clienteId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde') || undefined
    const hasta = searchParams.get('hasta') || undefined

    const parsed = ResumenFacturasQuerySchema.safeParse({
      clienteId,
      desde,
      hasta,
      estado: searchParams.get('estado')?.toUpperCase() || undefined,
      incluirAnuladas: searchParams.get('incluirAnuladas') || undefined,
    })
    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    // Sin `estado` (enlaces antiguos) = TODAS, con las anuladas visibles pero
    // sin sumar. Sin fechas = historial completo; el rango es el único límite.
    const estado: FacturaEstado | null =
      parsed.data.estado && parsed.data.estado !== 'TODAS' ? parsed.data.estado : null
    const filtros: FacturasFiltros = {
      desde: desde ?? null,
      hasta: hasta ?? null,
      clienteId,
      facturaId: null,
      estado,
      pendiente: false,
      incluirAnuladas: parsed.data.incluirAnuladas !== 'false',
    }

    const [cliente, facturas, porEstado, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true, barrio: true },
      }),
      prisma.factura.findMany({
        where: buildFacturasListWhere(filtros),
        orderBy: { fecha: 'asc' },
        include: {
          pedido: { select: { id: true, numero: true, fecha: true, saldo: true, totalPagado: true } },
        },
      }),
      // Conteos para las pestañas: mismo cliente y período, sin filtrar por estado.
      prisma.factura.groupBy({
        by: ['estado'],
        where: buildFacturasBaseWhere(filtros),
        _count: { _all: true },
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

    const filas = facturas.map((f) => ({
      estado: f.estado,
      total: Number(f.total),
      montoPagado: Number(f.montoPagado || 0),
      saldo: Number(f.saldo),
    }))
    const { totales, anuladas } = totalizarResumen(filas)
    const conteos = conteosPorEstado(porEstado.map((g) => ({ estado: g.estado, count: g._count._all })))

    return apiSuccess({
      cliente,
      periodo: { desde: desde ?? null, hasta: hasta ?? null },
      filtro: { estado: estado ?? 'TODAS', incluirAnuladas: filtros.incluirAnuladas },
      conteos,
        facturas: facturas.map((f) => {
          const saldo = Number(f.saldo)
          const montoPagado = Number(f.montoPagado || 0)

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
            // Estado guardado: el mismo que usa la lista y el filtro (#758).
            estado: f.estado,
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
      totales,
      anuladas,
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
