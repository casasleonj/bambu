import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ClienteCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const where = { activo: true }
    const prismaPagination = getPrismaPagination(pagination)
    const [clientesRaw, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: {
          _count: { select: { pedidos: true } },
          pedidos: {
            where: { saldo: { gt: 0 } },
            select: { saldo: true },
          },
        },
        ...prismaPagination,
      }),
      prisma.cliente.count({ where }),
    ])

    const clientes = clientesRaw.map(c => ({
      ...c,
      saldoPendiente: c.pedidos.reduce((sum, p) => sum + Number(p.saldo), 0),
    }))
    return apiSuccess(
      pagination.all
        ? { clientes, total }
        : buildPaginationResponse(clientes, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    return apiError('Error cargando clientes')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = ClienteCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const cliente = await prisma.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        apellido: parsed.data.apellido,
        telefono: parsed.data.telefono,
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        barrio: parsed.data.barrio,
        direccion: parsed.data.direccion,
        frecuencia: parsed.data.frecuencia || 'NINGUNA',
        cadaNDias: parsed.data.cadaNDias,
        preciosEspeciales: parsed.data.preciosEspeciales,
        notas: parsed.data.notas,
      },
    })

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'CREATE',
      datos: { nombre: cliente.nombre, telefono: cliente.telefono },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ cliente }, 201)
  } catch (error) {
    return apiError('Error creando cliente')
  }
}
