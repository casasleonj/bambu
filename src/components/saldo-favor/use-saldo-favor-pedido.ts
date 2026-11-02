'use client'

import { useEffect, useState } from 'react'

export interface ProyeccionReversion {
  salioDelPedido: number
  seResta: number
  yaUsado: number
  saldoActual: number
  saldoDespues: number
}

export interface MovimientoSaldoFavor {
  id: string
  tipo: 'ACREDITACION' | 'REAPLICACION' | 'REVERSION_ANULACION'
  monto: number
  origenTipo: string
  motivo: string
  fecha: string
  autor: string
}

export interface SaldoFavorPedido {
  pedido: { id: string; numero: number; estadoEntrega: string }
  cliente: { titular: string; tienda: string | null }
  proyeccion: ProyeccionReversion | null
  resultado: { revertido: number; yaUsado: number } | null
  movimientos: MovimientoSaldoFavor[]
}

export type EstadoSaldoFavor =
  | { estado: 'cargando' }
  | { estado: 'sin-conexion' }
  | { estado: 'listo'; datos: SaldoFavorPedido }

const TIEMPO_MAXIMO_MS = 8000

/**
 * Lee `GET /api/pedidos/[id]/saldo-favor`. Fetch plano (solo lectura, no se encola). Si la red falla,
 * expira o el servidor no responde bien, el estado es `sin-conexion`: la pantalla lo dice y deja
 * continuar, porque el servidor aplica la regla igual.
 */
export function useSaldoFavorPedido(pedidoId: string | null): EstadoSaldoFavor {
  const [estado, setEstado] = useState<EstadoSaldoFavor>({ estado: 'cargando' })
  const [clave, setClave] = useState(pedidoId)
  if (clave !== pedidoId) {
    setClave(pedidoId)
    setEstado({ estado: 'cargando' })
  }

  useEffect(() => {
    if (!pedidoId) return
    const control = new AbortController()
    let desmontado = false
    const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS)
    void (async () => {
      try {
        const res = await fetch(`/api/pedidos/${pedidoId}/saldo-favor`, { credentials: 'include', signal: control.signal })
        if (!res.ok) throw new Error('respuesta no válida')
        const datos = (await res.json()) as SaldoFavorPedido
        if (!desmontado) setEstado({ estado: 'listo', datos })
      } catch {
        if (!desmontado) setEstado({ estado: 'sin-conexion' })
      } finally {
        clearTimeout(reloj)
      }
    })()
    return () => { desmontado = true; clearTimeout(reloj); control.abort() }
  }, [pedidoId])

  return estado
}
