import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import {
  analizarPatronesEntrega,
  obtenerRepartidoresActivos,
  obtenerBarriosSinRuta,
} from '@/lib/route-analysis'
import { z } from 'zod'

const AnalisisSchema = z.object({
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  minEntregas: z.coerce.number().int().positive().optional(),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const url = new URL(request.url)
    const validation = AnalisisSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: validation.error.flatten() }, { status: 400 })
    }
    const [analisis, repartidores, barriosSinRuta] = await Promise.all([
      analizarPatronesEntrega(),
      obtenerRepartidoresActivos(),
      obtenerBarriosSinRuta(),
    ])

    return NextResponse.json({
      success: true,
      ...analisis,
      repartidores,
      barriosSinRuta,
    })
  } catch (error) {
    console.error('Error en análisis de rutas:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json(
      { error: 'Error al analizar patrones de entrega' },
      { status: 500 }
    )
  }
}
