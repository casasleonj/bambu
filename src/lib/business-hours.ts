/**
 * Cálculo de tiempo hábil transcurrido (Bogotá) entre dos turnos de trabajo
 * (ej. 6:00-12:00 y 14:00-17:00). Usado para detectar pedidos "olvidados":
 * llevan más de N horas hábiles pendientes/en ruta, sin importar cuándo
 * exactamente se crearon.
 *
 * Horas fuera de los turnos (almuerzo, noche, madrugada) NO cuentan.
 */

const BOGOTA_TZ = 'America/Bogota'

export interface Turno {
  /** "HH:MM" */
  inicio: string
  /** "HH:MM" */
  fin: string
}

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart)
  const end = Math.min(aEnd, bEnd)
  return Math.max(0, end - start) / 60_000
}

/**
 * Minutos hábiles transcurridos entre `desde` y `hasta`, contando solo los
 * minutos que caen dentro de alguno de los `turnos` (por día, Bogotá).
 * `hasta <= desde` → 0. Recorre día por día (cap de 366 días como guard).
 */
export function minutosHabilesTranscurridos(desde: Date, hasta: Date, turnos: Turno[]): number {
  if (hasta.getTime() <= desde.getTime() || turnos.length === 0) return 0

  let total = 0
  let cursorStr = desde.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ })
  const hastaStr = hasta.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ })

  for (let guard = 0; guard < 366; guard++) {
    for (const turno of turnos) {
      const turnoStart = new Date(`${cursorStr}T${turno.inicio}:00-05:00`).getTime()
      const turnoEnd = new Date(`${cursorStr}T${turno.fin}:00-05:00`).getTime()
      total += overlapMinutes(desde.getTime(), hasta.getTime(), turnoStart, turnoEnd)
    }
    if (cursorStr === hastaStr) break
    const next = new Date(`${cursorStr}T00:00:00-05:00`)
    next.setDate(next.getDate() + 1)
    cursorStr = next.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ })
  }

  return total
}

export function horasHabilesTranscurridas(desde: Date, hasta: Date, turnos: Turno[]): number {
  return minutosHabilesTranscurridos(desde, hasta, turnos) / 60
}
