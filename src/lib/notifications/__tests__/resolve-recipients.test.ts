import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationRule: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { resolveRecipients } from '../resolve-recipients'

const mockPrisma = prisma as unknown as {
  notificationRule: { findUnique: ReturnType<typeof vi.fn> }
  user: { findMany: ReturnType<typeof vi.fn> }
}

describe('resolveRecipients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna [] si no hay regla configurada', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce(null)
    const result = await resolveRecipients('CLIENTE_CREADO')
    expect(result).toEqual([])
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })

  it('retorna [] si la regla existe pero está deshabilitada', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce({
      enabled: false,
      roles: ['ADMIN'],
      targetUsers: [],
    })
    const result = await resolveRecipients('CLIENTE_CREADO')
    expect(result).toEqual([])
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })

  it('retorna [] si la regla está habilitada pero sin roles ni usuarios', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce({
      enabled: true,
      roles: [],
      targetUsers: [],
    })
    const result = await resolveRecipients('CLIENTE_CREADO')
    expect(result).toEqual([])
  })

  it('resuelve destinatarios por rol', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce({
      enabled: true,
      roles: ['ADMIN', 'ASISTENTE'],
      targetUsers: [],
    })
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])

    const result = await resolveRecipients('PEDIDO_CREADO')

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { rol: { in: ['ADMIN', 'ASISTENTE'] }, activo: true },
      select: { id: true },
    })
    expect(result.sort()).toEqual(['u1', 'u2'])
  })

  it('resuelve destinatarios por usuario específico, excluyendo inactivos', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce({
      enabled: true,
      roles: [],
      targetUsers: [
        { user: { id: 'u3', activo: true } },
        { user: { id: 'u4', activo: false } },
      ],
    })

    const result = await resolveRecipients('FIADO_GENERADO')

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
    expect(result).toEqual(['u3'])
  })

  it('une roles + usuarios específicos, dedupeando', async () => {
    mockPrisma.notificationRule.findUnique.mockResolvedValueOnce({
      enabled: true,
      roles: ['ADMIN'],
      targetUsers: [{ user: { id: 'u1', activo: true } }, { user: { id: 'u5', activo: true } }],
    })
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }])

    const result = await resolveRecipients('ABONO_APLICADO')

    expect(result.sort()).toEqual(['u1', 'u5'])
  })
})
