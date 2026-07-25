// @tests proxy CSRF (S-1)
// FIX S-1: validateCsrf() estaba implementado en src/lib/csrf.ts
// pero NO se llamaba en ningún lugar (código muerto). Ahora se
// aplica en src/proxy.ts para todos los endpoints state-changing.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const proxyPath = join(process.cwd(), 'src/proxy.ts')
const csrfPath = join(process.cwd(), 'src/lib/csrf.ts')
const proxySource = readFileSync(proxyPath, 'utf-8')
const csrfSource = readFileSync(csrfPath, 'utf-8')

describe('S-1: proxy aplica validateCsrf para state-changing methods', () => {
  it('FIX: el proxy importa validateCsrf de @/lib/csrf', () => {
    expect(proxySource).toMatch(/import\s+\{\s*validateCsrf\s*\}\s+from\s+['"]@\/lib\/csrf['"]/)
  })

  it('FIX: el proxy verifica auth antes de CSRF y antes del rate limit', () => {
    // auth check -> CSRF -> rate limit para que bots no consuman Redis
    const authIdx = proxySource.indexOf('request.auth?.user?.id')
    const csrfIdx = proxySource.indexOf('validateCsrf(request)')
    const rateLimitIdx = proxySource.indexOf("checkRateLimit(ip, 'api')")

    expect(authIdx).toBeGreaterThan(-1)
    expect(csrfIdx).toBeGreaterThan(-1)
    expect(rateLimitIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeLessThan(csrfIdx)
    expect(csrfIdx).toBeLessThan(rateLimitIdx)
  })

  it('FIX: si validateCsrf retorna respuesta, el proxy la retorna', () => {
    expect(proxySource).toMatch(/const csrfResponse = validateCsrf\(request\)/)
    expect(proxySource).toMatch(/if \(csrfResponse\) \{\s*return csrfResponse\s*\}/)
  })

  it('FIX: el auth check se hace DESPUÉS del skip de health/cron y antes de CSRF', () => {
    // El orden debe ser: skip health/cron → auth → CSRF → rate limit
    const skipIdx = proxySource.indexOf("'/api/health' || pathname.startsWith('/api/cron/')")
    const authIdx = proxySource.indexOf('request.auth?.user?.id')
    const csrfIdx = proxySource.indexOf('validateCsrf(request)')
    const rateLimitIdx = proxySource.indexOf("checkRateLimit(ip, 'api')")

    expect(skipIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeGreaterThan(skipIdx)
    expect(csrfIdx).toBeGreaterThan(authIdx)
    expect(rateLimitIdx).toBeGreaterThan(csrfIdx)
  })

  it('FIX: hay un comentario S-1 explicando el fix', () => {
    expect(proxySource).toMatch(/S-1 fix/)
  })

  it('FIX: el comentario explica el orden CSRF antes de rate limit', () => {
    expect(proxySource).toMatch(/CSRF check BEFORE rate limiting/)
  })
})

describe('S-1: validateCsrf sigue implementado correctamente', () => {
  it('FIX: la función validateCsrf existe en src/lib/csrf.ts', () => {
    expect(csrfSource).toMatch(/export function validateCsrf/)
  })

  it('FIX: valida Origin/Referer contra el host esperado', () => {
    expect(csrfSource).toMatch(/req\.headers\.get\('origin'\)/)
    expect(csrfSource).toMatch(/req\.headers\.get\('referer'\)/)
  })

  it('FIX: skip métodos seguros (GET, OPTIONS)', () => {
    expect(csrfSource).toMatch(/if \(!\['POST', 'PUT', 'DELETE', 'PATCH'\]\.includes\(method\)\)/)
  })

  it('FIX: skip endpoints de Auth.js (que maneja su propio CSRF)', () => {
    expect(csrfSource).toMatch(/path\.startsWith\('\/api\/auth\/'\)/)
  })
})
