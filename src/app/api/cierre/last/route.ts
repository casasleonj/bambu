import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'

const CierreLastSchema = z.object({
  includeDetails: z.coerce.boolean().optional(),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const url = new URL(request.url)
    const validation = CierreLastSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400)
    }
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    return apiSuccess({ cierre })
  } catch (error) {
    return apiError('Error', 500)
  }
}