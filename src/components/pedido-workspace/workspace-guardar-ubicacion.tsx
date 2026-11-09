'use client'

import { mismaUbicacion, type PuntoGeo } from '@/lib/geo/misma-ubicacion'
import { hayOtraUbicacion, type UbicacionGuardada } from './use-ubicacion-guardada'

const fmt = (p: PuntoGeo) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`

/**
 * #426 (maqueta D aprobada): «Guardar también la ubicación» — apagada por defecto. Dice dónde se guarda (en la
 * tienda si el pedido es de una tienda; si no, en el cliente). Si el destino ya tiene OTRA ubicación no se pisa en
 * silencio: hay que elegir «Reemplazarla» o «Dejar la que ya tenía».
 */
export function WorkspaceGuardarUbicacion({
  nueva,
  nombreTienda,
  ubicacion,
  guardar,
  onGuardarChange,
  reemplazar,
  onReemplazarChange,
  disabled,
}: {
  nueva: PuntoGeo
  /** nombre de la tienda si el pedido es de una tienda; null = se guarda en el cliente */
  nombreTienda: string | null
  ubicacion: UbicacionGuardada
  guardar: boolean
  onGuardarChange: (v: boolean) => void
  reemplazar: boolean | null
  onReemplazarChange: (v: boolean) => void
  disabled?: boolean
}) {
  const destinoTexto = nombreTienda ? `la tienda ${nombreTienda}` : 'el cliente'
  const otra = hayOtraUbicacion(ubicacion, nueva)
  const igual = ubicacion.estado === 'ok' && !!ubicacion.anterior && mismaUbicacion(ubicacion.anterior, nueva)
  const titulo = nombreTienda ? 'La tienda ya tiene una ubicación' : 'El cliente ya tiene una ubicación'

  return (
    <section data-testid="workspace-guardar-ubicacion" className="space-y-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 rounded border-gray-300"
          checked={guardar}
          disabled={disabled}
          onChange={(e) => onGuardarChange(e.target.checked)}
          data-testid="guardar-ubicacion-casilla"
        />
        <span className="min-w-0">
          <span className="block font-medium text-gray-800">Guardar también la ubicación</span>
          <span className="block text-xs text-gray-500" data-testid="guardar-ubicacion-destino">Se guarda en {destinoTexto}.</span>
        </span>
      </label>

      {guardar && ubicacion.estado === 'cargando' && (
        <p role="status" className="text-xs text-gray-500" data-testid="guardar-ubicacion-cargando">Revisando si ya tiene una ubicación…</p>
      )}
      {guardar && ubicacion.estado === 'error' && (
        <p className="text-xs text-amber-800" data-testid="guardar-ubicacion-sin-revisar">
          No pudimos revisar si ya tiene una ubicación. Si la tiene, no se cambia.
        </p>
      )}
      {guardar && igual && (
        <p className="text-xs text-gray-600" data-testid="guardar-ubicacion-igual">Esa misma ubicación ya está guardada: no hace falta cambiarla.</p>
      )}
      {guardar && otra && ubicacion.anterior && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="guardar-ubicacion-otra">
          <p className="font-semibold text-amber-900">{titulo}</p>
          <p className="text-xs text-amber-900">Guardada: {fmt(ubicacion.anterior)}. La nueva: {fmt(nueva)}.</p>
          <div role="radiogroup" aria-label="Qué hacer con la ubicación guardada" className="grid gap-2">
            {[
              { valor: true, texto: 'Reemplazarla por la nueva', id: 'reemplazar' },
              { valor: false, texto: 'Dejar la que ya tenía', id: 'dejar' },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={reemplazar === o.valor}
                disabled={disabled}
                onClick={() => onReemplazarChange(o.valor)}
                data-testid={`guardar-ubicacion-${o.id}`}
                className={`min-h-[44px] rounded-lg border px-3 text-left text-sm font-medium disabled:opacity-60 ${reemplazar === o.valor ? 'border-primary bg-white ring-1 ring-primary' : 'bg-white hover:bg-gray-50'}`}
              >
                {o.texto}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-amber-900">No se cambia en silencio: lo que se reemplaza queda en el historial.</p>
        </div>
      )}
    </section>
  )
}
