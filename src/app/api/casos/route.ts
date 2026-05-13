import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const { alertaTipo, severidad, titulo, descripcion, clienteId, pedidoId } = body

    if (!alertaTipo || !severidad || !titulo) {
      return apiError('Faltan campos requeridos: alertaTipo, severidad, titulo', 400)
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
