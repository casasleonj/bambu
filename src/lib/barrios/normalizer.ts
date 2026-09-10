import { normalizeName } from '@/lib/import/normalizer'

/**
 * Normalización determinista del nombre de un Barrio para búsqueda/unicidad.
 *
 * F1 (ALS Barrio/Zona §6, ajuste aprobado): esto es ÚNICAMENTE
 * normalización determinista (acentos + mayúsculas + espacios), reutilizando
 * `normalizeName` ya usado para el mismo propósito en la importación
 * histórica. NO es un sistema de matching difuso — eso (pg_trgm,
 * SAFE_MATCH/AMBIGUOUS/UNMATCHED) corresponde a la futura fase de
 * migración/reconciliación masiva (F2), no a la fundación del catálogo.
 */
export function normalizeBarrioNombre(nombre: string): string {
  return normalizeName(nombre)
}
