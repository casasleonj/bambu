import { useEffect, useState } from 'react'

/** Hora actual que se refresca sola (por defecto cada minuto). Para etiquetas de «tiempo restante». */
export function useAhora(cadaMs = 60_000): Date {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cadaMs)
    return () => clearInterval(t)
  }, [cadaMs])
  return ahora
}
