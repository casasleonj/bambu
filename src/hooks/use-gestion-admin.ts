'use client'

// TEMPORAL-SIN-EMBARQUE(#472): ¿está activa la gestión temporal de pedidos sin
// embarque para este ADMIN y quiénes pueden ser el repartidor? Se retira junto
// con la función cuando Embarques funcione.
import { useCallback, useEffect, useState } from 'react'

export interface RepartidorOpcion { id: string; nombre: string }
export interface EstadoGestionAdmin { activa: boolean; repartidores: RepartidorOpcion[]; estadoConsulta?: 'consultando' | 'verificado' | 'error'; reintentar?: () => void }

const APAGADA: EstadoGestionAdmin = { activa: false, repartidores: [], estadoConsulta: 'verificado' }

export function useGestionAdmin(esAdmin: boolean): EstadoGestionAdmin {
  const [estado, setEstado] = useState<EstadoGestionAdmin>({ ...APAGADA, estadoConsulta: 'consultando' })
  const [intento, setIntento] = useState(0)
  const reintentar = useCallback(() => setIntento(n => n + 1), [])

  useEffect(() => {
    if (!esAdmin) return
    let vivo = true
    // No confundir un fallo de consulta con una configuración desactivada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado({ ...APAGADA, estadoConsulta: 'consultando' })
    fetch('/api/pedidos/gestion-admin/estado')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { success?: boolean; activa?: boolean; repartidores?: RepartidorOpcion[] } | null) => {
        if (!j?.success) throw new Error('No se pudo consultar la gestión directa')
        if (vivo) setEstado({ activa: Boolean(j.activa), repartidores: j.repartidores ?? [], estadoConsulta: 'verificado' })
      })
      .catch(() => {
        if (vivo) setEstado({ ...APAGADA, estadoConsulta: 'error' })
      })
    return () => {
      vivo = false
    }
  }, [esAdmin, intento])

  return esAdmin ? { ...estado, reintentar } : APAGADA
}
