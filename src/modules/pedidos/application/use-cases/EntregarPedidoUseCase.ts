/**
 * EntregarPedidoUseCase.
 */

import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { ITransactionManager, TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'
import { registrarReceivableEntry } from '@/lib/receivable-entry'
import { leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import { aplicarEntregaConObligacion } from '@/lib/obligacion-guard'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import {
  CAPTURA_ENTREGA_PEDIDO,
  claveEventoEntrega,
  embarqueUsaEntregaVivaPorFlag,
} from '@/lib/entrega-fisica-viva'
import type { EntregarPedidoInput, EntregarPedidoResult, EntregaOficinaInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'
import { Pedido } from '../../domain/entities/Pedido'
import { EntregaOficinaError, DIAS_MAX_ATRAS_ENTREGA_OFICINA } from '../../domain/services/entrega-oficina.errors'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { endOfDayBogota, startOfDayBogota, todayStringBogota } from '@/lib/dates'

const diaBogota = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

const tieneCobro = (input: EntregarPedidoInput): boolean => (input.pagos ?? []).some((p) => p.monto > 0)

export class EntregarPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private pagoRepo: IPagoRepository,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: EntregarPedidoInput): Promise<EntregarPedidoResult> {
    // FIX F2.4: usar executeWithLock('PEDIDO', ...) en vez de execute sin lock.
    //
    // FIX F-N7: el dedup check ahora está DENTRO del lock.
    // Antes el check estaba en la route (fuera del lock). Dos requests
    // simultáneos podían ambos pasar el check 'estado === ENTREGADO',
    // entrar al use case, y el segundo recibía 'TRANSICION_INVALIDA'
    // con un 400 confuso. El trabajo de upload de foto y validación
    // REQUIERE_FOTO se hacía 2 veces innecesariamente.
    //
    // Ahora: el check corre dentro del lock. Si el pedido ya está
    // ENTREGADO, devolvemos { deduped: true } con el pedido actual.
    // El segundo request no hace trabajo wasted.
    //
    // FASE 0 (ADR-CONCURRENCIA-001): lock `PEDIDO:{pedidoId}`. Tras PR-1 la
    // entrega ya NO crea un pedido hijo (getNextNumero), así que no necesita el
    // lock global de secuencia — solo serializar las transiciones de ESTE
    // pedido (§6 del contrato). El faltante de una entrega parcial vive en el
    // propio pedido.
    return this.txManager.executeWithLock('PEDIDO', input.pedidoId, async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FASE 1 (ADR-IDEMPOTENCIA-001): dedup por clave idempotente persistida.
      // Un replay con el mismo offlineId retorna deduped:true aunque el estado
      // ya no sea ENTREGADO (más robusto que el dedup por estado, que depende
      // de que el estado no se haya revertido por un camino intermedio).
      if (input.offlineId && pedido.entregaOfflineId === input.offlineId) {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

      // PR-1B (Adenda v1.2 §3.2 punto 4): contexto físico de la entrega. Se
      // resuelve y se deduplica ANTES de modificar Pedido/Pago. `entregaOfflineId`
      // guarda una sola clave reciente y no cubre el replay viejo tras varios
      // parciales; la clave por línea del evento (`entrega:<id>:<PRODUCTO>`, única
      // en `EmbarqueMovimiento.offlineId`) sí.
      const eventoFisico = await this.resolverEventoFisico(tx, input)
      if (eventoFisico) {
        const previo = await tx.embarqueMovimiento.findFirst({
          where: { offlineId: { startsWith: claveEventoEntrega(eventoFisico.eventoEntregaId, '') } },
          select: { id: true },
        })
        if (previo) {
          return {
            pedido: PedidoDTOMapper.toResumen(pedido),
            deduped: true,
          }
        }
      }

      // F-N7: dedup check DENTRO del lock. Si el pedido ya está
      // ENTREGADO, devolvemos el estado actual sin hacer trabajo.
      if (pedido.estadoEntrega.get() === 'ENTREGADO') {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
          // Otro envío ya entregó este pedido (el mismo offlineId se atendió arriba):
          // si este traía cobro, no se registra — se avisa en vez de perderlo.
          ...(tieneCobro(input) ? { pagosNoAplicados: true } : {}),
        }
      }

      // TEMPORAL-SIN-EMBARQUE(#472): la entrega de oficina es la única vía que
      // admite PENDIENTE|NO_ENTREGADO → ENTREGADO (la tabla global no cambia).
      const oficina = input.oficina
      if (!(oficina ? pedido.puedeEntregarOficina() : pedido.puedeEntregar())) {
        throw new Error('TRANSICION_INVALIDA')
      }
      const repartidorOficinaId = oficina
        ? await this.validarEntregaOficina(tx, pedido, oficina, tieneCobro(input))
        : undefined
      // Embarque del que sale el pedido al registrarlo desde la oficina (se lee
      // ANTES de entregar: una entrega parcial ya lo suelta sola).
      const embarqueAntesOficina = oficina ? pedido.embarqueId : undefined

      // Register delivery quantities + metadata (photo, GPS, visit code).
      // PR-1: `entregar()` acumula. La cantidad se CLAMPEA al resto pendiente de
      // la línea — así un replay offline con un delta calculado sobre un
      // `cantEntrega` viejo (p.ej. una entrega encolada antes de un cierre
      // parcial) nunca sobrepasa `cantPedido` ni queda atascado en la cola.
      const entregasClampeadas = input.itemsEntregados.map(ie => {
        const item = pedido.items.find(i => i.producto === ie.producto)
        const resto = item ? item.cantPedido - item.cantEntrega : ie.cantidad
        return {
          producto: ie.producto,
          cantPedido: item?.cantPedido ?? 0,
          cantEntregaActual: item?.cantEntrega ?? 0,
          cantidadAEntregar: Math.max(0, Math.min(ie.cantidad, resto)),
        }
      })

      // Reconexión N2 (I-11, AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis): la porción
      // de esta entrega que cae en zona reservada por una ObligacionPendiente
      // ABIERTA se aplica a su cumplimiento (acotada a su pendiente real) en
      // vez de rechazarse — el Pedido sigue siendo la única autoridad de
      // cuánto se entregó (sin cambios abajo); esto solo espeja la porción
      // correspondiente en la obligación gestionada.
      await aplicarEntregaConObligacion(tx, input.pedidoId, entregasClampeadas, input.actorId)

      pedido.entregar(
        entregasClampeadas.map(e => ({ producto: e.producto, cantidad: e.cantidadAEntregar })),
        {
          fotoEntrega: input.fotoEntrega,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
          gpsAccuracy: input.gpsAccuracy,
          gpsJustificacion: input.gpsJustificacion,
          entregadoConGps: oficina ? false : input.entregadoConGps,
          entregadoAt: oficina ? oficina.fechaEntrega : (input.entregadoAt ? new Date(input.entregadoAt) : undefined),
          codigoVisita: input.codigoVisita,
          entregaOfflineId: input.offlineId,
          desdeOficina: Boolean(oficina),
        },
      )
      if (oficina) {
        pedido.registrarEntregaOficina({
          repartidorId: repartidorOficinaId,
          nota: oficina.nota?.trim() || 'Entrega registrada por la oficina sin embarque',
          adminId: input.actorId ?? '',
        })
      }

      // Retiro del cliente: sale del embarque en la misma transacción (si fue una
      // entrega parcial, `entregar()` ya lo soltó). Sin evento físico del vehículo.
      const embarqueLiberadoId = input.clienteRetiro ? pedido.embarqueId : embarqueAntesOficina
      if (input.clienteRetiro || oficina) pedido.liberarEmbarque()

      // Register payments
      if (input.pagos && input.pagos.length > 0) {
        for (const p of input.pagos) {
          pedido.registrarPago(p)
        }
        // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: una lectura de Config por
        // entrega (helper vía tx — `getConfig`/`unstable_cache` no funciona
        // fuera de un request context, rompe los unit tests del use case).
        const metodosConfirmacion = await leerMetodosRequierenConfirmacion(
          tx as unknown as Parameters<typeof leerMetodosRequierenConfirmacion>[0],
        )
        // ADR-PAGO-EMBARQUE-CAPTURA-001: el cobro de la entrega se capturó en el
        // embarque que declara el payload (validado en el route). Nunca se
        // deriva de `pedido.embarqueId`.
        await this.pagoRepo.createMany(
          pedido.id.get(),
          input.pagos,
          tx,
          metodosConfirmacion,
          input.embarqueId ?? null,
          oficina
            ? {
                recibidoPorId: oficina.recibioDinero === 'REPARTIDOR' ? (repartidorOficinaId ?? null) : null,
                // La fecha del hecho solo se guarda si difiere del registro (#402).
                ocurridoAt: diaBogota(oficina.fechaEntrega) !== todayStringBogota() ? oficina.fechaEntrega : null,
              }
            : undefined,
        )
      }

      // TEMPORAL-SIN-EMBARQUE(#472): reglas de deuda de la oficina, con el saldo
      // ya resultante y ANTES de persistir (si falla, el rollback deja todo igual).
      if (oficina) this.validarDeudaOficina(pedido, oficina)

      // Antifraude (#318): quien reparte no crea crédito por su cuenta. Se evalúa con
      // el saldo ya resultante y ANTES de persistir: si falla, el rollback deja el
      // pedido sin entregar y sin cobro. Solo aplica a la entrega completa y a
      // deudores reales (la venta anónima no puede dejar saldo en absoluto).
      if (
        input.exigirDeudaAceptada &&
        !input.clienteRetiro &&
        pedido.estadoEntrega.get() === 'ENTREGADO' &&
        pedido.saldo.cents > 0
      ) {
        const fila = await tx.pedido.findUnique({
          where: { id: input.pedidoId },
          select: { promesaPagoFecha: true },
        })
        if (pedido.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID || !fila?.promesaPagoFecha) {
          throw new Error('FIADO_NO_AUTORIZADO')
        }
      }

      // Persist pedido
      const updated = await this.pedidoRepo.update(pedido, tx)

      // Fiado de la oficina: la promesa de pago queda en el pedido (misma
      // columna que usa el antifraude #318 y el cron de vencimientos).
      if (oficina?.promesaPagoFecha && updated.estadoEntrega.get() === 'ENTREGADO' && updated.saldo.cents > 0) {
        await tx.pedido.update({ where: { id: input.pedidoId }, data: { promesaPagoFecha: oficina.promesaPagoFecha } })
      }

      // PR-1B: evento físico en la MISMA transacción que `cantEntrega`, con la
      // cantidad realmente aplicada tras el clamp (nunca la pedida; nunca 0).
      if (eventoFisico) {
        await this.registrarEventoFisico(tx, eventoFisico, input.pedidoId, entregasClampeadas)
      }

      // FASE FINAL (ADR-MONETARIO-001, §12): proyección de auditoría de los pagos.
      if (input.pagos && input.pagos.length > 0) {
        const montoPagadoEnEntrega = input.pagos.reduce((sum, p) => sum + p.monto, 0)
        await registrarReceivableEntry(tx, {
          pedidoId: updated.id.get(),
          clienteId: updated.clienteId,
          tipo: 'PAGO',
          monto: montoPagadoEnEntrega,
          saldoResultante: updated.saldo.toDecimal(),
          totalPagadoResultante: updated.totalPagado.toDecimal(),
        })
      }

      // PR-1 (integridad de entrega parcial): la factura solo se sincroniza
      // cuando el cumplimiento es total. Una entrega parcial deja el pedido
      // PENDIENTE y no debe tocar la factura (montos/estado) ni fijar su fecha.
      const entregaCompleta = updated.estadoEntrega.get() === 'ENTREGADO'
      const factura = await this.facturaRepo.findByPedidoId(pedido.id.get(), tx)
      // Un cobro SIEMPRE mueve el saldo del pedido, así que la factura debe
      // seguirlo aunque la entrega sea parcial (V3: mismo saldo que el pedido).
      const cobroOficina = Boolean(oficina) && tieneCobro(input)
      if (factura && (entregaCompleta || cobroOficina)) {
        await this.facturaRepo.update({
          ...factura,
          total: updated.total.toDecimal(),
          saldo: updated.saldo.toDecimal(),
          estado: updated.saldo.toDecimal() <= 0
            ? 'PAGADA'
            : (updated.totalPagado.toDecimal() > 0 ? 'PARCIAL' : 'EMITIDA'),
          montoPagado: updated.totalPagado.toDecimal(),
        }, tx)
      }

      // PR-1: NO se crea pedido hijo para el faltante. La cantidad pendiente
      // vive en el propio pedido (`cantEntrega < cantPedido`, estado PENDIENTE)
      // y se cumple con una entrega posterior. `crearPedidoHijo()` queda como
      // legacy hasta la migración (ADR PR-1 §8).

      await logAudit({
        entidad: 'Pedido',
        registroId: updated.id.get(),
        accion: 'UPDATE',
        datos: {
          accion: oficina ? 'ENTREGA_OFICINA' : 'ENTREGA',
          estadoEntrega: updated.estadoEntrega.get(),
          estadoPago: updated.estadoPago.get(),
          parcial: !entregaCompleta,
          ...(oficina
            ? {
                repartidorId: repartidorOficinaId ?? null,
                recibioDinero: tieneCobro(input) ? oficina.recibioDinero : null,
                fechaEntrega: oficina.fechaEntrega.toISOString(),
                nota: oficina.nota ?? null,
                saleDeEmbarqueId: embarqueAntesOficina ?? null,
              }
            : {}),
        },
        usuarioId: input.actorId,
      }, tx)

      if (embarqueLiberadoId) {
        await logAudit({
          entidad: 'Embarque',
          registroId: embarqueLiberadoId,
          accion: 'UPDATE',
          datos: { accion: 'ENTREGA_RETIRO_CLIENTE', pedidoId: updated.id.get(), pedidoNumero: updated.numero },
          usuarioId: input.actorId,
        }, tx)
      }

      return {
        pedido: PedidoDTOMapper.toResumen(updated),
        hijo: undefined,
        ...(embarqueLiberadoId ? { embarqueLiberadoId } : {}),
      }
    })
  }

  /**
   * TEMPORAL-SIN-EMBARQUE(#472): reglas previas de la entrega de oficina. Todo se
   * decide dentro del lock del pedido, con datos frescos. Devuelve el repartidor
   * responsable (nuevo o el ya fijado en el pedido).
   */
  private async validarEntregaOficina(
    tx: TransactionClient,
    pedido: Pedido,
    oficina: EntregaOficinaInput,
    hayCobro: boolean,
  ): Promise<string | undefined> {
    const ahora = Date.now()
    const fecha = oficina.fechaEntrega.getTime()
    if (fecha > ahora + 5 * 60_000) {
      throw new EntregaOficinaError('FECHA_FUTURA', 'La fecha de entrega no puede ser futura.')
    }
    if (fecha < ahora - DIAS_MAX_ATRAS_ENTREGA_OFICINA * 24 * 3_600_000) {
      throw new EntregaOficinaError(
        'FECHA_MUY_ANTIGUA',
        `Solo se puede registrar una entrega de hasta ${DIAS_MAX_ATRAS_ENTREGA_OFICINA} días atrás.`,
      )
    }
    // Un día anterior ya cerrado no se reabre. El día de hoy sí se admite aunque
    // tenga cierre (mismo criterio que ENTREGA_POST_CIERRE de embarques: un
    // hecho real que llega tarde no se bloquea, queda auditado).
    const dia = diaBogota(oficina.fechaEntrega)
    if (dia < todayStringBogota()) {
      const cierre = await tx.cierreDia.findFirst({
        where: { fecha: { gte: startOfDayBogota(dia), lte: endOfDayBogota(dia) } },
        select: { id: true },
      })
      if (cierre) {
        throw new EntregaOficinaError('DIA_CERRADO', 'Ese día ya está cerrado. Elige un día que siga abierto.')
      }
    }

    const esDomicilio = pedido.canal.get() === 'DOMICILIO'
    const fijado = pedido.entregadoPorId
    let repartidorId = oficina.repartidorId
    if (fijado) {
      if (repartidorId && repartidorId !== fijado) {
        throw new EntregaOficinaError(
          'REPARTIDOR_DISTINTO',
          'Este pedido ya tiene un repartidor responsable. Un pedido tiene un solo repartidor.',
        )
      }
      repartidorId = fijado
    } else if (repartidorId) {
      const t = await tx.trabajador.findUnique({
        where: { id: repartidorId },
        select: { activo: true, usaMoto: true },
      })
      if (!t || !t.activo || !t.usaMoto) {
        throw new EntregaOficinaError(
          'REPARTIDOR_INVALIDO',
          'Ese trabajador no aparece en la lista: solo se pueden elegir trabajadores activos con moto.',
        )
      }
    } else if (esDomicilio) {
      throw new EntregaOficinaError('REPARTIDOR_REQUERIDO', 'Elige quién entregó el pedido.')
    }

    if (repartidorId && esDomicilio) {
      const nomina = await nominaQueCubre(tx, repartidorId, oficina.fechaEntrega)
      if (nomina) {
        throw new EntregaOficinaError(
          'NOMINA_EXISTENTE',
          'La nómina de ese repartidor para esa fecha ya está hecha y su comisión se perdería. Elige una fecha de un período abierto o habla con quien liquida la nómina.',
        )
      }
    }

    if (hayCobro) {
      if (!oficina.recibioDinero) {
        throw new EntregaOficinaError('QUIEN_RECIBIO_REQUERIDO', 'Indica quién recibió el dinero.')
      }
      if (oficina.recibioDinero === 'REPARTIDOR' && !repartidorId) {
        throw new EntregaOficinaError('QUIEN_RECIBIO_REQUERIDO', 'Para decir que lo recibió el repartidor, elige primero quién fue.')
      }
    }
    return repartidorId
  }

  /** Deuda de la oficina: nunca a un cliente anónimo; el fiado exige promesa de pago futura. */
  private validarDeudaOficina(pedido: Pedido, oficina: EntregaOficinaInput): void {
    const saldo = pedido.saldo.cents
    if (saldo <= 0) return
    if (pedido.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID) {
      throw new EntregaOficinaError(
        'DEUDOR_REQUERIDO',
        'No se puede dejar fiado a un cliente sin nombre. Registra el pago completo o elige un cliente real.',
      )
    }
    if (pedido.estadoEntrega.get() !== 'ENTREGADO') return
    if (!oficina.promesaPagoFecha) {
      throw new EntregaOficinaError('PROMESA_REQUERIDA', 'Si queda debiendo, necesitamos hasta cuándo promete pagar.')
    }
    if (diaBogota(oficina.promesaPagoFecha) < todayStringBogota()) {
      throw new EntregaOficinaError('PROMESA_PASADA', 'La fecha de promesa de pago no puede estar en el pasado.')
    }
  }

  /**
   * PR-1B: ¿esta entrega genera evento físico? Solo si el payload declara el
   * contexto físico (`embarqueEntregaId`) Y ese embarque usa el modo de entrega
   * viva (flag por fecha de creación, o ya tiene eventos atribuidos). Sin
   * contexto físico = punto/oficina sin custodia de vehículo → sin evento.
   */
  private async resolverEventoFisico(
    tx: TransactionClient,
    input: EntregarPedidoInput,
  ): Promise<{ embarqueId: string; eventoEntregaId: string; posCierre: boolean } | null> {
    if (!input.embarqueEntregaId || !input.offlineId) return null
    const embarque = await tx.embarque.findUnique({
      where: { id: input.embarqueEntregaId },
      select: { id: true, estado: true, createdAt: true },
    })
    if (!embarque || embarque.estado === 'CANCELADO') return null
    const activo =
      embarqueUsaEntregaVivaPorFlag(embarque.createdAt) ||
      (await tx.embarqueMovimiento.count({
        where: { embarqueId: embarque.id, tipo: 'ENTREGA', metadata: { path: ['captura'], equals: CAPTURA_ENTREGA_PEDIDO } },
      })) > 0
    if (!activo) return null
    return { embarqueId: embarque.id, eventoEntregaId: input.offlineId, posCierre: embarque.estado === 'CERRADO' }
  }

  private async registrarEventoFisico(
    tx: TransactionClient,
    evento: { embarqueId: string; eventoEntregaId: string; posCierre: boolean },
    pedidoId: string,
    lineas: Array<{ producto: string; cantidadAEntregar: number }>,
  ): Promise<void> {
    for (const l of lineas) {
      if (l.cantidadAEntregar <= 0) continue
      await tx.embarqueMovimiento.create({
        data: {
          embarqueId: evento.embarqueId,
          tipo: 'ENTREGA',
          producto: l.producto,
          cantidad: l.cantidadAEntregar,
          origen: 'VEHICULO',
          destino: 'CLIENTE',
          offlineId: claveEventoEntrega(evento.eventoEntregaId, l.producto),
          metadata: {
            captura: CAPTURA_ENTREGA_PEDIDO,
            pedidoId,
            eventoEntregaId: evento.eventoEntregaId,
            ...(evento.posCierre ? { posCierre: true } : {}),
          },
        },
      })
    }
    if (evento.posCierre) {
      // Adenda §3.2 punto 5: un evento genuino que llega con el embarque ya
      // cerrado no se reatribuye ni se bloquea; queda auditado para revisión.
      await logAudit({
        entidad: 'Embarque',
        registroId: evento.embarqueId,
        accion: 'UPDATE',
        datos: { accion: 'ENTREGA_POST_CIERRE', pedidoId, eventoEntregaId: evento.eventoEntregaId },
      }, tx)
    }
  }
}
