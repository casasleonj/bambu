import { useState, useEffect, useRef } from 'react'
import type { Trabajador, Ruta } from '@/app/(app)/embarques/embarques-client/types'

interface Seed {
  trabajadores: Trabajador[]
  rutas: Ruta[]
}

/**
 * Catálogo de repartidores/rutas para el modal de embarque. Fetch-once (igual
 * patrón que useProductosDomicilio): no se re-descarga en cada cambio de
 * filtro/polling de /embarques, porque son catálogos casi estáticos.
 * Trade-off aceptado: un repartidor o ruta creado durante la sesión no
 * aparece en el dropdown hasta recargar la página (flujo administrativo de
 * baja frecuencia, no algo que cambie mid-turno).
 */
export function useRepartidoresYRutas(seed?: Seed) {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>(seed?.trabajadores || [])
  const [rutas, setRutas] = useState<Ruta[]>(seed?.rutas || [])
  const fetchedRef = useRef(Boolean(seed?.trabajadores?.length || seed?.rutas?.length))

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    ;(async () => {
      try {
        const [tRes, rRes] = await Promise.all([
          fetch('/api/trabajadores?rol=REPARTIDOR&activo=true&usaMoto=true', { credentials: 'include' }),
          fetch('/api/rutas?all=true', { credentials: 'include' }),
        ])
        const [tJson, rJson] = await Promise.all([tRes.json(), rRes.json()])
        setTrabajadores(tJson.trabajadores || [])
        setRutas(rJson.rutas || [])
      } catch {
        // Mantiene el seed (si había) o listas vacías; el modal de embarque
        // simplemente mostrará dropdowns vacíos si esto falla.
      }
    })()
  }, [])

  return { trabajadores, rutas }
}
