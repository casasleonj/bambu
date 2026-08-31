/**
 * Defaults del Paso 2 del wizard de "Nuevo Embarque".
 *
 * Solo la hora de salida tiene default (= ahora). Repartidor y base de dinero
 * NO se autocompletan — decisión del PO: son sensibles al contexto y
 * autocompletarlos induce errores (dejar la base del viaje anterior, elegir el
 * repartidor equivocado por inercia).
 */

/** Hora actual en Bogotá, formato "HH:MM" para un <input type="time">. */
export function horaActualBogota(now: Date = new Date()): string {
  // en-GB da 24h "HH:MM"; forzar 2 dígitos.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`
}
