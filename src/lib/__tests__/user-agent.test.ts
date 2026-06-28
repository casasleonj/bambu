import { describe, it, expect } from 'vitest'
import { parseDeviceName } from '@/lib/user-agent'

describe('parseDeviceName', () => {
  it('devuelve dispositivo desconocido para input vacío', () => {
    expect(parseDeviceName(null)).toBe('Dispositivo desconocido')
    expect(parseDeviceName(undefined)).toBe('Dispositivo desconocido')
    expect(parseDeviceName('')).toBe('Dispositivo desconocido')
  })

  it('detecta Chrome en Windows (escritorio)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(parseDeviceName(ua)).toContain('Chrome')
    expect(parseDeviceName(ua)).toContain('Windows')
    expect(parseDeviceName(ua)).toContain('Escritorio')
  })

  it('detecta Safari en iPhone (móvil)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    expect(parseDeviceName(ua)).toContain('Safari')
    expect(parseDeviceName(ua)).toContain('iOS')
    expect(parseDeviceName(ua)).toContain('Móvil')
  })
})
