import 'server-only'

import { createSign } from 'node:crypto'
import {
  construirSolicitudGoogle,
  leerOrdenGoogle,
  type ResultadoRecorridoVial,
  type SolicitudRecorridoVial,
} from './google-route-optimization'

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ROUTE_HOST = 'https://routeoptimization.googleapis.com'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export class GoogleRutaNoDisponibleError extends Error {
  constructor(
    public readonly codigo:
      | 'RUTA_DESHABILITADA'
      | 'CUOTA_SIN_CONFIRMAR'
      | 'CREDENCIALES_NO_CONFIGURADAS'
      | 'GOOGLE_NO_DISPONIBLE',
  ) {
    super('No se puede calcular un recorrido vial en este momento.')
    this.name = 'GoogleRutaNoDisponibleError'
  }
}

interface ConfiguracionGoogleRuta {
  projectId: string
  clientEmail: string
  privateKey: string
}

/** No permitir gasto por accidente: flag, cuota CONFIRMADA en Google Cloud y credenciales. */
export function configuracionGoogleRuta(
  variables: NodeJS.ProcessEnv = process.env,
): ConfiguracionGoogleRuta {
  if (variables.GOOGLE_ROUTE_OPTIMIZATION_ENABLED !== 'true')
    throw new GoogleRutaNoDisponibleError('RUTA_DESHABILITADA')
  if (variables.GOOGLE_ROUTE_OPTIMIZATION_QUOTA_CONFIRMED !== 'true')
    throw new GoogleRutaNoDisponibleError('CUOTA_SIN_CONFIRMAR')

  const projectId = variables.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID?.trim() ?? ''
  const clientEmail = variables.GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL?.trim() ?? ''
  const privateKey = (variables.GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!/^[a-zA-Z0-9-]{4,64}$/.test(projectId) ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(clientEmail) ||
      !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
      !privateKey.includes('-----END PRIVATE KEY-----'))
    throw new GoogleRutaNoDisponibleError('CREDENCIALES_NO_CONFIGURADAS')

  return { projectId, clientEmail, privateKey }
}

const base64url = (obj: object): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** JWT OAuth 2.0 para servidor-servidor. No guardar llave ni token en DB o logs. */
export function firmarAsercionGoogle(
  identidad: { clientEmail: string; privateKey: string },
  timestampSegundos: number,
): string {
  const head = base64url({ alg: 'RS256', typ: 'JWT' })
  const payload = base64url({
    iss: identidad.clientEmail,
    scope: CLOUD_PLATFORM_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: timestampSegundos,
    exp: timestampSegundos + 300,
  })
  const unsigned = `${head}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(unsigned)
  sign.end()
  return `${unsigned}.${sign.sign(identidad.privateKey).toString('base64url')}`
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null
}

let cacheToken: { clientEmail: string; token: string; venceAt: number } | null = null

async function obtenerTokenGoogle(
  cfg: ConfiguracionGoogleRuta,
  fetcher: typeof fetch,
): Promise<string> {
  if (cacheToken && cacheToken.clientEmail === cfg.clientEmail &&
      cacheToken.venceAt > Date.now() + 60_000)
    return cacheToken.token

  const assertion = firmarAsercionGoogle(
    cfg, Math.floor(Date.now() / 1000),
  )
  let response: Response
  try {
    response = await fetcher(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
  } catch {
    throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  }
  // NO volcar el body: puede contener información de OAuth.
  if (!response.ok) throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  let data: unknown
  try { data = await response.json() } catch {
    throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  }
  const token = objeto(data)
  if (!token || typeof token.access_token !== 'string' ||
      token.access_token.length === 0 || token.token_type !== 'Bearer' ||
      typeof token.expires_in !== 'number' || !(token.expires_in > 60))
    throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  cacheToken = {
    clientEmail: cfg.clientEmail,
    token: token.access_token,
    venceAt: Date.now() + token.expires_in * 1000,
  }
  return token.access_token
}

/**
 * Integración server-only con el proveedor de Google.
 * Nunca se llama si no existe autorización de habilitación + cuota de Cloud.
 * No se reintenta automáticamente una solicitud facturable.
 */
export async function optimizarRecorridoGoogle(
  input: SolicitudRecorridoVial,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoRecorridoVial> {
  const cfg = configuracionGoogleRuta()
  const solicitud = construirSolicitudGoogle(input)
  const accessToken = await obtenerTokenGoogle(cfg, fetcher)
  let response: Response
  try {
    response = await fetcher(
      `${GOOGLE_ROUTE_HOST}/v1/projects/${cfg.projectId}/locations/-:optimizeTours`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(solicitud),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      },
    )
  } catch {
    throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  }
  if (!response.ok) throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')

  let body: unknown
  try { body = await response.json() } catch {
    throw new GoogleRutaNoDisponibleError('GOOGLE_NO_DISPONIBLE')
  }
  return leerOrdenGoogle(body, input.paradas)
}
