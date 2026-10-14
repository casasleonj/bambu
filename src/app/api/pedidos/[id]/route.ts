import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  actualizarPedidoUseCase,
  anularPedidoUseCase,
  cancelarPedidoUseCase,
} from '@/modules/pedidos'
import { PedidoId } from '@/modules/pedidos/domain/value-objects/PedidoId'
import { PedidoDTOMapper } from '@/modules/pedidos/application/dto/PedidoDTOMapper'
import { publishRealtimeEvent } from '@/lib/realtime'
import { pickDireccionTexto } from '@/lib/geo/pedido-direccion'
import { clasificarCamposPut } from '@/lib/pedido-put-contrato'
import {
  EdicionEconomicaN2Error,
  EdicionNoPersistidaError,
  LineasDuplicadasError,
  OperacionEspecializadaError,
  PedidoCerradoError,
  TotalMenorAPagadoError,
} from '@/modules/pedidos/domain/services/pedido-edicion.errors'

function getUserFromSession(authResult: unknown) {
  return { id: (authResult as { user?: { id?: string } })?.user?.id || '', role: (authResult as { user?: { role?: string } })?.user?.role }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    // Detail read includes factura lazily. This projection is specific to
    // Prisma and is therefore implemented in PrismaPedidoRepository.
    const { PrismaPedidoRepository } = await import('@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository')
    const repo = new PrismaPedidoRepository()
    const found = await repo.findByIdWithFactura(PedidoId.from(id))
    if (!found) return apiError('Not found', 404)

    // Enrich detail response with cliente/negocio legacy fields so the modal
    // shows the owner name consistently with the list endpoint.
    const { prisma } = await import('@/lib/prisma')
    const [cliente, negocio] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: found.pedido.clienteId },
        include: { ruta: { select: { nombre: true } } },
      }),
      found.pedido.negocioId
        ? prisma.negocio.findUnique({
            where: { id: found.pedido.negocioId },
            include: { ruta: { select: { nombre: true } } },
          })
        : Promise.resolve(null),
    ])

    const nombreNegocio = negocio?.nombre || null
    const horaApertura = negocio?.horaApertura || null
    const rutaNombre = negocio?.ruta?.nombre || cliente?.ruta?.nombre

    // Fase 4b — datos de la capa 2 del peek (blueprint §9.2). Solo lectura.
    const selfRow = await prisma.pedido.findUnique({
      where: { id },
      select: { pedidoOrigenId: true, estadoEntrega: true, fechaEntrega: true, fotoEntrega: true, gpsLat: true, gpsLng: true },
    })
    const pedidoOrigenId = selfRow?.pedidoOrigenId ?? null
    // Fase 8 F8-0 — "pedido habitual" del contexto (Q4: negocio si hay
    // negocioId, si no cliente). Solo lectura.
    const recurrenciaWhere = found.pedido.negocioId
      ? { negocioId: found.pedido.negocioId }
      : { clienteId: found.pedido.clienteId }
    const [obligacion, vinculados, casosAbiertos, plantilla] = await Promise.all([
      prisma.obligacionPendiente.findUnique({
        where: { pedidoId: id },
        include: {
          actividades: {
            select: { id: true, tipo: true, cantidad: true, cantidadCumplida: true, estado: true, modo: true, embarqueId: true },
          },
        },
      }),
      prisma.pedido.findMany({
        where: {
          OR: [{ pedidoOrigenId: id }, ...(pedidoOrigenId ? [{ id: pedidoOrigenId }] : [])],
        },
        select: { id: true, numero: true, pedidoOrigenId: true, total: true, estadoEntrega: true },
      }),
      prisma.caso.findMany({
        where: { pedidoId: id, status: { in: ['ABIERTO', 'EN_PROCESO'] } },
        select: { id: true, alertaTipo: true, severidad: true, status: true, createdAt: true },
      }),
      prisma.plantillaRecurrente.findFirst({
        where: recurrenciaWhere,
        select: {
          id: true, cadaNDias: true, canal: true, activo: true, proxGeneracion: true,
          productos: { select: { producto: true, cantidad: true } },
        },
      }),
    ])
    const recurrencia = plantilla
      ? {
          id: plantilla.id,
          cadaNDias: plantilla.cadaNDias,
          canal: plantilla.canal,
          activo: plantilla.activo,
          proximaFecha: plantilla.proxGeneracion ? plantilla.proxGeneracion.toISOString() : null,
          productos: plantilla.productos,
        }
      : null

    let embarqueResumen: { id: string; numeroDia: number; estado: string; repartidor: string | null } | null = null
    if (found.pedido.embarqueId) {
      const e = await prisma.embarque.findUnique({
        where: { id: found.pedido.embarqueId },
        select: { id: true, numeroDia: true, estado: true, trabajador: { select: { nombre: true } } },
      })
      if (e) embarqueResumen = { id: e.id, numeroDia: e.numeroDia, estado: e.estado, repartidor: e.trabajador?.nombre ?? null }
    }

    const pedidosVinculados = vinculados
      .filter((p) => p.id !== id)
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        rol: (p.pedidoOrigenId === id ? 'demanda' : 'origen') as 'demanda' | 'origen',
        total: Number(p.total),
        estadoEntrega: p.estadoEntrega,
      }))

    // Fase 7-ii — evidencia de entrega (dato propio del Pedido, §6.2). Solo
    // si ya se entregó; sin queries nuevas (los campos vienen en `selfRow`).
    const entregaResumen =
      selfRow?.estadoEntrega === 'ENTREGADO' &&
      (selfRow.fechaEntrega || selfRow.fotoEntrega || selfRow.gpsLat != null || selfRow.gpsLng != null)
        ? {
            fecha: selfRow.fechaEntrega ? selfRow.fechaEntrega.toISOString() : null,
            gpsLat: selfRow.gpsLat != null ? Number(selfRow.gpsLat) : null,
            gpsLng: selfRow.gpsLng != null ? Number(selfRow.gpsLng) : null,
            fotoUrl: selfRow.fotoEntrega ?? null,
          }
        : null

    const pendienteN2 = obligacion
      ? {
          id: obligacion.id,
          producto: obligacion.producto,
          remanente: obligacion.cantidadOriginal - obligacion.cantidadCumplida,
          estado: obligacion.estado,
          actividades: obligacion.actividades,
        }
      : null

    const dto = PedidoDTOMapper.toResumen(found.pedido, { factura: found.factura })
    // Dirección de texto efectiva (regla única pickDireccionTexto): el
    // snapshot propio del pedido gana sobre negocio, que gana sobre cliente.
    const direccionEfectiva = pickDireccionTexto({
      cliente,
      negocio,
      overrideDireccion: dto.direccionEntrega,
      overrideBarrio: dto.barrioEntrega,
    })
    return apiSuccess({
      pedido: {
        ...dto,
        nombreCli: dto.clienteId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (cliente?.nombre || 'Desconocido'),
        apellidoCli: cliente?.apellido || null,
        telefonoCli: cliente?.telefono || '',
        zonaCli: direccionEfectiva.direccion,
        barrioCli: direccionEfectiva.barrio,
        nombreNegocioCli: nombreNegocio,
        horaAperturaCli: horaApertura,
        rutaNombre,
        // Fase 4b — capa 2 del peek
        pendienteN2,
        embarqueResumen,
        pedidosVinculados,
        casosAbiertos: casosAbiertos.map((c) => ({
          id: c.id,
          alertaTipo: c.alertaTipo,
          severidad: c.severidad,
          status: c.status,
        })),
        entregaResumen,
        recurrencia,
      },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching pedido detail:')
    return apiError('Error', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  // FIX (hallazgo antifraude 2026-09-06, revisión ALS/Plan Técnico UX de
  // Pedidos): esta ruta editaba items/precio/estado sin `requireRole` — el
  // comentario de `requireOwnership` (auth-check.ts) documentaba desde
  // antes que "write operations are still blocked at the route handler
  // level via requireRole([ADMIN, ASISTENTE])", pero esa llamada nunca
  // existió acá. Sin este check, cualquier rol que superara
  // `requireOwnership` (p.ej. un REPARTIDOR dueño del embarque del
  // pedido) podía editar cantidades/precio vía este endpoint genérico —
  // el mismo vector ya corregido una vez para resolver-disputa (commit
  // 3.1 plan antifraude).
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const body = await request.json()
    // commit 0e: casoId opcional en el body para vincular este UPDATE
    // con un Caso (alerta antifraude). Se extrae ANTES de validar
    // con Zod porque el schema no incluye casoId (es metadata forense,
    // no dato de negocio).
    const casoId: string | null = typeof body?.casoId === 'string' ? body.casoId : null

    // Contrato de campos: ningún cambio pedido puede descartarse en silencio.
    const { solicitados, rechazados } = clasificarCamposPut(body)
    if (Object.keys(rechazados).length > 0) {
      return apiError(
        `Campos no soportados en la edición: ${Object.keys(rechazados).join(', ')}. No se aplicó ningún cambio.`,
        422,
        { code: 'CAMPO_NO_SOPORTADO', fieldErrors: rechazados },
      )
    }
    if (solicitados.length === 0) {
      return apiError('La petición no pide ningún cambio.', 422, { code: 'SIN_CAMBIOS_SOLICITADOS' })
    }

    const parsed = PedidoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    if (parsed.data.items !== undefined && parsed.data.items.length === 0) {
      return apiError('Un pedido necesita al menos un producto.', 422, { code: 'ITEMS_VACIOS' })
    }
    // `estado` (legacy) y `estadoEntrega` son el mismo cambio: si vienen ambos, deben coincidir.
    if (parsed.data.estado && parsed.data.estadoEntrega && parsed.data.estado !== parsed.data.estadoEntrega) {
      return apiError('`estado` y `estadoEntrega` no coinciden.', 422, { code: 'CONFLICTO_ESTADO' })
    }

    const result = await actualizarPedidoUseCase.execute({
      pedidoId: id,
      items: parsed.data.items?.map((i: { producto: string; cantidad: number; precioManual?: number }) => ({
        producto: i.producto as import('@/shared/domain').ProductCode,
        cantidad: i.cantidad,
        precioManual: i.precioManual,
      })),
      estadoEntrega: parsed.data.estadoEntrega ?? parsed.data.estado,
      // `null` y '' LIMPIAN la observación (antes `|| undefined` lo hacía imposible).
      obs: parsed.data.obs === null ? '' : parsed.data.obs,
      actualizarCliente: parsed.data.actualizarCliente ? {
        direccion: parsed.data.actualizarCliente.direccion || undefined,
        barrio: parsed.data.actualizarCliente.barrio || undefined,
      } : undefined,
      direccionEntrega: parsed.data.direccionEntrega,
      barrioEntrega: parsed.data.barrioEntrega,
      entregaLat: parsed.data.entregaLat,
      entregaLng: parsed.data.entregaLng,
      usuarioId: getUserFromSession(authResult).id,
      // La auditoría (incluido casoId) la hace el use case DENTRO de la
      // transacción del lock — una sola fila, todas las ramas, rollback
      // atómico. Ya no se audita post-commit acá (F3, review PR #147).
      casoId: casoId ?? undefined,
    })

    if (!result.aplicado.sinCambios) publishRealtimeEvent('pedido.updated', id).catch(() => {})

    return apiSuccess({ pedido: result.pedido, aplicado: result.aplicado })
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD') {
      return apiError('El pedido ya está cerrado (entregado/cancelado/anulado) — use el flujo de corrección de cantidad', 409, { code: 'PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD' })
    }
    if (error instanceof Error && error.message === 'CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD') {
      return apiError('Ya se entregó cantidad de este pedido — use el flujo de corrección de cantidad', 409, { code: 'CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD' })
    }
    if (error instanceof Error && error.name === 'UbicacionEntregaInvalidaError') {
      return apiError('La ubicación del domicilio debe traer latitud y longitud válidas.', 422, { code: 'UBICACION_ENTREGA_INVALIDA' })
    }
    if (error instanceof Error && error.name === 'UbicacionSoloDomicilioError') {
      return apiError('La ubicación de destino solo aplica a pedidos a domicilio.', 422, { code: 'UBICACION_SOLO_DOMICILIO' })
    }
    if (error instanceof Error && error.name === 'EntregaInsuficienteError') {
      return apiError('Necesitamos información para localizar el domicilio: una dirección escrita o una ubicación.', 422, { code: 'ENTREGA_INSUFICIENTE' })
    }
    if (error instanceof PedidoCerradoError) {
      return apiError(
        `El pedido ya está ${error.estado.toLowerCase()}: ${error.campos.join(', ')} es historia y no se edita.`,
        409,
        { code: 'PEDIDO_CERRADO' },
      )
    }
    if (error instanceof TotalMenorAPagadoError) {
      const { totalNuevo, totalPagado, diferencia, totalAnterior } = error.impacto
      return apiError(
        `El nuevo total ($${totalNuevo}) queda por debajo de lo ya cobrado ($${totalPagado}): la diferencia de $${diferencia} requiere una decisión (devolución, saldo a favor o ajuste) que esta edición no toma. No se guardó ningún cambio.`,
        409,
        { code: 'TOTAL_MENOR_A_PAGADO', impacto: { totalAnterior, totalNuevo, totalPagado, diferencia } },
      )
    }
    if (error instanceof OperacionEspecializadaError) {
      return apiError(
        `Este endpoint no ejecuta el cambio a ${error.destino}. ${error.via}`,
        409,
        { code: 'OPERACION_ESPECIALIZADA', fieldErrors: { estado: [error.via] } },
      )
    }
    if (error instanceof EdicionEconomicaN2Error) {
      return apiError(
        'Este pedido tiene gestión N2 o un diferencial ya aplicado: sus cantidades se corrigen con «Corregir cantidad» (ajustar-cantidad), no editando. No se guardó ningún cambio.',
        409,
        { code: 'PEDIDO_CON_N2_USE_AJUSTAR_CANTIDAD' },
      )
    }
    if (error instanceof LineasDuplicadasError) {
      return apiError(
        `El pedido tiene el mismo producto en más de una línea (${error.productos.join(', ')}). Una línea por producto: corrija los datos antes de editar. No se guardó ningún cambio.`,
        409,
        { code: 'LINEAS_DUPLICADAS' },
      )
    }
    if (error instanceof EdicionNoPersistidaError) {
      logger.error({ campos: error.campos, pedidoId: id }, 'Edición de pedido no persistida (revertida)')
      return apiError('La edición no se pudo guardar completa y se revirtió. Intente de nuevo.', 500, { code: 'EDICION_NO_PERSISTIDA' })
    }
    if (error instanceof Error && error.message.startsWith('Transición inválida')) {
      return apiError(error.message, 409, { code: 'TRANSICION_INVALIDA' })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating pedido:')
    return apiError('Error updating', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    // commit 0e: casoId opcional en el body
    let casoId: string | null = null
    try {
      const body = await request.json()
      casoId = typeof body?.casoId === 'string' ? body.casoId : null
    } catch {
      // body vacio o invalido: OK, casoId queda null
    }

    // Try anular (requires ENTREGADO), fallback to cancelar
    try {
      const result = await anularPedidoUseCase.execute({ pedidoId: id })
      logAudit({
        entidad: 'Pedido',
        registroId: id,
        accion: 'DELETE',
        datos: { estado: 'ANULADO' },
        usuarioId: getUserFromSession(authResult).id,
        casoId,
      })
      publishRealtimeEvent('pedido.updated', id).catch(() => {})
      return apiSuccess({ pedido: result.pedido })
    } catch (err) {
      // If anular fails because pedido is not ENTREGADO, try cancelar
      // But if it fails because pedido doesn't exist, return 404
      if (err instanceof Error && err.message === 'PEDIDO_NOT_FOUND') {
        return apiError('Pedido no encontrado', 404)
      }
      const result = await cancelarPedidoUseCase.execute({ pedidoId: id })
      logAudit({
        entidad: 'Pedido',
        registroId: id,
        accion: 'DELETE',
        datos: { estado: 'CANCELADO' },
        usuarioId: getUserFromSession(authResult).id,
        casoId,
      })
      publishRealtimeEvent('pedido.updated', id).catch(() => {})
      return apiSuccess({ pedido: result.pedido })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting pedido:')
    return apiError('Error deleting', 500)
  }
}
