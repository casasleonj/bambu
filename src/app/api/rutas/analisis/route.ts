import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import {
  analizarPatronesEntrega,
  obtenerRepartidoresActivos,
  obtenerBarriosSinRuta,
} from '@/lib/route-analysis'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
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
    console.error('Error en análisis de rutas:', error)
    return NextResponse.json(
      { error: 'Error al analizar patrones de entrega' },
      { status: 500 }
    )
  }
}
