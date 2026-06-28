import { describe, it, expect } from 'vitest'
import { extractRequestMetadata } from '@/lib/request-metadata'

describe('extractRequestMetadata', () => {
  it('extrae IP de x-forwarded-for (primer valor)', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.1, 10.0.0.1',
      'user-agent': 'TestAgent/1.0',
    })
    const result = extractRequestMetadata(headers)
    expect(result.ip).toBe('203.0.113.1')
    expect(result.userAgent).toBe('TestAgent/1.0')
  })

  it('hace fallback a x-real-ip', () => {
    const headers = new Headers({
      'x-real-ip': '198.51.100.7',
      'user-agent': 'TestAgent/2.0',
    })
    const result = extractRequestMetadata(headers)
    expect(result.ip).toBe('198.51.100.7')
    expect(result.userAgent).toBe('TestAgent/2.0')
  })

  it('usa fallback por defecto si no hay headers', () => {
    const headers = new Headers()
    const result = extractRequestMetadata(headers)
    expect(result.ip).toBe('127.0.0.1')
    expect(result.userAgent).toBeNull()
  })

  it('respeta fallback personalizado', () => {
    const headers = new Headers()
    const result = extractRequestMetadata(headers, '0.0.0.0')
    expect(result.ip).toBe('0.0.0.0')
  })
})
