import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-check'
import { CasoCreateSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  // FIX CRITICAL (C-SEC-7a): Only users with view:casos can read cases
  // Previously: requireAuth() only — any user could read customer PII and descriptions
  const authResult = await requirePermission('view:casos')
  if (authResult instanceof Response) return authResult

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const severidad = searchParams.get('severidad')
  const asignadoA = searchParams.get('asignadoA')
  const search = searchParams.get('search')

  try {
    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (severidad) where.severidad = severidad
    if (asignadoA) where.asignadoAId = asignadoA
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { cliente: { nombre: { contains: search, mode: 'insensitive' } } },
        { descripcion: { contains: search, mode: 'insensitive' } },
      ]
    }

    const casos = await prisma.caso.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        pedido: { select: { id: true, numero: true, total: true } },
        asignadoA: { select: { id: true, username: true } },
        creadoPor: { select: { id: true, username: true } },
        _count: { select: { eventos: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess({ casos })
  } catch (error) {
    return apiError('Error cargando casos')
  }
}

export async function POST(request: NextRequest) {
  // FIX CRITICAL (C-SEC-7b): Only users with view:casos can create cases
  // Previously: requireAuth() only — any user could create cases and assign them to anyone
  const authResult = await requirePermission('view:casos')
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    // FIX CRITICAL (C-VAL-1): Use Zod schema instead of ad-hoc checks
    // Previously: no length limits, no enum validation — XSS / overflow / mass assignment risk
    const parsed = CasoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { alertaTipo, severidad, titulo, descripcion, clienteId, pedidoId } = parsed.data

    // FIX CRITICAL (C-VAL-2): Validate clienteId and pedidoId exist before assignment
    if (clienteId) {
      const exists = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } })
      if (!exists) return apiError('Cliente no encontrado', 404)
    }
    if (pedidoId) {
      const exists = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { id: true } })
      if (!exists) return apiError('Pedido no encontrado', 404)
    }

    const caso = await prisma.caso.create({
      data: {
        alertaTipo,
        severidad,
        titulo,
        descripcion: descripcion || null,
        clienteId: clienteId || null,
        pedidoId: pedidoId || null,
        creadoPorId: userId,
        eventos: {
          create: {
            userId,
            accion: 'creado',
            valorPost: 'ABIERTO',
          },
        },
      },
      include: {
        cliente: { select: { id: true, nombre: true } },
        pedido: { select: { id: true, numero: true } },
        creadoPor: { select: { id: true, username: true } },
      },
    })

    logAudit({
      entidad: 'Caso',
      registroId: caso.id,
      accion: 'CREATE',
      datos: { alertaTipo, severidad, clienteId, pedidoId },
      usuarioId: userId,
    })

    return apiSuccess({ caso }, 201)
  } catch (error) {
    return apiError('Error creando caso')
  }
}
