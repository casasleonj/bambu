'use client'

import { useCallback, useState } from 'react'
import { fetchClienteDetailFresh } from '@/lib/cliente-detail-cache'
import { buildPropuestas, type ClienteDetalleParaPropuesta, type Propuesta } from './build-propuestas'

export interface PedidoPropuestaState {
  propuestas: Propuesta[]
  loading: boolean
  /** true una vez que se intentó cargar (para distinguir "aún no" de "no hay"). */
  cargado: boolean
  load: (clienteId: string) => void
  clear: () => void
}

/**
 * Carga bajo demanda de propuestas de "Repetir" (blueprint §3). Igual que el
 * patrón de consumo: NO se dispara solo (offline-first, 2G/3G) — el usuario
 * pide explícitamente "repetir un pedido anterior". Reusa el mismo endpoint
 * (`GET /api/clientes/[id]`) que ya alimenta fiado/patrón.
 */
export function usePedidoPropuesta(): PedidoPropuestaState {
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)

  const load = useCallback((clienteId: string) => {
    if (!clienteId || clienteId === 'CONSUMIDOR_FINAL') return
    setLoading(true)
    fetchClienteDetailFresh<ClienteDetalleParaPropuesta>(clienteId)
      .then((result) => {
        setLoading(false)
        setCargado(true)
        setPropuestas(result.ok ? buildPropuestas(result.cliente) : [])
      })
      .catch(() => {
        setLoading(false)
        setCargado(true)
        setPropuestas([])
      })
  }, [])

  const clear = useCallback(() => {
    setPropuestas([])
    setLoading(false)
    setCargado(false)
  }, [])

  return { propuestas, loading, cargado, load, clear }
}
