/**
 * Expansión de short URLs de Google Maps (`maps.app.goo.gl/...`, `goo.gl/maps/...`)
 * vía cadena de HTTP redirects. Server-only (hace I/O con fetch).
 *
 * Extraído de `src/app/api/geo/expand-maps/route.ts` para compartirse con los
 * backfills de coordenadas (cliente y negocio): el parseo puro no puede
 * resolver short URLs, pero el servidor sí puede seguir el redirect.
 *
 * Seguridad (SSRF): allowlist de hosts Google + tope de redirects + timeout.
 * Verificado con docs Next.js 16: el fetch server-side pasa `redirect`
 * verbatim sin protección de framework — la allowlist es obligatoria.
 */

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 8000

/** Hosts permitidos para short URLs de Google Maps. */
export const ALLOWED_SHORT_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
])

export function isAllowedMapsHost(url: string): boolean {
  try {
    const u = new URL(url)
    return ALLOWED_SHORT_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

interface FetchRedirectResult {
  status: number
  location: string | null
}

async function fetchRedirect(
  url: string,
  method: 'HEAD' | 'GET',
): Promise<FetchRedirectResult | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BambuBot/1.0)',
      },
    })
    return { status: res.status, location: res.headers.get('location') }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function expandUrl(url: string, redirectsLeft = MAX_REDIRECTS): Promise<string | null> {
  if (redirectsLeft <= 0) return null

  // HEAD primero para no descargar el body; si no devuelve redirect,
  // probamos GET (algunos servidores no soportan HEAD bien).
  let result = await fetchRedirect(url, 'HEAD')
  if (!result) {
    result = await fetchRedirect(url, 'GET')
  }
  if (!result) return null

  if (result.status >= 300 && result.status < 400) {
    const location = result.location
    if (!location) return null
    const nextUrl = new URL(location, url).toString()
    if (!isAllowedMapsHost(nextUrl)) return null
    return expandUrl(nextUrl, redirectsLeft - 1)
  }

  return url
}

/**
 * Resuelve una short URL de Google Maps a su URL final (larga).
 * Devuelve `null` si no se puede expandir (red excede tope, host no
 * permitido, timeout, error de red).
 */
export async function expandShortMapsUrl(url: string): Promise<string | null> {
  if (!isAllowedMapsHost(url)) return null
  return expandUrl(url)
}
