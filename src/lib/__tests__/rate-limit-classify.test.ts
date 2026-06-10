// @tests rate-limit classifyRequest S-2
// FIX S-2: el rate limit de 10/15min (brute force protection)
// antes aplicaba a TODO /api/auth/*, incluyendo endpoints
// admin-only como /api/auth/force-password-change. Un admin
// cambiando passwords 10 veces en 15 min sería bloqueado.
//
// FIX: el rate limit estricto solo aplica al login callback
// (donde ocurren los brute force attacks). Otros endpoints
// /api/auth/* usan el rate limit 'api' más permisivo (300/min).

import { describe, it, expect } from 'vitest'
import { classifyRequest } from '@/lib/rate-limit'

describe('S-2: classifyRequest distingue login callback de otros /api/auth/*', () => {
  it('FIX: el login callback usa rate limit estricto (auth)', () => {
    expect(classifyRequest('/api/auth/[...nextauth]/callback/credentials')).toBe('auth')
    expect(classifyRequest('/api/auth/callback/credentials')).toBe('auth')
    expect(classifyRequest('/api/auth/signin')).toBe('auth')
    expect(classifyRequest('/api/auth/signin/credentials')).toBe('auth')
  })

  it('FIX: otros /api/auth/* usan rate limit permisivo (api)', () => {
    expect(classifyRequest('/api/auth/force-password-change')).toBe('api')
    expect(classifyRequest('/api/auth/profile')).toBe('api')
    expect(classifyRequest('/api/auth/[...nextauth]/csrf')).toBe('api')
    expect(classifyRequest('/api/auth/[...nextauth]/signout')).toBe('api')
    expect(classifyRequest('/api/auth/[...nextauth]/session')).toBe('api')
  })

  it('FIX: otros /api/* usan rate limit api', () => {
    expect(classifyRequest('/api/pedidos')).toBe('api')
    expect(classifyRequest('/api/clientes/123')).toBe('api')
    expect(classifyRequest('/api/embarques/456/cerrar')).toBe('api')
  })

  it('FIX: páginas usan rate limit page', () => {
    expect(classifyRequest('/dashboard')).toBe('page')
    expect(classifyRequest('/pedidos')).toBe('page')
    expect(classifyRequest('/repartidor')).toBe('page')
  })

  it('FIX: /api/health usa rate limit api (excluido del rate limit en proxy)', () => {
    // Aunque se clasifica como 'api', el proxy.ts lo excluye ANTES del
    // rate limit check. Esto es defensa en profundidad.
    expect(classifyRequest('/api/health')).toBe('api')
  })

  it('FIX: /api/cron/* usa rate limit api (excluido del rate limit en proxy)', () => {
    expect(classifyRequest('/api/cron/generar-recurrentes')).toBe('api')
  })
})
