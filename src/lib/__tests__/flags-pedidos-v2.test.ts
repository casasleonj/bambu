import { describe, it, expect, afterEach, vi } from 'vitest'
import { pedidosV2Enabled } from '../flags'

describe('pedidosV2Enabled', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('false por defecto (sin la env)', () => {
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', '')
    expect(pedidosV2Enabled()).toBe(false)
  })

  it('true solo con exactamente "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', 'true')
    expect(pedidosV2Enabled()).toBe(true)
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', '1')
    expect(pedidosV2Enabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', 'TRUE')
    expect(pedidosV2Enabled()).toBe(false)
  })
})
