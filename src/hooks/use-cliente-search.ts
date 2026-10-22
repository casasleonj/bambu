/**
 * useClienteSearch — buscador de cliente de los modales de pedido.
 *
 * Antes filtraba SOLO en el navegador sobre `GET /api/clientes?all=true`: la
 * tabla completa con 4 relaciones (~590 KB con 400 clientes) bajo un tiempo
 * máximo de 8 s. En 2G/3G —el escenario del negocio— o con la red cargada ese
 * fetch se aborta y el buscador quedaba sin resultados (#376).
 *
 * Ahora la búsqueda va al servidor (`/api/clientes?search=`, con `pg_trgm`),
 * paginada a `LIMITE_RESULTADOS` (~10 KB), con debounce y cancelación de la
 * petición anterior. El resultado es la UNIÓN de las coincidencias de la lista
 * local ya cargada y las del servidor, ordenadas por relevancia: el servidor
 * completa lo que la lista no tiene, nunca reemplaza lo que la lista encuentra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { matchCliente, meetsMinSearchLength, scoreCliente } from '@/lib/cliente-search'
import type { Cliente } from '@/components/pedido-form-unified/types'

export const LIMITE_RESULTADOS = 8
export const DEBOUNCE_MS = 300
export const TIMEOUT_MS = 8_000

interface ResultadoRemoto {
  term: string
  items: Cliente[]
  error: boolean
}

export interface UseClienteSearchResult {
  /** Lo que se debe listar: respuesta del servidor si ya llegó; si no, coincidencias locales. */
  resultados: Cliente[]
  /** Hay una búsqueda al servidor en curso para el término actual. */
  buscando: boolean
  /** La búsqueda al servidor falló por red/timeout/5xx (no por sesión o permisos). */
  error: boolean
  /** Repite la búsqueda al servidor para el término actual. */
  reintentar: () => void
}

export function useClienteSearch(searchTerm: string, clientes: Cliente[]): UseClienteSearchResult {
  const term = searchTerm.trim()
  const valido = meetsMinSearchLength(term)

  const [remoto, setRemoto] = useState<ResultadoRemoto | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!valido) return

    const controller = new AbortController()
    let vencido = false
    const timeoutId = setTimeout(() => {
      vencido = true
      controller.abort()
    }, DEBOUNCE_MS + TIMEOUT_MS)

    const debounceId = setTimeout(() => {
      const params = new URLSearchParams({ search: term, pageSize: String(LIMITE_RESULTADOS) })
      fetch(`/api/clientes?${params.toString()}`, { credentials: 'include', signal: controller.signal })
        .then(async (res) => {
          // Sesión vencida o sin permiso: no hay nada que reintentar aquí; el
          // guard de sesión y la lista local se encargan.
          if (res.status === 401 || res.status === 403) {
            setRemoto({ term, items: [], error: false })
            return
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = (await res.json()) as { clientes?: Cliente[]; data?: Cliente[] }
          setRemoto({ term, items: data.clientes ?? data.data ?? [], error: false })
        })
        .catch(() => {
          // Cancelada por un término nuevo o por desmontar: no es un fallo.
          if (controller.signal.aborted && !vencido) return
          setRemoto({ term, items: [], error: true })
        })
        .finally(() => clearTimeout(timeoutId))
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(debounceId)
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [term, valido, intento])

  const locales = useMemo(
    () => (valido ? clientes.filter((c) => matchCliente(c, term)) : []),
    [valido, term, clientes],
  )

  const vigente = valido && remoto !== null && remoto.term === term
  const respondio = vigente && !remoto.error

  // Local ∪ servidor, ordenado por relevancia con el mismo criterio que la lista:
  // el servidor NUNCA reemplaza a lo local. Motivo (medido): la búsqueda del
  // servidor hoy no normaliza celulares con espacios ni acentos, no busca la
  // relación del contacto y devuelve los primeros N por id, no los más
  // relevantes. Unir garantiza no perder nada de lo que ya encontraba la lista
  // y, si la lista no cargó, el servidor aporta lo que pueda.
  const resultados = useMemo(() => {
    if (!respondio || !remoto) return locales
    const porId = new Map<string, Cliente>()
    for (const c of locales) porId.set(c.id, c)
    for (const c of remoto.items) porId.set(c.id, c)
    return [...porId.values()]
      .map((c, i) => ({ c, i, score: scoreCliente(c, term) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.c)
  }, [respondio, locales, remoto, term])

  const reintentar = useCallback(() => {
    setRemoto(null)
    setIntento((n) => n + 1)
  }, [])

  return {
    resultados,
    buscando: valido && !vigente,
    error: vigente && remoto.error,
    reintentar,
  }
}
