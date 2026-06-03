/**
 * PUT /api/produccion/[id] — correcciones del mismo día.
 *
 * Bloque 4: permite a admin/asistente corregir conteos de una Produccion
 * recién creada (mismo día Bogotá). NO edita Producciones históricas
 * (eso requiere un workflow distinto, fuera de scope).
 *
 * Reglas:
 * - Solo Produccion del día actual (medianoche Bogotá).
 * - Solo ADMIN/ASISTENTE.
 * - Si la Produccion pertenece a un CierreDia cerrado → 409.
 * - Re-validar FIX 1.5: obs requerida si hay diferencia != 0.
 * - Re-leer ventas al momento del PUT (no usar cache del POST).
 * - Advisory lock key 8 (mismo que POST) para serializar vs POSTs concurrentes.
 * - Audit log con before/after diff completo.
 *
 * Body:
 *   { items?: [{producto, conteoA?, conteoB?, ...}], obs?: string }
 *   Al menos uno de items u obs debe estar presente.
 */

import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProduccionUpdateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { getVentasDelDia } from '@/lib/ventas'
import { calcComSellador } from '@/lib/comisiones'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { captureApiError, addApiBreadcrumb } from '@/lib/sentry-helpers'

// Mismo lock que POST para serializar.
const PROD_ADVISORY_LOCK_KEY = 8

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult.user as { id?: string } | undefined)?.id
  const userRol = (authResult.user as { rol?: string } | undefined)?.rol
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null
  const userAgent = request.headers.get('user-agent') ?? null

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('JSON inválido', 400)
  }

  const parsed = ProduccionUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }

  addApiBreadcrumb('produccion.PUT start', { id, hasItems: !!parsed.data.items, hasObs: parsed.data.obs !== undefined })

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        // Advisory lock para serializar vs POSTs concurrentes
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PROD_ADVISORY_LOCK_KEY}::int)::text`

        // 1. Cargar Produccion existente con items
        const existing = await tx.produccion.findUnique({
          where: { id },
          include: { items: true },
        })
        if (!existing) {
          throw new Error('PRODUCCION_NO_ENCONTRADA')
        }

        // 2. Solo Producciones del día actual (medianoche Bogotá)
        const todayStart = startOfDayInBogota(todayInBogota())
        if (existing.fecha.getTime() !== todayStart.getTime()) {
          throw new Error('PRODUCCION_NO_EDITABLE_HISTORICA')
        }

        // 3. Si pertenece a un CierreDia cerrado → 409
        const cierre = await tx.cierreDia.findFirst({
          where: { fecha: todayStart },
        })
        if (cierre) {
          throw new Error('PRODUCCION_EN_CIERRE_CERRADO')
        }

        // 4. Re-leer ventas al momento del PUT (no usar cache)
        const ventas = await getVentasDelDia()
        const stockIniAgua = existing.items.find(i => i.producto === 'PACA_AGUA')?.stockIni ?? 0
        const stockIniHielo = existing.items.find(i => i.producto === 'PACA_HIELO')?.stockIni ?? 0

        // 5. Construir items actualizados (merge con existentes)
        const before = JSON.parse(JSON.stringify(existing)) // snapshot para audit diff

        // Empezar con los items existentes
        const updatedItems = existing.items.map(it => ({ ...it }))

        if (parsed.data.items) {
          for (const upd of parsed.data.items) {
            const target = updatedItems.find(i => i.producto === upd.producto)
            if (!target) continue
            // Aplicar solo campos presentes
            if (upd.conteoA !== undefined) target.conteoA = upd.conteoA
            if (upd.conteoB !== undefined) target.conteoB = upd.conteoB
            if (upd.stockFinFisico !== undefined) target.stockFinFisico = upd.stockFinFisico
            if (upd.filtradas !== undefined) target.filtradas = upd.filtradas
            if (upd.rotas !== undefined) target.rotas = upd.rotas
            if (upd.consumoInterno !== undefined) target.consumoInterno = upd.consumoInterno
          }
        }

        // 6. Recalcular producido, diferencia, comSellador
        const itemAgua = updatedItems.find(i => i.producto === 'PACA_AGUA')!
        const itemHielo = updatedItems.find(i => i.producto === 'PACA_HIELO')!
        const prodAgua = Math.round((itemAgua.conteoA + itemAgua.conteoB) / 2)
        const prodHielo = Math.round((itemHielo.conteoA + itemHielo.conteoB) / 2)
        itemAgua.producido = prodAgua
        itemHielo.producido = prodHielo
        itemAgua.ventas = ventas.aguaVendida
        itemHielo.ventas = ventas.hieloVendido
        itemAgua.stockFinEsperado = stockIniAgua + prodAgua - ventas.aguaVendida
        itemHielo.stockFinEsperado = stockIniHielo + prodHielo - ventas.hieloVendido
        const perdidasAgua = itemAgua.rotas + itemAgua.filtradas + itemAgua.consumoInterno
        const perdidasHielo = itemHielo.rotas + itemHielo.filtradas + itemHielo.consumoInterno
        itemAgua.diferencia = itemAgua.stockFinEsperado - itemAgua.stockFinFisico - perdidasAgua
        itemHielo.diferencia = itemHielo.stockFinEsperado - itemHielo.stockFinFisico - perdidasHielo

        // 7. FIX 1.5: obs requerida si hay diferencia
        const hayDiferencia = itemAgua.diferencia !== 0 || itemHielo.diferencia !== 0
        const obsFinal = parsed.data.obs !== undefined
          ? parsed.data.obs.trim() || null
          : existing.obs
        if (hayDiferencia && !obsFinal) {
          throw new Error('FALTA_OBS_CON_DIFERENCIA')
        }

        // 8. Recalcular comisiones del sellador
        const trabajador = await tx.trabajador.findUnique({
          where: { id: existing.trabajadorId },
          select: { comPacaAgua: true, comPacaHielo: true },
        })
        if (!trabajador) {
          throw new Error('TRABAJADOR_NO_ENCONTRADO')
        }
        const comSell = calcComSellador(prodAgua, prodHielo, trabajador)
        // Los updates a Prisma.Decimal se hacen via Prisma.Decimal wrapper
        itemAgua.comSellador = new Prisma.Decimal(comSell.comAgua)
        itemHielo.comSellador = new Prisma.Decimal(comSell.comHielo)

        // 9. Persistir cambios (Produccion + items)
        // Construir lista de updates para ProduccionItem
        const itemUpdates = updatedItems.map(it => ({
          where: { id: it.id },
          data: {
            conteoA: it.conteoA,
            conteoB: it.conteoB,
            producido: it.producido,
            stockFinEsperado: it.stockFinEsperado,
            stockFinFisico: it.stockFinFisico,
            diferencia: it.diferencia,
            filtradas: it.filtradas,
            rotas: it.rotas,
            consumoInterno: it.consumoInterno,
            comSellador: new Prisma.Decimal(Number(it.comSellador)),
            ventas: it.ventas,
          },
        }))

        const result = await tx.produccion.update({
          where: { id },
          data: {
            obs: obsFinal,
            comSellTotal: comSell.total,
            // Updates anidados de items
            items: { update: itemUpdates },
          },
          include: { items: true, trabajador: true },
        })

        // Audit log con before/after diff
        const after = JSON.parse(JSON.stringify(result))
        const changedFields: string[] = []
        // Detectar campos cambiados a nivel Produccion
        for (const k of Object.keys(after)) {
          if (k === 'items' || k === 'trabajador' || k === 'createdBy') continue
          if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
            changedFields.push(k)
          }
        }
        // Detectar cambios por item
        for (const afterItem of after.items) {
          const beforeItem = before.items.find((bi: { id: string }) => bi.id === afterItem.id)
          if (!beforeItem) continue
          for (const k of Object.keys(afterItem)) {
            if (k === 'id' || k === 'produccionId' || k === 'createdAt' || k === 'updatedAt') continue
            if (JSON.stringify(beforeItem[k]) !== JSON.stringify(afterItem[k])) {
              changedFields.push(`items[${afterItem.producto}].${k}`)
            }
          }
        }

        logAudit({
          entidad: 'Produccion',
          registroId: id,
          accion: 'UPDATE',
          datos: {
            before,
            after,
            changedFields,
            diffSummary: `Changed ${changedFields.length} field(s): ${changedFields.join(', ')}`,
          },
          usuarioId: userId,
          ip,
          userAgent,
        }).catch(() => {})

        return result
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 15000,
      },
    )

    return apiSuccess({ produccion: updated })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    captureApiError(err, {
      endpoint: 'produccion.[id].PUT',
      rol: userRol,
      userId: userId ?? undefined,
      extra: { id, hasItems: !!parsed.data.items },
    })

    if (err.message === 'PRODUCCION_NO_ENCONTRADA') {
      return apiError('Producción no encontrada', 404)
    }
    if (err.message === 'PRODUCCION_NO_EDITABLE_HISTORICA') {
      return apiError('Solo se pueden editar producciones del día actual', 400)
    }
    if (err.message === 'PRODUCCION_EN_CIERRE_CERRADO') {
      return apiError('No se puede editar: el día ya fue cerrado', 409)
    }
    if (err.message === 'FALTA_OBS_CON_DIFERENCIA') {
      return apiError('Si hay diferencia de stock debés explicar la causa en observaciones', 400)
    }
    if (err.message === 'TRABAJADOR_NO_ENCONTRADO') {
      return apiError('Trabajador no encontrado', 400)
    }

    logger.error({ err: err.message, id }, 'Error updating produccion:')
    return apiError('Error al actualizar la producción', 500)
  }
}
