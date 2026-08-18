/**
 * Clasificación temporal de venta libre (FASE 7, ADR-OFFLINE-001).
 *
 * Contrato §11: cada venta espontánea distingue `occurredAt` (operador),
 * `capturedAt` (dispositivo) y `serverReceivedAt` (servidor). El servidor
 * clasifica NORMAL | TARDIA | SOSPECHOSA según la diferencia temporal.
 * Una venta tardía legítima NO se bloquea: es detectable y auditable, no
 * destructiva para la operación offline.
 */

export type ClasificacionTemporal = 'NORMAL' | 'TARDIA' | 'SOSPECHOSA'

// Umbrales (ms). Documentados en ADR-OFFLINE-001; son configurables.
export const UMBRAL_TARDIA_MS = 30 * 60 * 1000 // 30 min entre captura y recepción
export const UMBRAL_SOSPECHOSA_MS = 24 * 60 * 60 * 1000 // 24h entre captura y recepción

export interface ClasificacionInput {
  occurredAt?: Date | null
  capturedAt?: Date | null
  serverReceivedAt: Date
}

export function clasificarVentaLibre(input: ClasificacionInput): ClasificacionTemporal {
  // Legacy sin occurredAt/capturedAt: no bloquear ni marcar; se trata como NORMAL.
  if (!input.occurredAt || !input.capturedAt) {
    return 'NORMAL'
  }

  const capturedMs = input.capturedAt.getTime()
  const occurredMs = input.occurredAt.getTime()
  const receivedMs = input.serverReceivedAt.getTime()

  // Inconsistencia: el operador reporta que la venta ocurrió MUCHO después de
  // capturarse (timestamp local manipulado). Señal de sospecha.
  if (occurredMs - capturedMs > UMBRAL_TARDIA_MS) {
    return 'SOSPECHOSA'
  }

  // Offline prolongado: la venta se capturó localmente y llegó mucho después.
  const capturaARecepcion = receivedMs - capturedMs
  if (capturaARecepcion > UMBRAL_SOSPECHOSA_MS) {
    return 'SOSPECHOSA'
  }
  if (capturaARecepcion > UMBRAL_TARDIA_MS) {
    return 'TARDIA'
  }

  return 'NORMAL'
}
