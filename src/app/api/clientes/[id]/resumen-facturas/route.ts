import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import { buildFacturasBaseWhere, type FacturasFiltros } from '@/lib/facturas-filtros'
import {
  abonosNetosFactura,
  conteosPorEstado,
  detalleItemsFactura,
  encabezadoResumen,
  estadosDeResumen,
  fechaMasAntigua,
  totalizarResumen,
} from '@/lib/resumen-facturas'
import { leerExigibles } from '@/lib/entregas-exigibles-db'
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

    // Sin `estado` = TODAS = solo vigentes (#977): las anuladas no se mezclan con la
    // lista; se informan aparte y nunca suman. Sin fechas = historial completo.
    const estadoPedido = parsed.data.estado ?? 'TODAS'
    const estados = estadosDeResumen(estadoPedido)
    const filtros: FacturasFiltros = {
      desde: desde ?? null,
      hasta: hasta ?? null,
      clienteId,
      facturaId: null,
      estado: null,
      pendiente: false,
      incluirAnuladas: true,
    }
    const baseWhere = buildFacturasBaseWhere(filtros)

    const [cliente, facturas, porEstado, anuladasAgg, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true, barrio: true },
      }),
      prisma.factura.findMany({
        where: { ...baseWhere, estado: { in: estados } },
        orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
        include: {
          pedido: {
            select: {
              id: true, numero: true, fecha: true, saldo: true, totalPagado: true,
              items: { select: { producto: true, cantPedido: true, cantEntrega: true, precio: true, subtotal: true } },
            },
          },
          abonos: {
            select: { fecha: true, monto: true, correcciones: { select: { montoRevertido: true } } },
          },
        },
      }),
      // Conteos para las pestañas: mismo cliente y período, sin filtrar por estado.
      prisma.factura.groupBy({
        by: ['estado'],
        where: baseWhere,
        _count: { _all: true },
      }),
      // Anuladas del cliente/período: se informan aparte y nunca suman (#977).
      prisma.factura.aggregate({
        where: { ...baseWhere, estado: 'ANULADA' },
        _count: { _all: true },
        _sum: { total: true },
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

    const fmtFechaCorta = (d: Date): string =>
      d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })

    function formatFechaISO(d: Date): string {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    }

    // Lo que se debe AHORA es la deuda exigible (lo entregado menos lo pagado), la
    // misma que usan Fiados, Dashboard y Cartera (#656): el resumen no cobra lo
    // que aún no se entregó. Sin pedido enlazado se usa el saldo de la factura.
    const pedidoIds = facturas.map((f) => f.pedido?.id).filter((id): id is string => Boolean(id))
    const exigibles = pedidoIds.length > 0 ? await leerExigibles(prisma, { id: { in: pedidoIds } }) : new Map<string, number>()
    const debeDe = (f: (typeof facturas)[number]): number =>
      f.estado === 'ANULADA' ? 0 : f.pedido ? exigibles.get(f.pedido.id) ?? 0 : Number(f.saldo)

    const filas = facturas.map((f) => ({
      estado: f.estado,
      total: Number(f.total),
      montoPagado: Number(f.montoPagado || 0),
      saldo: debeDe(f),
    }))
    const { totales } = totalizarResumen(filas)
    const anuladas = { count: anuladasAgg._count._all, totalHistorico: Number(anuladasAgg._sum.total ?? 0) }
    const masAntigua = fechaMasAntigua(
      facturas.map((f) => ({ fecha: formatFechaISO(f.fecha), estado: f.estado, saldo: debeDe(f) })),
    )
    const conteos = conteosPorEstado(porEstado.map((g) => ({ estado: g.estado, count: g._count._all })))

    return apiSuccess({
      cliente,
      periodo: { desde: desde ?? null, hasta: hasta ?? null },
      filtro: { estado: estadoPedido },
      // Cifra principal según la pestaña: la misma lógica que usa el PDF (#977).
      encabezado: encabezadoResumen(estadoPedido, totales, anuladas, masAntigua),
      conteos,
        facturas: facturas.map((f) => {
          const saldo = Number(f.saldo)
          const montoPagado = Number(f.montoPagado || 0)

          const pedidoSaldo = f.pedido ? Number(f.pedido.saldo) : null
          const pedidoPagado = f.pedido ? Number(f.pedido.totalPagado) : null
          const tieneDesfase = (pedidoSaldo !== null && pedidoSaldo !== saldo) ||
                               (pedidoPagado !== null && pedidoPagado !== montoPagado)

          const abonos = abonosNetosFactura(
            f.abonos.map((a) => ({
              fecha: a.fecha,
              monto: Number(a.monto),
              revertido: a.correcciones.reduce((acc, x) => acc + Number(x.montoRevertido), 0),
            })),
            montoPagado,
          )

          return {
            id: f.id,
            numero: f.numero,
            fecha: formatFechaISO(f.fecha),
            total: Number(f.total),
            montoPagado,
            saldo,
            debe: debeDe(f),
            // Estado guardado: el mismo que usa la lista y el filtro (#758).
            estado: f.estado,
            ...detalleItemsFactura(
              (f.pedido?.items ?? []).map((i) => ({
                producto: i.producto,
                cantPedido: i.cantPedido,
                cantEntrega: i.cantEntrega,
                precio: Number(i.precio),
                subtotal: Number(i.subtotal),
              })),
              Number(f.total),
            ),
            abonos: abonos ? abonos.map((a) => ({ fechaTxt: fmtFechaCorta(a.fecha), monto: a.monto })) : null,
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
