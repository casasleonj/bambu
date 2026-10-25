'use client'

// TEMPORAL-SIN-EMBARQUE(#472): ¿está activa la gestión temporal de pedidos sin
// embarque para este ADMIN y quiénes pueden ser el repartidor? Se retira junto
// con la función cuando Embarques funcione.
import { useEffect, useState } from 'react'

export interface RepartidorOpcion { id: string; nombre: string }
export interface EstadoGestionAdmin { activa: boolean; repartidores: RepartidorOpcion[] }

const APAGADA: EstadoGestionAdmin = { activa: false, repartidores: [] }

export function useGestionAdmin(esAdmin: boolean): EstadoGestionAdmin {
  const [estado, setEstado] = useState<EstadoGestionAdmin>(APAGADA)

  useEffect(() => {
    if (!esAdmin) return
    let vivo = true
    fetch('/api/pedidos/gestion-admin/estado')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { success?: boolean; activa?: boolean; repartidores?: RepartidorOpcion[] } | null) => {
        if (vivo && j?.success) setEstado({ activa: Boolean(j.activa), repartidores: j.repartidores ?? [] })
      })
      .catch(() => {
        // Sin red o error: la función simplemente no se ofrece (queda apagada).
      })
    return () => {
      vivo = false
    }
  }, [esAdmin])

  return esAdmin ? estado : APAGADA
}
