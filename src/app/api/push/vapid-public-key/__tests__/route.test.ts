import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '../route'

describe('GET /api/push/vapid-public-key', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  })

  it('retorna la clave pública configurada', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BTestPublicKey'

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ publicKey: 'BTestPublicKey' })
  })

  it('retorna null cuando no hay clave configurada', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ publicKey: null })
  })
})
