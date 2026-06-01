/**
 * EstadoEmbarque Value Object.
 *
 * Encapsulates the valid states and transitions for an Embarque aggregate.
 *
 * State Machine:
 *   ABIERTO --> EN_RUTA --> CERRADO
 *      |          |
 *      |          +---> (cannot go back)
 *      |
 *      +---> CANCELADO (terminal)
 */

export type EstadoEmbarqueValue = 'ABIERTO' | 'EN_RUTA' | 'CERRADO' | 'CANCELADO'

export const ESTADOS_VALIDOS: ReadonlySet<EstadoEmbarqueValue> = new Set([
  'ABIERTO',
  'EN_RUTA',
  'CERRADO',
  'CANCELADO',
])

export const ESTADOS_TERMINALES: ReadonlySet<EstadoEmbarqueValue> = new Set([
  'CERRADO',
  'CANCELADO',
])

export class EstadoEmbarque {
  constructor(public readonly value: EstadoEmbarqueValue) {
    if (!ESTADOS_VALIDOS.has(value)) {
      throw new Error(`EstadoEmbarque invalido: ${value}. Validos: ${[...ESTADOS_VALIDOS].join(', ')}`)
    }
  }

  get isAbierto(): boolean {
    return this.value === 'ABIERTO'
  }

  get isEnRuta(): boolean {
    return this.value === 'EN_RUTA'
  }

  get isCerrado(): boolean {
    return this.value === 'CERRADO'
  }

  get isCancelado(): boolean {
    return this.value === 'CANCELADO'
  }

  get isTerminal(): boolean {
    return ESTADOS_TERMINALES.has(this.value)
  }

  /**
   * Returns a new EstadoEmbarque with the updated value.
   * Validates the transition is allowed.
   */
  transicionar(nuevoEstado: EstadoEmbarqueValue): EstadoEmbarque {
    const transicionesValidas: Record<EstadoEmbarqueValue, EstadoEmbarqueValue[]> = {
      ABIERTO: ['EN_RUTA', 'CANCELADO'],
      EN_RUTA: ['CERRADO'],
      CERRADO: [],
      CANCELADO: [],
    }

    const permitidas = transicionesValidas[this.value]
    if (!permitidas.includes(nuevoEstado)) {
      throw new Error(
        `Transicion invalida: ${this.value} -> ${nuevoEstado}. Permitidas: ${permitidas.join(', ') || 'ninguna (estado terminal)'}`,
      )
    }

    return new EstadoEmbarque(nuevoEstado)
  }

  /**
   * Returns true if the embarque can be edited (only when ABIERTO).
   */
  canEdit(): boolean {
    return this.isAbierto
  }

  /**
   * Returns true if pedidos can be assigned/removed.
   */
  canModifyPedidos(): boolean {
    return this.isAbierto
  }

  /**
   * Returns true if gastos can be added/removed.
   */
  canModifyGastos(): boolean {
    return this.isAbierto || this.isEnRuta
  }

  /**
   * Returns true if the embarque can be closed.
   */
  canCerrar(): boolean {
    return this.isAbierto || this.isEnRuta
  }

  equals(other: EstadoEmbarque): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

  toJSON(): EstadoEmbarqueValue {
    return this.value
  }
}
