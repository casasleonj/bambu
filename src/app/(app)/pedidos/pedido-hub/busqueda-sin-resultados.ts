/**
 * #788 — estado de la búsqueda del Hub cuando no hay pedidos en el período consultado
 * (maqueta A aprobada por el PO el 16-11-2026).
 *
 * La lista abre en «Hoy». Buscar un cliente que no tiene pedidos hoy da una lista vacía y,
 * para quien busca, «el cliente no aparece». Esta función decide qué mostrar sin tocar el
 * rango por su cuenta: ampliar a «Todos los períodos» es siempre una acción explícita.
 *
 * Es pura: recibe las señales de `useConsultaPedidos` y devuelve el estado a pintar.
 */
import type { FiltrosConsultaPedidos } from '@/lib/pedidos-consulta'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

export type EstadoBusquedaSinResultados =
  | { tipo: 'normal' }
  | { tipo: 'vacio'; busqueda: string; periodo: string }
  | { tipo: 'cargando'; busqueda: string }
  | { tipo: 'error'; busqueda: string; volver: string }
  | { tipo: 'resultado'; busqueda: string; volver: string }
  | { tipo: 'sin-resultados-en-todos'; busqueda: string; volver: string }

export interface EntradaEstadoBusqueda {
  /** Filtros que dicta la URL ahora mismo. */
  filtrosUrl: FiltrosConsultaPedidos
  /** Última lectura completada, con los filtros con los que se hizo. */
  lectura: { filtros: FiltrosConsultaPedidos; total: number } | null
  /** La URL pide una consulta distinta de la última lectura. */
  cambiando: boolean
  /** La última solicitud falló. */
  hayError: boolean
  /** Filas que se verían en la lista (incluye las pendientes de sincronizar). */
  filasVisibles: number
  /** Filtros que había justo antes de pulsar «Ver todos los períodos»; null si no se pulsó. */
  filtrosPrevios: FiltrosConsultaPedidos | null
  /** Hoy en Bogotá, YYYY-MM-DD. */
  hoy: string
}

const DIA_MS = 86_400_000
const ayerDe = (hoy: string): string => dayInBogota(new Date(startOfDayInBogota(hoy).getTime() - DIA_MS))

/** «de hoy», «de ayer», «de ayer y hoy» o «del período», según el rango consultado. */
function periodoDe(f: FiltrosConsultaPedidos, hoy: string): string {
  const ayer = ayerDe(hoy)
  if (f.desde === hoy && f.hasta === hoy) return 'de hoy'
  if (f.desde === ayer && f.hasta === ayer) return 'de ayer'
  if (f.desde === ayer && f.hasta === hoy) return 'de ayer y hoy'
  return 'del período'
}

/** A qué se vuelve: «Hoy» si el rango anterior era exactamente hoy, si no «período anterior». */
function destinoVolver(previos: FiltrosConsultaPedidos, hoy: string): string {
  return !previos.all && previos.desde === hoy && previos.hasta === hoy ? 'Hoy' : 'período anterior'
}

export function derivarEstadoBusqueda(e: EntradaEstadoBusqueda): EstadoBusquedaSinResultados {
  const busqueda = e.filtrosUrl.search.trim()
  if (!busqueda) return { tipo: 'normal' }

  // Tras «Ver todos los períodos»: el rango pasó a Todos y se recuerda el anterior.
  if (e.filtrosPrevios && e.filtrosUrl.all) {
    const volver = destinoVolver(e.filtrosPrevios, e.hoy)
    if (e.cambiando) return e.hayError ? { tipo: 'error', busqueda, volver } : { tipo: 'cargando', busqueda }
    if (!e.lectura?.filtros.all) return { tipo: 'normal' }
    return e.lectura.total > 0
      ? { tipo: 'resultado', busqueda, volver }
      : { tipo: 'sin-resultados-en-todos', busqueda, volver }
  }

  if (!e.cambiando && e.lectura && !e.lectura.filtros.all && e.lectura.total === 0 && e.filasVisibles === 0) {
    return { tipo: 'vacio', busqueda, periodo: periodoDe(e.lectura.filtros, e.hoy) }
  }
  return { tipo: 'normal' }
}

export const tituloVacio = (periodo: string, busqueda: string): string => `Sin pedidos ${periodo} para «${busqueda}»`
export const textoVolver = (destino: string): string => (destino === 'Hoy' ? 'Volver a Hoy' : 'Volver al período anterior')
