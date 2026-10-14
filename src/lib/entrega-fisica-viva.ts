/**
 * Entrega física viva (PR-1B/1C — AB-ALS-EMB-2026-10-13, Adenda v1.2 §3.1-§3.2).
 *
 * PROPUESTA DE AJUSTE respecto a F5 P1-B (`docs/AGUA_BAMBU_F5_P1B_CAPACIDAD_FISICA_v1.0.md`),
 * sujeta al gate arquitectónico del equipo: P1-B calcula las SALIDAS en vivo por
 * lectura de Pedido + ledger y no escribe `ENTREGA` ordinaria. Este modo escribe
 * el evento físico al momento de la entrega verificable (`/entrega`) y el cierre
 * lo consume en vez de reconstruirlo desde el acumulado comercial del pedido.
 * Ver docs/incidentes/PR1BC_ENTREGA_FISICA_VIVA_2026-10-14.md.
 *
 * Selección por procedencia (un mismo embarque nunca mezcla ambos caminos):
 *  1. Flag de servidor `EMBARQUE_ENTREGA_VIVA_DESDE` (ISO-8601). Sin definir =
 *     modo apagado: todo se comporta como antes de este cambio.
 *  2. Un embarque usa el modo vivo si fue creado en/después de esa fecha, O si
 *     YA tiene eventos `ENTREGA` atribuidos (rollback del flag a mitad de misión:
 *     no se puede volver a la lógica anterior sin duplicar la salida).
 *  3. Embarques anteriores a la activación = excepción histórica: conservan la
 *     lógica anterior; no se fabrican eventos retroactivos.
 */

export const FLAG_ENTREGA_VIVA = 'EMBARQUE_ENTREGA_VIVA_DESDE'

/** Valor de `metadata.captura` del evento escrito por `/entrega`. */
export const CAPTURA_ENTREGA_PEDIDO = 'ENTREGA_PEDIDO'
/** Valor de `metadata.captura` del movimiento que escribe el propio cierre. */
export const CAPTURA_CIERRE = 'CIERRE'

/** Fecha desde la que los embarques nuevos usan el modo vivo (null = apagado). */
export function entregaFisicaVivaDesde(): Date | null {
  const raw = process.env[FLAG_ENTREGA_VIVA]
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** ¿Este embarque (por su fecha de creación) cae en el modo vivo por el flag? */
export function embarqueUsaEntregaVivaPorFlag(createdAt: Date): boolean {
  const desde = entregaFisicaVivaDesde()
  return desde !== null && createdAt.getTime() >= desde.getTime()
}

/** Clave idempotente a nivel línea: `entrega:<id-evento>:<PRODUCTO>`. */
export function claveEventoEntrega(eventoEntregaId: string, producto: string): string {
  return `entrega:${eventoEntregaId}:${producto}`
}

export interface MetadataMovimiento {
  captura?: string
  pedidoId?: string
  eventoEntregaId?: string
  posCierre?: boolean
  tipoEnvase?: string
}

export function leerMetadata(raw: unknown): MetadataMovimiento {
  return raw && typeof raw === 'object' ? (raw as MetadataMovimiento) : {}
}

/** Evento `ENTREGA` que cuenta como cumplimiento de misión en la conciliación. */
export function esEntregaDeMision(raw: unknown): boolean {
  const m = leerMetadata(raw)
  if (m.captura === CAPTURA_ENTREGA_PEDIDO) return m.posCierre !== true
  // Entrega manual de botellón (POST /botellones): hecho físico propio del ledger
  // (F5 P1-B: autoridad de botellón = ledger). Sustituciones NO cuentan aquí:
  // se concilian como `cambios`.
  return m.tipoEnvase === 'ENTREGADO'
}

/** Evento cuya identidad con un Pedido no es verificable (manual / otro writer). */
export function esEntregaSinAtribucion(raw: unknown): boolean {
  const m = leerMetadata(raw)
  return m.captura !== CAPTURA_ENTREGA_PEDIDO && m.captura !== CAPTURA_CIERRE
}
