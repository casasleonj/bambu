import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ConfigCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { validateConfigValue } from '@/lib/config-validation'
import { revalidateConfigCache } from '@/lib/config'

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

  const body = await request.json()
  const parsed = ConfigCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }
  const { clave, valor } = parsed.data

  // Server-side semantic validation per key
  const validationError = validateConfigValue(clave, valor)
  if (validationError) {
    return apiError(validationError, 400)
  }

  // BASE_DIA keys can be set by any authenticated user
  const isBaseDia = clave.startsWith('BASE_DIA')
  if (!isBaseDia) {
    const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
    if (roleCheck instanceof Response) return roleCheck
  }

  try {
    const { valor } = parsed.data

    // FIX F-N24 (hallazgo 43): envolver el upsert en prisma.$transaction
    // y revalidar cache SOLO si el commit fue exitoso.
    //
    // Antes: el upsert corría FUERA de tx. Si fallaba (P2002 por
    // unique constraint, error de red, etc.), revalidateConfigCache
    // se ejecutaba igual, invalidando la cache innecesariamente.
    // Si la tx externa no se hacía commit, la cache se invalidaba
    // de todas formas (stale invalidation).
    //
    // Ahora: la tx garantiza que el upsert commiteó. Solo entonces
    // revalidamos la cache. Si la tx hace rollback, la cache no
    // se invalida.
    const { config, existing } = await prisma.$transaction(async (tx) => {
      const existing = await tx.config.findUnique({ where: { clave } })
      const config = await tx.config.upsert({
        where: { clave },
        update: { valor },
        create: { clave, valor },
      })
      return { config, existing }
    })

    logAudit({
      entidad: 'Config',
      registroId: config.id,
      accion: existing ? 'UPDATE' : 'CREATE',
      datos: { clave, valor },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    // Solo revalidar si la tx commiteó exitosamente
    revalidateConfigCache()

    return apiSuccess({ config }, 201)
  } catch (error) {
    return apiError('Error', 500)
  }
}