import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth-check'
import { PagarFiadoSchema } from '@/lib/validators'
import { calcularEstadoPago, shouldFireCulminado } from '@/lib/pedido-utils'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { prisma } from '@/lib/prisma'
import { registrarReceivableEntry } from '@/lib/receivable-entry'
import { datosConfirmacionInicial } from '@/lib/pago-confirmacion'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { gestionAdminSinEmbarqueActiva } from '@/lib/gestion-admin'
import { diaBogota, validarFechaHechoOficina } from '@/lib/gestion-admin-fecha'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { todayStringBogota } from '@/lib/dates'
import { EntregaOficinaError, ESTADO_HTTP_OFICINA } from '@/modules/pedidos/domain/services/entrega-oficina.errors'
import { idResultadoFiado, huellaCobroFiado, prepararCobroFiado, leerResultadoFiado } from '@/lib/fiados-cobro-server'
import type { AplicacionFiado, ResultadoCobroFiado } from '@/lib/fiados-cobro'

/** #515: revisión y resultados originales, independientes de la fecha de Pedidos. */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['ADMIN', 'ASISTENTE', 'CONTADOR'])
  if (auth instanceof Response) return auth
  const q = request.nextUrl.searchParams
  try {
    if (q.get('recientes') === 'true') {
      const rows = await prisma.historial.findMany({ where: { entidad: 'Pedido', id: { startsWith: 'cobro-fiado:' } },
        orderBy: { fecha: 'desc' }, take: 10, select: { datos: true } })
      return apiSuccess({ resultados: rows.flatMap(row => {
        const registro = leerResultadoFiado(row.datos)
        return registro ? [registro.resultado] : []
      }) })
    }
    const clienteId = q.get('clienteId')
    if (!clienteId) return apiError('Indica el cliente', 400)
    const offlineId = q.get('offlineId')
    if (offlineId) {
      const row = await prisma.historial.findUnique({ where: { id: idResultadoFiado(offlineId) } })
      if (row?.registroId === clienteId) {
        const registro = leerResultadoFiado(row.datos)
        if (registro) return apiSuccess({ estado: 'REGISTRADO', ...registro.resultado, deduped: true })
      }
      const previos = await prisma.pago.findMany({ where: { offlineId, pedido: { clienteId } },
        select: { pedidoId: true, pedido: { select: { numero: true } } } })
      return apiSuccess({ estado: previos.length ? 'REGISTRADO_LEGACY' : 'NO_ENCONTRADO',
        pedidos: previos.map(p => ({ id: p.pedidoId, numero: p.pedido.numero })) })
    }
    const preparacion = await prepararCobroFiado(clienteId)
    return preparacion ? apiSuccess({ preparacion }) : apiError('Cliente no encontrado', 404)
  } catch (error) {
    logger.error({ err: error }, 'Error consultando cobro de fiado')
    return apiError('No se pudo consultar el cobro. Conserva su referencia y reintenta.', 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ADMIN', 'ASISTENTE'])
  if (auth instanceof Response) return auth
  try {
    const parsed = PagarFiadoSchema.safeParse(await request.json())
    if (!parsed.success) return apiError('Revisa los medios y montos del cobro', 400)
    const { clienteId, monto, pagos, offlineId, versionDeuda, recibioDinero, repartidorId, fechaRecepcion } = parsed.data
    const oficina = recibioDinero !== undefined || repartidorId !== undefined || fechaRecepcion !== undefined
    const huella = huellaCobroFiado({ clienteId, pagos, recibioDinero: recibioDinero ?? null,
      repartidorId: repartidorId ?? null, fechaRecepcion: fechaRecepcion ?? null })
    const outcome = await withAdvisoryLock('CARTERA', clienteId, async tx => {
      // Dedup antes de la versión: el pago registrado ya cambió la deuda.
      if (offlineId) {
        const row = await tx.historial.findUnique({ where: { id: idResultadoFiado(offlineId) } })
        if (row) {
          const registro = leerResultadoFiado(row.datos)
          if (!registro || row.registroId !== clienteId || registro.huella !== huella) return apiError(
            'Esta referencia corresponde a otro cobro. Consulta su resultado.', 409, { code: 'REFERENCIA_COBRO_DISTINTA' })
          return { resultado: { ...registro.resultado, deduped: true }, culminados: [] }
        }
        // No reconstruir un resumen histórico original ausente desde saldos actuales.
        const previos = await tx.pago.findMany({ where: { offlineId },
          select: { pedidoId: true, pedido: { select: { clienteId: true, numero: true } } } })
        if (previos.length) {
          if (previos.some(p => p.pedido.clienteId !== clienteId)) return apiError(
            'Esta referencia corresponde a otro cobro.', 409, { code: 'REFERENCIA_COBRO_DISTINTA' })
          return apiSuccess({ deduped: true, estado: 'REGISTRADO_LEGACY',
            mensaje: 'El cobro ya existe. Consulta sus pedidos; no vuelvas a registrarlo.',
            pedidos: previos.map(p => ({ id: p.pedidoId, numero: p.pedido.numero })) })
        }
      }
      // TEMPORAL-SIN-EMBARQUE(#472): mismos permisos, responsabilidad y fechas.
      let recibidoPorId: string | null = null
      let ocurridoAt: Date | null = null
      let recepcion: ResultadoCobroFiado['recepcion']
      if (oficina) {
        if (auth.user?.role !== 'ADMIN') return apiError('Solo el administrador puede registrar quién recibió el dinero y cuándo.', 403, { code: 'SOLO_ADMIN' })
        if (!(await gestionAdminSinEmbarqueActiva())) return apiError('Esta función está desactivada por ahora. Consulta con el administrador del sistema.', 403, { code: 'FUNCION_DESACTIVADA' })
        if (!recibioDinero) throw new EntregaOficinaError('QUIEN_RECIBIO_REQUERIDO', 'Indica quién recibió el dinero.')
        const fecha = fechaRecepcion ? new Date(fechaRecepcion) : new Date()
        await validarFechaHechoOficina(tx, fecha, 'cobro')
        let nombreReceptor = 'Oficina'
        if (recibioDinero === 'REPARTIDOR') {
          if (!repartidorId) throw new EntregaOficinaError('QUIEN_RECIBIO_REQUERIDO', 'Para decir que lo recibió el repartidor, elige primero quién fue.')
          const trabajador = await tx.trabajador.findUnique({ where: { id: repartidorId }, select: { activo: true, usaMoto: true, nombre: true } })
          if (!trabajador?.activo || !trabajador.usaMoto) throw new EntregaOficinaError('REPARTIDOR_INVALIDO', 'Ese trabajador no aparece en la lista: solo se pueden elegir trabajadores activos con moto.')
          if (await nominaQueCubre(tx, repartidorId, fecha)) throw new EntregaOficinaError('NOMINA_EXISTENTE', 'La nómina de ese repartidor para esa fecha ya está hecha. Elige una fecha de un período abierto o habla con quien liquida la nómina.')
          recibidoPorId = repartidorId
          nombreReceptor = trabajador.nombre
        }
        ocurridoAt = diaBogota(fecha) !== todayStringBogota() ? fecha : null
        recepcion = { quien: recibioDinero, nombre: nombreReceptor, fecha: fecha.toISOString() }
      }
      const preparacion = await prepararCobroFiado(clienteId, tx)
      if (!preparacion) return apiError('Cliente no encontrado', 404)
      if (versionDeuda && versionDeuda !== preparacion.version) return apiError(
        'La deuda cambió desde que la revisaste. Actualiza el reparto antes de registrar el pago.', 409, { code: 'DEUDA_CAMBIO' })
      if (!preparacion.pedidos.length) return apiError('El cliente no tiene deudas pendientes de pedidos entregados', 400, { code: 'SIN_DEUDA' })

      const fondos = pagos.map(p => ({ ...p, restante: Math.round(p.monto * 100), aplicado: 0 }))
      const pagosAplicados: AplicacionFiado[] = []
      const culminados: Array<{ pedidoId: string; numero: number }> = []
      for (const pedido of preparacion.pedidos) {
        let saldo = Math.round(pedido.saldo * 100)
        let pagado = Math.round(pedido.totalPagado * 100)
        let aplicado = 0
        for (const fondo of fondos) {
          const centavos = Math.min(saldo, fondo.restante)
          if (centavos <= 0) continue
          const montoAplicar = centavos / 100
          const pago = await tx.pago.create({ data: { pedidoId: pedido.id, metodo: fondo.metodo,
            monto: montoAplicar, offlineId: offlineId ?? null, ...(oficina ? { recibidoPorId, ocurridoAt } : {}),
            ...datosConfirmacionInicial(fondo.metodo, preparacion.metodosPorConfirmar) } })
          saldo -= centavos; pagado += centavos; aplicado += centavos
          fondo.restante -= centavos; fondo.aplicado += centavos
          await tx.pedido.update({ where: { id: pedido.id }, data: { totalPagado: pagado / 100,
            saldo: saldo / 100, estadoPago: calcularEstadoPago(pedido.total, pagado / 100, 'ENTREGADO') } })
          await registrarReceivableEntry(tx, { pedidoId: pedido.id, facturaId: pedido.factura?.id,
            clienteId, tipo: 'PAGO', monto: montoAplicar, saldoResultante: saldo / 100,
            totalPagadoResultante: pagado / 100, offlineId })
          if (pedido.factura) {
            const factura = await tx.factura.update({ where: { id: pedido.factura.id },
              data: { saldo: { decrement: montoAplicar }, montoPagado: { increment: montoAplicar } } })
            await tx.factura.update({ where: { id: factura.id }, data: {
              estado: Number(factura.saldo) <= 0 ? 'PAGADA' : Number(factura.montoPagado) > 0 ? 'PARCIAL' : 'EMITIDA' } })
            const numero = await getNextNumero(tx, { model: 'abono', field: 'numero' })
            await tx.abono.create({ data: { numero: `ABO-${numero.toString().padStart(5, '0')}`,
              facturaId: factura.id, clienteId, pedidoId: pedido.id, monto: montoAplicar,
              metodoPago: fondo.metodo, origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id } })
          }
        }
        if (aplicado > 0) {
          pagosAplicados.push({ pedidoId: pedido.id, numero: pedido.numero, montoAplicado: aplicado / 100,
            saldoRestante: saldo / 100, facturaId: pedido.factura?.id, facturaNumero: pedido.factura?.numero })
          if (shouldFireCulminado('ENTREGADO', calcularEstadoPago(pedido.total, pagado / 100, 'ENTREGADO'))) culminados.push({ pedidoId: pedido.id, numero: pedido.numero })
        }
        if (fondos.every(f => f.restante <= 0)) break
      }
      // D.6 se conserva. #524 sigue abierto: el crédito no crea un ingreso en cierre.
      const sobrante = fondos.reduce((sum, f) => sum + f.restante, 0) / 100
      let saldoFavorAcreditado = 0
      if (sobrante > 0 && !isConsumidorFinalCanonical(clienteId)) {
        await tx.cliente.update({ where: { id: clienteId }, data: { saldoFavor: { increment: sobrante } } })
        saldoFavorAcreditado = sobrante
      }
      const resultado: ResultadoCobroFiado = { referencia: offlineId ?? null, clienteId,
        clienteNombre: preparacion.clienteNombre, registradoAt: new Date().toISOString(), pagosAplicados, ...(recepcion ? { recepcion } : {}),
        montoRecibido: monto, montoAplicado: monto - sobrante, montoSobrante: sobrante, saldoFavorAcreditado,
        medios: fondos.map(f => ({ metodo: f.metodo, monto: f.monto, montoAplicado: f.aplicado / 100,
          saldoFavor: f.restante / 100, confirmacion: f.aplicado > 0 ? datosConfirmacionInicial(f.metodo, preparacion.metodosPorConfirmar).confirmacion : null })) }
      await logAudit({ ...(offlineId ? { id: idResultadoFiado(offlineId) } : {}), entidad: 'Pedido', registroId: clienteId,
        accion: 'UPDATE', usuarioId: auth.user?.id, datos: { operacion: 'COBRO_FIADO_V2', huella, resultado,
          monto, pagos, pagosAplicados, saldoFavorAcreditado,
          ...(oficina ? { recibioDinero, repartidorId: recibidoPorId, fechaRecepcion: ocurridoAt?.toISOString() ?? null } : {}) } }, tx)
      return { resultado, culminados }
    })
    if (outcome instanceof Response) return outcome
    const { resultado, culminados } = outcome
    if (!resultado.deduped) {
      void publishRealtimeEvent('pago.created', clienteId).catch(() => {})
      for (const pedido of resultado.pagosAplicados) void publishRealtimeEvent('pedido.updated', pedido.pedidoId).catch(() => {})
      void notifyEvent(NotificationEventType.ABONO_APLICADO, { title: 'Abono aplicado',
        body: `Se aplicó un abono de $${resultado.montoAplicado.toLocaleString()} a ${resultado.clienteNombre}.`,
        url: `/clientes?openCliente=${clienteId}`, tag: offlineId ?? `abono-${clienteId}-${Date.now()}` }).catch(() => {})
      for (const pedido of culminados) void notifyEvent(NotificationEventType.PEDIDO_CULMINADO, {
        title: 'Pedido culminado', body: `Pedido #${pedido.numero} fue entregado y pagado en su totalidad.`,
        url: `/pedidos?openPedido=${pedido.pedidoId}`, tag: `pedido-culminado-${pedido.pedidoId}` }).catch(() => {})
    }
    return apiSuccess({ ...resultado, mensaje: resultado.deduped ? 'Pago ya registrado; se conserva el resultado original.' : 'Pago registrado.' })
  } catch (error) {
    if (error instanceof EntregaOficinaError) return apiError(error.message, ESTADO_HTTP_OFICINA[error.codigo], { code: error.codigo })
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return apiError(
      'La referencia de cobro ya existe. Consulta su estado antes de continuar.', 409, { code: 'REFERENCIA_COBRO_DISTINTA' })
    logger.error({ err: error }, 'Error pagando fiado')
    return apiError('No se pudo confirmar el resultado del registro. Conserva la referencia y consulta su estado antes de repetirlo.', 500)
  }
}
