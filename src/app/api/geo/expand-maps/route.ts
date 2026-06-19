import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth-check'
import { parseGoogleMapsLink, isShortMapsUrl } from '@/lib/geo/parse-google-maps-link'
import { z } from 'zod'

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 8000

/**
 * Hosts permitidos para short URLs de Google Maps.
 * Solo resolvemos estos dominios para mitigar SSRF.
 */
const ALLOWED_SHORT_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
])

const BodySchema = z.object({
  url: z.string().url(),
})

function isAllowedHost(url: string): boolean {
  try {
    const u = new URL(url)
    return ALLOWED_SHORT_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function fetchRedirect(url: string, method: 'HEAD' | 'GET'): Promise<{ status: number; location: string | null; finalUrl: string } | null> {
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
    return { status: res.status, location: res.headers.get('location'), finalUrl: url }
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
    if (!isAllowedHost(nextUrl)) return null
    return expandUrl(nextUrl, redirectsLeft - 1)
  }

  return url
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return apiError('URL inválida', 400, { formErrors: ['La URL no es válida'] })
    }

    const { url } = parsed.data
    if (!isShortMapsUrl(url)) {
      const coords = parseGoogleMapsLink(url)
      return apiSuccess({ url, coords })
    }

    if (!isAllowedHost(url)) {
      return apiError('Dominio no permitido', 400, { formErrors: ['Solo se permiten links de Google Maps'] })
    }

    const expanded = await expandUrl(url)
    if (!expanded) {
      return apiError('No se pudo expandir el link', 422, {
        formErrors: ['No se pudo resolver el link acortado. Probá con el link largo de Google Maps.'],
      })
    }

    const coords = parseGoogleMapsLink(expanded)
    return apiSuccess({ url: expanded, coords })
  } catch (error) {
    return apiError('Error expandiendo link')
  }
}
