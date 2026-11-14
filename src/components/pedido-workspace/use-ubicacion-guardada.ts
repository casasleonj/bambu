'use client'

import { useEffect, useState } from 'react'
import { fetchClienteDetailFresh } from '@/lib/cliente-detail-cache'
import { aPuntoGeo, mismaUbicacion, type PuntoGeo } from '@/lib/geo/misma-ubicacion'

export interface UbicacionGuardada {
  estado: 'inactivo' | 'cargando' | 'ok' | 'error'
  destino: 'NEGOCIO' | 'CLIENTE' | null
  /** ubicación que ya tiene el destino (null = no tiene) */
  anterior: PuntoGeo | null
}

const INACTIVA: UbicacionGuardada = { estado: 'inactivo', destino: null, anterior: null }

interface DetalleConUbicacion {
  lat?: unknown
  lng?: unknown
  negocios?: Array<{ id: string; lat?: unknown; lng?: unknown }>
}

/**
 * #426: la ubicación que YA tiene el destino donde se guardaría (la tienda si el pedido es de una tienda; si no,
 * el cliente). Solo consulta cuando la persona marca la casilla: en 2G/3G no se pide nada antes.
 * Si no se puede leer, el servidor igual conserva la que haya (no pisa en silencio).
 */
export function useUbicacionGuardada(clienteId: string | null, negocioId: string | null, activo: boolean): UbicacionGuardada {
  const key = activo && clienteId ? `${clienteId}|${negocioId ?? ''}` : ''
  const [resultado, setResultado] = useState<{ key: string; valor: UbicacionGuardada } | null>(null)

  useEffect(() => {
    if (!key || !clienteId) return
    const controller = new AbortController()
    void fetchClienteDetailFresh<DetalleConUbicacion>(clienteId, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (!r.ok) {
        setResultado({ key, valor: { estado: 'error', destino: negocioId ? 'NEGOCIO' : 'CLIENTE', anterior: null } })
        return
      }
      if (negocioId) {
        const negocio = r.cliente.negocios?.find((n) => n.id === negocioId)
        setResultado({ key, valor: negocio
          ? { estado: 'ok', destino: 'NEGOCIO', anterior: aPuntoGeo(negocio.lat, negocio.lng) }
          : { estado: 'error', destino: 'NEGOCIO', anterior: null } })
        return
      }
      setResultado({ key, valor: { estado: 'ok', destino: 'CLIENTE', anterior: aPuntoGeo(r.cliente.lat, r.cliente.lng) } })
    })
    return () => controller.abort()
  }, [key, clienteId, negocioId])

  if (!key) return INACTIVA
  if (resultado?.key === key) return resultado.valor
  return { estado: 'cargando', destino: negocioId ? 'NEGOCIO' : 'CLIENTE', anterior: null }
}

/** ¿hay que preguntar qué hacer? Solo si el destino ya tiene OTRA ubicación (distinta de la nueva). */
export function hayOtraUbicacion(ubic: UbicacionGuardada, nueva: PuntoGeo | null): boolean {
  return ubic.estado === 'ok' && !!ubic.anterior && !!nueva && !mismaUbicacion(ubic.anterior, nueva)
}
