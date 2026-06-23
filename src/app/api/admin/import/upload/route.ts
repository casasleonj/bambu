import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { uploadImportFile } from '@/lib/import/application'
import { logger } from '@/lib/logger'

/**
 * POST /api/admin/import/upload
 *
 * Recibe un archivo .xlsx / .xls / .csv multipart, lo parsea y crea un
 * ImportBatch en estado DRAFT con sus ImportStagingRow asociadas.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const nombre = formData.get('nombre')

    if (!file || !(file instanceof File)) {
      return apiError('Debe subir un archivo', 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const batchName = typeof nombre === 'string' && nombre.trim() !== ''
      ? nombre.trim()
      : file.name

    const userId = (authResult.user as { id?: string } | undefined)?.id
    if (!userId) {
      return apiError('No se pudo identificar el usuario', 401)
    }

    const result = await uploadImportFile(userId, batchName, buffer)

    logger.info(
      { userId, batchId: result.batchId, totalRows: result.totalRows },
      'import upload completed'
    )

    return apiSuccess(result, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error procesando el archivo'
    logger.error({ error: message }, 'import upload failed')
    return apiError(message, 400)
  }
}
