/**
 * Recovery — servicios de dominio puros (FASE 4, ADR-RECUPERACION-001).
 *
 * Reglas congeladas (contrato §3/§4):
 * - `sourceEventId` y `cantidadDisponibleEnOrigen` son NULLABLES: un FALTANTE
 *   no tiene evento físico de origen consumible.
 * - Invariante: 0 <= cantidadAplicada <= cantidad.
 * - SOBRANTE: sourceEventId = EmbarqueMovimiento.id (origen físico).
 * - FALTANTE: sourceEventId = NULL (no se inventa un evento físico de origen).
 */

export type RecoveryTipo = 'SOBRANTE' | 'FALTANTE'

export function validarRecoveryDecision(input: {
  tipo: RecoveryTipo
  cantidad: number
  cantidadAplicada: number
  sourceEventId?: string | null
}): string[] {
  const errores: string[] = []

  if (input.tipo !== 'SOBRANTE' && input.tipo !== 'FALTANTE') {
    errores.push('tipo debe ser SOBRANTE o FALTANTE')
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    errores.push('cantidad debe ser un entero positivo')
  }

  if (!Number.isInteger(input.cantidadAplicada) || input.cantidadAplicada < 0) {
    errores.push('cantidadAplicada debe ser un entero no negativo')
  } else if (input.cantidadAplicada > input.cantidad) {
    errores.push('cantidadAplicada no puede exceder cantidad')
  }

  if (input.tipo === 'SOBRANTE') {
    if (!input.sourceEventId) {
      errores.push('SOBRANTE exige sourceEventId')
    }
  } else {
    // FALTANTE: NO inventar un evento físico de origen (contrato §3).
    if (input.sourceEventId) {
      errores.push('FALTANTE no debe tener sourceEventId')
    }
  }

  return errores
}
