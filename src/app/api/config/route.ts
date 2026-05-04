import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ConfigCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const clave = searchParams.get('clave')
    const keysParam = searchParams.get('keys')
    
    if (clave) {
      const config = await prisma.config.findUnique({ where: { clave } })
      if (!config) {
        return apiError('Not found', 404)
      }
      return apiSuccess({ config })
    }
    
    if (keysParam) {
      const keys = keysParam.split(',')
      const configs = await prisma.config.findMany({
        where: { clave: { in: keys } }
      })
      const result: Record<string, string> = {}
      configs.forEach(c => { result[c.clave] = c.valor })
      return apiSuccess(result)
    }
    
    const configs = await prisma.config.findMany()
    return apiSuccess({ configs })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = ConfigCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { clave, valor } = parsed.data

    const existing = await prisma.config.findUnique({ where: { clave } })
    const config = await prisma.config.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    })

    logAudit({
      entidad: 'Config',
      registroId: config.id,
      accion: existing ? 'UPDATE' : 'CREATE',
      datos: { clave, valor },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ config }, 201)
  } catch (error) {
    return apiError('Error', 500)
  }
}