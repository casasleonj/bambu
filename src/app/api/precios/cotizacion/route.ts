import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { PRODUCT_CODES } from '@/lib/pricing'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { parsePreciosEspeciales } from '@/modules/pedidos/domain/services/pricing-algorithm.service'

const Entrada = z.object({
  clienteId: z.string().trim().min(1).nullish(),
  negocioId: z.string().trim().min(1).nullish(),
  clienteNuevoTelefono: z.string().trim().min(1).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']),
})

/**
 * Contexto de cálculo LOCAL para un solo comprador y canal (#925).
 * Nunca compartido en caches CDN/browser; no se solicitan precios por clic.
 * El preview y el commit permanecen autoritativos para crédito, permisos
 * y precios definitivos. La versión es digest del contenido, no un reloj.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const autorizado = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (autorizado instanceof Response) return autorizado

  try {
    const input = Entrada.safeParse(await request.json())
    if (!input.success) return apiError('Contexto de precios inválido', 400)

    const { negocioId, canal, clienteNuevoTelefono } = input.data
    let clienteId = input.data.clienteId
    // Un cliente nuevo con teléfono ya existente debe obtener sus precios
    // especiales, igual que PreviewPedidoUseCase y CrearPedidoUseCase.
    if (!clienteId && clienteNuevoTelefono) {
      const existente = await prisma.cliente.findFirst({
        where: { telefono: clienteNuevoTelefono },
        select: { id: true },
      })
      clienteId = existente?.id ?? 'CONSUMIDOR_FINAL'
    }
    if (!clienteId) return apiError('Selecciona un comprador', 400)

    if (negocioId) {
      const negocio = await prisma.negocio.findUnique({
        where: { id: negocioId },
        select: { clienteId: true },
      })
      if (!negocio || negocio.clienteId !== clienteId) {
        return apiError('El negocio no corresponde al comprador', 422)
      }
    } else if (clienteId !== 'CONSUMIDOR_FINAL') {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true },
      })
      if (!cliente) return apiError('Comprador no encontrado', 404)
    }

    const pricing = await new PrismaPricingAdapter().loadPricingContext(
      clienteId,
      negocioId ?? null,
      [...PRODUCT_CODES],
    )

    // Solo entregar los overrides efectivos del canal solicitado. No exponer
    // precios de otros compradores, tiendas ni del canal alternativo.
    const especiales = pricing.clienteOverrides
      ? parsePreciosEspeciales(JSON.stringify(pricing.clienteOverrides))[canal]
      : {}
    const permitidos = new Set<string>(PRODUCT_CODES)
    const clienteOverrides = Object.fromEntries(
      Object.entries(especiales)
        .filter(([codigo, valor]) => permitidos.has(codigo) && typeof valor === 'number' && Number.isFinite(valor)),
    ) as Record<string, number>
    const contexto = {
      clienteId,
      negocioId: negocioId ?? null,
      canal,
      pricing: {
        clienteOverrides,
        tiersByCode: pricing.tiersByCode,
        productosByCode: pricing.productosByCode,
      },
    }
    const version = createHash('sha256').update(JSON.stringify(contexto)).digest('hex')
    const response = apiSuccess({ ...contexto, version })
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'desconocido' }, 'Error preparando contexto de precios')
    return apiError('No se pudo cargar el contexto de precios', 500)
  }
}
