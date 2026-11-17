import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { correccionPagoActiva } from '@/lib/correccion-pago-flag'
import { armarHistorialPagos, ocultarDetalleCorrecciones, type HistorialPagos } from '@/lib/factura-historial-pagos'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  // #556: la lectura también es del ASISTENTE.
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR', 'ASISTENTE'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { id } = await params

    const factura = await prisma.factura.findUnique({
      where: { id },
      include: {
        cliente: true,
        pedido: {
          include: {
            items: true,
          },
        },
        abonos: {
          orderBy: { fecha: 'desc' },
        },
        notasCredito: true,
        createdBy: {
          select: { username: true },
        },
      },
    })

    if (!factura) {
      return apiError('Factura no encontrada', 404)
    }

    // #796 (paso 1): historial de pagos armado desde los PAGOS (cada uno una vez, también el que no tiene abono).
    // Si falla, la factura se entrega igual y la pantalla muestra su estado de error; `abonos` se conserva.
    let historialPagos: HistorialPagos | null = null
    let historialPagosError = false
    // Quién puede imprimir el historial INTERNO lo decide el servidor (mismos roles que ven el detalle de las correcciones).
    let puedeVerHistorialInterno = false
    try {
      const [pagos, abonosConCorreccion] = await Promise.all([
        prisma.pago.findMany({
          where: { pedidoId: factura.pedidoId },
          select: {
            id: true, metodo: true, monto: true, createdAt: true, ocurridoAt: true, confirmacion: true,
            // ADR-002: correcciones ancladas al pago (existen solo si el pago no tiene abono).
            correcciones: {
              select: {
                id: true, numero: true, tipo: true, montoRevertido: true, motivo: true, createdAt: true,
                autorizadoPor: { select: { nombre: true, username: true } },
              },
            },
          },
        }),
        prisma.abono.findMany({
          where: { facturaId: factura.id },
          select: {
            id: true, numero: true, monto: true, metodoPago: true, fecha: true, pagoOrigenId: true,
            correcciones: {
              select: {
                id: true, numero: true, tipo: true, montoRevertido: true, motivo: true, createdAt: true,
                autorizadoPor: { select: { nombre: true, username: true } },
              },
            },
          },
        }),
      ])
      const completo = armarHistorialPagos(
        pagos.map((p) => ({
          ...p, metodo: String(p.metodo), confirmacion: String(p.confirmacion),
          correcciones: p.correcciones.map((c) => ({ ...c, autorizadoPor: c.autorizadoPor?.nombre?.trim() || c.autorizadoPor?.username || null })),
        })),
        abonosConCorreccion.map((a) => ({
          ...a,
          correcciones: a.correcciones.map((c) => ({ ...c, autorizadoPor: c.autorizadoPor?.nombre?.trim() || c.autorizadoPor?.username || null })),
        })),
      )
      // Condición del PO: no ampliar privilegios. Hoy el ASISTENTE lee la factura pero no el detalle de las correcciones.
      const rol = (authResult.user as { role?: string } | undefined)?.role
      puedeVerHistorialInterno = rol === 'ADMIN' || rol === 'CONTADOR'
      // «Corregir»: solo ADMIN y CONTADOR (misma regla que corregir un abono, #309). Corregir un pago SIN abono además exige
      // la bandera encendida (ADR-002); mientras esté apagada esas filas no ofrecen la acción.
      const conAcciones: HistorialPagos = {
        ...completo,
        pagos: completo.pagos.map((p) => ({
          ...p,
          corregir: puedeVerHistorialInterno && p.corregir && (p.corregir.via === 'ABONO' || correccionPagoActiva()) ? p.corregir : null,
        })),
      }
      historialPagos = puedeVerHistorialInterno ? conAcciones : ocultarDetalleCorrecciones(conAcciones)
    } catch (err) {
      historialPagosError = true
      logger.error({ err: err instanceof Error ? err.message : 'Unknown', facturaId: id }, 'factura: no se pudo armar el historial de pagos')
    }

    return apiSuccess({ factura, historialPagos, historialPagosError, puedeVerHistorialInterno })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching factura:')
    return apiError('Error fetching factura', 500)
  }
}
