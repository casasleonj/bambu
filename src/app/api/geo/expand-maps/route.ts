import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth-check'
import { parseGoogleMapsLink, isShortMapsUrl } from '@/lib/geo/parse-google-maps-link'
import { isAllowedMapsHost, expandShortMapsUrl } from '@/lib/geo/expand-short-maps-url'
import { z } from 'zod'

const BodySchema = z.object({
  url: z.string().url(),
})

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

    if (!isAllowedMapsHost(url)) {
      return apiError('Dominio no permitido', 400, { formErrors: ['Solo se permiten links de Google Maps'] })
    }

    const expanded = await expandShortMapsUrl(url)
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
