/**
 * Calculate total pacas in an embarque from its pedidos
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

export type CapacidadNivel = 'ideal' | 'pesado' | 'maximo' | 'excedido'

export interface CapacidadInfo {
  total: number
  nivel: CapacidadNivel
  label: string
  color: string
  icon: string
}

/**
 * Get capacity level based on total pacas
 * 50 = ideal, 60 = pesado, 65 = maximo, 70+ = excedido
 */
export function getCapacidadInfo(total: number): CapacidadInfo {
  if (total >= 70) {
    return {
      total,
      nivel: 'excedido',
      label: 'Excedido',
      color: 'text-red-600 bg-red-50 border-red-200',
      icon: '⛔',
    }
  }
  if (total >= 65) {
    return {
      total,
      nivel: 'maximo',
      label: 'Máximo',
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      icon: '🔴',
    }
  }
  if (total >= 60) {
    return {
      total,
      nivel: 'pesado',
      label: 'Pesado',
      color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      icon: '🟠',
    }
  }
  return {
    total,
    nivel: 'ideal',
    label: 'Ideal',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: '🟢',
  }
}
