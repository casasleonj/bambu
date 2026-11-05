'use client'

import { AlertTriangle } from 'lucide-react'

export interface UnidadAproximada {
  pedidoId: string
  numero: number | null
  fechaCreacion: string
  unidades: { agua: number; hielo: number; botellon: number; bolsaAgua: number; bolsaHielo: number }
}

const NOMBRES: Array<[keyof UnidadAproximada['unidades'], string]> = [
  ['agua', 'agua'],
  ['hielo', 'hielo'],
  ['botellon', 'botellón'],
  ['bolsaAgua', 'bolsa de agua'],
  ['bolsaHielo', 'bolsa de hielo'],
]

/** Unidades de agua y hielo (las de los bloques de stock) de los pedidos sin detalle por día. */
export function unidadesAproximadasDe(lista: UnidadAproximada[] | undefined, clave: 'agua' | 'hielo') {
  return (lista ?? []).reduce((t, p) => t + p.unidades[clave], 0)
}

export default function AvisoUnidadesAproximadas({
  aproximadas,
  error,
  onReintentar,
}: {
  aproximadas?: UnidadAproximada[]
  error?: boolean
  onReintentar?: () => void
}) {
  if (error) {
    return (
      <div role="alert" data-testid="aviso-unidades-error" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" /> No se pudo calcular el reparto de unidades por día.
        </p>
        <p className="mt-1">Se muestran las cifras por fecha de creación del pedido. Puedes cerrar con tu conteo real.</p>
        {onReintentar && (
          <button type="button" onClick={onReintentar} className="mt-2 rounded border border-amber-400 px-3 py-1 text-xs font-medium">
            Reintentar
          </button>
        )}
      </div>
    )
  }
  if (!aproximadas?.length) return null
  return (
    <div data-testid="aviso-unidades-aproximadas" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" /> Unidades que no se pudieron repartir por día
      </p>
      <ul className="mt-2 space-y-1">
        {aproximadas.map((p) => (
          <li key={p.pedidoId}>
            Pedido #{p.numero ?? '—'}:{' '}
            {NOMBRES.filter(([k]) => p.unidades[k] > 0)
              .map(([k, n]) => `${p.unidades[k]} de ${n}`)
              .join(', ')}{' '}
            (creado el {p.fechaCreacion.slice(0, 10)})
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">Si tu conteo físico no coincide por esto, cierra con tu conteo real. No bloquea el cierre.</p>
    </div>
  )
}
