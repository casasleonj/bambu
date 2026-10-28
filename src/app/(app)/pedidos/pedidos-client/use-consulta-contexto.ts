'use client'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'

/** #515: cada consulta conserva sus filtros sin consumir fechas de Pedidos. */
export function useParametroConsulta<T extends string>(key: string, fallback: T, validos?: readonly T[]) {
  const params = useShallowSearchParams()
  const raw = params.get(key)
  const value = raw !== null && (!validos || validos.includes(raw as T)) ? raw as T : fallback
  const set = (next: T) => params.set({ [key]: next === fallback ? undefined : next }, { history: 'replace' })
  return [value, set] as const
}
