/**
 * CapacidadInfo Value Object.
 *
 * Represents the capacity status of an embarque based on weight and limits.
 */

export type CapacidadNivel = 'ideal' | 'pesado' | 'maximo' | 'excedido'

export interface CapacidadInfoData {
  totalUnidades: number
  pesoKg: number
  capacidadKg: number
  porcentaje: number
  nivel: CapacidadNivel
}

export class CapacidadInfo {
  readonly totalUnidades: number
  readonly pesoKg: number
  readonly capacidadKg: number
  readonly porcentaje: number
  readonly nivel: CapacidadNivel

  constructor(data: CapacidadInfoData) {
    this.totalUnidades = data.totalUnidades
    this.pesoKg = data.pesoKg
    this.capacidadKg = data.capacidadKg
    this.porcentaje = data.porcentaje
    this.nivel = data.nivel
  }

  get label(): string {
    const labels: Record<CapacidadNivel, string> = {
      ideal: 'Ideal',
      pesado: 'Pesado',
      maximo: 'Maximo',
      excedido: 'Excedido',
    }
    return labels[this.nivel]
  }

  get color(): string {
    const colors: Record<CapacidadNivel, string> = {
      ideal: 'text-green-600 bg-green-50 border-green-200',
      pesado: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      maximo: 'text-red-600 bg-red-50 border-red-200',
      excedido: 'text-red-700 bg-red-100 border-red-300',
    }
    return colors[this.nivel]
  }

  get icon(): string {
    const icons: Record<CapacidadNivel, string> = {
      ideal: '🟢',
      pesado: '🟡',
      maximo: '🔴',
      excedido: '⛔',
    }
    return icons[this.nivel]
  }

  get isExcedido(): boolean {
    return this.nivel === 'excedido'
  }

  get isWithinLimit(): boolean {
    return this.nivel !== 'excedido'
  }

  /**
   * Creates CapacidadInfo from weight and capacity.
   * Uses 110% tolerance (maximo threshold at 87%, excedido > 100%).
   */
  static fromPeso(pesoKg: number, capacidadKg: number, totalUnidades: number): CapacidadInfo {
    const porcentaje = capacidadKg > 0 ? (pesoKg / capacidadKg) * 100 : 0

    let nivel: CapacidadNivel
    if (porcentaje > 100) {
      nivel = 'excedido'
    } else if (porcentaje >= 87) {
      nivel = 'maximo'
    } else if (porcentaje >= 75) {
      nivel = 'pesado'
    } else {
      nivel = 'ideal'
    }

    return new CapacidadInfo({
      totalUnidades,
      pesoKg,
      capacidadKg,
      porcentaje,
      nivel,
    })
  }

  toJSON(): CapacidadInfoData {
    return {
      totalUnidades: this.totalUnidades,
      pesoKg: this.pesoKg,
      capacidadKg: this.capacidadKg,
      porcentaje: this.porcentaje,
      nivel: this.nivel,
    }
  }
}
