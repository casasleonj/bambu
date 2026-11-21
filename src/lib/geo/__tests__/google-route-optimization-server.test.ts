import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'

vi.mock('server-only', () => ({}))

import {
  configuracionGoogleRuta,
  firmarAsercionGoogle,
  GoogleRutaNoDisponibleError,
  optimizarRecorridoGoogle,
} from '../google-route-optimization-server'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const email = 'tests@example.iam.gserviceaccount.com'
const envio = {
  origen: { lat: 10.03, lng: -73.23 },
  paradas: [
    { pedidoId: 'a', tipo: 'ENTREGA' as const, lat: 10.032, lng: -73.234 },
    { pedidoId: 'b', tipo: 'COBRO' as const, lat: 10.035, lng: -73.239 },
  ],
  salida: new Date('2026-11-20T15:00:00Z'),
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('#930 servicio Google con permisos de gasto explícitos', () => {
  it('impide llamadas por defecto, aun con credenciales disponibles', async () => {
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_ENABLED', 'false')
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED', 'true')
    const fetcher = vi.fn()
    await expect(optimizarRecorridoGoogle(envio, fetcher as unknown as typeof fetch))
      .rejects.toMatchObject({ codigo: 'RUTA_DESHABILITADA' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('no basta habilitar el flag sin confirmar la cuota real de Google Cloud', () => {
    expect(() => configuracionGoogleRuta({ GOOGLE_ROUTE_OPTIMIZATION_ENABLED: 'true' }))
      .toThrow(GoogleRutaNoDisponibleError)
  })

  it('la configuración exige proyecto, cuenta de servicio y clave PEM; nunca acepta URLs arbitrarias', () => {
    const base = {
      GOOGLE_ROUTE_OPTIMIZATION_ENABLED: 'true',
      GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED: 'true',
      GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID: '../unsafe/path',
      GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL: email,
      GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY: privateKey,
    }
    expect(() => configuracionGoogleRuta(base)).toThrow(GoogleRutaNoDisponibleError)
    expect(configuracionGoogleRuta({ ...base,
      GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID: 'project-123',
    }).projectId).toBe('project-123')
  })

  it('firma un JWT RS256 con issuer, scope, audiencia y ventana de 5 minutos', () => {
    const firmado = firmarAsercionGoogle({ clientEmail: email, privateKey }, 2000)
    const [header, payload, signature] = firmado.split('.')
    const verificador = createVerify('RSA-SHA256')
    verificador.update(`${header}.${payload}`)
    verificador.end()
    expect(verificador.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    expect(claims).toMatchObject({
      iss: email, iat: 2000, exp: 2300,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    })
  })

  it('llama a dominios fijos Google OAuth/API y devuelve únicamente orden por vías, no mapa', async () => {
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_ENABLED', 'true')
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED', 'true')
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID', 'project-123')
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL', email)
    vi.stubEnv('GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY', privateKey)
    const llamadas: string[] = []
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push(String(url))
      if (String(url) === 'https://oauth2.googleapis.com/token')
        return Response.json({ access_token: 'test-access-token', token_type: 'Bearer', expires_in: 3600 })
      expect(init?.headers).toEqual({
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/json',
      })
      const body = JSON.parse(String(init?.body))
      expect(body.populatePolylines).toBe(false)
      expect(body.useGeodesicDistances).toBe(false)
      return Response.json({ routes: [{ visits: [
        { shipmentIndex: 1, shipmentLabel: 'b' }, { shipmentLabel: 'a' },
      ] }] })
    }) as unknown as typeof fetch
    const resultado = await optimizarRecorridoGoogle(envio, fetcher)
    expect(resultado.ordenPedidoIds).toEqual(['b', 'a'])
    expect(llamadas).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://routeoptimization.googleapis.com/v1/projects/project-123/locations/-:optimizeTours',
    ])
  })
})
