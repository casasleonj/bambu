import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ClienteCreateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { publishRealtimeEvent } from '@/lib/realtime'
import { broadcastPush } from '@/lib/push'
import {
  fetchClientesList,
  parseClienteListParams,
} from '@/lib/clientes-repo'

export async function GET(request: NextRequest) {
  // FIX H3-4: GET /api/clientes solo para roles con visibilidad de
  // cartera de clientes (ADMIN, ASISTENTE, CONTADOR). REPARTIDOR
  // no debe listar clientes — debe usar el endpoint dedicado de su
  // ruta (futuro /api/clientes/mi-ruta). Antes: cualquier usuario
  // autenticado veía toda la base.
  const authResult = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR])
  if (authResult instanceof Response) return authResult
  try {
    const params = parseClienteListParams(request.nextUrl.searchParams)
    const result = await fetchClientesList(params)
    return apiSuccess({
      clientes: result.clientes,
      total: result.total,
      totalPages: result.totalPages,
      page: result.page,
    })
  } catch (error) {
    return apiError('Error cargando clientes')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  // FIX: timeout global de 25s para el POST. Si la DB no responde
  // (Supabase pausada, cold start severo, o conexión colgada), la función
  // devuelve 500 inmediato en lugar de colgar hasta el timeout de Vercel
  // (10s en Hobby, 60s en Pro). Esto evita que el cliente se quede
  // esperando indefinidamente sin respuesta.
  // En CI (PostgreSQL en contenedor con cold start) se permite sobreescribir
  // via env var para dar margen a la transacción Serializable con retries.
  const TIMEOUT_MS = Number(process.env.CLIENTES_POST_TIMEOUT_MS) || 25_000
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('DB_TIMEOUT')), TIMEOUT_MS)
  })

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
    const result = await Promise.race([
      executeSerializableWithRetry<
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
            referencia: parsed.data.referencia ?? null,
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
            referencia: true,
            limitePedidosFiados: true,
          },
        })

        return { kind: 'created' as const, cliente: { ...cliente, clienteId: cliente.id } }
      },
      'clientes:create',
    ),
    timeoutPromise,
  ])

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
    // Push notification for new cliente (replaces SSE for off-tab users).
    void broadcastPush({
      title: 'Nuevo cliente',
      body: `${result.cliente.nombre} fue agregado.`,
      url: `/clientes?openCliente=${result.cliente.id}`,
      tag: `cliente-${result.cliente.id}`,
    })

    return apiSuccess({ cliente: result.cliente }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'DB_TIMEOUT') {
      // La DB no respondió en 25s. Devolvemos 500 con mensaje claro para
      // que el cliente no se quede esperando indefinidamente. El usuario
      // puede reintentar cuando la DB vuelva a estar disponible.
      return apiError('La base de datos tardó demasiado en responder. Reintentá en unos minutos.', 500)
    }
    return apiError('Error creando cliente')
  }
}
