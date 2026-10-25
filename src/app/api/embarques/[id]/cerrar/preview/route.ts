/**
 * Preview (dry-run) del cierre de embarque — A.3.4.
 *
 * Corre exactamente el mismo `CerrarEmbarqueUseCase` que el cierre real
 * (misma conciliación de productos, mismo cálculo de caja, mismas reglas
 * de pagos/discrepancia), pero con `dryRun: true`: la transacción hace
 * rollback antes de comitear, así que nada de esto se persiste ni dispara
 * realtime/notificaciones. Existe para que la pantalla de Reconciliation
 * (Fase 7) no reimplemente `calcularCaja`/`conciliarProductos` en el
 * cliente — ver riesgo documentado en A.3.4/B.5 del plan de convergencia.
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { formatZodError } from '@/lib/utils'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CerrarEmbarqueSchema } from '@/lib/validators'

import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { CierrePresenter } from '@/modules/embarques/presentation/CierrePresenter'
import { mapCierreError, toCerrarInput } from '@/modules/embarques/presentation/cierre-http'

const embarqueRepo = new PrismaEmbarqueRepository()
const gastoRepo = new PrismaGastoEmbarqueRepository()
const productoRepo = new PrismaEmbarqueProductoRepository()
const txManager = new PrismaTransactionManager()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const body = await request.json()
    const parsed = CerrarEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new CerrarEmbarqueUseCase(
      embarqueRepo,
      gastoRepo,
      productoRepo,
      txManager,
      session.user?.id,
      session.user?.role,
    )

    // Sin offlineId a propósito: un preview nunca debe calzar con la
    // detección de replay del cierre real (CierreDedupService.esReplay).
    const result = await useCase.execute(toCerrarInput(id, parsed.data, { dryRun: true }))

    return apiSuccess(CierrePresenter.toLegacyResponse(result))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error en preview de cierre de embarque:')

    // El preview responde con los MISMOS códigos que el cierre real (un 4xx aquí
    // significa que el cierre real también fallaría).
    const conocido = mapCierreError(message)
    if (conocido) {
      return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    }

    return apiError('Error al calcular preview de cierre', 500)
  }
}
