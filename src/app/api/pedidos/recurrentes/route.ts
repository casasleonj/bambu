import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { generarPedidosRecurrentes } from '@/lib/recurrentes'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json().catch(() => ({}))
    const fecha = body.fecha ? new Date(body.fecha) : new Date()

    const generados = await generarPedidosRecurrentes(fecha)

    return NextResponse.json({
      success: true,
      generados: generados.length,
      pedidos: generados,
    })
  } catch (error) {
    console.error('Error generando pedidos recurrentes:', error)
    return NextResponse.json(
      { error: 'Error generando pedidos recurrentes' },
      { status: 500 }
    )
  }
}
