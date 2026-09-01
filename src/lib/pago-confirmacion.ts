/**
 * ADR-PAGO-REPORTADO-CONFIRMADO-001 — clasificación inicial de un `Pago`.
 *
 * Un pago digital ("ya te mandé el Nequi") nace `REPORTADO`: alguien lo dijo,
 * nadie verificó que el dinero entró. El efectivo/bono nace `CONFIRMADO`: el
 * billete físico entra a la custodia del repartidor y su conciliación es el
 * cierre de embarque + `FALTANTE_CAJA`, no este flujo.
 *
 * El override `Config.METODOS_REQUIEREN_CONFIRMACION` (CSV) descrito en el ADR
 * §2 se cableará junto con el endpoint de confirmación (`/api/pagos/[id]/confirmar`),
 * donde leer `Config` es natural. Hasta entonces todos los sitios de creación
 * usan el default del ADR vía `confirmacionInicial(metodo)` — así el route de
 * venta libre y el cierre de embarque no divergen. `parseMetodosRequierenConfirmacion`
 * ya está listo para ese cableado.
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

/**
 * Campos de confirmación para el `data` de `pago.create` / `createMany`.
 *
 * Coherente con el backfill de la migración: un pago que nace `CONFIRMADO`
 * (efectivo/bono, auto-confirmado por regla de método) lleva `confirmadoAt`
 * seteado y `confirmadoPorId` NULL — igual que las filas históricas. Así
 * cualquier consulta "confirmados en el período X" por `confirmadoAt` incluye
 * tanto lo histórico como las ventas de contado posteriores.
 * `confirmadoPorId` solo se llena cuando un humano confirma vía el endpoint.
 */
export function datosConfirmacionInicial(
  metodo: string,
  metodosRequieren?: string[],
): { confirmacion: ConfirmacionInicial; confirmadoAt?: Date } {
  const confirmacion = confirmacionInicial(metodo, metodosRequieren)
  return confirmacion === 'CONFIRMADO'
    ? { confirmacion, confirmadoAt: new Date() }
    : { confirmacion }
}
