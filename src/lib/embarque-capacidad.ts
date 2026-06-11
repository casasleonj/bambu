/**
 * Real weights per product unit (in KG)
 * Based on actual measurements:
 * - Paca agua: 40 bolsas × 300ml ≈ 10.0 kg (measured 9.5-10.5kg)
 * - Paca hielo: 20 bolsas × 650ml ≈ 11.0 kg (proportional to water)
 * - Botellón: 20L water + container ≈ 20.0 kg
 * - Bolsa agua: 10.0 / 40 ≈ 0.25 kg
 * - Bolsa hielo: 11.0 / 20 ≈ 0.55 kg
 */
export const PESOS_KG = {
  PACA_AGUA: 10.0,
  PACA_HIELO: 11.0,
  BOTELLON: 20.0,
  BOLSA_AGUA: 0.25,
  BOLSA_HIELO: 0.55,
} as const

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
  cPacaAguaPed?: number
  cPacaHieloPed?: number
  cBotellonFabPed?: number
  cBotellonDomPed?: number
  cBolsaAguaPed?: number
  cBolsaHieloPed?: number
  // Shape canónico (Sprint 4+)
  items?: Array<{
    producto: string
    cantPedido: number
  }>
}

function cantidadProducto(pedido: PedidoCapacidadInput, code: ProductCode): number {
  // Preferir items[] si está presente (single source of truth).
  if (pedido.items && pedido.items.length > 0) {
    return pedido.items.find(i => i.producto === code)?.cantPedido ?? 0
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
      cantidadProducto(p, 'PACA_AGUA') +
      cantidadProducto(p, 'PACA_HIELO') +
      cantidadProducto(p, 'BOTELLON') +
      cantidadProducto(p, 'BOLSA_AGUA') +
      cantidadProducto(p, 'BOLSA_HIELO')
    )
  }, 0)
}

export function calcularPesoEmbarque(pedidos: PedidoCapacidadInput[]): number {
  return pedidos.reduce((total, p) => {
    return (
      total +
      cantidadProducto(p, 'PACA_AGUA') * PESOS_KG.PACA_AGUA +
      cantidadProducto(p, 'PACA_HIELO') * PESOS_KG.PACA_HIELO +
      cantidadProducto(p, 'BOTELLON') * PESOS_KG.BOTELLON +
      cantidadProducto(p, 'BOLSA_AGUA') * PESOS_KG.BOLSA_AGUA +
      cantidadProducto(p, 'BOLSA_HIELO') * PESOS_KG.BOLSA_HIELO
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
