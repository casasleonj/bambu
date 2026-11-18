import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ResumenFacturasQuerySchema } from '@/lib/validators'
import { buildFacturasListWhere, type FacturaEstado, type FacturasFiltros } from '@/lib/facturas-filtros'
import { abonosNetosFactura, detalleItemsFactura, totalizarResumen } from '@/lib/resumen-facturas'
import { ResumenFacturasPdf, type ResumenPdfData, type ResumenPdfFactura } from '@/lib/resumen-facturas-pdf'
import { apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const ESTADO_PDF: Record<'EMITIDA' | 'PARCIAL' | 'PAGADA', { texto: string; color: string }> = {
  EMITIDA: { texto: 'Sin pagar', color: '#2563eb' },
  PARCIAL: { texto: 'Pago parcial', color: '#d97706' },
  PAGADA: { texto: 'Pagada', color: '#15803d' },
}

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

    const estado: FacturaEstado | null =
      parsed.data.estado && parsed.data.estado !== 'TODAS' ? parsed.data.estado : null
    const filtros: FacturasFiltros = {
      desde: desde ?? null,
      hasta: hasta ?? null,
      clienteId,
      facturaId: null,
      estado,
      pendiente: false,
      incluirAnuladas: false,
    }

    const [cliente, facturas, empresaConfigs] = await Promise.all([
      prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, apellido: true } }),
      prisma.factura.findMany({
        where: buildFacturasListWhere(filtros),
        orderBy: { fecha: 'asc' },
        include: {
          pedido: {
            select: { items: { select: { producto: true, cantPedido: true, cantEntrega: true, precio: true, subtotal: true } } },
          },
          abonos: {
            select: { fecha: true, monto: true, correcciones: { select: { montoRevertido: true } } },
          },
        },
      }),
      prisma.config.findMany({
        where: { clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono'] } },
      }),
    ])

    if (!cliente) return apiError('Cliente no encontrado', 404)
    if (facturas.length === 0) return apiError('No hay facturas para compartir con ese filtro', 404)

    const empresa: Record<string, string> = {}
    empresaConfigs.forEach((cfg) => { empresa[cfg.clave] = cfg.valor })

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
        saldo: Number(f.saldo),
        items: detalle.items,
        otrosAjustes: detalle.otrosAjustes,
        abonos: abonos ? abonos.map((a) => ({ fechaTxt: fmtFecha(a.fecha), monto: a.monto })) : null,
      }
    })

    const { totales } = totalizarResumen(
      facturas.map((f) => ({
        estado: f.estado,
        total: Number(f.total),
        montoPagado: Number(f.montoPagado || 0),
        saldo: Number(f.saldo),
      })),
    )

    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
    const data: ResumenPdfData = {
      empresa: {
        nombre: empresa.empresa_nombre || 'Agua Bambú SAS',
        nit: empresa.empresa_nit || '',
        direccion: empresa.empresa_direccion || '',
        telefono: empresa.empresa_telefono || '',
      },
      clienteNombre: nombre,
      periodoTxt: periodoTxt(desde, hasta),
      generadoTxt: new Date().toLocaleString('es-CO', {
        timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      facturas: filas,
      totales,
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
