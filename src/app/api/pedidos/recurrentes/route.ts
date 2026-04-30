import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes, type DecisionGeneracion } from '@/lib/recurrentes'
import { z } from 'zod'
import { ROLES } from '@/lib/constants'

const DecisionSchema = z.object({
  recurrenteId: z.string().min(1),
  decision: z.enum(['NORMAL', 'CON_PENDIENTES', 'SOLO_PENDIENTES', 'SALTAR']),
})

const GenerarRecurrentesSchema = z.object({
  decisiones: z.array(DecisionSchema).min(1),
  fecha: z.string().datetime().optional(),
})

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
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = GenerarRecurrentesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const decisiones: DecisionGeneracion[] = parsed.data.decisiones
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date()

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
