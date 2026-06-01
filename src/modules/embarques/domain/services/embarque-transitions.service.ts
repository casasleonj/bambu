/**
 * EmbarqueTransitions Domain Service.
 *
 * Encapsulates all state transition logic for Embarque aggregates.
 * Pure domain logic — no infrastructure dependencies.
 */

import { EstadoEmbarque, type EstadoEmbarqueValue } from '../value-objects/EstadoEmbarque'

export interface TransitionResult {
  success: boolean
  nuevoEstado: EstadoEmbarqueValue
  error?: string
}

export class EmbarqueTransitionsService {
  /**
   * Validates and executes ABIERTO -> EN_RUTA transition.
   */
  enviar(embarqueEstado: EstadoEmbarque): TransitionResult {
    try {
      const nuevoEstado = embarqueEstado.transicionar('EN_RUTA')
      return { success: true, nuevoEstado: nuevoEstado.value }
    } catch (error) {
      return {
        success: false,
        nuevoEstado: embarqueEstado.value,
        error: error instanceof Error ? error.message : 'Transicion fallida',
      }
    }
  }

  /**
   * Validates and executes ABIERTO/EN_RUTA -> CERRADO transition.
   */
  cerrar(embarqueEstado: EstadoEmbarque): TransitionResult {
    try {
      const nuevoEstado = embarqueEstado.transicionar('CERRADO')
      return { success: true, nuevoEstado: nuevoEstado.value }
    } catch (error) {
      return {
        success: false,
        nuevoEstado: embarqueEstado.value,
        error: error instanceof Error ? error.message : 'Transicion fallida',
      }
    }
  }

  /**
   * Validates and executes ABIERTO -> CANCELADO transition.
   */
  cancelar(embarqueEstado: EstadoEmbarque): TransitionResult {
    try {
      const nuevoEstado = embarqueEstado.transicionar('CANCELADO')
      return { success: true, nuevoEstado: nuevoEstado.value }
    } catch (error) {
      return {
        success: false,
        nuevoEstado: embarqueEstado.value,
        error: error instanceof Error ? error.message : 'Transicion fallida',
      }
    }
  }

  /**
   * Checks if a transition is valid without executing it.
   */
  puedeTransicionar(estadoActual: EstadoEmbarque, nuevoEstado: EstadoEmbarqueValue): boolean {
    try {
      estadoActual.transicionar(nuevoEstado)
      return true
    } catch {
      return false
    }
  }
}
