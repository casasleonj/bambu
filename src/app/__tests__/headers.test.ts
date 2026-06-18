import { describe, it, expect } from 'vitest'

// Mock next.config headers by reading the config directly
// We test the static config object to avoid starting a server
import nextConfig from '../../../next.config'

describe('PWA headers', () => {
  it('Permissions-Policy allows geolocation for same origin', async () => {
    const configHeaders = await (nextConfig as any).headers()
    const prodHeaders = configHeaders.find((h: any) => h.source === '/(.*)')
    const permissionsPolicy = prodHeaders.headers.find(
      (h: any) => h.key === 'Permissions-Policy'
    )
    expect(permissionsPolicy.value).toContain('geolocation=(self)')
    expect(permissionsPolicy.value).not.toContain('geolocation=()')
  })
})
