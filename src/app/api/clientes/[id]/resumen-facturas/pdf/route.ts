import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import { buildFacturasBaseWhere, type FacturasFiltros } from '@/lib/facturas-filtros'
import {
  abonosNetosFactura,
  detalleItemsFactura,
  encabezadoResumen,
  estadosDeResumen,
  fechaMasAntigua,
  totalizarResumen,
  type EstadoResumenEntrada,
} from '@/lib/resumen-facturas'
import { ResumenFacturasPdf, datoTexto, dinero, type ResumenPdfData, type ResumenPdfFactura } from '@/lib/resumen-facturas-pdf'
import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const ESTADO_PDF: Record<'EMITIDA' | 'PARCIAL' | 'PAGADA', { texto: string; color: string }> = {
  EMITIDA: { texto: 'Sin pagar', color: '#2563eb' },
  PARCIAL: { texto: 'Pago parcial', color: '#d97706' },
  PAGADA: { texto: 'Pagada', color: '#15803d' },
}

const CONTEXTO_TXT = { POR_COBRAR: 'Por cobrar', PAGADA: 'Pagadas', TODAS: 'Vigentes' } as const

const fmtFecha = (d: Date): string =>
  d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })

function periodoTxt(desde?: string, hasta?: string): string {
  const f = (iso: string) => iso.split('-').reverse().join('/')
  if (desde && hasta) return `${f(desde)} - ${f(hasta)}`
  if (desde) return `Desde ${f(desde)}`
  if (hasta) return `Hasta ${f(hasta)}`
  return 'Historial completo'
}

/** Nombre de archivo ASCII y sin caracteres de ruta. */
function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente'
}

/**
 * PDF del resumen de cuenta para compartir con el cliente (#845). Solo ADMIN y
 * ASISTENTE (decisión delegada por el PO). Nunca incluye anuladas. Es de solo
 * lectura: no cambia facturas, pagos ni saldos.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['ADMIN', 'ASISTENTE'])
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
    })
    if (!parsed.success) return apiError('Datos inválidos', 400)
    if (parsed.data.estado === 'ANULADA') {
      return apiError('Las facturas anuladas no se comparten con el cliente', 400)
    }

    // Mismo contenido que la pantalla (#977): la pestaña manda y las anuladas no se mezclan.
    const estadoPedido: EstadoResumenEntrada = parsed.data.estado ?? 'TODAS'
    const filtros: FacturasFiltros = {
      desde: desde ?? null,
      hasta: hasta ?? null,
      clienteId,
      facturaId: null,
      estado: null,
      pendiente: false,
      incluirAnuladas: false,
    }
    const baseWhere = buildFacturasBaseWhere(filtros)

    const [cliente, facturas, anuladasAgg, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { nombre: true, apellido: true, telefono: true, direccion: true, barrio: true },
      }),
      prisma.factura.findMany({
        where: { ...baseWhere, estado: { in: estadosDeResumen(estadoPedido) } },
        orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
        include: {
          pedido: {
            select: { id: true, items: { select: { producto: true, cantPedido: true, cantEntrega: true, precio: true, subtotal: true } } },
          },
          abonos: {
            select: { fecha: true, monto: true, correcciones: { select: { montoRevertido: true } } },
          },
        },
      }),
      prisma.factura.aggregate({
        where: { ...baseWhere, estado: 'ANULADA' },
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.config.findMany({
        where: { clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono'] } },
      }),
    ])

    if (!cliente) return apiError('Cliente no encontrado', 404)
    if (facturas.length === 0) return apiError('No hay facturas para compartir con ese filtro', 404)

    const empresa: Record<string, string> = {}
    empresaConfigs.forEach((cfg) => { empresa[cfg.clave] = cfg.valor })

    // Misma deuda exigible que la pantalla, Fiados y Cartera (#656/#977).
    const pedidoIds = facturas.map((f) => f.pedido?.id).filter((id): id is string => Boolean(id))
    const exigibles = pedidoIds.length > 0 ? await leerExigibles(prisma, { id: { in: pedidoIds } }) : new Map<string, number>()
    const debeDe = (f: (typeof facturas)[number]): number =>
      f.estado === 'ANULADA' ? 0 : f.pedido ? exigibles.get(f.pedido.id) ?? 0 : Number(f.saldo)

    const filas: ResumenPdfFactura[] = facturas.map((f) => {
      const total = Number(f.total)
      const montoPagado = Number(f.montoPagado || 0)
      const detalle = detalleItemsFactura(
        (f.pedido?.items ?? []).map((i) => ({
          producto: i.producto,
          cantPedido: i.cantPedido,
          cantEntrega: i.cantEntrega,
          precio: Number(i.precio),
          subtotal: Number(i.subtotal),
        })),
        total,
      )
      const abonos = abonosNetosFactura(
        f.abonos.map((a) => ({
          fecha: a.fecha,
          monto: Number(a.monto),
          revertido: a.correcciones.reduce((acc, x) => acc + Number(x.montoRevertido), 0),
        })),
        montoPagado,
      )
      const ui = ESTADO_PDF[f.estado as keyof typeof ESTADO_PDF] ?? ESTADO_PDF.EMITIDA
      return {
        numero: f.numero,
        fechaTxt: fmtFecha(f.fecha),
        estadoTxt: ui.texto,
        color: ui.color,
        total,
        montoPagado,
        debe: debeDe(f),
        items: detalle.items,
        pendientes: detalle.pendientes,
        pendienteMonto: detalle.pendienteMonto,
        otrosAjustes: detalle.otrosAjustes,
        abonos: abonos ? abonos.map((a) => ({ fechaTxt: fmtFecha(a.fecha), monto: a.monto })) : null,
      }
    })

    const { totales } = totalizarResumen(
      facturas.map((f) => ({
        estado: f.estado,
        total: Number(f.total),
        montoPagado: Number(f.montoPagado || 0),
        saldo: debeDe(f),
      })),
    )
    const anuladas = { count: anuladasAgg._count._all, totalHistorico: Number(anuladasAgg._sum.total ?? 0) }
    const masAntigua = fechaMasAntigua(
      facturas.map((f) => ({
        fecha: f.fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
        estado: f.estado,
        saldo: debeDe(f),
      })),
    )
    const encabezado = encabezadoResumen(estadoPedido, totales, anuladas, masAntigua)
    const fechaLarga = (iso: string): string => fmtFecha(new Date(`${iso}T12:00:00-05:00`))
    const porCobrar = estadoPedido === 'POR_COBRAR' || estadoPedido === 'EMITIDA' || estadoPedido === 'PARCIAL'

    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
    const data: ResumenPdfData = {
      empresa: {
        nombre: empresa.empresa_nombre || 'Agua Bambú SAS',
        nit: empresa.empresa_nit || '',
        direccion: empresa.empresa_direccion || '',
        telefono: empresa.empresa_telefono || '',
      },
      clienteNombre: nombre,
      clienteTelefono: cliente.telefono ?? '',
      clienteDireccion: [cliente.direccion, cliente.barrio].filter(Boolean).join(', '),
      generadoTxt: new Date().toLocaleString('es-CO', {
        timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      encabezado,
      datosTxt: encabezado.datos.map((d) => ({ etiqueta: d.etiqueta, valor: datoTexto(d, fechaLarga) })),
      contextoTxt: `${CONTEXTO_TXT[porCobrar ? 'POR_COBRAR' : estadoPedido === 'PAGADA' ? 'PAGADA' : 'TODAS']} (${totales.count}) · ${periodoTxt(desde, hasta)} · de la más antigua a la más reciente`,
      facturas: filas,
      pie: porCobrar ? { etiqueta: `Suma de las ${totales.count} por cobrar`, monto: totales.saldo } : null,
      anuladasTxt: estadoPedido === 'TODAS' && anuladas.count > 0
        ? `Anuladas aparte: ${anuladas.count} (${dinero(anuladas.totalHistorico)}). No son venta ni deuda y no suman.`
        : null,
    }

    const buffer = await renderToBuffer(ResumenFacturasPdf({ data }))
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '')

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Resumen-${slug(nombre)}-${hoy}.pdf"`,
        // Datos financieros del cliente: nunca en caché compartida.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error generando PDF del resumen de facturas')
    return apiError('No se pudo generar el PDF', 500)
  }
}
