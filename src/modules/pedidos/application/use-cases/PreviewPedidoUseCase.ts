/**
 * PreviewPedidoUseCase — prepara una creación de Pedido SIN persistir ni
 * mutar nada. Compone servicios y repos de LECTURA existentes. Nunca escribe,
 * nunca toma lock, nunca abre transacción, nunca crea/modifica un Cliente.
 * El commit real (POST /api/pedidos) revalida y recalcula todo.
 *
 * Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.
 * Plan: docs/pedidos/fase4-preview-endpoint-plan.md.
 */

import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'
import type { PreviewPedidoInput, PreviewPedidoResult, PreviewCalculationItem } from '../dto'
import type { ProductCode } from '@/shared/domain'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { normalizarPagos, calcularSaldo, calcularEstadoPago } from '../../domain/services/pagos-calculator.service'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { calcularAlertasCliente } from '@/lib/alertas-detector'
import { draftToPedidoBase, pedidoEntityToPedidoBase } from './pedido-to-pedido-base'

export class ClienteNotFoundError extends Error {
  constructor(id: string) { super(`CLIENTE_NOT_FOUND: ${id}`); this.name = 'ClienteNotFoundError' }
}
export class PedidoOrigenNotFoundError extends Error {
  constructor(id: string) { super(`PEDIDO_ORIGEN_NOT_FOUND: ${id}`); this.name = 'PedidoOrigenNotFoundError' }
}
export class PedidoNotFoundError extends Error {
  constructor(id: string) { super(`PEDIDO_NOT_FOUND: ${id}`); this.name = 'PedidoNotFoundError' }
}

export interface PreviewPedidoDeps {
  pricingPort: IPricingPort
  clienteRepo: IClienteRepository
  pedidoRepo: IPedidoRepository
  getFiadoStatusUseCase: GetFiadoStatusUseCase
  getPrecioMinimos: () => Promise<Array<{ producto: string; cantMin: number; cantMax: number | null; precioMinimo: number | null }>>
}

const ESTADOS_ENTREGA_VALIDOS = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO']

export class PreviewPedidoUseCase {
  constructor(private deps: PreviewPedidoDeps) {}

  async execute(input: PreviewPedidoInput): Promise<PreviewPedidoResult> {
    const canal = input.canal ?? 'DOMICILIO'
    const origen = input.origen ?? 'PEDIDO'
    const esAnonimo = input.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID
    const esEdicion = Boolean(input.pedidoId)

    const cliente = await this.deps.clienteRepo.findById(input.clienteId)
    if (!cliente) throw new ClienteNotFoundError(input.clienteId)

    if (input.pedidoOrigenId) {
      const origenPedido = await this.deps.pedidoRepo.findById(PedidoId.from(input.pedidoOrigenId))
      if (!origenPedido) throw new PedidoOrigenNotFoundError(input.pedidoOrigenId)
    }

    // ── Modo edición: el PUT /api/pedidos/[id] es declarativo de items y
    // conserva los pagos existentes. `totalPagado` NO viene del body, y el
    // `estadoEntrega` no cambia (el PUT proyecta el estadoPago contra el
    // estadoEntrega actual, no contra 'PENDIENTE'). ──
    let totalPagadoBase = 0
    let estadoEntregaExistente: string | null = null
    if (esEdicion) {
      const existente = await this.deps.pedidoRepo.findById(PedidoId.from(input.pedidoId as string))
      if (!existente) throw new PedidoNotFoundError(input.pedidoId as string)
      totalPagadoBase = existente.totalPagado.toDecimal()
      estadoEntregaExistente = existente.estadoEntrega.get()
    }

    // ── Pricing (mismo port que CrearPedidoUseCase) ──
    const activeCodes = [...new Set(input.items.map(i => i.producto))] as ProductCode[]
    const pricingData = await this.deps.pricingPort.loadPricingContext(input.clienteId, input.negocioId ?? null, activeCodes)
    const resueltos = await this.deps.pricingPort.resolverPrecios(
      input.items.map(i => ({ codigo: i.producto as ProductCode, cantidad: i.cantidad, precioManual: i.precioManual })),
      canal,
      pricingData,
    )

    const items: PreviewCalculationItem[] = resueltos.map(r => ({
      producto: r.producto,
      cantidad: r.cantidad,
      precioUnitario: r.precio, // ya incluye recargo domicilio si aplica
      subtotal: r.subtotal, // = r.precio × r.cantidad
      precioOrigen: r.origen,
    }))

    // ── Semántica de cálculo (contrato) ──
    const total = items.reduce((s, i) => s + i.subtotal, 0)
    const recargoDomicilio = canal === 'DOMICILIO'
      ? resueltos.reduce((acc, r) => {
          const cfg = pricingData.productosByCode[r.producto]
          return acc + (cfg?.aplicaDomicilio ? cfg.sobreCostoDomicilio * r.cantidad : 0)
        }, 0)
      : 0
    const subtotal = total - recargoDomicilio

    // ── Pagos ──
    // Creación: proyección virtual de `input.pagos` con las reglas existentes.
    // Edición: el PUT es declarativo de items y conserva los pagos → `totalPagado`
    // es el del pedido existente; el saldo a favor no cambia en este flujo.
    const { pagosAplicados, excedente } = normalizarPagos(
      (esEdicion ? [] : (input.pagos ?? [])).map(p => ({ metodo: p.metodo, monto: p.monto })),
      total,
    )
    const totalPagado = esEdicion ? totalPagadoBase : pagosAplicados.reduce((s, p) => s + p.monto, 0)
    const saldoFavorProyectado = esEdicion ? 0 : excedente
    // Edición: el estadoEntrega no cambia — se proyecta el estadoPago contra el
    // actual (igual que ActualizarPedidoUseCase). Creación: PENDIENTE/ENTREGADO.
    const estadoEntregaProyectado = (esEdicion && estadoEntregaExistente
      ? estadoEntregaExistente
      : input.entregado === true ? 'ENTREGADO' : 'PENDIENTE'
    ) as PreviewPedidoResult['calculation']['estadoEntregaProyectado']
    const saldoProyectado = calcularSaldo(total, totalPagado)
    const estadoPagoProyectado = calcularEstadoPago(total, totalPagado, estadoEntregaProyectado) as
      PreviewPedidoResult['calculation']['estadoPagoProyectado']

    const tienePrecioManual = resueltos.some(r => r.origen === 'manual')

    // ── Permissions + warnings ──
    const warnings: PreviewPedidoResult['warnings'] = []
    let canCreate = true

    if (!esAnonimo && cliente.bloqueado) {
      canCreate = false
      warnings.push({ code: 'CLIENTE_BLOQUEADO', message: 'Cliente bloqueado por deuda vencida. Pague primero.' })
    }

    // El límite de fiados es un guard de ALTA — editar un pedido existente no
    // crea un nuevo fiado, así que no aplica en modo edición.
    if (!esAnonimo && !cliente.bloqueado && !esEdicion) {
      const fiado = await this.deps.getFiadoStatusUseCase.execute({ clienteId: input.clienteId })
      if (fiado.count >= fiado.limite) {
        canCreate = false
        warnings.push({
          code: 'FIADO_SOBRE_LIMITE',
          message: `Cliente tiene ${fiado.count} pedidos fiados (límite: ${fiado.limite}). Pague primero para crear más.`,
        })
      }
    }

    if (canal === 'DOMICILIO' && !cliente.direccion) {
      warnings.push({ code: 'DIRECCION_FALTANTE', message: 'Domicilio sin dirección registrada.', field: 'direccion' })
    }

    if (tienePrecioManual) {
      warnings.push({ code: 'PRECIO_MANUAL_APLICADO', message: 'Se aplicó un precio manual a uno o más productos.' })
    }

    const allowedActions: PreviewPedidoResult['allowedActions'] = []
    if (canCreate) {
      if (esEdicion) {
        allowedActions.push('actualizar')
      } else {
        allowedActions.push('crear')
        if (estadoEntregaProyectado === 'PENDIENTE') allowedActions.push('crear-y-enviar-a-ruta')
      }
    }

    // hoy no se restringe para ADMIN/ASISTENTE — la política de umbral es
    // PENDIENTE DE NEGOCIO (§8.2 del blueprint).
    const canSetManualPrice = true

    // ── Risk signals (detector detectivo — señal ≠ bloqueo).
    // CONSUMIDOR_FINAL = ausencia de cliente real: sin historial ni riesgo. ──
    let riskSignals: PreviewPedidoResult['riskSignals'] = []
    if (!esAnonimo) {
      const [pedidosRecientesRaw, precioMinimos] = await Promise.all([
        this.deps.pedidoRepo.findMany(
          { clienteId: input.clienteId, estadoEntrega: ESTADOS_ENTREGA_VALIDOS },
          { take: 6, orderBy: 'desc' },
        ),
        this.deps.getPrecioMinimos(),
      ])
      // en edición, el propio pedido no debe compararse contra sí mismo.
      const pedidosRecientes = (esEdicion
        ? pedidosRecientesRaw.filter(p => readEntityId(p) !== input.pedidoId)
        : pedidosRecientesRaw
      ).slice(0, 5)
      const historial = pedidosRecientes.map((p, idx) =>
        pedidoEntityToPedidoBase(p as never, readEntityId(p) ?? `__real_${idx}__`),
      )
      const draft = draftToPedidoBase({
        clienteId: input.clienteId,
        canal,
        resolvedItems: resueltos,
        total,
        saldo: saldoProyectado,
        nowIso: new Date().toISOString(),
      })
      const alertas = calcularAlertasCliente(
        {
          id: cliente.id,
          nombre: cliente.nombre ?? '',
          telefono: cliente.telefono ?? '',
          verificado: cliente.verificado,
          bloqueado: cliente.bloqueado,
          creadoPorRol: cliente.creadoPorRol,
        },
        [...historial, draft],
        { precioMinimos },
      )
      riskSignals = alertas.map(a => ({ tipo: a.tipo, severidad: a.severidad, detalle: a.detalle }))
    }

    return {
      calculation: {
        items,
        subtotal,
        recargoDomicilio,
        total,
        totalPagado,
        saldoProyectado,
        saldoFavorProyectado,
        estadoEntregaProyectado,
        estadoPagoProyectado,
      },
      permissions: { canCreate, canSetManualPrice },
      allowedActions,
      warnings,
      riskSignals,
      requiresAuthorization: false,
      auditPreview: {
        actor: input.actorId,
        accion: esEdicion ? 'ACTUALIZAR_PEDIDO' : 'CREAR_PEDIDO',
        recurso: esEdicion ? 'Pedido (edición)' : 'Pedido (nuevo)',
        valoresRelevantes: { total, clienteId: input.clienteId, canal, origen, tienePrecioManual },
      },
    }
  }
}

/** El id de la entidad Pedido es un VO PedidoId (`.get()`). Defensa por si el
 *  repo devuelve otra forma — el detector solo necesita un id único y estable. */
function readEntityId(p: unknown): string | undefined {
  const id = (p as { id?: unknown }).id
  if (typeof id === 'string') return id
  if (id && typeof (id as { get?: unknown }).get === 'function') return (id as { get(): string }).get()
  return undefined
}
