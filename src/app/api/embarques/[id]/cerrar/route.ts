/**
 * Cerrar Embarque API Route — Thin Controller.
 *
 * Formerly 582 lines of business logic.
 * Now delegates entirely to CerrarEmbarqueUseCase.
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { formatZodError } from '@/lib/utils'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CerrarEmbarqueSchema } from '@/lib/validators'

// DDD imports
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { CierrePresenter } from '@/modules/embarques/presentation/CierrePresenter'
import { publishRealtimeEvent } from '@/lib/realtime'
import { broadcastPush } from '@/lib/push'

// Infrastructure dependencies
const embarqueRepo = new PrismaEmbarqueRepository()
const gastoRepo = new PrismaGastoEmbarqueRepository()
const productoRepo = new PrismaEmbarqueProductoRepository()
const txManager = new PrismaTransactionManager()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { pedidos, ventasLibres, productos, gastos, dineroEntregado, justificacionDiscrepancia, justificacionFaltante, obs } = parsed.data

    // Helper to coerce null to 0 (from Zod .nullish() fields)
    const n = (v: number | null | undefined): number => v ?? 0

    // Map legacy DTO to DDD input
    const useCase = new CerrarEmbarqueUseCase(
      embarqueRepo,
      gastoRepo,
      productoRepo,
      txManager,
      session.user?.id,
      session.user?.role,
    )

    const result = await useCase.execute({
      id,
      pedidos: pedidos.map((p) => ({
        pedidoId: p.pedidoId,
        entregado: p.entregado,
        productosEntregados: p.productosEntregados ? {
          cPacaAguaEnt: n(p.productosEntregados.cPacaAguaEnt),
          cPacaHieloEnt: n(p.productosEntregados.cPacaHieloEnt),
          cBotellonFabEnt: n(p.productosEntregados.cBotellonFabEnt),
          cBotellonDomEnt: n(p.productosEntregados.cBotellonDomEnt),
          cBolsaAguaEnt: n(p.productosEntregados.cBolsaAguaEnt),
          cBolsaHieloEnt: n(p.productosEntregados.cBolsaHieloEnt),
        } : undefined,
        pagos: p.pagos.map((pg) => ({ metodo: pg.metodo, monto: n(pg.monto) })),
        preciosReales: p.preciosReales ? {
          pacaAgua: n(p.preciosReales.pacaAgua),
          pacaHielo: n(p.preciosReales.pacaHielo),
          botellonFab: n(p.preciosReales.botellonFab),
          botellonDom: n(p.preciosReales.botellonDom),
          bolsaAgua: n(p.preciosReales.bolsaAgua),
          bolsaHielo: n(p.preciosReales.bolsaHielo),
        } : undefined,
        nuevoEmbarqueId: p.nuevoEmbarqueId ?? undefined,
      })),
      ventasLibres: ventasLibres?.map((v) => ({
        clienteId: v.clienteId,
        cPacaAgua: n(v.cPacaAgua),
        cPacaHielo: n(v.cPacaHielo),
        cBotellonFab: n(v.cBotellonFab),
        cBotellonDom: n(v.cBotellonDom),
        cBolsaAgua: n(v.cBolsaAgua),
        cBolsaHielo: n(v.cBolsaHielo),
        pagos: v.pagos.map((pg) => ({ metodo: pg.metodo, monto: n(pg.monto) })),
        obs: v.obs,
      })),
      productosRetorno: productos,
      gastos: gastos?.map((g) => ({
        categoria: g.categoria,
        nota: g.nota,
        monto: g.monto,
      })),
      dineroEntregado,
      justificacionDiscrepancia,
      justificacionFaltante,
      obs,
    })

    // Convert to legacy response shape for backward compatibility
    const legacyResponse = CierrePresenter.toLegacyResponse(result)

    publishRealtimeEvent('embarque.updated', id).catch(() => {})
    const { prisma } = await import('@/lib/prisma')
    prisma.embarque.findUnique({
      where: { id },
      include: { pedidos: { select: { id: true } } },
    }).then((embarque) => {
      embarque?.pedidos.forEach((p) => {
        publishRealtimeEvent('pedido.updated', p.id).catch(() => {})
      })
    }).catch(() => {})

    // Push notification to admins (replaces SSE for off-tab users).
    void broadcastPush({
      title: 'Embarque cerrado',
      body: `Un embarque fue cerrado. Revisá la caja.`,
      url: `/embarques?openEmbarque=${id}`,
      tag: `embarque-cerrado-${id}`,
    })

    return apiSuccess(legacyResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error cerrando embarque:')

    if (message === 'EMBARQUE_NOT_FOUND') {
      return apiError('Embarque no encontrado', 404)
    }
    if (message === 'EMBARQUE_YA_CERRADO' || message.toLowerCase().includes('transicion')) {
      return apiError('El embarque ya esta cerrado', 400)
    }
    if (message.startsWith('PAGOS_EXCEDIDOS')) {
      return apiError(message.replace('PAGOS_EXCEDIDOS: ', ''), 400)
    }
    if (message.startsWith('EMBARQUE_DESTINO_NOT_FOUND')) {
      return apiError(message.replace('EMBARQUE_DESTINO_NOT_FOUND: ', ''), 404)
    }
    if (message.startsWith('EMBARQUE_DESTINO_NO_DISPONIBLE')) {
      return apiError(message.replace('EMBARQUE_DESTINO_NO_DISPONIBLE: ', ''), 400)
    }

    logger.error({ err: message }, 'Error cerrando embarque:')
    return apiError('Error al cerrar embarque', 500)
  }
}
