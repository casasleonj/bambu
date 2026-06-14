/**
 * GET /api/alertas/umbrales
 *
 * Devuelve los umbrales configurables del sistema de alertas antifraude.
 * El cliente (alertas-table.tsx y similares) llama a este endpoint al
 * montar para obtener los valores parametrizados.
 *
 * Los valores se leen de la tabla Config con cache de 60s (via
 * getConfigs en src/lib/config.ts). Si una clave no existe, se usa
 * el default hardcoded en src/lib/umbrales.ts.
 *
 * Auth: requiere sesion (cualquier rol). Los umbrales no son
 * informacion sensible — el admin y el repartidor ven lo mismo.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getUmbralesAlertas } from '@/lib/umbrales-server'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const umbrales = await getUmbralesAlertas()
    return apiSuccess(umbrales)
  } catch (error) {
    return apiError('Error leyendo umbrales', 500)
  }
}
