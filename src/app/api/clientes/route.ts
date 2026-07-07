import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ClienteCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { logAudit } from '@/lib/audit'
import { ROLES, CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { publishRealtimeEvent } from '@/lib/realtime'
import {
  buildClientesWhere,
  buildClientesRawWhere,
  type MostrarNegocio,
} from '@/lib/cliente-filters'

export async function GET(request: NextRequest) {
  // FIX H3-4: GET /api/clientes solo para roles con visibilidad de
  // cartera de clientes (ADMIN, ASISTENTE, CONTADOR). REPARTIDOR
  // no debe listar clientes — debe usar el endpoint dedicado de su
  // ruta (futuro /api/clientes/mi-ruta). Antes: cualquier usuario
  // autenticado veía toda la base.
  const authResult = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR])
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const search = request.nextUrl.searchParams.get('search')
    const mostrarNegocio = request.nextUrl.searchParams.get('mostrarNegocio') as MostrarNegocio | null
    const todosNegociosConLink = request.nextUrl.searchParams.get('todosNegociosConLink')
    const clienteConLink = request.nextUrl.searchParams.get('clienteConLink')
    const bloqueado = request.nextUrl.searchParams.get('bloqueado')
    const reclamaciones = request.nextUrl.searchParams.get('reclamaciones')
    const noVerificado = request.nextUrl.searchParams.get('noVerificado')
    const where = buildClientesWhere({
      bloqueado: bloqueado ?? undefined,
      reclamaciones: reclamaciones ?? undefined,
      noVerificado: noVerificado ?? undefined,
      mostrarNegocio: mostrarNegocio ?? undefined,
      todosNegociosConLink: todosNegociosConLink === 'true' ? 'true' : undefined,
      clienteConLink: clienteConLink === 'true' ? 'true' : undefined,
    })

    // Use pg_trgm search for queries with 2+ characters (better relevance)
    // Fall back to Prisma contains for single-char queries
    if (search && search.trim().length >= 2) {
      // Use raw SQL with pg_trgm word_similarity for better relevance
      // Ocultar canónico en la búsqueda raw SQL también.
      const adminFilter = Prisma.sql`AND c.id != ${CANONICAL_CONSUMIDOR_FINAL_ID}`
      const filtrosNegocioRaw = Prisma.raw(
        buildClientesRawWhere({
          mostrarNegocio: mostrarNegocio ?? undefined,
          todosNegociosConLink: todosNegociosConLink === 'true' ? 'true' : undefined,
          clienteConLink: clienteConLink === 'true' ? 'true' : undefined,
        })
      )

      const clientesRaw = await prisma.$queryRaw`
        SELECT DISTINCT ON (c.id)
          c.id, c.nombre, c.apellido, c.telefono, c.direccion, c.barrio,
          c."nombreNegocio", c."tipoNegocio", c.notas, c.fuente, c.frecuencia,
          c."cadaNDias", c."ultEntrega", c."proxEntrega", c."habAgua", c."habHielo",
          c."habBotellon", c."habBolsaAgua", c."habBolsaHielo", c.verificado,
          c."verificadoEn", c."creadoPorRol", c.bloqueado, c.reclamaciones,
          c."limitePedidosFiados", c."negocioDefaultId", c.notas, c.activo,
          c."createdAt", c."updatedAt", c."createdById", c."rutaId", c.referencia,
          c."linkUbicacion", c."preciosEspeciales",
          c.lat, c.lng, c."geocodeOrigen", c."geocodeAt",
          COALESCE(
            (SELECT json_agg(json_build_object('nombre', cc.nombre, 'telefono', cc.telefono, 'relacion', cc.relacion))
             FROM "ContactoCliente" cc WHERE cc."clienteId" = c.id),
            '[]'::json
          ) AS contactos,
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
          ${filtrosNegocioRaw}
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
          select: { id: true, nombre: true, tipoNegocio: true, direccion: true, barrio: true, referencia: true, linkUbicacion: true, clienteId: true },
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
            estadoEntrega: 'ENTREGADO',
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
              estadoEntrega: 'ENTREGADO',
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
              linkUbicacion: true,
            },
          },
          contactos: true,  // FASE 3: ya es el nombre final
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

    // FIX F-N3: dedup por offlineId + dedup por teléfono + create corren
    // dentro de una transacción Serializable. Antes eran 3 operaciones
    // auto-commit con race window. Dos requests simultáneos con el
    // mismo teléfono podían pasar el check y ambos intentar crear.
    const result = await executeSerializableWithRetry<
      | { kind: 'existing'; cliente: { id: string; nombre: string; telefono: string; offlineId: string | null; clienteId: string } }
      | { kind: 'created'; cliente: { id: string; nombre: string; telefono: string; clienteId: string } }
      | { kind: 'duplicate_phone'; existingNombre: string }
    >(
      async (tx) => {
        // 1. Dedup por offlineId
        if (parsed.data.offlineId) {
          const existente = await tx.cliente.findUnique({
            where: { offlineId: parsed.data.offlineId },
            select: { id: true, nombre: true, telefono: true, offlineId: true },
          })
          if (existente) {
            return {
              kind: 'existing' as const,
              cliente: { ...existente, clienteId: existente.id },
            }
          }
        }

        // 2. Dedup por teléfono
        const duplicadoTelefono = await tx.cliente.findFirst({
          where: {
            activo: true,
            OR: [
              { telefono: parsed.data.telefono },
              { contactos: { some: { telefono: parsed.data.telefono } } },
            ],
          },
          select: { id: true, nombre: true, telefono: true },
        })

        if (duplicadoTelefono) {
          return { kind: 'duplicate_phone' as const, existingNombre: duplicadoTelefono.nombre }
        }

        // 3. Create
        const cliente = await tx.cliente.create({
          data: {
            nombre: parsed.data.nombre,
            apellido: parsed.data.apellido,
            telefono: parsed.data.telefono,
            fuente: parsed.data.fuente,
            barrio: parsed.data.barrio,
            direccion: parsed.data.direccion,
            linkUbicacion: parsed.data.linkUbicacion ?? null,
            nombreNegocio: parsed.data.nombreNegocio ?? null,
            tipoNegocio: parsed.data.tipoNegocio ?? null,
            horaApertura: parsed.data.horaApertura ?? null,
            referencia: parsed.data.referencia ?? null,
            // lat/lng se persisten después vía POST /api/clientes/[id]/geocode.
            // No es responsabilidad de POST /api/clientes. El admin puede
            // triggerearlo desde el botón "Actualizar coordenadas" o el
            // cron job.
            preciosEspeciales: parsed.data.preciosEspeciales,
            notas: parsed.data.notas,
            limitePedidosFiados: parsed.data.limitePedidosFiados ?? null,
            offlineId: parsed.data.offlineId ?? null,
          },
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            fuente: true,
            barrio: true,
            direccion: true,
            linkUbicacion: true,
            preciosEspeciales: true,
            notas: true,
            offlineId: true,
            nombreNegocio: true,
            tipoNegocio: true,
            horaApertura: true,
            referencia: true,
            limitePedidosFiados: true,
          },
        })

        return { kind: 'created' as const, cliente: { ...cliente, clienteId: cliente.id } }
      },
      'clientes:create',
    )

    if (result.kind === 'duplicate_phone') {
      return apiError('Ya existe un cliente con ese teléfono', 409, {
        formErrors: [`El teléfono ya está registrado en "${result.existingNombre}"`],
      })
    }

    if (result.kind === 'existing') {
      return apiSuccess({ deduped: true, cliente: result.cliente }, 200)
    }

    // result.kind === 'created'
    logAudit({
      entidad: 'Cliente',
      registroId: result.cliente.id,
      accion: 'CREATE',
      datos: { nombre: result.cliente.nombre, telefono: result.cliente.telefono },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    publishRealtimeEvent('cliente.created', result.cliente.id).catch(() => {})

    return apiSuccess({ cliente: result.cliente }, 201)
  } catch (error) {
    return apiError('Error creando cliente')
  }
}
