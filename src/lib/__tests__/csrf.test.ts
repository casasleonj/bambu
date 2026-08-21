// @tests validateCsrf() — detección de esquema (FIX: hardcodeaba "https")
// Bug real: allowedOrigins hardcodeaba `https://${host}`, sin fallback al
// esquema real de la request. Como el proxy solo llama a validateCsrf()
// cuando NODE_ENV !== 'development' (next dev siempre setea development),
// el bug quedaba invisible en local/E2E hasta correr contra un build de
// producción (NODE_ENV=production) servido por HTTP directo — cualquier
// POST/PUT/DELETE/PATCH legítimo con Origin http:// era rechazado con 403.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { validateCsrf } from '../csrf'

const env = process.env as { NODE_ENV?: string; ALLOWED_ORIGINS?: string }
const ORIGINAL_NODE_ENV = env.NODE_ENV
const ORIGINAL_ALLOWED_ORIGINS = env.ALLOWED_ORIGINS

function makeRequest(
  url: string,
  opts: { method: string; origin?: string; referer?: string; host?: string; forwardedProto?: string },
): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.origin) headers.origin = opts.origin
  if (opts.referer) headers.referer = opts.referer
  if (opts.host) headers.host = opts.host
  if (opts.forwardedProto) headers['x-forwarded-proto'] = opts.forwardedProto
  return new NextRequest(url, { method: opts.method, headers })
}

describe('validateCsrf', () => {
  beforeEach(() => {
    env.NODE_ENV = 'production'
    delete env.ALLOWED_ORIGINS
  })

  afterEach(() => {
    env.NODE_ENV = ORIGINAL_NODE_ENV
    if (ORIGINAL_ALLOWED_ORIGINS === undefined) delete env.ALLOWED_ORIGINS
    else env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED_ORIGINS
  })

  it('permite GET sin chequear origin/referer', () => {
    const req = makeRequest('http://localhost:3001/api/clientes', { method: 'GET' })
    expect(validateCsrf(req)).toBeNull()
  })

  it('skip endpoints /api/auth/* (Auth.js maneja su propio CSRF)', () => {
    const req = makeRequest('http://localhost:3001/api/auth/callback/credentials', {
      method: 'POST',
      origin: 'https://otro-host.com',
      host: 'localhost:3001',
    })
    expect(validateCsrf(req)).toBeNull()
  })

  it('skip completo en development', () => {
    env.NODE_ENV = 'development'
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      origin: 'https://cualquier-otro-host.com',
      host: 'localhost:3001',
    })
    expect(validateCsrf(req)).toBeNull()
  })

  it('FIX: acepta Origin http:// sin x-forwarded-proto (el bug real — antes 403 siempre)', () => {
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      origin: 'http://localhost:3001',
      host: 'localhost:3001',
    })
    expect(validateCsrf(req)).toBeNull()
  })

  it('acepta Origin https:// cuando x-forwarded-proto=https (detrás de Vercel/proxy TLS-terminating)', () => {
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      origin: 'https://bambu.example.com',
      host: 'bambu.example.com',
      forwardedProto: 'https',
    })
    expect(validateCsrf(req)).toBeNull()
  })

  it('rechaza con 403 cuando el host del Origin no matchea', () => {
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      origin: 'http://attacker.example.com',
      host: 'localhost:3001',
    })
    const res = validateCsrf(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  it('rechaza cuando falta Origin y Referer', () => {
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      host: 'localhost:3001',
    })
    const res = validateCsrf(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  it('acepta ALLOWED_ORIGINS explícito aunque no matchee el host detectado', () => {
    process.env.ALLOWED_ORIGINS = 'https://extra-origin.example.com'
    const req = makeRequest('http://localhost:3001/api/clientes', {
      method: 'POST',
      origin: 'https://extra-origin.example.com',
      host: 'localhost:3001',
    })
    expect(validateCsrf(req)).toBeNull()
  })
})
