'use client'

import { useState } from 'react'
import { UbicacionEntregaInput } from './ubicacion-entrega-input'
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
 * P1-4 (#419): en cualquier estado el usuario puede cambiar el destino de
 * ESTE pedido (dirección, barrio, link/ubicación). Lo escrito es solo del
 * pedido: nunca modifica Cliente/Negocio salvo la casilla explícita «Guardar
 * también como dirección del cliente». Con una ubicación, dirección y barrio
 * son opcionales (la autoridad sigue siendo `preview.entrega`).
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
  entregaLat,
  entregaLng,
  onUbicacionChange,
  previewPending,
  ventaRapida = false,
  guardada = null,
  destinoPropio = false,
  puedeGuardarEnCliente = false,
  guardarEnCliente = false,
  onGuardarEnClienteChange,
  onVolverAGuardada,
}: {
  entrega: EntregaResuelta | null | undefined
  canal: 'PUNTO' | 'DOMICILIO'
  direccionEntrega: string
  barrioEntrega: string
  onDireccionChange: (v: string) => void
  onBarrioChange: (v: string) => void
  entregaLat: number | null
  entregaLng: number | null
  onUbicacionChange: (lat: number | null, lng: number | null) => void
  previewPending: boolean
  /** venta rápida (sin cliente real): no hay datos de cliente que resolver; la dirección se escribe aquí. */
  ventaRapida?: boolean
  /** lo guardado del comprador (tienda o cliente) que NO cambia al escribir otro destino; null si no hay comprador real. */
  guardada?: { texto: string; origen: 'cliente' | 'negocio' } | null
  /** el pedido lleva un destino distinto al guardado (texto o ubicación propia). */
  destinoPropio?: boolean
  /** persona (no tienda) con dirección/barrio distintos: se ofrece la casilla de guardar. */
  puedeGuardarEnCliente?: boolean
  guardarEnCliente?: boolean
  onGuardarEnClienteChange?: (v: boolean) => void
  onVolverAGuardada?: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  if (canal !== 'DOMICILIO') return null

  const hayUbicacion = entregaLat != null && entregaLng != null

  const AddressInputs = (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {entrega?.coords && !hayUbicacion && (
        <p className="col-span-2 text-[11px] text-gray-600" data-testid="workspace-entrega-ubicacion-guardada">
          📍 Ubicación guardada: se usa para ubicar el pedido. Pega otro link para cambiarla solo en este pedido.
        </p>
      )}
      <UbicacionEntregaInput
        lat={entregaLat}
        lng={entregaLng}
        onChange={(la, ln) => {
          setAbierto(true)
          onUbicacionChange(la, ln)
        }}
        className="col-span-2"
      />
      <input
        type="text"
        placeholder={hayUbicacion ? 'Dirección (opcional con ubicación)' : 'Dirección de entrega'}
        value={direccionEntrega}
        onChange={(e) => {
          setAbierto(true) // el preview se recalcula al teclear: los campos no deben desmontarse
          onDireccionChange(e.target.value)
        }}
        data-testid="workspace-entrega-direccion"
        className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="text"
        placeholder={hayUbicacion ? 'Barrio (opcional)' : 'Barrio'}
        value={barrioEntrega}
        onChange={(e) => {
          setAbierto(true)
          onBarrioChange(e.target.value)
        }}
        data-testid="workspace-entrega-barrio"
        className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {guardada && (
        <p className="col-span-2 text-[11px] text-gray-500" data-testid="workspace-entrega-guardada">
          Lo que escribas es solo de este pedido.{' '}
          {guardada.origen === 'negocio' ? 'La dirección de la tienda' : 'La dirección guardada del cliente'} no cambia:{' '}
          {guardada.texto || 'sin dirección guardada'}.
        </p>
      )}
      {guardada && destinoPropio && onVolverAGuardada && (
        <button
          type="button"
          data-testid="workspace-entrega-volver-guardada"
          onClick={() => {
            onVolverAGuardada()
            setAbierto(false)
          }}
          className="col-span-2 text-left text-[11px] text-blue-600 hover:underline"
        >
          ↩︎ Volver a la dirección guardada
        </button>
      )}
      {puedeGuardarEnCliente && onGuardarEnClienteChange && (
        <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            data-testid="workspace-entrega-guardar-en-cliente"
            checked={guardarEnCliente}
            onChange={(e) => onGuardarEnClienteChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          Guardar también como dirección del cliente
        </label>
      )}
    </div>
  )

  // Un solo árbol estable: los campos son SIEMPRE el último hijo de la misma
  // <section>, así no se desmontan (ni pierden el foco) cuando el preview se
  // recalcula a `null` mientras el usuario teclea.
  const pendienteDeEscribir = !entrega && ventaRapida
  const estado = entrega ? entrega.estado : null
  const insuficiente = estado === 'INSUFICIENTE'
  const camposVisibles = abierto || insuficiente || pendienteDeEscribir
  const resumenTexto = entrega ? [entrega.direccion, entrega.barrio].filter(Boolean).join(' · ') : ''
  const coords = entrega?.coords ?? null

  const VerUbicacion = coords && (
    <a
      href={mapsHref(coords.lat, coords.lng)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="workspace-entrega-ver-ubicacion"
      className="ml-2 text-[11px] text-blue-600 hover:underline"
    >
      Ver ubicación →
    </a>
  )

  return (
    <section
      data-testid="workspace-entrega"
      data-estado={pendienteDeEscribir ? 'PENDIENTE_DE_ESCRIBIR' : (estado ?? undefined)}
      className={`rounded-lg border px-3 py-2 text-sm ${
        insuficiente || pendienteDeEscribir ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="text-xs font-semibold uppercase text-gray-400">
        {pendienteDeEscribir ? 'Entrega · dirección obligatoria' : 'Entrega'}
      </div>

      {pendienteDeEscribir && (
        // Venta rápida a domicilio: la dirección es obligatoria (decisión del PO,
        // P1-2). Aún sin vista previa se ofrecen los campos para escribirla.
        <p className="mt-0.5 text-[11px] text-amber-800" data-testid="workspace-entrega-venta-rapida">
          Escribe la dirección de entrega: queda como destino de la venta, o agrega una ubicación.
        </p>
      )}

      {!entrega && !pendienteDeEscribir && (
        <p className="text-xs text-gray-400" data-testid="workspace-entrega-resolviendo">
          {previewPending ? 'Resolviendo información de entrega…' : 'Elegí un cliente para resolver la entrega.'}
        </p>
      )}

      {entrega && destinoPropio && (
        <div className="mt-1 text-[11px]" data-testid="workspace-entrega-solo-pedido">
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Solo este pedido</span>
          {guardada && (
            <span className="ml-2 text-gray-500">Guardada: {guardada.texto || 'sin dirección'}</span>
          )}
        </div>
      )}

      {estado === 'SUFICIENTE' && (
        <div data-testid="workspace-entrega-suficiente" className="mt-1 text-gray-700">
          {coords && <span className="mr-1">📍</span>}
          {resumenTexto || (coords ? 'Ubicación disponible' : 'Información de entrega resuelta')}
          {VerUbicacion}
        </div>
      )}

      {entrega && estado === 'SUFICIENTE_COMPLEMENTARIA_FALTANTE' && (
        <div data-testid="workspace-entrega-complementaria" className="mt-1">
          <div className="text-gray-700">
            {coords && <span className="mr-1">📍</span>}
            {resumenTexto || (coords ? 'Ubicación disponible' : 'Información de entrega parcial')}
            {VerUbicacion}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Puedes continuar. Agregar {entrega.faltaComplementario.map((f) => FALTA_LABEL[f] ?? f).join(' y ')} puede facilitar la entrega.
          </p>
        </div>
      )}

      {entrega && insuficiente && (
        <div data-testid="workspace-entrega-insuficiente" className="mt-1">
          <p className="font-medium text-amber-900">⚠️ Necesitamos información para localizar el domicilio.</p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            Falta {entrega.faltaBloqueante.map((f) => FALTA_LABEL[f] ?? f).join(' o ')}.
          </p>
        </div>
      )}

      {camposVisibles ? AddressInputs : entrega && (
        <button
          type="button"
          data-testid="workspace-entrega-cambiar"
          onClick={() => setAbierto(true)}
          className="mt-1 text-[11px] text-blue-600 hover:underline"
        >
          {estado === 'SUFICIENTE' ? '✏️ Cambiar el destino de este pedido' : 'Agregar información'}
        </button>
      )}
    </section>
  )
}
