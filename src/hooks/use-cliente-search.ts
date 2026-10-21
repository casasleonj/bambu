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
 * petición anterior. Mientras responde, o si falla, se muestran las
 * coincidencias de la lista local ya cargada, para que no se pierda el
 * comportamiento instantáneo ni la búsqueda con la lista precargada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { matchCliente, meetsMinSearchLength } from '@/lib/cliente-search'
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
  // El servidor respondió sin coincidencias pero la lista local sí tiene (criterios de
  // coincidencia distintos, o 401/403): no se vacía el listado.
  const servidorVacioConLocales = respondio && remoto.items.length === 0 && locales.length > 0

  const reintentar = useCallback(() => {
    setRemoto(null)
    setIntento((n) => n + 1)
  }, [])

  return {
    resultados: respondio && !servidorVacioConLocales ? remoto.items : locales,
    buscando: valido && !vigente,
    error: vigente && remoto.error,
    reintentar,
  }
}
