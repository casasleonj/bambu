/**
 * EmbarqueValidation Domain Service.
 *
 * Encapsulates all validation rules for Embarque operations.
 * Pure domain logic — no infrastructure dependencies.
 */

import { Carga } from '../value-objects/Carga'
import { EstadoEmbarque } from '../value-objects/EstadoEmbarque'

/**
 * Maximum units allowed per embarque.
 * Centralized constant — was duplicated across 6+ files.
 */
export const MAX_UNIDADES = 70

/**
 * Stock override tolerance: 50% overage allowed if stock > 0.
 */
export const STOCK_OVERRIDE_TOLERANCE = 0.5

/**
 * Hard cap when no stock estimate exists.
 */
export const STOCK_HARD_CAP = 30

/**
 * Weight tolerance: 110% of capacity allowed.
 */
export const PESO_TOLERANCE = 1.1

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class EmbarqueValidationService {
  /**
   * Validates that a worker can have an embarque (must have usaMoto = true).
   */
  validarTrabajadorMoto(usaMoto: boolean): ValidationResult {
    if (!usaMoto) {
      return { valid: false, errors: ['El trabajador no tiene moto asignada'] }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Validates that the carga does not exceed MAX_UNIDADES.
   */
  validarMaxUnidades(carga: Carga): ValidationResult {
    const total = carga.totalUnidades()
    if (total > MAX_UNIDADES) {
      return {
        valid: false,
        errors: [`La carga excede el maximo de ${MAX_UNIDADES} unidades (${total} unidades)`],
      }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Validates that the carga weight does not exceed capacity (with tolerance).
   */
  validarCapacidadPeso(carga: Carga, capacidadKg: number): ValidationResult {
    const peso = carga.pesoKg()
    const limite = capacidadKg * PESO_TOLERANCE

    if (peso > limite) {
      return {
        valid: false,
        errors: [
          `El peso de la carga (${peso.toFixed(1)} kg) excede la capacidad maxima (${limite.toFixed(1)} kg)`,
        ],
      }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Validates carga against stock availability.
   * If stock > 0: allows up to 50% overage.
   * If stock = 0: hard cap of 30 units total.
   */
  validarStock(
    carga: Carga,
    stockDisponible: Record<string, number> | null,
  ): ValidationResult {
    const errors: string[] = []

    if (!stockDisponible || Object.values(stockDisponible).every((s) => s === 0)) {
      // No stock: hard cap
      if (carga.totalUnidades() > STOCK_HARD_CAP) {
        errors.push(
          `Sin stock estimado: maximo ${STOCK_HARD_CAP} unidades permitidas (${carga.totalUnidades()} solicitadas)`,
        )
      }
    } else {
      // Stock available: check per-product with tolerance
      for (const [producto, cantidad] of Object.entries(carga.toJSON())) {
        const stock = stockDisponible[producto] ?? 0
        if (stock > 0) {
          const maxPermitido = Math.floor(stock * (1 + STOCK_OVERRIDE_TOLERANCE))
          if (cantidad > maxPermitido) {
            errors.push(
              `${producto}: ${cantidad} unidades excede stock disponible (${stock}) + tolerancia 50% (max: ${maxPermitido})`,
            )
          }
        } else if (cantidad > 0) {
          errors.push(`${producto}: sin stock disponible pero se solicitan ${cantidad} unidades`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Validates that the embarque state allows editing specific fields.
   * Only ABIERTO embarques can have trabajadorId, rutaId, horaSalida,
   * baseDinero, tipoMoto, or carga modified.
   */
  validarEdicionPorEstado(estado: EstadoEmbarque, camposAModificar: string[]): ValidationResult {
    if (!estado.canEdit()) {
      const camposBloqueados = camposAModificar.filter((campo) =>
        ['trabajadorId', 'rutaId', 'horaSalida', 'baseDinero', 'tipoMoto', 'carga'].includes(campo),
      )
      if (camposBloqueados.length > 0) {
        return {
          valid: false,
          errors: [
            `No se pueden modificar los campos ${camposBloqueados.join(', ')} en estado ${estado.value}`,
          ],
        }
      }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Validates that the embarque is not already closed.
   */
  validarNoCerrado(estado: EstadoEmbarque): ValidationResult {
    if (estado.isCerrado) {
      return { valid: false, errors: ['El embarque ya esta cerrado'] }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Validates that the embarque can accept gastos.
   */
  validarGastos(estado: EstadoEmbarque): ValidationResult {
    if (!estado.canModifyGastos()) {
      return {
        valid: false,
        errors: [`No se pueden agregar gastos en estado ${estado.value}`],
      }
    }
    return { valid: true, errors: [] }
  }

  /**
   * Combines multiple validations into one result.
   */
  static combinar(...results: ValidationResult[]): ValidationResult {
    const errors = results.flatMap((r) => r.errors)
    return { valid: errors.length === 0, errors }
  }
}
