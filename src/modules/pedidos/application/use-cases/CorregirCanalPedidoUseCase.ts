/**
 * CorregirCanalPedidoUseCase — TEMPORAL-SIN-EMBARQUE (#472).
 *
 * El canal comercial de un pedido (PUNTO / DOMICILIO) es inmutable por
 * `ADR-PEDIDO-ORIGEN-CANAL-001`: el PUT lo rechaza y manda a "pedir la corrección
 * formal a un administrador". Mientras Embarques no funciona, esta es esa
 * corrección, y solo existe con el interruptor `GESTION_ADMIN_SIN_EMBARQUE`
 * encendido. Se retira junto con la función.
 *
 * Solo corrige un pedido ABIERTO que todavía no tiene nada físico encima:
 * sin unidades entregadas, sin repartidor responsable, fuera de un embarque.
 *
 * Precios (decisión del PO):
 *  - CONSERVAR (por defecto): solo cambia el canal; precios y total intactos.
 *  - RECALCULAR: se vuelve a resolver el precio de cada línea con la regla de
 *    la creación y el canal nuevo. El recargo de domicilio solo afecta al precio
 *    base (#493); las líneas con precio manual, especial o por volumen conservan su
 *    precio. Nunca deja `total < totalPagado`
 *    (devolver o absorber dinero cobrado es una decisión comercial, no de aquí).
 *
 * Con `soloVistaPrevia` calcula el impacto sin escribir nada. Toda mutación va
 * bajo el lock `PEDIDO:{id}`, con una auditoría con antes/después y el motivo.
 */

import { Money } from '@/shared/domain'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { CanalVO } from '../../domain/value-objects/Canal'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import { Pedido } from '../../domain/entities/Pedido'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { ResolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'
import { resolverEntrega } from '../../domain/services/entrega-suficiencia.service'
import { requiereEntregaSuficiente } from '../../domain/services/entrega-politica.service'
import { CorreccionCanalError } from '../../domain/services/correccion-canal.errors'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'
import type { Canal } from '../../domain/types'

export type ModoPrecios = 'CONSERVAR' | 'RECALCULAR'

export interface CorregirCanalInput {
  pedidoId: string
  canalNuevo: Canal
  precios: ModoPrecios
  motivo: string
  /** Clave de idempotencia: un reintento con la misma clave no vuelve a aplicar. */
  offlineId: string
  actorId: string
  /** Calcula y devuelve el impacto sin escribir ni auditar. */
  soloVistaPrevia?: boolean
}

export interface LineaCorreccion {
  producto: string
  cantidad: number
  precioAntes: number
  precioDespues: number
  origenDespues: string
}

export interface CorregirCanalResult {
  /** `false` = solo vista previa: no se escribió nada. */
  aplicado: boolean
  /** `true` = esta corrección ya estaba aplicada (reintento). */
  deduped: boolean
  pedido: ReturnType<typeof PedidoDTOMapper.toResumen>
  cambio: {
    canalAntes: Canal
    canalDespues: Canal
    precios: ModoPrecios
    totalAntes: number
    totalDespues: number
    totalPagado: number
    saldoDespues: number
    estadoPagoDespues: string
    lineas: LineaCorreccion[]
  }
}

/** Estados de entrega en los que un pedido todavía se puede corregir. */
const ESTADOS_CORREGIBLES = new Set(['PENDIENTE', 'NO_ENTREGADO'])
const ESTADOS_CERRADOS = new Set(['ENTREGADO', 'CANCELADO', 'ANULADO'])

/** Marca en el historial que identifica una corrección ya aplicada (idempotencia). */
const marcaOffline = (offlineId: string): string => `"offlineIdCorreccionCanal":${JSON.stringify(offlineId)}`

export class CorregirCanalPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private clienteRepo: IClienteRepository,
    private pricingPort: IPricingPort,
    private txManager: ITransactionManager,
    /** `linkUbicacion → coords` server-only. Se llama FUERA del lock/tx. */
    private resolverCoordsDeLink: ResolverCoordsDeLink,
  ) {}

  async execute(input: CorregirCanalInput): Promise<CorregirCanalResult> {
    const motivo = input.motivo.trim()
    if (motivo.length < 3) {
      throw new CorreccionCanalError('MOTIVO_REQUERIDO', 'Escribe el motivo de la corrección (por ejemplo: «se registró como domicilio por error»).')
    }

    // I/O fuera del lock: coords del link del cliente/negocio, solo si el destino será DOMICILIO.
    const coordsDeLink = input.canalNuevo === 'DOMICILIO' ? await this.resolverCoordsDeLinkParaEntrega(input.pedidoId) : null

    return this.txManager.executeWithLock('PEDIDO', input.pedidoId, async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // Reintento de una corrección ya aplicada: se devuelve el estado actual.
      if (!input.soloVistaPrevia) {
        const previa = await tx.historial.findFirst({
          where: { entidad: 'Pedido', registroId: input.pedidoId, accion: 'UPDATE', datos: { contains: marcaOffline(input.offlineId) } },
          select: { id: true },
        })
        if (previa) return this.resultadoSinCambio(pedido, input, true)
      }

      const canalAntes = pedido.canal.get()
      if (canalAntes === input.canalNuevo) {
        throw new CorreccionCanalError('CANAL_SIN_CAMBIO', `El pedido ya es de ${nombreCanal(canalAntes)}.`)
      }

      const estado = pedido.estadoEntrega.get()
      if (ESTADOS_CERRADOS.has(estado)) {
        throw new CorreccionCanalError('PEDIDO_CERRADO', 'Solo se puede corregir el canal de un pedido que sigue abierto. Este ya está cerrado.')
      }
      if (pedido.embarqueId || !ESTADOS_CORREGIBLES.has(estado)) {
        throw new CorreccionCanalError('PEDIDO_EN_EMBARQUE', 'Este pedido está en un embarque. Sácalo del embarque primero y luego corrige el canal.')
      }
      if (pedido.items.some((i) => i.cantEntrega > 0) || pedido.entregadoPorId) {
        throw new CorreccionCanalError('YA_HAY_ENTREGA', 'Este pedido ya tiene entregas registradas o un repartidor responsable. No se puede cambiar su canal.')
      }

      const [obligaciones, ajustesConDiferencial] = await Promise.all([
        tx.obligacionPendiente.count({ where: { pedidoId: input.pedidoId } }),
        tx.pedidoCantidadAjuste.count({ where: { pedidoId: input.pedidoId, montoDiferencial: { not: 0 } } }),
      ])
      if (obligaciones > 0 || ajustesConDiferencial > 0) {
        throw new CorreccionCanalError('N2_ACTIVO', 'Este pedido tiene pendientes o ajustes de cantidad con diferencial. No se puede cambiar su canal.')
      }

      // Destino suficiente: misma autoridad que la creación y la edición.
      if (input.canalNuevo === 'DOMICILIO' && requiereEntregaSuficiente({ canal: 'DOMICILIO', estadoEntrega: estado, origen: pedido.origen.get() })) {
        const [cliente, negocio] = await Promise.all([
          this.clienteRepo.findById(pedido.clienteId, tx),
          pedido.negocioId ? this.clienteRepo.findNegocioById(pedido.negocioId, tx) : Promise.resolve(null),
        ])
        const entrega = resolverEntrega({
          canal: 'DOMICILIO',
          pedidoCoords: pedido.entregaLat != null && pedido.entregaLng != null ? { lat: pedido.entregaLat, lng: pedido.entregaLng } : null,
          overrideDireccion: pedido.direccionEntrega,
          overrideBarrio: pedido.barrioEntrega,
          cliente: cliente
            ? { direccion: cliente.direccion, barrio: cliente.barrio, referencia: cliente.referencia, linkUbicacion: cliente.linkUbicacion, lat: cliente.lat, lng: cliente.lng, geocodeOrigen: cliente.geocodeOrigen }
            : null,
          negocio: negocio
            ? { direccion: negocio.direccion, barrio: negocio.barrio, referencia: negocio.referencia, linkUbicacion: negocio.linkUbicacion, lat: negocio.lat, lng: negocio.lng }
            : null,
          coordsDeLink,
        })
        if (entrega.estado === 'INSUFICIENTE') {
          throw new CorreccionCanalError('DESTINO_INSUFICIENTE', 'Para pasarlo a domicilio faltan la dirección o la ubicación del cliente. Complétalas primero.')
        }
      }

      // ── Precios ──────────────────────────────────────────────────────────
      const totalAntes = pedido.total.toDecimal()
      const totalPagado = pedido.totalPagado.toDecimal()
      let nuevosItems: PedidoItem[] = [...pedido.items]
      if (input.precios === 'RECALCULAR') {
        const contexto = await this.pricingPort.loadPricingContext(pedido.clienteId, pedido.negocioId, pedido.items.map((i) => i.producto), tx)
        const resueltos = await this.pricingPort.resolverPrecios(
          pedido.items.map((i) => {
            if (i.precioOrigen !== 'manual') return { codigo: i.producto, cantidad: i.cantPedido }
            // #493: el precio escrito a mano es final (ya incluye el domicilio); el resolvedor no le suma recargo.
            return { codigo: i.producto, cantidad: i.cantPedido, precioManual: i.precio.toDecimal() }
          }),
          input.canalNuevo,
          contexto,
        )
        const porProducto = new Map(resueltos.map((r) => [r.producto as string, r]))
        nuevosItems = pedido.items.map((i) => {
          const r = porProducto.get(i.producto as string)
          return r ? new PedidoItem(r.producto, r.cantidad, Money.fromDecimal(r.precio), r.origen, 0) : i
        })
      }
      const totalDespues = nuevosItems.reduce((s, i) => s + i.subtotalPedido.toDecimal(), 0)
      if (totalDespues < totalPagado) {
        throw new CorreccionCanalError(
          'TOTAL_MENOR_A_PAGADO',
          'Con los precios recalculados el pedido valdría menos de lo que ya se pagó. Elige «Conservar precios» o resuelve primero el dinero cobrado.',
          { totalNuevo: totalDespues, totalPagado, diferencia: totalPagado - totalDespues },
        )
      }
      const estadoPagoDespues = EstadoPagoVO.proyectar(totalDespues, totalPagado, estado).get()
      const previoPorProducto = new Map(pedido.items.map((i) => [i.producto as string, i]))
      const cambio: CorregirCanalResult['cambio'] = {
        canalAntes,
        canalDespues: input.canalNuevo,
        precios: input.precios,
        totalAntes,
        totalDespues,
        totalPagado,
        saldoDespues: Math.max(0, totalDespues - totalPagado),
        estadoPagoDespues,
        lineas: nuevosItems.map((i) => ({
          producto: i.producto as string,
          cantidad: i.cantPedido,
          precioAntes: previoPorProducto.get(i.producto as string)?.precio.toDecimal() ?? i.precio.toDecimal(),
          precioDespues: i.precio.toDecimal(),
          origenDespues: i.precioOrigen,
        })),
      }

      if (input.soloVistaPrevia) {
        return { aplicado: false, deduped: false, pedido: PedidoDTOMapper.toResumen(pedido), cambio }
      }

      // ── Persistir UNA vez ────────────────────────────────────────────────
      const props = pedido.toProps()
      props.canal = CanalVO.create(input.canalNuevo)
      props.items = nuevosItems
      props.total = Money.fromDecimal(totalDespues)
      if (totalDespues !== totalAntes) {
        props.estadoPago = EstadoPagoVO.proyectar(totalDespues, totalPagado, estado)
      }
      // `PedidoMapper.toPrismaUpdate` NO escribe el canal a propósito (inmutable para
      // cualquier otro camino de edición). Esta corrección formal es la única que lo
      // cambia, y lo hace aquí, explícito, antes de guardar el resto con el mismo mapper.
      await tx.pedido.update({ where: { id: input.pedidoId }, data: { canal: input.canalNuevo } })
      const saved = await this.pedidoRepo.update(Pedido.create(props), tx)
      if (saved.canal.get() !== input.canalNuevo) throw new Error('CANAL_NO_PERSISTIDO')

      // Factura alineada con el pedido si el total cambió (misma regla que la edición).
      if (totalDespues !== totalAntes) {
        const factura = await this.facturaRepo.findByPedidoId(saved.id.get(), tx)
        if (factura) {
          await this.facturaRepo.update({
            ...factura,
            total: totalDespues,
            saldo: Math.max(0, totalDespues - totalPagado),
            estado: totalDespues <= totalPagado ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
          }, tx)
        }
      }

      await logAudit({
        entidad: 'Pedido',
        registroId: saved.id.get(),
        accion: 'UPDATE',
        datos: {
          numero: saved.numero,
          estado,
          campos: ['canal', ...(totalDespues !== totalAntes ? ['items', 'total'] : [])],
          correccionCanal: true,
          offlineIdCorreccionCanal: input.offlineId,
          motivo,
          precios: input.precios,
          antes: { canal: canalAntes, total: totalAntes, lineas: cambio.lineas.map((l) => ({ producto: l.producto, precio: l.precioAntes })) },
          despues: { canal: input.canalNuevo, total: totalDespues, lineas: cambio.lineas.map((l) => ({ producto: l.producto, precio: l.precioDespues, origen: l.origenDespues })) },
        },
        usuarioId: input.actorId,
      }, tx)

      return { aplicado: true, deduped: false, pedido: PedidoDTOMapper.toResumen(saved), cambio }
    })
  }

  /** Respuesta de un reintento ya aplicado: el estado actual, sin recalcular. */
  private resultadoSinCambio(pedido: Pedido, input: CorregirCanalInput, deduped: boolean): CorregirCanalResult {
    const total = pedido.total.toDecimal()
    const pagado = pedido.totalPagado.toDecimal()
    return {
      aplicado: true,
      deduped,
      pedido: PedidoDTOMapper.toResumen(pedido),
      cambio: {
        canalAntes: input.canalNuevo === 'DOMICILIO' ? 'PUNTO' : 'DOMICILIO',
        canalDespues: pedido.canal.get(),
        precios: input.precios,
        totalAntes: total,
        totalDespues: total,
        totalPagado: pagado,
        saldoDespues: Math.max(0, total - pagado),
        estadoPagoDespues: pedido.estadoPago.get(),
        lineas: pedido.items.map((i) => ({
          producto: i.producto as string,
          cantidad: i.cantPedido,
          precioAntes: i.precio.toDecimal(),
          precioDespues: i.precio.toDecimal(),
          origenDespues: i.precioOrigen,
        })),
      },
    }
  }

  /**
   * Resuelve `linkUbicacion → coords` ANTES del lock (I/O, nunca dentro de la
   * tx), solo si no hay coords almacenadas y existe un link. Best-effort.
   */
  private async resolverCoordsDeLinkParaEntrega(pedidoId: string): Promise<{ lat: number; lng: number } | null> {
    const pedido = await this.pedidoRepo.findById(PedidoId.from(pedidoId))
    if (!pedido || pedido.clienteId === 'CONSUMIDOR_FINAL') return null
    const [cliente, negocio] = await Promise.all([
      this.clienteRepo.findById(pedido.clienteId),
      pedido.negocioId ? this.clienteRepo.findNegocioById(pedido.negocioId) : Promise.resolve(null),
    ])
    const hayCoords = (negocio?.lat != null && negocio?.lng != null) || (cliente?.lat != null && cliente?.lng != null)
    if (hayCoords) return null
    const link = (negocio?.linkUbicacion ?? cliente?.linkUbicacion) || null
    return link ? this.resolverCoordsDeLink(link) : null
  }
}

const nombreCanal = (c: Canal): string => (c === 'DOMICILIO' ? 'domicilio' : 'punto de venta')
