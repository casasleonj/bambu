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

    const cliente = await this.deps.clienteRepo.findById(input.clienteId)
    if (!cliente) throw new ClienteNotFoundError(input.clienteId)

    if (input.pedidoOrigenId) {
      const origenPedido = await this.deps.pedidoRepo.findById(PedidoId.from(input.pedidoOrigenId))
      if (!origenPedido) throw new PedidoOrigenNotFoundError(input.pedidoOrigenId)
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

    // ── Pagos: proyección virtual con las reglas existentes ──
    const { pagosAplicados, excedente } = normalizarPagos(
      (input.pagos ?? []).map(p => ({ metodo: p.metodo, monto: p.monto })),
      total,
    )
    const totalPagado = pagosAplicados.reduce((s, p) => s + p.monto, 0)
    const estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO' = input.entregado === true ? 'ENTREGADO' : 'PENDIENTE'
    const saldoProyectado = calcularSaldo(total, totalPagado)
    const estadoPagoProyectado = calcularEstadoPago(total, totalPagado, estadoEntregaProyectado) as
      'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'

    const tienePrecioManual = resueltos.some(r => r.origen === 'manual')

    // ── Permissions + warnings ──
    const warnings: PreviewPedidoResult['warnings'] = []
    let canCreate = true

    if (!esAnonimo && cliente.bloqueado) {
      canCreate = false
      warnings.push({ code: 'CLIENTE_BLOQUEADO', message: 'Cliente bloqueado por deuda vencida. Pague primero.' })
    }

    if (!esAnonimo && !cliente.bloqueado) {
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
      allowedActions.push('crear')
      if (estadoEntregaProyectado === 'PENDIENTE') allowedActions.push('crear-y-enviar-a-ruta')
    }

    // hoy no se restringe para ADMIN/ASISTENTE — la política de umbral es
    // PENDIENTE DE NEGOCIO (§8.2 del blueprint).
    const canSetManualPrice = true

    // ── Risk signals (detector detectivo — señal ≠ bloqueo).
    // CONSUMIDOR_FINAL = ausencia de cliente real: sin historial ni riesgo. ──
    let riskSignals: PreviewPedidoResult['riskSignals'] = []
    if (!esAnonimo) {
      const [pedidosRecientes, precioMinimos] = await Promise.all([
        this.deps.pedidoRepo.findMany(
          { clienteId: input.clienteId, estadoEntrega: ESTADOS_ENTREGA_VALIDOS },
          { take: 5, orderBy: 'desc' },
        ),
        this.deps.getPrecioMinimos(),
      ])
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
        saldoFavorProyectado: excedente,
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
        accion: 'CREAR_PEDIDO',
        recurso: 'Pedido (nuevo)',
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
