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
      (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
      (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
      (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
      (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
      (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
      (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
    )
  }, 0)
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
