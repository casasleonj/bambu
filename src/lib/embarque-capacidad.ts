/**
 * Pesos reales por unidad de producto (KG).
 *
 * Fuente ÚNICA: el value object de dominio `Carga`
 * (`src/modules/embarques/domain/value-objects/Carga.ts`). Antes este archivo
 * declaraba su propia copia 1:1 de la tabla — deuda de duplicación señalada por
 * la auditoría (B.4 / B.8): cambiar un peso obligaba a editar en dos sitios.
 * Ahora se re-exporta para no romper los ~10 consumidores que lo importan
 * desde acá.
 */
import { PESOS_KG } from '@/modules/embarques/domain/value-objects/Carga'

export { PESOS_KG }

export type ProductCode = keyof typeof PESOS_KG

/**
 * Sprint 4 (C-2 Fase 2): input type unificado. Acepta tanto el shape
 * legacy (cPacaAguaPed, cBotellonDomPed, etc.) como el shape canónico
 * items[] (PedidoItem[] con { producto, cantPedido }). El primero se
 * mantiene por retrocompatibilidad durante la migración, pero las
 * rutas modernas deben preferir `items`.
 */
export interface PedidoCapacidadInput {
  // Shape legacy (mantener para retrocompat)
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
  cPacaAguaEnt?: number | null
  cPacaHieloEnt?: number | null
  cBotellonFabEnt?: number | null
  cBotellonDomEnt?: number | null
  cBolsaAguaEnt?: number | null
  cBolsaHieloEnt?: number | null
  // Shape canónico (Sprint 4+)
  items?: Array<{
    producto: string
    cantPedido: number
    cantEntrega?: number
    cantRegaloPedido?: number
    cantRegaloEntrega?: number
  }>
}

/** Proyección para un NUEVO viaje; no modifica el pedido ni el historial de una carga anterior. */
export function pedidoParaCargaPendiente(p: PedidoCapacidadInput): PedidoCapacidadInput {
  return {
    ...p,
    cPacaAguaPed: Math.max(0, (p.cPacaAguaPed ?? 0) - (p.cPacaAguaEnt ?? 0)), cPacaAguaEnt: 0,
    cPacaHieloPed: Math.max(0, (p.cPacaHieloPed ?? 0) - (p.cPacaHieloEnt ?? 0)), cPacaHieloEnt: 0,
    cBotellonFabPed: Math.max(0, (p.cBotellonFabPed ?? 0) - (p.cBotellonFabEnt ?? 0)), cBotellonFabEnt: 0,
    cBotellonDomPed: Math.max(0, (p.cBotellonDomPed ?? 0) - (p.cBotellonDomEnt ?? 0)), cBotellonDomEnt: 0,
    cBolsaAguaPed: Math.max(0, (p.cBolsaAguaPed ?? 0) - (p.cBolsaAguaEnt ?? 0)), cBolsaAguaEnt: 0,
    cBolsaHieloPed: Math.max(0, (p.cBolsaHieloPed ?? 0) - (p.cBolsaHieloEnt ?? 0)), cBolsaHieloEnt: 0,
    ...(p.items ? { items: p.items.map(i => ({ ...i,
      cantPedido: Math.max(0, i.cantPedido - (i.cantEntrega ?? 0)), cantEntrega: 0,
      cantRegaloPedido: Math.max(0, (i.cantRegaloPedido ?? 0) - (i.cantRegaloEntrega ?? 0)), cantRegaloEntrega: 0,
    })) } : {}),
  }
}

export function cantidadFisicaProductoPedido(pedido: PedidoCapacidadInput, code: ProductCode): number {
  // Preferir items[] si está presente (single source of truth).
  if (pedido.items && pedido.items.length > 0) {
    const item = pedido.items.find(i => i.producto === code)
    return item ? item.cantPedido + (item.cantRegaloPedido ?? 0) : 0
  }
  // Fallback a legacy si items[] no está.
  switch (code) {
    case 'PACA_AGUA': return pedido.cPacaAguaPed || 0
    case 'PACA_HIELO': return pedido.cPacaHieloPed || 0
    case 'BOTELLON':
      return (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0)
    case 'BOLSA_AGUA': return pedido.cBolsaAguaPed || 0
    case 'BOLSA_HIELO': return pedido.cBolsaHieloPed || 0
  }
}

export function calcularPacasEmbarque(pedidos: PedidoCapacidadInput[]): number {
  return pedidos.reduce((total, p) => {
    return (
      total +
      cantidadFisicaProductoPedido(p, 'PACA_AGUA') +
      cantidadFisicaProductoPedido(p, 'PACA_HIELO') +
      cantidadFisicaProductoPedido(p, 'BOTELLON') +
      cantidadFisicaProductoPedido(p, 'BOLSA_AGUA') +
      cantidadFisicaProductoPedido(p, 'BOLSA_HIELO')
    )
  }, 0)
}

export function calcularPesoEmbarque(pedidos: PedidoCapacidadInput[]): number {
  return pedidos.reduce((total, p) => {
    return (
      total +
      cantidadFisicaProductoPedido(p, 'PACA_AGUA') * PESOS_KG.PACA_AGUA +
      cantidadFisicaProductoPedido(p, 'PACA_HIELO') * PESOS_KG.PACA_HIELO +
      cantidadFisicaProductoPedido(p, 'BOTELLON') * PESOS_KG.BOTELLON +
      cantidadFisicaProductoPedido(p, 'BOLSA_AGUA') * PESOS_KG.BOLSA_AGUA +
      cantidadFisicaProductoPedido(p, 'BOLSA_HIELO') * PESOS_KG.BOLSA_HIELO
    )
  }, 0)
}

export type StockSnapshot = {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export function emptyStock(): StockSnapshot {
  return {
    PACA_AGUA: 0,
    PACA_HIELO: 0,
    BOTELLON: 0,
    BOLSA_AGUA: 0,
    BOLSA_HIELO: 0,
  }
}

export interface CargaSnapshot {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export function calcularPesoDesdeCarga(carga: CargaSnapshot): number {
  return (
    (carga.PACA_AGUA || 0) * PESOS_KG.PACA_AGUA +
    (carga.PACA_HIELO || 0) * PESOS_KG.PACA_HIELO +
    (carga.BOTELLON || 0) * PESOS_KG.BOTELLON +
    (carga.BOLSA_AGUA || 0) * PESOS_KG.BOLSA_AGUA +
    (carga.BOLSA_HIELO || 0) * PESOS_KG.BOLSA_HIELO
  )
}

export function totalUnidadesCarga(carga: CargaSnapshot): number {
  return (
    (carga.PACA_AGUA || 0) +
    (carga.PACA_HIELO || 0) +
    (carga.BOTELLON || 0) +
    (carga.BOLSA_AGUA || 0) +
    (carga.BOLSA_HIELO || 0)
  )
}

export type CapacidadNivel = 'ideal' | 'pesado' | 'maximo' | 'excedido'

export interface CapacidadInfo {
  total: number
  pesoKg: number
  capacidadKg: number
  porcentaje: number
  nivel: CapacidadNivel
  label: string
  color: string
  icon: string
}

export function getCapacidadInfo(totalPacas: number, pesoKg: number, capacidadKg: number): CapacidadInfo {
  const porcentaje = capacidadKg > 0 ? (pesoKg / capacidadKg) * 100 : 0

  if (porcentaje > 100) {
    return {
      total: totalPacas,
      pesoKg,
      capacidadKg,
      porcentaje,
      nivel: 'excedido',
      label: 'Excedido',
      color: 'text-red-700 bg-red-100 border-red-300',
      icon: '⛔',
    }
  }
  if (porcentaje >= 87) {
    return {
      total: totalPacas,
      pesoKg,
      capacidadKg,
      porcentaje,
      nivel: 'maximo',
      label: 'Máximo',
      color: 'text-red-600 bg-red-50 border-red-200',
      icon: '🔴',
    }
  }
  if (porcentaje >= 75) {
    return {
      total: totalPacas,
      pesoKg,
      capacidadKg,
      porcentaje,
      nivel: 'pesado',
      label: 'Pesado',
      color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      icon: '🟡',
    }
  }
  return {
    total: totalPacas,
    pesoKg,
    capacidadKg,
    porcentaje,
    nivel: 'ideal',
    label: 'Ideal',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: '🟢',
  }
}
