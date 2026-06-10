import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { ClienteQuickCreateSchema } from '@/lib/validators'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { executeSerializableWithRetry } from '@/lib/serializable'

/**
 * POST /api/clientes/quick
 *
 * FIX F-N5/F-N6: creación rápida de cliente con dedup offline-first
 * y protección contra race conditions.
 *
 * Antes: el endpoint hacía findFirst por teléfono + create en operaciones
 * separadas (auto-commit). Dos requests simultáneos con el mismo teléfono
 * podían pasar el check de duplicado y ambos intentar crear → el segundo
 * fallaba con error no manejado (500).
 *
 * Ahora: toda la lógica corre dentro de una transacción Serializable
 * con retry en P2034. Esto:
 * 1. Serializa operaciones que tocan la misma fila (Cliente.telefono)
 * 2. Detecta race en el create (unique constraints + SSI)
 * 3. Permite dedup por offlineId para offline-first (replay safety)
 *
 * El helper `executeSerializableWithRetry` está en `src/lib/serializable.ts`,
 * extraído de `src/lib/recurrentes.ts` (commit H-12) para evitar
 * duplicación.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(
    [ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR, ROLES.REPARTIDOR],
    authResult,
  )
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = ClienteQuickCreateSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { nombre, apellido, telefono, direccion, barrio, offlineId } = parsed.data

    const result = await executeSerializableWithRetry<
      | { kind: 'existing'; cliente: { id: string; nombre: string; telefono: string; deduped: boolean } }
      | { kind: 'created'; cliente: { id: string; nombre: string; telefono: string } }
      | { kind: 'duplicate_phone'; existing: { id: string; nombre: string } }
    >(
      async (tx) => {
        // 1. Dedup por offlineId (F-N5: offline-first replay safety)
        if (offlineId) {
          const existente = await tx.cliente.findUnique({
            where: { offlineId },
            select: { id: true, nombre: true, telefono: true },
          })
          if (existente) {
            return { kind: 'existing', cliente: { ...existente, deduped: true } }
          }
        }

        // 2. Dedup por teléfono (F-N6: race condition fix)
        // Antes: el findFirst estaba FUERA de la tx. Ahora corre dentro
        // de Serializable, lo que evita que dos requests simultáneos con el
        // mismo teléfono pasen el check y ambos intenten crear.
        const duplicadoTelefono = await tx.cliente.findFirst({
          where: {
            activo: true,
            OR: [
              { telefono },
              { contactos: { some: { telefono } } },
            ],
          },
          select: { id: true, nombre: true, telefono: true },
        })

        if (duplicadoTelefono) {
          return {
            kind: 'duplicate_phone',
            existing: { id: duplicadoTelefono.id, nombre: duplicadoTelefono.nombre },
          }
        }

        // 3. Crear cliente
        const cliente = await tx.cliente.create({
          data: {
            nombre,
            apellido,
            telefono,
            direccion,
            barrio: barrio || '',
            offlineId: offlineId ?? null,
          },
          select: { id: true, nombre: true, telefono: true },
        })

        return { kind: 'created', cliente }
      },
      'clientes/quick:create',
    )

    if (result.kind === 'duplicate_phone') {
      return apiError(
        `Ya existe un cliente con ese teléfono (${result.existing.nombre})`,
        409,
      )
    }

    if (result.kind === 'existing') {
      return apiSuccess({ cliente: result.cliente, deduped: true }, 200)
    }

    // result.kind === 'created'
    logAudit({
      entidad: 'Cliente',
      registroId: result.cliente.id,
      accion: 'CREATE',
      datos: { nombre: result.cliente.nombre, telefono: result.cliente.telefono, via: 'quick' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ cliente: result.cliente }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error creating quick client:')
    return apiError('Error creating client', 500)
  }
}
