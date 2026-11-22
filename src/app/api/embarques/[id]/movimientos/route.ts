import { z } from 'zod'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma, type TipoMovimiento } from '@prisma/client'
import { isDeepStrictEqual } from 'node:util'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { CUSTODIAS, validarMovimientoFisico } from '@/modules/embarques/domain/services/ledger-fisico.service'

/**
 * GET /api/embarques/[id]/movimientos — lista el ledger físico del embarque
 * (contrato §8), más reciente primero. Mismo control de acceso que
 * GET /api/embarques/[id] (dueño del embarque o rol privilegiado).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const { searchParams } = new URL(request.url)
    const tipoParam = searchParams.get('tipo')
    const tipos = tipoParam ? tipoParam.split(',').filter(Boolean) : undefined

    const movimientos = await prisma.embarqueMovimiento.findMany({
      where: {
        embarqueId: id,
        ...(tipos && tipos.length > 0 ? { tipo: { in: tipos as TipoMovimiento[] } } : {}),
      },
      include: {
        autorizador: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess({ movimientos })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando movimientos físicos')
    return apiError('Error listando movimientos físicos', 500)
  }
}

/** Datos que identifican un único movimiento, incluso si se retransmite tras perder conexión. */
interface MovimientoReintentable {
  embarqueId: string
  tipo: string
  producto: string
  cantidad: number
  origen: string | null
  destino: string | null
  metadata: unknown
  authorization: string | null
  userId: string | null
}

function esElMismoMovimiento(registrado: MovimientoReintentable, enviado: MovimientoReintentable): boolean {
  return registrado.embarqueId === enviado.embarqueId &&
    registrado.tipo === enviado.tipo &&
    registrado.producto === enviado.producto &&
    registrado.cantidad === enviado.cantidad &&
    registrado.origen === enviado.origen &&
    registrado.destino === enviado.destino &&
    registrado.authorization === enviado.authorization &&
    registrado.userId === enviado.userId &&
    // La serialización JSON puede cambiar el orden de las claves entre reintentos.
    isDeepStrictEqual(registrado.metadata ?? null, enviado.metadata ?? null)
}

async function recuperarMovimientoIdempotente(offlineId: string, esperado: MovimientoReintentable) {
  const existente = await prisma.embarqueMovimiento.findUnique({
    where: { offlineId },
    include: { autorizador: { select: { id: true, nombre: true } } },
  })
  if (!existente) return null
  if (!esElMismoMovimiento(existente, esperado)) {
    // No revelar datos de otro embarque ni marcar una operación distinta como realizada.
    return apiError('Esta referencia corresponde a otro movimiento. Verifica el estado antes de reintentar.', 409, {
      code: 'REFERENCIA_MOVIMIENTO_DISTINTA',
    })
  }
  return apiSuccess({ movimiento: existente, deduped: true })
}

const MovimientoSchema = z.object({
  tipo: z.enum(['REEMPAQUE', 'DESCARTE', 'CUSTODY_TRANSFER', 'AJUSTE_AUTORIZADO']),
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  origen: z.enum(CUSTODIAS).optional(),
  destino: z.enum(CUSTODIAS).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  authorization: z.string().optional(),
  offlineId: z.string().trim().min(1).optional(),
})

/**
 * POST /api/embarques/[id]/movimientos — registra un movimiento físico genérico
 * del ledger (contrato §8): REEMPAQUE, DESCARTE, CUSTODY_TRANSFER o
 * AJUSTE_AUTORIZADO. `cantidad` siempre positiva; el efecto lo determina `tipo`.
 * AJUSTE_AUTORIZADO exige metadata.effect + authorization + userId.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = MovimientoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const errores = validarMovimientoFisico({
      tipo: parsed.data.tipo,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      origen: parsed.data.origen,
      destino: parsed.data.destino,
      metadata: parsed.data.metadata as { effect?: 'INCREASE' | 'DECREASE' } | undefined,
      authorization: parsed.data.authorization,
      userId: auth.user?.id,
    })
    if (errores.length > 0) {
      return apiError(errores.join('; '), 400)
    }

    // La referencia identifica una operación en UN embarque, no cualquier fila global.
    const esperado: MovimientoReintentable = {
      embarqueId: id,
      tipo: parsed.data.tipo,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      origen: parsed.data.origen ?? null,
      destino: parsed.data.destino ?? null,
      metadata: parsed.data.metadata ?? null,
      authorization: parsed.data.authorization ?? null,
      userId: parsed.data.tipo === 'AJUSTE_AUTORIZADO' ? auth.user?.id ?? null : null,
    }
    if (parsed.data.offlineId) {
      const anterior = await recuperarMovimientoIdempotente(parsed.data.offlineId, esperado)
      if (anterior) return anterior
    }

    try {
      const creado = await prisma.embarqueMovimiento.create({
        data: {
          embarqueId: id,
          tipo: parsed.data.tipo,
          producto: parsed.data.producto,
          cantidad: parsed.data.cantidad,
          origen: parsed.data.origen ?? null,
          destino: parsed.data.destino ?? null,
          metadata: parsed.data.metadata ? (parsed.data.metadata as unknown as Prisma.InputJsonValue) : undefined,
          authorization: parsed.data.authorization ?? null,
          userId: esperado.userId,
          offlineId: parsed.data.offlineId ?? null,
        },
      })
      return apiSuccess({ movimiento: creado }, 201)
    } catch (error) {
      // Dos dispositivos pueden superar el findUnique inicial simultáneamente.
      // El índice único decide quién escribió; el perdedor consulta y coteja la
      // operación exacta en vez de devolver un 500 o realizar otro movimiento.
      if (parsed.data.offlineId &&
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const anterior = await recuperarMovimientoIdempotente(parsed.data.offlineId, esperado)
        if (anterior) return anterior
      }
      throw error
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error registrando movimiento físico')
    return apiError('Error registrando movimiento físico', 500)
  }
}
