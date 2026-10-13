/**
 * ActualizarPedidoUseCase.
 *
 * Edición de un Pedido. Tres clases de modificación, con reglas distintas:
 *
 *  - INFORMACIÓN (obs, dirección/barrio de entrega, dirección del cliente):
 *    no toca dinero. La dirección no se reescribe en pedidos cerrados.
 *  - ECONÓMICA (items): recalcula total/factura. Solo líneas NUEVAS o con
 *    cantidad/precio manual cambiados se (re)precifican; una línea idéntica
 *    conserva precio y origen históricos. Nunca deja `total < totalPagado`
 *    (eso sería devolver/absorber dinero cobrado: decisión comercial, no de
 *    este endpoint).
 *  - ESTADO (transición de entrega).
 *
 * Ajustar cantidades de un pedido con entrega o cerrado NO es una edición:
 * pasa por `AjustarPedidoCantidadUseCase`.
 *
 * Contrato: devuelve `aplicado.campos` (lo que realmente cambió) y
 * `aplicado.sinCambios`. Una auditoría por llamada, con antes/después,
 * dentro de la transacción del lock `PEDIDO:{id}`.
 */

import { Money } from '@/shared/domain'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { EstadoEntregaVO } from '../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import type { ProductCode } from '@/shared/domain'
import { Pedido } from '../../domain/entities/Pedido'
import type { ActualizarPedidoInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'
import { pickDireccionTexto } from '@/lib/geo/pedido-direccion'
import { lineaSinCambio as lineaSinCambioPlana } from '@/lib/pedido-edicion-items'
import type { ResolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'
import { resolverEntrega } from '../../domain/services/entrega-suficiencia.service'
import { EntregaInsuficienteError } from '../../domain/services/entrega-suficiencia.errors'
import {
  EdicionEconomicaN2Error,
  EdicionNoPersistidaError,
  LineasDuplicadasError,
  OperacionEspecializadaError,
  PedidoCerradoError,
  TotalMenorAPagadoError,
  VIA_OPERACION_ESPECIALIZADA,
} from '../../domain/services/pedido-edicion.errors'

const ESTADOS_CERRADOS = ['ENTREGADO', 'CANCELADO', 'ANULADO']

export interface ActualizarPedidoResult {
  pedido: ReturnType<typeof PedidoDTOMapper.toResumen>
  aplicado: { campos: string[]; sinCambios: boolean }
}

interface LineaSnapshot { producto: string; cantidad: number; precio: number; precioOrigen: string }

const snapshotLineas = (items: readonly PedidoItem[]): LineaSnapshot[] =>
  items
    .map((i) => ({ producto: i.producto as string, cantidad: i.cantPedido, precio: i.precio.toDecimal(), precioOrigen: i.precioOrigen }))
    .sort((a, b) => a.producto.localeCompare(b.producto))

type LineaSolicitada = { producto: ProductCode; cantidad: number; precioManual?: number }

/** Adaptador al dominio de la regla compartida (`lib/pedido-edicion-items`, misma que usa el formulario). */
function lineaSinCambio(previo: PedidoItem | undefined, i: LineaSolicitada): boolean {
  return lineaSinCambioPlana(
    previo ? { cantidad: previo.cantPedido, precio: previo.precio.toDecimal(), precioOrigen: previo.precioOrigen } : undefined,
    i,
  )
}

export class ActualizarPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private clienteRepo: IClienteRepository,
    private pricingPort: IPricingPort,
    private txManager: ITransactionManager,
    /** `linkUbicacion → coords` server-only. Se llama FUERA del lock/tx; el
     *  resultado alimenta `resolverEntrega` adentro (misma autoridad que
     *  Crear/Preview). */
    private resolverCoordsDeLink: ResolverCoordsDeLink,
  ) {}

  async execute(input: ActualizarPedidoInput): Promise<ActualizarPedidoResult> {
    const tocaDireccion = input.direccionEntrega !== undefined || input.barrioEntrega !== undefined
    // F-ENTREGA: resolver el link a coords ANTES del lock (I/O), igual que
    // CrearPedidoUseCase / PreviewPedidoUseCase.
    const coordsDeLink = tocaDireccion ? await this.resolverCoordsDeLinkParaEntrega(input.pedidoId) : null

    // F3 (INVENTARIO §F3): toda mutación bajo `PEDIDO:{id}` (ADR-CONCURRENCIA-001 §6).
    return this.txManager.executeWithLock('PEDIDO', input.pedidoId, async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      const estadoActual = pedido.estadoEntrega.get()
      const cerrado = ESTADOS_CERRADOS.includes(estadoActual)
      const tocaClienteDir = Boolean(input.actualizarCliente)

      // ── ESTADO: este caso de uso NO cambia el estado de entrega ────────────
      // Entregar, cancelar, anular, enviar, no-entregar y volver a pendiente
      // (quitar del embarque) tienen su operación especializada: factura/nota
      // de crédito, pagos, trazabilidad física del embarque, notificación al
      // repartidor y reconexión N2. Aquí solo se edita información y líneas.
      if (input.estadoEntrega && input.estadoEntrega !== estadoActual) {
        const destino = EstadoEntregaVO.from(input.estadoEntrega).get()
        throw new OperacionEspecializadaError(
          destino,
          VIA_OPERACION_ESPECIALIZADA[destino] ?? 'Use la operación especializada.',
        )
      }

      // Pedido cerrado: la información de entrega es historia. (obs sí: se
      // audita con antes/después.)
      if (cerrado && (tocaDireccion || tocaClienteDir)) {
        throw new PedidoCerradoError(estadoActual, [
          ...(input.direccionEntrega !== undefined ? ['direccionEntrega'] : []),
          ...(input.barrioEntrega !== undefined ? ['barrioEntrega'] : []),
          ...(tocaClienteDir ? ['actualizarCliente'] : []),
        ])
      }

      const props = pedido.toProps()
      const antes: Record<string, unknown> = {}
      const despues: Record<string, unknown> = {}
      const campos: string[] = []
      const registrar = (campo: string, a: unknown, d: unknown) => {
        campos.push(campo)
        antes[campo] = a
        despues[campo] = d
      }
      const totalAnterior = pedido.total.toDecimal()
      const totalPagado = pedido.totalPagado.toDecimal()
      let totalCambio = false

      // ── ECONÓMICA: items ───────────────────────────────────────────────────
      if (input.items && input.items.length > 0) {
        const solicitados = input.items.filter((i) => i.cantidad > 0)
        const productos = solicitados.map((i) => i.producto as string)
        const repetidos = productos.filter((p, idx) => productos.indexOf(p) !== idx)
        if (repetidos.length > 0) throw new LineasDuplicadasError([...new Set(repetidos)])

        const previoPorProducto = new Map(pedido.items.map((i) => [i.producto as string, i]))
        const hayCambioDeclarado =
          solicitados.length !== pedido.items.length ||
          solicitados.some((i) => !lineaSinCambio(previoPorProducto.get(i.producto), i))

        // Las guardas de cantidades/N2 aplican SOLO si de verdad se pide cambiar
        // líneas: reenviar lo mismo (lo que hace el formulario al editar una
        // nota) no puede quedar bloqueado por entregas, cierre o N2.
        if (hayCambioDeclarado) {
          if (cerrado) throw new Error('PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD')
          if (pedido.items.some((i) => i.cantEntrega > 0)) throw new Error('CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD')

          const productosActuales = pedido.items.map((i) => i.producto as string)
          const duplicadosActuales = productosActuales.filter((p, idx) => productosActuales.indexOf(p) !== idx)
          if (duplicadosActuales.length > 0) throw new LineasDuplicadasError([...new Set(duplicadosActuales)])

          // Diferencial N2 ya aplicado: Pedido.total = Σ ítems + diferenciales.
          // Recalcular desde los ítems lo borraría (o lo duplicaría al revertirlo).
          const [obligaciones, ajustesConDiferencial] = await Promise.all([
            tx.obligacionPendiente.count({ where: { pedidoId: input.pedidoId } }),
            tx.pedidoCantidadAjuste.count({ where: { pedidoId: input.pedidoId, montoDiferencial: { not: 0 } } }),
          ])
          if (obligaciones > 0 || ajustesConDiferencial > 0) throw new EdicionEconomicaN2Error()

          const aResolver = solicitados.filter((i) => !lineaSinCambio(previoPorProducto.get(i.producto), i))
          const resueltos = aResolver.length === 0
            ? []
            : await this.pricingPort.resolverPrecios(
                aResolver.map((i) => ({ codigo: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
                pedido.canal.get(),
                await this.pricingPort.loadPricingContext(
                  pedido.clienteId, pedido.negocioId, aResolver.map((i) => i.producto), tx,
                ),
              )
          const resueltoPorProducto = new Map(resueltos.map((r) => [r.producto as string, r]))

          const nuevosItems = solicitados.map((i) => {
            const r = resueltoPorProducto.get(i.producto)
            if (r) return new PedidoItem(r.producto, r.cantidad, Money.fromDecimal(r.precio), r.origen, 0)
            const previo = previoPorProducto.get(i.producto)!
            return new PedidoItem(previo.producto, previo.cantPedido, previo.precio, previo.precioOrigen, 0)
          })

          const nuevoTotal = nuevosItems.reduce((sum, i) => sum + i.subtotalPedido.toDecimal(), 0)
          const lineasAntes = snapshotLineas(pedido.items)
          const lineasDespues = snapshotLineas(nuevosItems)
          if (JSON.stringify(lineasAntes) !== JSON.stringify(lineasDespues)) {
            // Dinero ya cobrado: no se decide aquí devolverlo ni absorberlo.
            if (nuevoTotal < totalPagado) {
              throw new TotalMenorAPagadoError({
                totalAnterior, totalNuevo: nuevoTotal, totalPagado, diferencia: totalPagado - nuevoTotal,
              })
            }
            props.items = nuevosItems
            props.total = Money.fromDecimal(nuevoTotal)
            totalCambio = nuevoTotal !== totalAnterior
            registrar('items', { items: lineasAntes, total: totalAnterior }, { items: lineasDespues, total: nuevoTotal })
          }
        }
      }

      // ── INFORMACIÓN: obs ───────────────────────────────────────────────────
      if (input.obs !== undefined && (input.obs || '') !== (pedido.obs || '')) {
        registrar('obs', pedido.obs ?? null, input.obs || null)
        props.obs = input.obs || undefined
      }

      // ── INFORMACIÓN: dirección de entrega / dirección del cliente ──────────
      let clienteActualizar: { direccion: string; barrio?: string } | null = null
      if (tocaDireccion || tocaClienteDir) {
        const clienteActual = await this.clienteRepo.findById(pedido.clienteId, tx)
        const negocioActual = pedido.negocioId ? await this.clienteRepo.findNegocioById(pedido.negocioId, tx) : null
        const esCF = pedido.clienteId === 'CONSUMIDOR_FINAL'
        const aplicaraActualizarCliente = Boolean(input.actualizarCliente && !pedido.negocioId && !esCF)

        if (aplicaraActualizarCliente && clienteActual) {
          const dir = input.actualizarCliente?.direccion || ''
          const barrio = input.actualizarCliente?.barrio
          if (dir !== (clienteActual.direccion || '') || (barrio ?? '') !== (clienteActual.barrio ?? '')) {
            clienteActualizar = { direccion: dir, barrio }
            registrar(
              'actualizarCliente',
              { direccion: clienteActual.direccion || null, barrio: clienteActual.barrio ?? null },
              { direccion: dir || null, barrio: barrio ?? null },
            )
          }
        }

        if (tocaDireccion) {
          const clienteParaResolucion = aplicaraActualizarCliente
            ? { direccion: input.actualizarCliente?.direccion || '', barrio: input.actualizarCliente?.barrio }
            : clienteActual
          const resuelta = pickDireccionTexto({ cliente: clienteParaResolucion, negocio: negocioActual })
          // Edición PARCIAL: lo no enviado conserva el valor efectivo actual
          // (snapshot propio, o la dirección resuelta si no hay snapshot).
          const dirNueva = input.direccionEntrega !== undefined
            ? input.direccionEntrega
            : (pedido.direccionEntrega ?? resuelta.direccion)
          const barrioNuevo = input.barrioEntrega !== undefined
            ? input.barrioEntrega
            : (pedido.barrioEntrega ?? resuelta.barrio)
          const igualAResuelta = dirNueva === resuelta.direccion && barrioNuevo === resuelta.barrio
          const snapshotDir = igualAResuelta ? undefined : (dirNueva || undefined)
          const snapshotBarrio = igualAResuelta ? undefined : (barrioNuevo || undefined)

          // Suficiencia de entrega — MISMA autoridad que el preview (§16).
          if (pedido.canal.get() === 'DOMICILIO' && !esCF) {
            const entrega = resolverEntrega({
              canal: 'DOMICILIO',
              overrideDireccion: dirNueva,
              overrideBarrio: barrioNuevo,
              cliente: clienteParaResolucion && clienteActual
                ? { direccion: clienteParaResolucion.direccion, barrio: clienteParaResolucion.barrio, referencia: clienteActual.referencia, linkUbicacion: clienteActual.linkUbicacion, lat: clienteActual.lat, lng: clienteActual.lng, geocodeOrigen: clienteActual.geocodeOrigen }
                : null,
              negocio: negocioActual
                ? { direccion: negocioActual.direccion, barrio: negocioActual.barrio, referencia: negocioActual.referencia, linkUbicacion: negocioActual.linkUbicacion, lat: negocioActual.lat, lng: negocioActual.lng }
                : null,
              coordsDeLink,
            })
            if (entrega.estado === 'INSUFICIENTE') throw new EntregaInsuficienteError()
          }

          if ((snapshotDir ?? null) !== (pedido.direccionEntrega ?? null)) {
            registrar('direccionEntrega', pedido.direccionEntrega ?? null, snapshotDir ?? null)
            props.direccionEntrega = snapshotDir
          }
          if ((snapshotBarrio ?? null) !== (pedido.barrioEntrega ?? null)) {
            registrar('barrioEntrega', pedido.barrioEntrega ?? null, snapshotBarrio ?? null)
            props.barrioEntrega = snapshotBarrio
          }
        }
      }

      // ── Sin cambios reales: se informa, no se escribe ni se audita ─────────
      if (campos.length === 0) {
        return { pedido: PedidoDTOMapper.toResumen(pedido), aplicado: { campos: [], sinCambios: true } }
      }

      // ── Persistir UNA vez, con TODOS los cambios ya aplicados a `props` ────
      // (La entidad se construye recién ahora: construirla antes de procesar
      // obs/dirección fue la causa del falso éxito reportado en la revisión.)
      if (props.total.toDecimal() !== totalAnterior) {
        // G5.1: proyección de pago desde el estado final y el total vigente.
        props.estadoPago = EstadoPagoVO.proyectar(props.total.toDecimal(), totalPagado, props.estadoEntrega.get())
      }
      const saved = await this.pedidoRepo.update(Pedido.create(props), tx)

      // Guardia final: nada se declara aplicado si no quedó persistido.
      const noPersistidos: string[] = []
      if (campos.includes('obs') && (saved.obs || '') !== (props.obs || '')) noPersistidos.push('obs')
      if (campos.includes('direccionEntrega') && (saved.direccionEntrega ?? null) !== (props.direccionEntrega ?? null)) noPersistidos.push('direccionEntrega')
      if (campos.includes('barrioEntrega') && (saved.barrioEntrega ?? null) !== (props.barrioEntrega ?? null)) noPersistidos.push('barrioEntrega')
      if (campos.includes('items') && JSON.stringify(snapshotLineas(saved.items)) !== JSON.stringify(snapshotLineas(props.items))) noPersistidos.push('items')
      if (noPersistidos.length > 0) throw new EdicionNoPersistidaError(noPersistidos)

      // Factura alineada con el pedido si el total cambió.
      if (totalCambio) {
        const factura = await this.facturaRepo.findByPedidoId(saved.id.get(), tx)
        if (factura) {
          const saldo = Math.max(0, saved.total.toDecimal() - totalPagado)
          await this.facturaRepo.update({
            ...factura,
            total: saved.total.toDecimal(),
            saldo,
            estado: saved.total.toDecimal() <= totalPagado ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
          }, tx)
        }
      }

      // NUNCA si el destino es un negocio/sucursal: ahí `actualizarCliente`
      // trae la dirección del negocio, no una edición real del cliente.
      if (clienteActualizar) {
        await this.clienteRepo.updateDireccion(
          saved.clienteId,
          clienteActualizar.direccion,
          clienteActualizar.barrio,
          tx,
          { usuarioId: input.usuarioId, pedidoId: saved.id.get() },
        )
      }

      // Auditoría única, dentro del lock, con antes/después (`numero`/`estado`
      // se conservan para los lectores existentes del Historial).
      await logAudit({
        entidad: 'Pedido',
        registroId: saved.id.get(),
        accion: 'UPDATE',
        datos: { numero: saved.numero, estado: saved.estadoEntrega.get(), campos, antes, despues },
        usuarioId: input.usuarioId,
        casoId: input.casoId,
      }, tx)

      return { pedido: PedidoDTOMapper.toResumen(saved), aplicado: { campos, sinCambios: false } }
    })
  }

  /**
   * Resuelve `linkUbicacion → coords` para el pedido ANTES del lock (I/O — nunca
   * dentro de la tx). Lee el pedido para conocer cliente/negocio/canal; si es
   * DOMICILIO, no hay coords almacenadas y existe un link → lo resuelve.
   * Best-effort (`null` si no aplica o no resuelve). NO persiste nada.
   */
  private async resolverCoordsDeLinkParaEntrega(
    pedidoId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const pedido = await this.pedidoRepo.findById(PedidoId.from(pedidoId))
    if (!pedido || pedido.canal.get() !== 'DOMICILIO' || pedido.clienteId === 'CONSUMIDOR_FINAL') {
      return null
    }
    const [clientePre, negocioPre] = await Promise.all([
      this.clienteRepo.findById(pedido.clienteId),
      pedido.negocioId ? this.clienteRepo.findNegocioById(pedido.negocioId) : Promise.resolve(null),
    ])
    const hayCoords =
      (negocioPre?.lat != null && negocioPre?.lng != null) ||
      (clientePre?.lat != null && clientePre?.lng != null)
    if (hayCoords) return null

    const efectivoLink = (negocioPre?.linkUbicacion ?? clientePre?.linkUbicacion) || null
    if (!efectivoLink) return null

    return this.resolverCoordsDeLink(efectivoLink)
  }
}
