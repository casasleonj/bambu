import { describe, it, expect, vi } from 'vitest'

type HeaderEntry = {
  source: string
  headers: { key: string; value: string }[]
}

describe('PWA headers', () => {
  it('Permissions-Policy allows geolocation for same origin in production', async () => {
    vi.resetModules()
    const env = process.env as { NODE_ENV?: string }
    const originalNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    try {
      // Dynamic import to ensure next.config reads NODE_ENV at import time
      const { default: nextConfig } = await import('../../../next.config')
      const config = nextConfig as { headers(): Promise<HeaderEntry[]> }
      const configHeaders = await config.headers()
      const prodHeaders = configHeaders.find((h) => h.source === '/(.*)')
      expect(prodHeaders).toBeDefined()

      const permissionsPolicy = prodHeaders!.headers.find(
        (h) => h.key === 'Permissions-Policy'
      )
      expect(permissionsPolicy).toBeDefined()
      expect(permissionsPolicy!.value).toContain('geolocation=(self)')
      expect(permissionsPolicy!.value).not.toContain('geolocation=()')
    } finally {
      env.NODE_ENV = originalNodeEnv
    }
  })

  it('production security headers are not returned in development/test', async () => {
    vi.resetModules()
    const env = process.env as { NODE_ENV?: string }
    const originalNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'test'
    try {
      const { default: nextConfig } = await import('../../../next.config')
      const config = nextConfig as { headers(): Promise<HeaderEntry[]> }
      const configHeaders = await config.headers()
      const prodHeaders = configHeaders.find((h) => h.source === '/(.*)')
      expect(prodHeaders).toBeUndefined()
    } finally {
      env.NODE_ENV = originalNodeEnv
    }
  })
})
