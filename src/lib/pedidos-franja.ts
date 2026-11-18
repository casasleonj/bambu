/**
 * #836 F2b — «Hora acordada» del pedido (`Pedido.entregaNoAntesDe`, HH:MM de America/Bogota) y
 * su efecto: ORDENAR y AGRUPAR por tiempo restante. No avisa, no bloquea y no oculta nada.
 *
 * Franjas (solo para pedidos abiertos, con hora, previstos para HOY en Bogotá):
 *  - `ya_toca`:   la hora llegó/pasó o faltan ≤ YA_TOCA_MIN → primero, por hora.
 *  - `mas_tarde`: faltan > MAS_TARDE_MIN → al final, por hora.
 *  - `normal`:    todo lo demás (sin hora, otro día, o con hora entre ambos límites). Dentro de
 *                 «normal» los pedidos sin hora conservan su orden y los que tienen hora van
 *                 después, por hora: así van «subiendo» solos al acercarse.
 *
 * Función pura: recibe `ahora`; el reloj nunca se lee aquí (probable con hora inyectada).
 */
import { diaEntregaBogota } from '@/lib/pedidos-entregas-historial'

/** Límites de las franjas (decisión del PO, #836 F2b): constantes fáciles de cambiar. */
export const YA_TOCA_MIN = 60
export const MAS_TARDE_MIN = 180

export type Franja = 'ya_toca' | 'normal' | 'mas_tarde'

export interface PedidoConHora {
  fechaEntrega?: Date | string | null
  estadoEntrega: string
  entregaNoAntesDe?: string | null
}

export interface ResultadoFranja {
  franja: Franja
  /** Minutos que faltan para la hora acordada (negativo = ya pasó). `null` si no aplica. */
  minutosFaltantes: number | null
}

const CERRADOS: ReadonlySet<string> = new Set(['ENTREGADO', 'CANCELADO', 'ANULADO'])
const FORMATO_HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

export function esHoraValida(h: string | null | undefined): h is string {
  return typeof h === 'string' && FORMATO_HHMM.test(h)
}

/** Minutos transcurridos del día en America/Bogota (0–1439). */
export function minutosDelDiaBogota(ahora: Date): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora)
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? '0')
  return v('hour') * 60 + v('minute')
}

export function minutosDeHora(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

export function clasificarFranja(p: PedidoConHora, ahora: Date): ResultadoFranja {
  if (CERRADOS.has(p.estadoEntrega) || !p.fechaEntrega || !esHoraValida(p.entregaNoAntesDe)) {
    return { franja: 'normal', minutosFaltantes: null }
  }
  // La hora solo cuenta el día prometido: otro día no se mezcla con «hoy».
  if (diaEntregaBogota(new Date(p.fechaEntrega)) !== diaEntregaBogota(ahora)) {
    return { franja: 'normal', minutosFaltantes: null }
  }
  const faltan = minutosDeHora(p.entregaNoAntesDe) - minutosDelDiaBogota(ahora)
  if (faltan <= YA_TOCA_MIN) return { franja: 'ya_toca', minutosFaltantes: faltan }
  if (faltan > MAS_TARDE_MIN) return { franja: 'mas_tarde', minutosFaltantes: faltan }
  return { franja: 'normal', minutosFaltantes: faltan }
}

const RANGO: Record<Franja, number> = { ya_toca: 0, normal: 1, mas_tarde: 2 }

/**
 * Ordena estable por franja. No muta la entrada. Los pedidos sin hora conservan su orden
 * relativo (el que ya traía la lista, p. ej. el geográfico de la ruta).
 */
export function ordenarPorFranja<T>(items: readonly T[], ahora: Date, obtener: (t: T) => PedidoConHora): Array<T & { _franja: ResultadoFranja }> {
  return items
    .map((it, i) => ({ it, i, f: clasificarFranja(obtener(it), ahora) }))
    .sort((a, b) => {
      if (RANGO[a.f.franja] !== RANGO[b.f.franja]) return RANGO[a.f.franja] - RANGO[b.f.franja]
      const aHora = a.f.minutosFaltantes !== null
      const bHora = b.f.minutosFaltantes !== null
      if (aHora !== bHora) return aHora ? 1 : -1 // dentro de una franja, sin hora primero
      if (aHora && bHora && a.f.minutosFaltantes !== b.f.minutosFaltantes) return a.f.minutosFaltantes! - b.f.minutosFaltantes!
      return a.i - b.i
    })
    .map(({ it, f }) => ({ ...it, _franja: f }))
}

/** «En 20 min», «En 1 h 50 min», «Hora llegada», «Faltan 9 h 50 min». */
export function textoTiempoRestante(m: number | null): string | null {
  if (m === null) return null
  if (m <= 0) return m === 0 ? 'Ya es la hora' : `pasó hace ${formatear(-m)}`
  return `${m > MAS_TARDE_MIN ? 'Faltan' : 'En'} ${formatear(m)}`
}
function formatear(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
