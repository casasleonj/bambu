import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { NotificationRulesUpdateSchema } from '@/lib/validators'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN', authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const rules = await prisma.notificationRule.findMany({
      include: { targetUsers: { select: { userId: true } } },
    })
    return apiSuccess({ rules })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching notification rules:')
    return apiError('Error cargando reglas de notificación')
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN', authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = NotificationRulesUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    // Una única transacción interactiva: o se guarda la matriz
    // completa, o no se guarda nada. Un diseño no-atómico (upsert de
    // reglas + loop de reconciliación de targetUsers por fuera de la
    // transacción) podría dejar algunas reglas con roles actualizados
    // pero usuarios específicos desincronizados si el proceso falla
    // a mitad de camino.
    await prisma.$transaction(async (tx) => {
      for (const r of parsed.data.rules) {
        const rule = await tx.notificationRule.upsert({
          where: { eventType: r.eventType },
          create: { eventType: r.eventType, enabled: r.enabled, roles: r.roles },
          update: { enabled: r.enabled, roles: r.roles },
        })

        await tx.notificationRuleTargetUser.deleteMany({ where: { ruleId: rule.id } })
        if (r.targetUserIds.length > 0) {
          await tx.notificationRuleTargetUser.createMany({
            data: r.targetUserIds.map((userId) => ({ ruleId: rule.id, userId })),
            skipDuplicates: true,
          })
        }
      }
    })

    logAudit({
      entidad: 'NotificationRule',
      registroId: 'matrix',
      accion: 'UPDATE',
      datos: { rules: parsed.data.rules },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    const rules = await prisma.notificationRule.findMany({
      include: { targetUsers: { select: { userId: true } } },
    })
    return apiSuccess({ rules })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating notification rules:')
    return apiError('Error guardando reglas de notificación')
  }
}
