'use client'

import type { EntregaResuelta } from '@/modules/pedidos/application/dto'

const FALTA_LABEL: Record<string, string> = {
  direccion: 'la dirección escrita',
  barrio: 'el barrio',
  referencia: 'una referencia',
  ubicacion: 'una ubicación',
}

const mapsHref = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`

/**
 * Zona "Entrega" del workspace adaptativo (blueprint §3.2, plan
 * `entrega-suficiencia-plan.md` §4, F-ENTREGA-i).
 *
 * **Consume EXCLUSIVAMENTE `preview.entrega`** — NO recalcula suficiencia en
 * React (la autoridad es `resolverEntrega` en el backend). Los 3 estados son
 * experiencias distintas: SUFICIENTE (nada que pedir) · COMPLEMENTARIA
 * (puede continuar, se muestra qué falta sin marcarlo error) · INSUFICIENTE
 * (intervención obligatoria, inputs visibles, commit deshabilitado por el
 * backend vía `allowedActions`).
 *
 * PUNTO no tiene domicilio → no se renderiza.
 */
export function WorkspaceEntrega({
  entrega,
  canal,
  direccionEntrega,
  barrioEntrega,
  onDireccionChange,
  onBarrioChange,
  previewPending,
}: {
  entrega: EntregaResuelta | null | undefined
  canal: 'PUNTO' | 'DOMICILIO'
  direccionEntrega: string
  barrioEntrega: string
  onDireccionChange: (v: string) => void
  onBarrioChange: (v: string) => void
  previewPending: boolean
}) {
  if (canal !== 'DOMICILIO') return null

  if (!entrega) {
    return (
      <section data-testid="workspace-entrega" className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
        <div className="text-xs font-semibold uppercase text-gray-400">Entrega</div>
        <p className="text-xs text-gray-400" data-testid="workspace-entrega-resolviendo">
          {previewPending ? 'Resolviendo información de entrega…' : 'Elegí un cliente para resolver la entrega.'}
        </p>
      </section>
    )
  }

  const { estado, direccion, barrio, coords, faltaComplementario, faltaBloqueante } = entrega
  const resumenTexto = [direccion, barrio].filter(Boolean).join(' · ')

  const AddressInputs = (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <input
        type="text"
        placeholder="Dirección de entrega"
        value={direccionEntrega}
        onChange={(e) => onDireccionChange(e.target.value)}
        data-testid="workspace-entrega-direccion"
        className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="text"
        placeholder="Barrio"
        value={barrioEntrega}
        onChange={(e) => onBarrioChange(e.target.value)}
        data-testid="workspace-entrega-barrio"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  )

  return (
    <section
      data-testid="workspace-entrega"
      data-estado={estado}
      className={`rounded-lg border px-3 py-2 text-sm ${
        estado === 'INSUFICIENTE' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="text-xs font-semibold uppercase text-gray-400">Entrega</div>

      {estado === 'SUFICIENTE' && (
        <div data-testid="workspace-entrega-suficiente" className="mt-1 text-gray-700">
          {coords && <span className="mr-1">📍</span>}
          {resumenTexto || (coords ? 'Ubicación disponible' : 'Información de entrega resuelta')}
          {coords && (
            <a
              href={mapsHref(coords.lat, coords.lng)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="workspace-entrega-ver-ubicacion"
              className="ml-2 text-[11px] text-blue-600 hover:underline"
            >
              Ver ubicación →
            </a>
          )}
        </div>
      )}

      {estado === 'SUFICIENTE_COMPLEMENTARIA_FALTANTE' && (
        <div data-testid="workspace-entrega-complementaria" className="mt-1">
          <div className="text-gray-700">
            {coords && <span className="mr-1">📍</span>}
            {resumenTexto || (coords ? 'Ubicación disponible' : 'Información de entrega parcial')}
            {coords && (
              <a
                href={mapsHref(coords.lat, coords.lng)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="workspace-entrega-ver-ubicacion"
                className="ml-2 text-[11px] text-blue-600 hover:underline"
              >
                Ver ubicación →
              </a>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Puedes continuar. Agregar {faltaComplementario.map((f) => FALTA_LABEL[f] ?? f).join(' y ')} puede facilitar la entrega.
          </p>
          <details className="mt-1 text-[11px]">
            <summary className="cursor-pointer text-blue-600">Agregar información</summary>
            {AddressInputs}
          </details>
        </div>
      )}

      {estado === 'INSUFICIENTE' && (
        <div data-testid="workspace-entrega-insuficiente" className="mt-1">
          <p className="font-medium text-amber-900">⚠️ Necesitamos información para localizar el domicilio.</p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            Falta {faltaBloqueante.map((f) => FALTA_LABEL[f] ?? f).join(' o ')}.
          </p>
          {AddressInputs}
        </div>
      )}
    </section>
  )
}
