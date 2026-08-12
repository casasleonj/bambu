import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../resolve-recipients', () => ({
  resolveRecipients: vi.fn(),
}))

vi.mock('@/lib/push', () => ({
  sendPushToUser: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { resolveRecipients } from '../resolve-recipients'
import { sendPushToUser } from '@/lib/push'
import { notifyEvent } from '../notify-event'

const mockResolveRecipients = resolveRecipients as unknown as ReturnType<typeof vi.fn>
const mockSendPushToUser = sendPushToUser as unknown as ReturnType<typeof vi.fn>

describe('notifyEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no manda nada si no hay destinatarios', async () => {
    mockResolveRecipients.mockResolvedValueOnce([])
    await notifyEvent('CLIENTE_CREADO', { title: 'X', body: 'Y' })
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })

  it('manda un push dirigido por cada destinatario resuelto', async () => {
    mockResolveRecipients.mockResolvedValueOnce(['u1', 'u2'])
    mockSendPushToUser.mockResolvedValue(1)

    await notifyEvent('PEDIDO_CREADO', { title: 'Pedido nuevo', body: 'Se creó un pedido' })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(2)
    expect(mockSendPushToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Pedido nuevo' }))
    expect(mockSendPushToUser).toHaveBeenCalledWith('u2', expect.objectContaining({ title: 'Pedido nuevo' }))
  })

  it('threading de persistent: false para eventos normales', async () => {
    mockResolveRecipients.mockResolvedValueOnce(['u1'])
    mockSendPushToUser.mockResolvedValue(1)

    await notifyEvent('PEDIDO_ENTREGADO', { title: 'Entregado', body: 'x' })

    expect(mockSendPushToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ persistent: false }))
  })

  it('threading de persistent: true solo para CASO_ALTA', async () => {
    mockResolveRecipients.mockResolvedValueOnce(['u1'])
    mockSendPushToUser.mockResolvedValue(1)

    await notifyEvent('CASO_ALTA', { title: 'Alerta', body: 'x' })

    expect(mockSendPushToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ persistent: true }))
  })

  it('nunca lanza, aunque resolveRecipients falle', async () => {
    mockResolveRecipients.mockRejectedValueOnce(new Error('DB caída'))
    await expect(notifyEvent('CLIENTE_CREADO', { title: 'X', body: 'Y' })).resolves.toBeUndefined()
  })

  it('nunca lanza, aunque sendPushToUser falle para un usuario', async () => {
    mockResolveRecipients.mockResolvedValueOnce(['u1', 'u2'])
    mockSendPushToUser.mockRejectedValueOnce(new Error('push falló')).mockResolvedValueOnce(1)

    await expect(notifyEvent('CLIENTE_CREADO', { title: 'X', body: 'Y' })).resolves.toBeUndefined()
    expect(mockSendPushToUser).toHaveBeenCalledTimes(2)
  })
})
