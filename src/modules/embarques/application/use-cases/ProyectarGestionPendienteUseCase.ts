/**
 * ProyectarGestionPendienteUseCase (Fase 5-0 del rediseño de Pedidos —
 * docs/pedidos/fase5-n2-flujo-plan.md P2).
 *
 * **Proyección read-only** del impacto de una acción N2 (gestionar / cambiar
 * modo / liberar) ANTES de ejecutarla. NUNCA muta: sin `$transaction` de
 * escritura, sin lock, sin `aplicarConsecuenciaEconomicaDiferencial`.
 *
 * NO es un "preview" en el sentido de reusar su resultado — el commit real
 * (`gestionar-pendiente` / `cambiar-modo` / `liberar`) **revalida y recalcula
 * todo** dentro de su lock. Esta proyección solo sirve para que el usuario
 * comprenda la consecuencia económica antes de decidir (semántica B).
 *
 * Compone `calcularDiferencial` (función pura de lectura) + lecturas de
 * `Pedido` / `PedidoItem` / `Cliente` / `ObligacionPendiente` /
 * `PedidoCantidadAjuste`. Cero pricing nuevo, cero cálculo nuevo.
 */

import { prisma } from '@/lib/prisma'
import { calcularDiferencial } from '../../domain/services/diferencial.service'
import type { Canal, ProductCode } from '@/lib/pricing'

export type AccionN2 = 'gestionar' | 'cambiar-modo' | 'liberar'

export interface ProyectarGestionPendienteInput {
  pedidoId: string
  accion: AccionN2
  /** gestionar: producto/cantidad/modoDestino del remanente a gestionar. */
  producto?: ProductCode
  cantidad?: number
  modoDestino?: Canal
  /** cambiar-modo / liberar: la actividad afectada. */
  actividadId?: string
}

export interface DiferencialProyectado {
  valorHistorico: number
  valorActual: number
  diferencial: number
}

export interface ConsecuenciaProyectada {
  pedidoTotalAntes: number
  pedidoTotalDespues: number
  pedidoSaldoAntes: number
  pedidoSaldoDespues: number
  clienteSaldoFavorAntes: number
  clienteSaldoFavorDespues: number
  tipo: 'cobro_adicional' | 'ajuste_a_favor' | 'sin_ajuste' | 'reversion_parcial' | 'reversion_total'
}

export interface ProyectarGestionPendienteResult {
  accion: AccionN2
  remanente?: number
  /** gestionar / cambiar-modo. */
  diferencial?: DiferencialProyectado
  /** liberar: lo que se revierte de `Pedido.total` y lo que NO se revierte (ya en saldoFavor). */
  reversion?: { montoRevertible: number; saldoFavorNoRevertido: number }
  consecuencia: ConsecuenciaProyectada
  allowedActions: AccionN2[]
  warnings: Array<{ code: string; message: string }>
}

export class ProyectarGestionPendienteError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ProyectarGestionPendienteError' }
}

const ESTADOS_NO_ADMITEN_GESTION = ['CANCELADO', 'ANULADO']

export class ProyectarGestionPendienteUseCase {
  async execute(input: ProyectarGestionPendienteInput): Promise<ProyectarGestionPendienteResult> {
    const pedido = await prisma.pedido.findUnique({
      where: { id: input.pedidoId },
      select: {
        id: true, clienteId: true, negocioId: true, canal: true,
        total: true, totalPagado: true, saldo: true, estadoEntrega: true,
      },
    })
    if (!pedido) throw new ProyectarGestionPendienteError('PEDIDO_NOT_FOUND')

    const cliente = pedido.clienteId
      ? await prisma.cliente.findUnique({ where: { id: pedido.clienteId }, select: { saldoFavor: true } })
      : null
    const saldoFavorAntes = Number(cliente?.saldoFavor ?? 0)
    const totalAntes = Number(pedido.total)
    const saldoAntes = Number(pedido.saldo)

    const baseConsecuencia = {
      pedidoTotalAntes: totalAntes,
      pedidoSaldoAntes: saldoAntes,
      clienteSaldoFavorAntes: saldoFavorAntes,
    }

    if (input.accion === 'liberar' || input.accion === 'cambiar-modo') {
      return this.proyectarSobreActividad(input, pedido, baseConsecuencia)
    }
    return this.proyectarGestionar(input, pedido, baseConsecuencia)
  }

  private async proyectarGestionar(
    input: ProyectarGestionPendienteInput,
    pedido: { id: string; clienteId: string; negocioId: string | null; canal: string; estadoEntrega: string },
    base: { pedidoTotalAntes: number; pedidoSaldoAntes: number; clienteSaldoFavorAntes: number },
  ): Promise<ProyectarGestionPendienteResult> {
    if (!input.producto || input.cantidad == null || !input.modoDestino) {
      throw new ProyectarGestionPendienteError('PRODUCTO_CANTIDAD_MODO_REQUERIDOS')
    }
    const item = await prisma.pedidoItem.findFirst({
      where: { pedidoId: pedido.id, producto: input.producto },
      select: { precio: true, cantPedido: true, cantEntrega: true },
    })
    if (!item) throw new ProyectarGestionPendienteError(`PEDIDO_ITEM_NOT_FOUND: ${input.producto}`)

    const remanente = item.cantPedido - item.cantEntrega
    const warnings: ProyectarGestionPendienteResult['warnings'] = []

    if (ESTADOS_NO_ADMITEN_GESTION.includes(pedido.estadoEntrega)) {
      warnings.push({ code: 'NO_ADMITE_GESTION', message: `El pedido está ${pedido.estadoEntrega.toLowerCase()} — no admite gestión de pendientes.` })
    }
    if (remanente <= 0) {
      warnings.push({ code: 'SIN_REMANENTE', message: 'Este producto no tiene remanente pendiente.' })
    }
    if (input.cantidad <= 0 || input.cantidad > remanente) {
      warnings.push({ code: 'CANTIDAD_EXCEDE_PENDIENTE', message: `Cantidad ${input.cantidad}; remanente ${Math.max(0, remanente)}.` })
    }
    const obligacionActiva = await prisma.obligacionPendiente.findFirst({
      where: { pedidoId: pedido.id, producto: input.producto, estado: 'ABIERTA' },
      select: { id: true },
    })
    if (obligacionActiva) {
      warnings.push({ code: 'OBLIGACION_YA_ACTIVA', message: `Ya hay una gestión abierta de ${input.producto} para este pedido.` })
    }

    // El backend solo calcula/aplica diferencial si el modo destino != canal del pedido.
    let diferencial: DiferencialProyectado
    if (input.modoDestino === pedido.canal) {
      diferencial = { valorHistorico: input.cantidad * Number(item.precio), valorActual: input.cantidad * Number(item.precio), diferencial: 0 }
    } else {
      diferencial = await calcularDiferencial({
        producto: input.producto,
        precioHistorico: Number(item.precio),
        cantidadPendiente: input.cantidad,
        modoDestino: input.modoDestino,
        clienteId: pedido.clienteId,
        negocioId: pedido.negocioId,
      })
    }

    const consecuencia = this.consecuenciaDeDiferencial(diferencial.diferencial, base)
    const bloqueado = warnings.some((w) => ['NO_ADMITE_GESTION', 'SIN_REMANENTE', 'CANTIDAD_EXCEDE_PENDIENTE', 'OBLIGACION_YA_ACTIVA'].includes(w.code))

    return {
      accion: 'gestionar',
      remanente: Math.max(0, remanente),
      diferencial,
      consecuencia,
      allowedActions: bloqueado ? [] : ['gestionar'],
      warnings,
    }
  }

  private async proyectarSobreActividad(
    input: ProyectarGestionPendienteInput,
    pedido: { id: string; clienteId: string; negocioId: string | null; canal: string },
    base: { pedidoTotalAntes: number; pedidoSaldoAntes: number; clienteSaldoFavorAntes: number },
  ): Promise<ProyectarGestionPendienteResult> {
    if (!input.actividadId) throw new ProyectarGestionPendienteError('ACTIVIDAD_ID_REQUERIDO')
    const actividad = await prisma.actividad.findUnique({
      where: { id: input.actividadId },
      select: {
        id: true, cantidad: true, modo: true, estado: true,
        obligacion: { select: { id: true, producto: true, pedidoId: true } },
      },
    })
    if (!actividad || actividad.obligacion.pedidoId !== pedido.id) {
      throw new ProyectarGestionPendienteError('ACTIVIDAD_NOT_FOUND')
    }

    const warnings: ProyectarGestionPendienteResult['warnings'] = []
    if (actividad.estado !== 'ASIGNADA' && actividad.estado !== 'EN_PROGRESO') {
      warnings.push({ code: 'ACTIVIDAD_NO_MODIFICABLE', message: `La actividad está ${actividad.estado.toLowerCase()} — no se puede modificar.` })
    }

    // Sumas ya aplicadas por esta obligación (misma lógica que revertirDiferencialEnPedido).
    const ajustes = await prisma.pedidoCantidadAjuste.findMany({
      where: { obligacionId: actividad.obligacion.id },
      select: { montoDiferencial: true },
    })
    const montoRevertible = ajustes
      .map((a) => Number(a.montoDiferencial ?? 0))
      .filter((m) => m > 0)
      .reduce((s, m) => s + m, 0)
    const saldoFavorNoRevertido = ajustes
      .map((a) => Number(a.montoDiferencial ?? 0))
      .filter((m) => m < 0)
      .reduce((s, m) => s + Math.abs(m), 0)

    const bloqueado = warnings.some((w) => w.code === 'ACTIVIDAD_NO_MODIFICABLE')

    if (input.accion === 'liberar') {
      const consecuencia: ConsecuenciaProyectada = {
        ...base,
        pedidoTotalDespues: base.pedidoTotalAntes - montoRevertible,
        pedidoSaldoDespues: Math.max(0, base.pedidoSaldoAntes - montoRevertible),
        clienteSaldoFavorDespues: base.clienteSaldoFavorAntes, // el negativo ya acreditado NO se revierte
        tipo: saldoFavorNoRevertido > 0 ? 'reversion_parcial' : 'reversion_total',
      }
      return {
        accion: 'liberar',
        reversion: { montoRevertible, saldoFavorNoRevertido },
        consecuencia,
        allowedActions: bloqueado ? [] : ['liberar'],
        warnings,
      }
    }

    // cambiar-modo
    if (!input.modoDestino) throw new ProyectarGestionPendienteError('MODO_DESTINO_REQUERIDO')
    const item = await prisma.pedidoItem.findFirst({
      where: { pedidoId: pedido.id, producto: actividad.obligacion.producto },
      select: { precio: true },
    })
    if (!item) throw new ProyectarGestionPendienteError(`PEDIDO_ITEM_NOT_FOUND: ${actividad.obligacion.producto}`)

    let nuevoDiferencial: DiferencialProyectado
    if (input.modoDestino === pedido.canal) {
      const v = actividad.cantidad * Number(item.precio)
      nuevoDiferencial = { valorHistorico: v, valorActual: v, diferencial: 0 }
    } else {
      nuevoDiferencial = await calcularDiferencial({
        producto: actividad.obligacion.producto as ProductCode,
        precioHistorico: Number(item.precio),
        cantidadPendiente: actividad.cantidad,
        modoDestino: input.modoDestino,
        clienteId: pedido.clienteId,
        negocioId: pedido.negocioId,
      })
    }

    // Neto: se revierte lo aplicado antes, luego se aplica el nuevo.
    const totalDespues = base.pedidoTotalAntes - montoRevertible + Math.max(0, nuevoDiferencial.diferencial)
    const saldoDespues = Math.max(0, base.pedidoSaldoAntes - montoRevertible + Math.max(0, nuevoDiferencial.diferencial))
    const saldoFavorDespues = base.clienteSaldoFavorAntes + Math.max(0, -nuevoDiferencial.diferencial)
    let tipo: ConsecuenciaProyectada['tipo'] = 'sin_ajuste'
    if (nuevoDiferencial.diferencial > 0) tipo = 'cobro_adicional'
    else if (nuevoDiferencial.diferencial < 0) tipo = 'ajuste_a_favor'

    return {
      accion: 'cambiar-modo',
      diferencial: nuevoDiferencial,
      reversion: { montoRevertible, saldoFavorNoRevertido },
      consecuencia: {
        ...base,
        pedidoTotalDespues: totalDespues,
        pedidoSaldoDespues: saldoDespues,
        clienteSaldoFavorDespues: saldoFavorDespues,
        tipo,
      },
      allowedActions: bloqueado ? [] : ['cambiar-modo'],
      warnings,
    }
  }

  private consecuenciaDeDiferencial(
    dif: number,
    base: { pedidoTotalAntes: number; pedidoSaldoAntes: number; clienteSaldoFavorAntes: number },
  ): ConsecuenciaProyectada {
    if (dif > 0) {
      return {
        ...base,
        pedidoTotalDespues: base.pedidoTotalAntes + dif,
        pedidoSaldoDespues: base.pedidoSaldoAntes + dif,
        clienteSaldoFavorDespues: base.clienteSaldoFavorAntes,
        tipo: 'cobro_adicional',
      }
    }
    if (dif < 0) {
      return {
        ...base,
        pedidoTotalDespues: base.pedidoTotalAntes, // el total NO baja
        pedidoSaldoDespues: base.pedidoSaldoAntes,
        clienteSaldoFavorDespues: base.clienteSaldoFavorAntes + Math.abs(dif),
        tipo: 'ajuste_a_favor',
      }
    }
    return {
      ...base,
      pedidoTotalDespues: base.pedidoTotalAntes,
      pedidoSaldoDespues: base.pedidoSaldoAntes,
      clienteSaldoFavorDespues: base.clienteSaldoFavorAntes,
      tipo: 'sin_ajuste',
    }
  }
}
