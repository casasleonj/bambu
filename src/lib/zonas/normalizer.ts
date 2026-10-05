import { normalizeName } from '@/lib/import/normalizer'

/**
 * Normalización determinista del nombre de una Zona para búsqueda/unicidad.
 *
 * Mismo criterio que `barrios/normalizer.ts` (ALS §6): únicamente
 * normalización determinista (acentos + mayúsculas + espacios), reutilizando
 * `normalizeName`. Sin fuzzy matching.
 */
export function normalizeZonaNombre(nombre: string): string {
  return normalizeName(nombre)
}
