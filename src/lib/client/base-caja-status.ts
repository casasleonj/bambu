/**
 * Fetch deduplicado de /api/cierre/last + /api/config?clave=BASE_DIA_<today>.
 *
 * `CajaBaseHeader` (sidebar) y `BaseCajaModal` (prompt automático) montan
 * juntos desde `(app)/layout.tsx` y necesitan exactamente los mismos dos
 * endpoints para decidir su estado inicial (¿hay base registrada hoy? ¿el
 * día ya cerró?). Antes cada uno hacía su propio fetch independiente,
 * duplicando 2 round-trips en CADA carga de cualquier página con sidebar —
 * costoso en la red 2G/3G rural para la que está pensada la app.
 *
 * Si dos llamadas con el mismo `today` llegan en el mismo ciclo síncrono
 * (mismo flush de efectos de React), la segunda reutiliza la promesa de la
 * primera en vez de disparar un fetch nuevo. La ventana de coalescing es
 * deliberadamente angosta (se limpia en un microtask, no al resolver el
 * fetch): agrupa el caso real (dos componentes montando juntos) sin
 * arriesgar quedar "pegado" a una promesa vieja para llamadas posteriores
 * no relacionadas (ej. un refetch disparado por un evento de realtime).
 */

export interface BaseCajaStatus {
  cierre: { fecha: string } | null
  /** Config BASE_DIA_<today>, null si no hay base registrada para hoy. */
  configHoy: { valor: string } | null
}

let pending: { key: string; promise: Promise<BaseCajaStatus> } | null = null

export function fetchBaseCajaStatus(today: string): Promise<BaseCajaStatus> {
  if (pending && pending.key === today) return pending.promise

  const promise = (async () => {
    const [cierreRes, configRes] = await Promise.all([
      fetch('/api/cierre/last'),
      fetch(`/api/config?clave=BASE_DIA_${today}`),
    ])
    const cierreData = cierreRes.ok ? await cierreRes.json() : { cierre: null }
    const configData = configRes.ok ? await configRes.json() : { config: null }
    return {
      cierre: cierreData.cierre ?? null,
      configHoy: configData.config ?? null,
    }
  })()

  pending = { key: today, promise }
  Promise.resolve().then(() => {
    if (pending?.promise === promise) pending = null
  })

  return promise
}
