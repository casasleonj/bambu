/**
 * ADR-PAGO-REPORTADO-CONFIRMADO-001 — clasificación inicial de un `Pago`.
 *
 * Un pago digital ("ya te mandé el Nequi") nace `REPORTADO`: alguien lo dijo,
 * nadie verificó que el dinero entró. El efectivo/bono nace `CONFIRMADO`: el
 * billete físico entra a la custodia del repartidor y su conciliación es el
 * cierre de embarque + `FALTANTE_CAJA`, no este flujo.
 *
 * El override `Config.METODOS_REQUIEREN_CONFIRMACION` (CSV) del ADR §2 está
 * cableado en los 6 sitios de creación de `Pago`: los route handlers leen
 * `getConfig(...)` (cacheado) y los que ya tienen un `tx` en mano usan
 * `leerMetodosRequierenConfirmacion(tx)`. Sin el config, cae al default del ADR.
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
 * Lee `Config.METODOS_REQUIEREN_CONFIRMACION` desde una tx/cliente Prisma.
 * Para código que ya tiene un `tx` en mano (domain services, repos) y no debe
 * importar el helper cacheado `getConfig` (framework). Los route handlers usan
 * `parseMetodosRequierenConfirmacion(await getConfig(...))` directamente.
 */
export async function leerMetodosRequierenConfirmacion(tx: {
  config: { findUnique: (args: { where: { clave: string } }) => Promise<{ valor: string } | null> }
}): Promise<string[]> {
  const row = await tx.config.findUnique({ where: { clave: 'METODOS_REQUIEREN_CONFIRMACION' } })
  return parseMetodosRequierenConfirmacion(row?.valor)
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
