import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes, type DecisionGeneracion } from '@/lib/recurrentes'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const preview = await previewGeneracionRecurrentes()
    return NextResponse.json({ success: true, preview })
  } catch (error) {
    console.error('Error preview recurrentes:', error)
    return NextResponse.json({ error: 'Error al generar preview' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json().catch(() => ({}))
    const decisiones: DecisionGeneracion[] = body.decisiones || []
    const fecha = body.fecha ? new Date(body.fecha) : new Date()

    if (decisiones.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron decisiones' }, { status: 400 })
    }

    const resultado = await generarPedidosRecurrentes(decisiones, fecha)

    return NextResponse.json({
      success: true,
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      pedidos: resultado.generados,
      saltadosIds: resultado.saltados,
    }, { status: 201 })
  } catch (error) {
    console.error('Error generando recurrentes:', error)
    return NextResponse.json({ error: 'Error generando pedidos recurrentes' }, { status: 500 })
  }
}
