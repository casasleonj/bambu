// @tests integration — NotificationRule / resolveRecipients contra Postgres real.
// Los tests unitarios de resolveRecipients (src/lib/notifications/__tests__/)
// mockean prisma completo — esto verifica que la query real (roles: { in: ... }
// contra una columna RolUsuario[] nativa de Postgres) efectivamente funciona,
// algo que un mock no puede confirmar.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, disconnect, uniqueId } from './setup'

describe('NotificationRule + resolveRecipients (integración)', () => {
  let adminUserId: string
  let asistenteUserId: string
  let inactivoUserId: string
  const ruleIds: string[] = []
  const userIds: string[] = []

  beforeAll(async () => {
    const suffix = uniqueId('notif')

    const admin = await testPrisma.user.create({
      data: { username: `${suffix}-admin`, password: 'x', rol: 'ADMIN', activo: true },
    })
    const asistente = await testPrisma.user.create({
      data: { username: `${suffix}-asistente`, password: 'x', rol: 'ASISTENTE', activo: true },
    })
    const inactivo = await testPrisma.user.create({
      data: { username: `${suffix}-inactivo`, password: 'x', rol: 'ADMIN', activo: false },
    })
    adminUserId = admin.id
    asistenteUserId = asistente.id
    inactivoUserId = inactivo.id
    userIds.push(admin.id, asistente.id, inactivo.id)
  })

  afterAll(async () => {
    await testPrisma.notificationRuleTargetUser.deleteMany({ where: { ruleId: { in: ruleIds } } })
    await testPrisma.notificationRule.deleteMany({ where: { id: { in: ruleIds } } })
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } })
    await disconnect()
  })

  it('resuelve por rol contra la columna RolUsuario[] nativa (query real, no mock)', async () => {
    const { resolveRecipients } = await import('@/lib/notifications/resolve-recipients')

    // PEDIDO_ENTREGADO (no CLIENTE_CREADO/PEDIDO_CREADO/EMBARQUE_CERRADO):
    // esos 3 vienen sembrados por defecto (prisma/seed.ts /
    // prisma/migrations/20260812_seed_default_notification_rules) y
    // `eventType` es @unique — usar uno de los sembrados chocaría con
    // la fila ya existente en esta misma DB.
    const rule = await testPrisma.notificationRule.create({
      data: { eventType: 'PEDIDO_ENTREGADO', enabled: true, roles: ['ADMIN'] },
    })
    ruleIds.push(rule.id)

    const result = await resolveRecipients('PEDIDO_ENTREGADO')

    expect(result).toContain(adminUserId)
    expect(result).not.toContain(asistenteUserId)
    // El usuario ADMIN inactivo no debe recibir, aunque su rol matchee.
    expect(result).not.toContain(inactivoUserId)
  })

  it('resuelve por usuario específico via NotificationRuleTargetUser (FK real)', async () => {
    const { resolveRecipients } = await import('@/lib/notifications/resolve-recipients')

    const rule = await testPrisma.notificationRule.create({
      data: { eventType: 'FIADO_GENERADO', enabled: true, roles: [] },
    })
    ruleIds.push(rule.id)
    await testPrisma.notificationRuleTargetUser.create({
      data: { ruleId: rule.id, userId: asistenteUserId },
    })

    const result = await resolveRecipients('FIADO_GENERADO')

    expect(result).toEqual([asistenteUserId])
  })

  it('regla deshabilitada no resuelve destinatarios', async () => {
    const { resolveRecipients } = await import('@/lib/notifications/resolve-recipients')

    const rule = await testPrisma.notificationRule.create({
      data: { eventType: 'GASTO_CREADO', enabled: false, roles: ['ADMIN'] },
    })
    ruleIds.push(rule.id)

    const result = await resolveRecipients('GASTO_CREADO')
    expect(result).toEqual([])
  })

  it('sin ninguna NotificationRule para el eventType, retorna [] sin lanzar', async () => {
    const { resolveRecipients } = await import('@/lib/notifications/resolve-recipients')
    const result = await resolveRecipients('COMPRA_CREADA')
    expect(result).toEqual([])
  })
})
