import type { Embarque } from '../types'

/**
 * Command Center (Fase 3) — resumen de "actividad" del ledger nuevo por embarque,
 * derivado del `_count` que trae `GET /api/embarques` (movimientos, recoveries,
 * sustituciones, casos de responsabilidad).
 *
 * Es solo lectura y derivado: no se persiste nada. Si el payload no trae
 * `_count` (rutas legacy), devuelve lista vacía.
 */
export interface ActividadItem {
  label: string
  count: number
  /** true si merece atención (recovery / caso abierto). */
  alerta: boolean
}

export function derivarActividad(embarque: Embarque): ActividadItem[] {
  const c = embarque._count
  if (!c) return []

  const items: ActividadItem[] = []
  if ((c.movimientos ?? 0) > 0) {
    items.push({ label: 'movimientos', count: c.movimientos as number, alerta: false })
  }
  if ((c.sustituciones ?? 0) > 0) {
    items.push({ label: 'sustituciones', count: c.sustituciones as number, alerta: false })
  }
  if ((c.recoveries ?? 0) > 0) {
    items.push({ label: 'recovery', count: c.recoveries as number, alerta: true })
  }
  if ((c.responsibilityCases ?? 0) > 0) {
    items.push({ label: 'casos', count: c.responsibilityCases as number, alerta: true })
  }
  return items
}

export function tieneAlerta(embarque: Embarque): boolean {
  return derivarActividad(embarque).some((i) => i.alerta)
}
