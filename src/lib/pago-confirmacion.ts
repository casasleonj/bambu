/**
 * ADR-PAGO-REPORTADO-CONFIRMADO-001 — clasificación inicial de un `Pago`.
 *
 * Un pago digital ("ya te mandé el Nequi") nace `REPORTADO`: alguien lo dijo,
 * nadie verificó que el dinero entró. El efectivo/bono nace `CONFIRMADO`: el
 * billete físico entra a la custodia del repartidor y su conciliación es el
 * cierre de embarque + `FALTANTE_CAJA`, no este flujo.
 *
 * La lista de métodos que requieren confirmación es configurable vía
 * `Config.METODOS_REQUIEREN_CONFIRMACION` (CSV). El default coincide con la
 * tabla del ADR §2.
 */

export type ConfirmacionInicial = 'REPORTADO' | 'CONFIRMADO'

/** Métodos que nacen `REPORTADO` salvo override de Config (ADR §2). */
export const METODOS_REQUIEREN_CONFIRMACION_DEFAULT = [
  'NEQUI',
  'TRANSFERENCIA',
  'DAVIPLATA',
] as const

/**
 * Parsea el CSV de `Config.METODOS_REQUIEREN_CONFIRMACION`. Vacío/ausente →
 * el default del ADR. Normaliza a MAYÚSCULAS y descarta entradas vacías.
 */
export function parseMetodosRequierenConfirmacion(csv?: string | null): string[] {
  if (!csv || !csv.trim()) return [...METODOS_REQUIEREN_CONFIRMACION_DEFAULT]
  const parsed = csv
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : [...METODOS_REQUIEREN_CONFIRMACION_DEFAULT]
}

/**
 * Estado de confirmación con el que nace un `Pago` según su método.
 *
 * @param metodo — valor de `MetodoPago` (case-insensitive).
 * @param metodosRequieren — lista resuelta de métodos que requieren confirmación
 *   (típicamente `parseMetodosRequierenConfirmacion(config)`); default = ADR §2.
 */
export function confirmacionInicial(
  metodo: string,
  metodosRequieren: string[] = [...METODOS_REQUIEREN_CONFIRMACION_DEFAULT],
): ConfirmacionInicial {
  return metodosRequieren.includes(metodo.toUpperCase()) ? 'REPORTADO' : 'CONFIRMADO'
}
