import { describe, it, expect, vi } from 'vitest'
import vercelConfig from '../../../vercel.json'

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

describe('Vercel headers', () => {
  it('Service-Worker-Allowed header applies to /serwist/sw.js', () => {
    const swHeader = vercelConfig.headers.find((h) => h.source === '/serwist/sw.js')
    expect(swHeader).toBeDefined()
    expect(swHeader!.headers).toContainEqual({
      key: 'Service-Worker-Allowed',
      value: '/',
    })
  })

  it('does not apply Service-Worker-Allowed to obsolete /sw.js', () => {
    const swHeader = vercelConfig.headers.find((h) => h.source === '/sw.js')
    expect(swHeader).toBeUndefined()
  })

  it('Permissions-Policy allows geolocation for same origin', () => {
    const globalHeader = vercelConfig.headers.find((h) => h.source === '/(.*)')
    expect(globalHeader).toBeDefined()
    const permissionsPolicy = globalHeader!.headers.find((h) => h.key === 'Permissions-Policy')
    expect(permissionsPolicy).toBeDefined()
    expect(permissionsPolicy!.value).toContain('geolocation=(self)')
    expect(permissionsPolicy!.value).not.toContain('geolocation=()')
  })
})
