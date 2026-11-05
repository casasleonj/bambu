'use client'

import { AlertTriangle } from 'lucide-react'
import { Desplegable } from '@/components/ui/desplegable'

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
  const total = (clave: 'agua' | 'hielo') => unidadesAproximadasDe(aproximadas, clave)
  return (
    <Desplegable testid="aviso-unidades-aproximadas" tono="ambar" icono="⚠️" titulo="Unidades sin repartir por día" insignia={`${aproximadas.length} pedido${aproximadas.length === 1 ? '' : 's'}`}
      ayuda="Son pedidos antiguos que no guardaron en qué día se entregó cada parte. Sus unidades se cuentan en el día en que se creó el pedido."
      resumen={[total('agua') > 0 ? `${total('agua')} agua` : '', total('hielo') > 0 ? `${total('hielo')} hielo` : ''].filter(Boolean).join(' · ') || undefined}>
      <p className="mb-2 rounded-lg bg-white p-2 text-[11px] text-amber-900">
        Son pedidos antiguos que no guardaron en qué día se entregó cada parte. Sus unidades se cuentan en el <b>día en que se creó el pedido</b>.
        Si tu conteo físico no coincide por esto, cierra con tu conteo real. No bloquea el cierre.
      </p>
      <ul className="space-y-1 text-amber-900">
        {aproximadas.map((p) => (
          <li key={p.pedidoId} className="flex justify-between gap-3 border-b border-amber-100 py-1 last:border-0">
            <span className="font-semibold">Pedido #{p.numero ?? '—'}: {NOMBRES.filter(([k]) => p.unidades[k] > 0).map(([k, n]) => `${p.unidades[k]} de ${n}`).join(', ')}</span>
            <span className="whitespace-nowrap text-[11px]">(creado el {p.fechaCreacion.slice(0, 10)})</span>
          </li>
        ))}
      </ul>
    </Desplegable>
  )
}
