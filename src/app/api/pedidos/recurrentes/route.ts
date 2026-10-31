import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requirePermission } from '@/lib/auth-check'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes, type DecisionGeneracion } from '@/lib/recurrentes'
import { ConfirmarHabitualesSchema } from '@/lib/habituales-contrato'
import { ROLES, LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { resolverLimiteFiados } from '@/lib/pedido-utils'
import { leerIntentoRecurrentes, estadoIntentoRecurrentes, ConflictoIntentoRecurrentes } from '@/lib/recurrentes-intento'


export async function GET(request?: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const permission = await requirePermission('view:recurrentes', authResult)
  if (permission instanceof Response) return permission

  try {
    const batch = request ? new URL(request.url).searchParams.get('offlineId') : null
    if (batch) {
      const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], authResult)
      if (role instanceof Response) return role
      const actor = authResult.user?.id
      if (!actor) return apiError('Sesión sin usuario', 401)
      const estado = await estadoIntentoRecurrentes(batch, actor)
      const response = estado ? apiSuccess(estado) : apiError('El intento aún no figura registrado. Conserva la misma referencia al reintentar.', 404)
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    const preview = await previewGeneracionRecurrentes()
    const response = apiSuccess({ preview, hoy: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ConflictoIntentoRecurrentes) return apiError(error.message, error.status)
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error preview recurrentes:')
    return apiError('Error al generar preview', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = ConfirmarHabitualesSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const decisiones: DecisionGeneracion[] = parsed.data.decisiones
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date()
    const { offlineId } = parsed.data
    const usuarioId = authResult.user?.id
    if (!usuarioId) return apiError('Sesión sin usuario', 401)
    const intentoAnterior = offlineId ? await leerIntentoRecurrentes(offlineId, usuarioId, decisiones) : null
    const estadoAnterior = offlineId ? await estadoIntentoRecurrentes(offlineId, usuarioId) : null
    const idsPorProcesar = estadoAnterior
      ? estadoAnterior.items.filter(i => i.estado === 'PENDIENTE').map(i => i.recurrenteId)
      : decisiones.map(d => d.recurrenteId)

    if (decisiones.length === 0) {
      return apiError('No se proporcionaron decisiones', 400)
    }

    // #515: la ruta valida la revisión; el motor conserva el manifiesto
    // original y comprueba cada recibo dentro de su transacción. Que exista
    // un pedido con esta referencia no demuestra que terminó todo el lote.

    // Race-guard: validate proxGeneracion hasn't shifted since preview.
    // limiteConfig (paso A8) no depende de plantillasActuales — se carga
    // en paralelo en vez de esperar a que termine la query anterior.
    const [plantillasLeidas, limiteConfig] = await Promise.all([
      prisma.plantillaRecurrente.findMany({
        where: { id: { in: idsPorProcesar } },
        include: {
          cliente: { select: { id: true, nombre: true, activo: true, bloqueado: true, limitePedidosFiados: true } },
          negocio: { include: { cliente: { select: { id: true, nombre: true, activo: true, bloqueado: true, limitePedidosFiados: true } } } },
          productos: true,
        },
      }),
      // A8: Check fiado limit for all clients.
      // FIX C-FIADOS-1: solo pedidos ENTREGADOS con saldo > 0 cuentan.
      prisma.config.findUnique({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } }),
    ])
    // Las recurrencias que cambiaron desde un intento parcial se resuelven
    // sin generar ni mover su calendario en el guard transaccional del motor.
    const plantillasActuales = plantillasLeidas.filter(pt => {
      if (!intentoAnterior) return true
      const objetivo = intentoAnterior.objetivos[pt.id]
      return objetivo?.prox === pt.proxGeneracion?.toISOString() && objetivo.version === pt.updatedAt.toISOString()
    })
    const cambiadas = plantillasActuales.filter(pt => !pt.proxGeneracion || pt.proxGeneracion > fecha)
    if (cambiadas.length > 0) {
      return apiError('Algunos habituales ya se generaron o cambiaron. Actualiza la revisión.', 409)
    }

    // A7: Check for inactive/blocked clients
    const inactivas = plantillasActuales.filter(pt => { const c = pt.cliente ?? pt.negocio?.cliente; return !c?.activo || c.bloqueado })
    if (inactivas.length > 0) {
      const nombres = inactivas.map(pt => pt.clienteId || pt.negocioId || 'unknown').join(', ')
      return apiError(`Clientes inactivos o bloqueados: ${nombres}`, 400)
    }

    const limitesPorCliente = new Map<string, number>()
    for (const pt of plantillasActuales) {
      const clienteId = pt.clienteId ?? pt.negocio?.clienteId
      if (!clienteId) continue
      const limite = resolverLimiteFiados(
        { limitePedidosFiados: (pt.cliente ?? pt.negocio?.cliente)?.limitePedidosFiados ?? null },
        limiteConfig?.valor ?? null,
      )
      limitesPorCliente.set(clienteId, limite)
    }

    const pedidosPendientesTodos = await prisma.pedido.findMany({
      where: {
        clienteId: { in: Array.from(limitesPorCliente.keys()) },
        estadoEntrega: 'ENTREGADO',
        saldo: { gt: 0 },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
      },
      select: { clienteId: true, id: true, numero: true, saldo: true },
    })

    const pendientesPorCliente = new Map<string, number>()
    for (const p of pedidosPendientesTodos) {
      pendientesPorCliente.set(p.clienteId, (pendientesPorCliente.get(p.clienteId) || 0) + 1)
    }

    const clientesEnLimite: string[] = []
    for (const pt of plantillasActuales) {
      const clienteId = pt.clienteId ?? pt.negocio?.clienteId
      if (!clienteId) continue
      const limite = limitesPorCliente.get(clienteId) ?? LIMITE_FIADOS_DEFAULT
      const count = pendientesPorCliente.get(clienteId) || 0
      if (count >= limite) {
        clientesEnLimite.push(`${(pt.cliente ?? pt.negocio?.cliente)?.nombre || 'unknown'} (${count}/${limite})`)
      }
    }
    if (clientesEnLimite.length > 0) {
      return apiError(`Clientes con límite de fiados alcanzado: ${clientesEnLimite.join(', ')}`, 400)
    }

    // A6: Pre-check CON_PENDIENTES/SOLO_PENDIENTES for debt
    const withPendingDecisions = decisiones.filter(d => d.decision === 'CON_PENDIENTES' || d.decision === 'SOLO_PENDIENTES')
    if (withPendingDecisions.length > 0) {
      const clienteIds = withPendingDecisions.map(d => {
        const pt = plantillasActuales.find(p => p.id === d.recurrenteId)
        return pt?.clienteId ?? pt?.negocio?.clienteId
      }).filter(Boolean) as string[]

      if (clienteIds.length > 0) {
        const pedidosConDeuda = await prisma.pedido.findMany({
          where: {
            clienteId: { in: clienteIds },
            estadoEntrega: 'PENDIENTE',
            origen: { not: 'RECURRENTE' },
            saldo: { gt: 0 },
          },
          select: { clienteId: true, numero: true },
        })
        if (pedidosConDeuda.length > 0) {
          return apiError('Hay pedidos pendientes con deuda. No se puede usar CON_PENDIENTES o SOLO_PENDIENTES.', 400)
        }
      }
    }

    // Pre-check APLICAR_CREDITO: no debe haber deuda y debe haber pedidos pagados
    const withCreditDecisions = decisiones.filter(d => d.decision === 'APLICAR_CREDITO')
    if (withCreditDecisions.length > 0) {
      const clienteIds = withCreditDecisions.map(d => {
        const pt = plantillasActuales.find(p => p.id === d.recurrenteId)
        return pt?.clienteId ?? pt?.negocio?.clienteId
      }).filter(Boolean) as string[]

      if (clienteIds.length > 0) {
        // Verificar que no haya deuda
        const pedidosConDeuda = await prisma.pedido.findMany({
          where: {
            clienteId: { in: clienteIds },
            estadoEntrega: 'PENDIENTE',
            origen: { not: 'RECURRENTE' },
            saldo: { gt: 0 },
          },
          select: { clienteId: true, numero: true },
        })
        if (pedidosConDeuda.length > 0) {
          return apiError('Hay pedidos pendientes con deuda. Pague primero para usar Aplicar crédito.', 400)
        }

        // Verificar que haya pedidos pagados
        const pedidosPagados = await prisma.pedido.findMany({
          where: {
            clienteId: { in: clienteIds },
            estadoEntrega: 'PENDIENTE',
            origen: { not: 'RECURRENTE' },
            saldo: 0,
            totalPagado: { gt: 0 },
          },
          select: { clienteId: true, numero: true },
        })
        if (pedidosPagados.length === 0) {
          return apiError('No hay pedidos pagados para aplicar crédito.', 400)
        }
      }
    }

    // H-12 RESUELTO: Serializable evita LOST UPDATE; se conservan además
    // los objetivos originales de cada recurrencia entre reintentos.
    // El motor ordena por recurrenteId para
    // evitar ciclos y comprueba los recibos antes de ejecutar efectos.
    const resultado = await generarPedidosRecurrentes(decisiones, fecha, {
      recurrenteBatchId: offlineId,
      actor: { usuarioId, proceso: 'hub' },
      onCreado: async g => { await publishRealtimeEvent('pedido.created', g.id) },
    })

    // #407: el batch está también en pedidos nuevos. La autoridad es el
    // recibo recuperado por el generador, nunca contar pedidos con esa clave.
    const deduped = resultado.deduped === true
    // La auditoría (GENERACION + CREATE del pedido) se escribe dentro de la
    // transacción de cada plantilla en `generarPedidosRecurrentes` (§5.E).
    // El callback post-commit del motor notifica también lotes parciales.

    return apiSuccess({
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      pedidos: resultado.generados,
      saltadosIds: resultado.saltados,
      // Plantillas no generadas por destino no localizable, con motivo.
      omitidos: resultado.omitidos,
      ...(deduped && { deduped: true }),
    }, deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof ConflictoIntentoRecurrentes) return apiError(error.message, error.status)
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error generando recurrentes:')
    return apiError('Error generando pedidos recurrentes', 500)
  }
}
