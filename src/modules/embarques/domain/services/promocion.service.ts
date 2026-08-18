/**
 * Promociones/regalos — servicios de dominio puros (FASE 8, ADR-PROMOCION-001).
 *
 * Contrato §17:
 * - Un regalo autorizado consume inventario exactamente una vez.
 * - Debe existir autorización auditable (autorizadoPorId obligatorio).
 * - Una promoción NO se convierte en un cobro ficticio; el consumo se registra
 *   en el ledger físico (EmbarqueMovimiento tipo PROMOCION) aunque el precio sea
 *   cero.
 */

export function validarPromocion(input: {
  producto: string
  cantidad: number
  autorizadoPorId?: string | null
}): string[] {
  const errores: string[] = []

  if (!input.autorizadoPorId) {
    errores.push('promocion exige autorizadoPorId (autorización auditable)')
  }
  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    errores.push('cantidad debe ser un entero positivo')
  }
  if (!input.producto || input.producto.trim() === '') {
    errores.push('producto es obligatorio')
  }

  return errores
}
