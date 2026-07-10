import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  getFiadoStatusUseCase,
  ClienteNotFoundError,
} from '@/modules/pedidos'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const status = await getFiadoStatusUseCase.execute({ clienteId: id })
    return apiSuccess({ status })
  } catch (error) {
    if (error instanceof ClienteNotFoundError) {
      return apiError('Cliente no encontrado', 404)
    }

    console.error('[API /clientes/[id]/fiado-status]', error)
    return apiError('Error cargando estado de fiados', 500)
  }
}
