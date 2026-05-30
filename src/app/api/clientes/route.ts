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
    const search = request.nextUrl.searchParams.get('search')
    const isAdmin = (authResult.user as { role?: string } | undefined)?.role === 'ADMIN'
    const where: any = {
      activo: true,
      ...(isAdmin ? {} : { id: { not: 'CONSUMIDOR_FINAL' } }),
    }

    // Use pg_trgm search for queries with 2+ characters (better relevance)
    // Fall back to Prisma contains for single-char queries
    if (search && search.trim().length >= 2) {
      // Use raw SQL with pg_trgm word_similarity for better relevance
      const isAdmin = (authResult.user as { role?: string } | undefined)?.role === 'ADMIN'
      const adminFilter = isAdmin ? '' : 'AND c.id != \'CONSUMIDOR_FINAL\''

      const clientesRaw = await prisma.$queryRaw`
        SELECT DISTINCT ON (c.id)
          c.id, c.nombre, c.apellido, c.telefono, c.direccion, c.barrio,
          c."nombreNegocio", c."tipoNegocio", c.notas, c.fuente, c.frecuencia,
          c."cadaNDias", c."ultEntrega", c."proxEntrega", c."habAgua", c."habHielo",
          c."habBotellon", c."habBolsaAgua", c."habBolsaHielo", c.verificado,
          c."verificadoEn", c."creadoPorRol", c.bloqueado, c.reclamaciones,
          c."limitePedidosFiados", c."negocioDefaultId", c.notas, c.activo,
          c."createdAt", c."updatedAt", c."createdById", c."rutaId", c.referencia,
          c."linkUbicacion", c.contactos, c."preciosEspeciales",
          GREATEST(
            word_similarity(${search}, c.nombre),
            word_similarity(${search}, COALESCE(c.apellido, '')),
            word_similarity(${search}, COALESCE(c."nombreNegocio", '')),
            word_similarity(${search}, COALESCE(c.barrio, '')),
            word_similarity(${search}, COALESCE(c.direccion, ''))
          ) as similarity_score
        FROM "Cliente" c
        WHERE c.activo = true
          ${adminFilter}
          AND (
            c.nombre <% ${search} OR
            COALESCE(c.apellido, '') <% ${search} OR
            COALESCE(c."nombreNegocio", '') <% ${search} OR
            COALESCE(c.barrio, '') <% ${search} OR
            COALESCE(c.direccion, '') <% ${search} OR
            c.nombre ILIKE '%' || ${search} || '%' OR
            COALESCE(c.apellido, '') ILIKE '%' || ${search} || '%' OR
            COALESCE(c."nombreNegocio", '') ILIKE '%' || ${search} || '%' OR
            COALESCE(c.barrio, '') ILIKE '%' || ${search} || '%' OR
            COALESCE(c.direccion, '') ILIKE '%' || ${search} || '%'
          )
        ORDER BY c.id, similarity_score DESC
        LIMIT 100
      ` as any[]

      // Enrich with negocios and counts
      const clienteIds = clientesRaw.map((c: any) => c.id)
      const [negociosMap, countsMap] = await Promise.all([
        prisma.negocio.findMany({
          where: { clienteId: { in: clienteIds }, activo: true },
          select: { id: true, nombre: true, tipoNegocio: true, direccion: true, barrio: true, referencia: true, clienteId: true },
        }).then(negs => {
          const map = new Map<string, any[]>()
          for (const n of negs) {
            const existing = map.get(n.clienteId) || []
            existing.push(n)
            map.set(n.clienteId, existing)
          }
          return map
        }),
        prisma.pedido.findMany({
          where: {
            clienteId: { in: clienteIds },
            saldo: { gt: 0 },
            estadoEntrega: { in: ['ENTREGADO', 'EN_RUTA', 'PENDIENTE', 'NO_ENTREGADO'] },
          },
          select: { clienteId: true, saldo: true },
        }).then(pedidos => {
          const map = new Map<string, number>()
          for (const p of pedidos) {
            map.set(p.clienteId, (map.get(p.clienteId) || 0) + Number(p.saldo))
          }
          return map
        }),
      ])

      const clientes = clientesRaw.map((c: any) => ({
        ...c,
        clienteId: c.id,
        saldoPendiente: countsMap.get(c.id) || 0,
        negocios: negociosMap.get(c.id) || [],
        _count: { pedidos: 0 }, // simplified
      }))

      return apiSuccess({ clientes, total: clientes.length })
    }

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { direccion: { contains: search, mode: 'insensitive' } },
        { barrio: { contains: search, mode: 'insensitive' } },
        { nombreNegocio: { contains: search, mode: 'insensitive' } },
        { tipoNegocio: { contains: search, mode: 'insensitive' } },
        { notas: { contains: search, mode: 'insensitive' } },
        { negocios: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { direccion: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { barrio: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { tipoNegocio: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { referencia: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const prismaPagination = getPrismaPagination(pagination)
    const [clientesRaw, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: {
          _count: { select: { pedidos: true } },
          pedidos: {
            where: {
              saldo: { gt: 0 },
              estadoEntrega: { in: ['ENTREGADO', 'EN_RUTA', 'PENDIENTE', 'NO_ENTREGADO'] },
            },
            select: { saldo: true },
          },
          negocios: {
            select: {
              id: true,
              nombre: true,
              tipoNegocio: true,
              direccion: true,
              barrio: true,
              referencia: true,
            },
          },
        },
        ...prismaPagination,
      }),
      prisma.cliente.count({ where }),
    ])

    const clientes = clientesRaw.map(c => ({
      ...c,
      clienteId: c.id,
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

    const duplicadoTelefono = await prisma.cliente.findFirst({
      where: {
        activo: true,
        OR: [
          { telefono: parsed.data.telefono },
          { contactos: { path: ['[*].telefono'], equals: parsed.data.telefono } },
        ],
      },
      select: { id: true, nombre: true, telefono: true },
    })

    if (duplicadoTelefono) {
      return apiError('Ya existe un cliente con ese teléfono', 409, {
        formErrors: [`El teléfono ya está registrado en "${duplicadoTelefono.nombre}"`],
      })
    }

    const contactos = parsed.data.contactos ?? []
    const contactosSinDuplicados = contactos.filter(c => c.telefono !== parsed.data.telefono)

    const cliente = await prisma.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        apellido: parsed.data.apellido,
        telefono: parsed.data.telefono,
        fuente: parsed.data.fuente,
        barrio: parsed.data.barrio,
        direccion: parsed.data.direccion,
        linkUbicacion: parsed.data.linkUbicacion ?? null,
        contactos: contactosSinDuplicados.length > 0 ? contactosSinDuplicados : undefined,
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

    return apiSuccess({ cliente: { ...cliente, clienteId: cliente.id } }, 201)
  } catch (error) {
    return apiError('Error creando cliente')
  }
}
