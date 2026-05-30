import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { parsePreciosEspeciales } from '@/lib/pricing'

/**
 * GET /api/precios/impacto?productoId=X&precioNuevo=Y
 * 
 * Analiza el impacto de cambiar un precio base.
 * Retorna: clientes afectados con preciosEspeciales, pedidos pendientes, desviación %.
 * 
 * Solo ADMIN (quien puede cambiar precios).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const productoId = searchParams.get('productoId')
    const precioNuevoStr = searchParams.get('precioNuevo')

    if (!productoId || !precioNuevoStr) {
      return apiError('productoId y precioNuevo son requeridos', 400)
    }

    const precioNuevo = parseFloat(precioNuevoStr)
    if (isNaN(precioNuevo) || precioNuevo < 0) {
      return apiError('precioNuevo debe ser un número válido >= 0', 400)
    }

    // 1. Buscar producto actual
    const producto = await prisma.producto.findUnique({
      where: { id: productoId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        precioBase: true,
      },
    })

    if (!producto) {
      return apiError('Producto no encontrado', 404)
    }

    const precioActual = Number(producto.precioBase)
    const cambioPorcentaje = precioActual > 0 
      ? ((precioNuevo - precioActual) / precioActual) * 100 
      : 0

    // 2. Buscar clientes con preciosEspeciales que contengan este código
    const clientesConEspeciales = await prisma.cliente.findMany({
      where: {
        preciosEspeciales: {
          contains: producto.codigo,
        },
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        preciosEspeciales: true,
      },
    })

    // Parsear y extraer el precio especial de cada cliente
    const clientesAfectados = clientesConEspeciales.map(cliente => {
      const parsed = parsePreciosEspeciales(cliente.preciosEspeciales)
      const precioEspecialDomicilio = parsed.DOMICILIO?.[producto.codigo] || null
      const precioEspecialPunto = parsed.PUNTO?.[producto.codigo] || null
      const precioEspecial = precioEspecialDomicilio || precioEspecialPunto || 0
      
      const desviacion = precioEspecial > 0 
        ? ((precioNuevo - precioEspecial) / precioEspecial) * 100 
        : 0

      return {
        id: cliente.id,
        nombre: `${cliente.nombre}${cliente.apellido ? ' ' + cliente.apellido : ''}`,
        precioEspecial,
        desviacion: Math.round(desviacion * 10) / 10,
      }
    }).filter(c => c.precioEspecial > 0) // Solo los que realmente tienen especial para este producto

    // 3. Contar pedidos pendientes con este producto
    const pedidosPendientes = await prisma.pedido.count({
      where: {
        estadoEntrega: { notIn: ['ENTREGADO', 'CANCELADO', 'ANULADO'] },
        items: {
          some: {
            producto: producto.codigo,
          },
        },
      },
    })

    // 4. Obtener rangos existentes para contexto
    const rangosExistentes = await prisma.precioVolumen.findMany({
      where: {
        productoId,
        activo: true,
      },
      select: {
        cantMin: true,
        cantMax: true,
        precio: true,
      },
      orderBy: { cantMin: 'asc' },
    })

    return apiSuccess({
      impacto: {
        productoNombre: producto.nombre,
        productoCodigo: producto.codigo,
        precioActual,
        precioNuevo,
        cambioPorcentaje: Math.round(cambioPorcentaje * 10) / 10,
        clientesAfectados,
        pedidosPendientes,
        rangosExistentes: rangosExistentes.map(r => ({
          cantMin: r.cantMin,
          cantMax: r.cantMax,
          precio: Number(r.precio),
        })),
      },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error analyzing price impact:')
    return apiError('Error analyzing price impact', 500)
  }
}
