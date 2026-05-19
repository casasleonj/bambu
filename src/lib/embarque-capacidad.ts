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
  cPacaAguaPed: 10.0,
  cPacaHieloPed: 11.0,
  cBotellonFabPed: 20.0,
  cBotellonDomPed: 20.0,
  cBolsaAguaPed: 0.25,
  cBolsaHieloPed: 0.55,
} as const

/**
 * Calculate total pacas (unit count) for reference
 * This is what the repartidor sees as "what I'm carrying"
 */
export function calcularPacasEmbarque(pedidos: Array<{
  cPacaAguaPed?: number
  cPacaHieloPed?: number
  cBotellonFabPed?: number
  cBotellonDomPed?: number
  cBolsaAguaPed?: number
  cBolsaHieloPed?: number
}>): number {
  return pedidos.reduce((total, p) => {
    return (
      total +
      (p.cPacaAguaPed || 0) +
      (p.cPacaHieloPed || 0) +
      (p.cBotellonFabPed || 0) +
      (p.cBotellonDomPed || 0) +
      (p.cBolsaAguaPed || 0) +
      (p.cBolsaHieloPed || 0)
    )
  }, 0)
}

/**
 * Calculate total weight in KG for capacity checking
 * Uses real weights per product unit
 */
export function calcularPesoEmbarque(pedidos: Array<{
  cPacaAguaPed?: number
  cPacaHieloPed?: number
  cBotellonFabPed?: number
  cBotellonDomPed?: number
  cBolsaAguaPed?: number
  cBolsaHieloPed?: number
}>): number {
  return pedidos.reduce((total, p) => {
    return (
      total +
      (p.cPacaAguaPed || 0) * PESOS_KG.cPacaAguaPed +
      (p.cPacaHieloPed || 0) * PESOS_KG.cPacaHieloPed +
      (p.cBotellonFabPed || 0) * PESOS_KG.cBotellonFabPed +
      (p.cBotellonDomPed || 0) * PESOS_KG.cBotellonDomPed +
      (p.cBolsaAguaPed || 0) * PESOS_KG.cBolsaAguaPed +
      (p.cBolsaHieloPed || 0) * PESOS_KG.cBolsaHieloPed
    )
  }, 0)
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

/**
 * Get capacity level based on weight vs motorcycle capacity
 * Thresholds: ≤75% ideal, ≤87% pesado, ≤98% máximo, >100% excedido
 */
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
