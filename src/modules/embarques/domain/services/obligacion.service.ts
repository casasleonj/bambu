/**
 * Obligaciones — servicios de dominio puros (FASE 3, ADR-OBLIGACION-001).
 *
 * Reglas congeladas (contrato §7):
 * - `cantidadDisponible` NO se almacena: es derivada.
 *   disponible = cantidadOriginal - cantidadCumplida - cantidadAsignada.
 * - Invariante: cantidadCumplida + cantidadAsignada <= cantidadOriginal.
 * - Toda operación que incremente `cantidadAsignada` o `cantidadCumplida` debe
 *   validar contra el disponible antes de escribir (además del lock).
 */

export function calcularDisponible(
  cantidadOriginal: number,
  cantidadCumplida: number,
  cantidadAsignada: number,
): number {
  return cantidadOriginal - cantidadCumplida - cantidadAsignada
}

/**
 * Valida una asignación (incremento de `cantidadAsignada`).
 * Retorna la lista de errores (vacía si es válida).
 */
export function validarAsignacion(input: {
  cantidadOriginal: number
  cantidadCumplida: number
  cantidadAsignada: number
  cantidadNueva: number
}): string[] {
  const errores: string[] = []

  if (!Number.isInteger(input.cantidadNueva) || input.cantidadNueva <= 0) {
    errores.push('cantidad a asignar debe ser un entero positivo')
    return errores
  }

  const disponible = calcularDisponible(
    input.cantidadOriginal,
    input.cantidadCumplida,
    input.cantidadAsignada,
  )
  if (input.cantidadNueva > disponible) {
    errores.push('SOBRECONSUMO: cantidad excede el disponible de la obligación')
  }

  return errores
}

/**
 * Valida un cumplimiento (convierte asignado → cumplido).
 * Regla: no se puede cumplir más de lo asignado, y el total cumplido+asignado
 * resultante nunca supera el original.
 */
export function validarCumplimiento(input: {
  cantidadOriginal: number
  cantidadCumplida: number
  cantidadAsignada: number
  cantidadACumplir: number
}): string[] {
  const errores: string[] = []

  if (!Number.isInteger(input.cantidadACumplir) || input.cantidadACumplir <= 0) {
    errores.push('cantidad a cumplir debe ser un entero positivo')
    return errores
  }

  if (input.cantidadACumplir > input.cantidadAsignada) {
    errores.push('NO_SE_PUEDE_CUMPLIR_MAS_DE_LO_ASIGNADO')
  }

  const nuevaCumplida = input.cantidadCumplida + input.cantidadACumplir
  const nuevaAsignada = input.cantidadAsignada - input.cantidadACumplir
  if (nuevaCumplida + nuevaAsignada > input.cantidadOriginal) {
    errores.push('SOBRECONSUMO: cumplimiento excede el original')
  }

  return errores
}
