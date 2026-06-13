import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: 'BPub',
      privateKey: 'Priv',
    })),
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import webpush from 'web-push'
import { broadcastPush, sendPushToUser, __resetPushInitForTests } from '@/lib/push'

const mockPrisma = prisma as unknown as {
  pushSubscription: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
}

const mockWebpush = webpush as unknown as {
  setVapidDetails: ReturnType<typeof vi.fn>
  sendNotification: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset internal init state
  __resetPushInitForTests()
  // Set VAPID env vars
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BTest_Pub'
  process.env.VAPID_PRIVATE_KEY = 'TestPriv'
  process.env.VAPID_SUBJECT = 'mailto:test@example.com'
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_SUBJECT
})

describe('broadcastPush', () => {
  it('retorna 0 sin error si VAPID no esta configurado', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const result = await broadcastPush({ title: 'X', body: 'Y' })
    expect(result).toBe(0)
    expect(mockWebpush.setVapidDetails).not.toHaveBeenCalled()
  })

  it('retorna 0 si no hay suscripciones', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([])
    const result = await broadcastPush({ title: 'X', body: 'Y' })
    expect(result).toBe(0)
    expect(mockWebpush.sendNotification).not.toHaveBeenCalled()
  })

  it('inicializa VAPID al primer send', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 's1', endpoint: 'https://push.example.com/abc', p256dh: 'p1', auth: 'a1' },
    ])
    mockWebpush.sendNotification.mockResolvedValueOnce(undefined)
    mockPrisma.pushSubscription.update.mockResolvedValueOnce({})

    await broadcastPush({ title: 'Test', body: 'Hello' })

    expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'BTest_Pub',
      'TestPriv',
    )
    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('envia el payload JSON correcto', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 's1', endpoint: 'https://push.example.com/abc', p256dh: 'p1', auth: 'a1' },
    ])
    mockWebpush.sendNotification.mockResolvedValueOnce(undefined)
    mockPrisma.pushSubscription.update.mockResolvedValueOnce({})

    await broadcastPush({ title: 'Alerta', body: 'Fraude detectado', url: '/casos' })

    const callArgs = mockWebpush.sendNotification.mock.calls[0]
    expect(callArgs[0]).toEqual({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p1', auth: 'a1' },
    })
    expect(JSON.parse(callArgs[1])).toEqual({
      title: 'Alerta',
      body: 'Fraude detectado',
      url: '/casos',
    })
  })

  it('cuenta envios exitosos', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'p', auth: 'a' },
      { id: 's2', endpoint: 'https://push.example.com/2', p256dh: 'p', auth: 'a' },
      { id: 's3', endpoint: 'https://push.example.com/3', p256dh: 'p', auth: 'a' },
    ])
    mockWebpush.sendNotification
      .mockResolvedValueOnce(undefined) // s1 ok
      .mockResolvedValueOnce(undefined) // s2 ok
      .mockRejectedValueOnce(new Error('boom')) // s3 fail
    mockPrisma.pushSubscription.update.mockResolvedValue({})

    const result = await broadcastPush({ title: 'X', body: 'Y' })
    expect(result).toBe(2)
  })

  it('elimina suscripciones expiradas (404 / 410)', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 'exp1', endpoint: 'https://push.example.com/exp1', p256dh: 'p', auth: 'a' },
      { id: 'exp2', endpoint: 'https://push.example.com/exp2', p256dh: 'p', auth: 'a' },
    ])
    const err410 = Object.assign(new Error('Gone'), { statusCode: 410 })
    const err404 = Object.assign(new Error('Not Found'), { statusCode: 404 })
    mockWebpush.sendNotification
      .mockRejectedValueOnce(err410)
      .mockRejectedValueOnce(err404)
    mockPrisma.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 2 })

    const result = await broadcastPush({ title: 'X', body: 'Y' })
    expect(result).toBe(0)
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['exp1', 'exp2'] } },
    })
  })

  it('NO elimina suscripciones con error 500 (reintentar proxima vez)', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'p', auth: 'a' },
    ])
    const err500 = Object.assign(new Error('Server error'), { statusCode: 500 })
    mockWebpush.sendNotification.mockRejectedValueOnce(err500)

    const result = await broadcastPush({ title: 'X', body: 'Y' })
    expect(result).toBe(0)
    expect(mockPrisma.pushSubscription.deleteMany).not.toHaveBeenCalled()
  })
})

describe('sendPushToUser', () => {
  it('filtra suscripciones por userId', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([
      { id: 's1', endpoint: 'https://push.example.com/u1', p256dh: 'p', auth: 'a' },
    ])
    mockWebpush.sendNotification.mockResolvedValueOnce(undefined)
    mockPrisma.pushSubscription.update.mockResolvedValueOnce({})

    const result = await sendPushToUser('user-123', { title: 'X', body: 'Y' })
    expect(result).toBe(1)
    expect(mockPrisma.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: expect.any(Object),
    })
  })

  it('retorna 0 si el usuario no tiene suscripciones', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValueOnce([])
    const result = await sendPushToUser('user-123', { title: 'X', body: 'Y' })
    expect(result).toBe(0)
  })
})

describe('initialization', () => {
  it('inicializa solo una vez (singleton)', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([])
    await broadcastPush({ title: 'X', body: 'Y' })
    await broadcastPush({ title: 'X', body: 'Y' })
    await broadcastPush({ title: 'X', body: 'Y' })
    expect(mockWebpush.setVapidDetails).toHaveBeenCalledTimes(1)
  })
})
