import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'

const BodySchema = z.object({
  canal: z.literal('whatsapp'),
  estado: z.enum(['TODAS', 'EMITIDA', 'PARCIAL', 'PAGADA']).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  facturas: z.number().int().min(0).max(10_000).optional(),
})

/**
 * Anota que se PREPARÓ el envío del resumen de facturas por WhatsApp (#845).
 * No prueba que se enviara ni que el cliente lo leyera. Solo ADMIN y ASISTENTE.
 *
 * La comunicación al cliente es opcional, best-effort y nunca fuente de verdad
 * (ADR-COMUNICACIONES-001): no modifica facturas, pagos ni saldos, y el cliente
 * web ignora un fallo de este registro.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['ADMIN', 'ASISTENTE'])
  if (authResult instanceof Response) return authResult

  const { id: clienteId } = await params

  const raw: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return apiError('Body inválido', 400, { formErrors: [formatZodError(parsed.error)] })
  }

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } })
    if (!cliente) return apiError('Cliente no encontrado', 404)

    await logAudit({
      entidad: 'Cliente',
      registroId: clienteId,
      accion: 'COMPARTIR',
      usuarioId: authResult.user?.id ?? null,
      datos: {
        tipo: 'RESUMEN_FACTURAS',
        canal: parsed.data.canal,
        resultado: 'PREPARADO',
        estado: parsed.data.estado ?? 'TODAS',
        desde: parsed.data.desde ?? null,
        hasta: parsed.data.hasta ?? null,
        facturas: parsed.data.facturas ?? null,
      },
    })

    return apiSuccess({ registrado: true })
  } catch {
    return apiError('No se pudo registrar', 500)
  }
}
