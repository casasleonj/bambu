import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { CorreccionAbonoSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { withAdvisoryLock, acquireAdvisoryLockTx } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { aplicarReversionMonetaria } from '@/lib/correccion-monetaria'
import { correccionPagoActiva } from '@/lib/correccion-pago-flag'
import { prisma } from '@/lib/prisma'
import { verificarConsumoBonoPago } from '@/lib/bono-saldo-favor'

/**
 * POST /api/pagos/[id]/corregir — ADR-CORRECCION-MONETARIA-002.
 *
 * Revierte (append-only) un `Pago` que NO tiene `Abono`: crea una `CorreccionAbono` anclada al pago, una `ReceivableEntry
 * REVERSION` y recalcula `Factura` + `Pedido`. NUNCA edita ni borra el `Pago`. Es el MISMO mecanismo que corregir un abono.
 * Un pago que sí tiene abono se corrige por su abono (nunca por las dos vías sobre el mismo dinero).
 *
 * Roles: ADMIN + CONTADOR (igual que corregir un abono; cobrar sigue siendo ADMIN + ASISTENTE, #309). Idempotente por
 * `correccionOfflineId`. Detrás de la bandera CORRECCION_PAGO_SIN_ABONO (apagada por defecto).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('Sesión inválida', 401)
  if (!correccionPagoActiva()) {
    return apiError('Esta función está desactivada por ahora. Consulta con el administrador del sistema.', 403, { code: 'FUNCION_DESACTIVADA' })
  }

  const { id: pagoId } = await params

  try {
    const body = await request.json()
    const parsed = CorreccionAbonoSchema.safeParse(body)
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
    const { tipo, montoRevertido, motivo, correccionOfflineId } = parsed.data

    // Lectura fuera del lock solo para conocer las claves de los locks (cliente y pedido).
    const pagoPre = await prisma.pago.findUnique({
      where: { id: pagoId },
      select: { pedidoId: true, pedido: { select: { clienteId: true } } },
    })
    if (!pagoPre) return apiError('Pago no encontrado', 404)

    const result = await withAdvisoryLock('CARTERA', pagoPre.pedido.clienteId, async (tx) => {
      // Dedup real por DB: el id es único por comando; si ya existe pero para OTRO pago, el cliente lo reusó (409).
      if (correccionOfflineId) {
        const previa = await tx.correccionAbono.findUnique({ where: { correccionOfflineId } })
        if (previa) {
          if (previa.pagoId !== pagoId) throw new Error('OFFLINE_ID_REUSADO')
          return { correccion: previa, deduped: true as const }
        }
      }

      // Mismo orden de locks que `pagar-fiado` y `corregir` por abono: CARTERA y luego PEDIDO (sin interbloqueos).
      await acquireAdvisoryLockTx(tx, 'PEDIDO', pagoPre.pedidoId)

      const pago = await tx.pago.findUnique({
        where: { id: pagoId },
        include: {
          pedido: { select: { id: true, numero: true, clienteId: true, total: true, totalPagado: true, saldo: true, estadoEntrega: true, estado: true, estadoPago: true } },
          abonoEspejo: { select: { id: true } },
          correcciones: { select: { montoRevertido: true } },
        },
      })
      if (!pago) throw new Error('PAGO_NOT_FOUND')

      // D2.2: un pago con abono se corrige por su abono; así nunca hay dos caminos sobre el mismo dinero.
      if (pago.abonoEspejo) throw new Error('PAGO_CON_ABONO')
      // Si el pedido está anulado o cancelado, la reversión ya la emitió ese flujo (ADR-001 D.4): corregir aquí la duplicaría.
      if (['ANULADO', 'CANCELADO'].includes(pago.pedido.estadoEntrega) || pago.pedido.estado === 'ANULADO') {
        throw new Error('PEDIDO_CERRADO')
      }

      const montoPago = Number(pago.monto)
      const yaRevertido = pago.correcciones.reduce((s, c) => s + Number(c.montoRevertido), 0)
      // MONTO admite reversión parcial; el resto revierte lo que no se ha revertido.
      const revertir =
        tipo === 'MONTO' && montoRevertido != null
          ? Math.round(montoRevertido * 100) / 100
          : Math.round((montoPago - yaRevertido) * 100) / 100
      if (revertir <= 0) throw new Error('MONTO_INVALIDO')
      if (yaRevertido + revertir > montoPago + 1e-6) throw new Error('EXCEDE_PAGO')

      // Una corrección de BONO sin Abono debe devolver únicamente el crédito
      // efectivamente consumido, nunca crédito de pagos históricos sin marcador.
      const creditoBonoRestituible = await verificarConsumoBonoPago(tx, {
        id: pago.id, clienteId: pago.pedido.clienteId, metodo: pago.metodo, monto: pago.monto,
      }) ? revertir : 0

      // La factura del pedido puede no existir (decisión #840: crear pedido no implica facturar).
      const factura = await tx.factura.findFirst({
        where: { pedidoId: pago.pedido.id },
        select: { id: true, total: true, montoPagado: true, saldo: true, estado: true },
      })
      if (factura && ['ANULADA'].includes(factura.estado)) throw new Error('PEDIDO_CERRADO')

      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'correccionAbono')
      const num = await getNextNumero(tx, { model: 'correccionAbono', field: 'numero' })

      // D.7: pago no recibido → investigación vía ResponsibilityCase (el dominio de pagos produce el hecho; el caso lo investiga).
      let responsibilityCaseId: string | null = null
      if (tipo === 'NO_RECIBIDO') {
        const caso = await tx.responsibilityCase.create({
          data: {
            tipo: 'PAGO_NO_CONFIRMADO',
            descripcion: `Pago ${pago.metodo} de ${montoPago} (pedido #${pago.pedido.numero}) reportado como NO recibido. ${motivo}`,
            montoEstimado: revertir,
            clienteId: pago.pedido.clienteId,
          },
        })
        responsibilityCaseId = caso.id
      }

      const correccion = await tx.correccionAbono.create({
        data: {
          numero: `COR-${num.toString().padStart(5, '0')}`,
          pagoId: pago.id, // ancla: el pago (abonoId queda nulo; el CHECK exige exactamente una)
          tipo,
          montoRevertido: revertir,
          motivo,
          autorizadoPorId: userId,
          responsibilityCaseId,
          correccionOfflineId: correccionOfflineId || null,
        },
      })

      const { efecto, pedidoActualizado, facturaActualizada } = await aplicarReversionMonetaria(tx, {
        pedido: { id: pago.pedido.id, total: pago.pedido.total, totalPagado: pago.pedido.totalPagado, saldo: pago.pedido.saldo, estadoEntrega: pago.pedido.estadoEntrega, estadoPago: pago.pedido.estadoPago },
        factura,
        clienteId: pago.pedido.clienteId,
        revertir,
        correccionOfflineId: correccionOfflineId || null,
      })

      if (creditoBonoRestituible > 0) {
        await tx.cliente.update({
          where: { id: pago.pedido.clienteId },
          data: { saldoFavor: { increment: creditoBonoRestituible } },
        })
      }

      await logAudit(
        {
          entidad: 'Pago',
          registroId: pago.id,
          accion: 'UPDATE',
          datos: {
            accion: 'CORRECCION',
            correccionNumero: correccion.numero,
            tipo,
            montoRevertido: revertir,
            creditoBonoRestituido: creditoBonoRestituible,
            motivo,
            responsibilityCaseId,
            antes: { pedido: efecto.pedido?.antes ?? null, factura: efecto.factura?.antes ?? null },
            despues: { pedido: efecto.pedido?.despues ?? null, factura: efecto.factura?.despues ?? null },
          },
          usuarioId: userId,
        },
        tx,
      )

      return { correccion, factura: facturaActualizada, pedido: pedidoActualizado, clienteId: pago.pedido.clienteId, pedidoId: pago.pedido.id, deduped: false as const }
    })

    if (!result.deduped) {
      publishRealtimeEvent('pago.created', result.clienteId).catch(() => {})
      if (result.pedidoId) publishRealtimeEvent('pedido.updated', result.pedidoId).catch(() => {})
    }
    return apiSuccess(
      result.deduped ? { correccion: result.correccion, deduped: true } : { correccion: result.correccion, factura: result.factura, pedido: result.pedido },
      result.deduped ? 200 : 201,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'BONO_AUDITORIA_INVALIDA') return apiError('La procedencia del BONO requiere conciliación; no se modificó el pago.', 409, { code: msg })
    if (msg === 'PAGO_NOT_FOUND') return apiError('Pago no encontrado', 404)
    if (msg === 'PAGO_CON_ABONO') return apiError('Este pago tiene un abono: corrígelo desde su abono para no revertir el mismo dinero dos veces', 409, { code: 'PAGO_CON_ABONO' })
    if (msg === 'PEDIDO_CERRADO') return apiError('El pedido o la factura está anulado o cancelado: la reversión va por ese flujo', 409, { code: 'PEDIDO_CERRADO' })
    if (msg === 'MONTO_INVALIDO') return apiError('El monto a revertir debe ser mayor a 0', 400)
    if (msg === 'EXCEDE_PAGO') return apiError('El monto a revertir excede lo que queda por revertir del pago', 400)
    if (msg === 'OFFLINE_ID_REUSADO') return apiError('El correccionOfflineId ya se usó para corregir otro pago', 409)
    logger.error({ err: msg, pagoId }, 'Error corrigiendo pago')
    return apiError('Error procesando la corrección', 500)
  }
}
