/**
 * Responsibility — servicios de dominio puros (FASE 6, ADR-RESPONSABILIDAD-001).
 *
 * Regla congelada (contrato §13): un `ResponsibilityCase` puede investigarse
 * sin una operación (embarque) activa -- ej. fiado vencido detectado días
 * después del cierre. `embarqueId` es opcional, pero se exige AL MENOS una
 * referencia de contexto (`embarqueId` | `clienteId` | `trabajadorId`) para
 * que el caso sea localizable. Esto se valida en aplicación, no como CHECK
 * de BD sobre múltiples columnas nullable (regla de negocio, no integridad
 * referencial).
 */

export function validarContextoResponsibilityCase(input: {
  embarqueId?: string | null
  clienteId?: string | null
  trabajadorId?: string | null
}): string[] {
  const errores: string[] = []

  if (!input.embarqueId && !input.clienteId && !input.trabajadorId) {
    errores.push('CONTEXTO_REQUERIDO: se exige al menos embarqueId, clienteId o trabajadorId')
  }

  return errores
}
