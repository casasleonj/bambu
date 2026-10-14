'use client'

import { useState } from 'react'
import { parseGoogleMapsLink } from '@/lib/geo/parse-google-maps-link'

/**
 * Captura la UBICACIÓN PROPIA del pedido (destino de la entrega,
 * `Pedido.entregaLat/entregaLng`): "usar mi ubicación" o link de Google Maps.
 * No es el GPS de comprobación de la entrega (`gpsLat/gpsLng`).
 */
export function UbicacionEntregaInput({
  lat,
  lng,
  onChange,
  className = '',
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number | null, lng: number | null) => void
  className?: string
}) {
  const [linkTexto, setLinkTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const usarMiUbicacion = () => {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Este dispositivo no permite obtener la ubicación.')
      return
    }
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false)
        onChange(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setBuscando(false)
        setError('No se pudo obtener la ubicación. Escribe la dirección o pega un link de Maps.')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  const aplicarLink = (texto: string) => {
    setLinkTexto(texto)
    setError(null)
    if (!texto.trim()) return
    const parsed = parseGoogleMapsLink(texto)
    if (parsed) {
      onChange(parsed.lat, parsed.lng)
      setLinkTexto('')
    } else {
      setError('Link no reconocido. Pega un link con coordenadas o usa tu ubicación.')
    }
  }
  return (
      <div className={`space-y-1 ${className}`} data-testid="workspace-entrega-ubicacion">
        {lat != null && lng != null ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-700">
            <span data-testid="workspace-entrega-ubicacion-fijada">📍 Ubicación fijada ({lat.toFixed(5)}, {lng.toFixed(5)})</span>
            <button type="button" data-testid="workspace-entrega-ubicacion-quitar" onClick={() => onChange(null, null)} className="text-red-600 hover:underline">Quitar</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="workspace-entrega-usar-ubicacion"
              onClick={usarMiUbicacion}
              disabled={buscando}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {buscando ? 'Obteniendo…' : '📍 Usar mi ubicación actual'}
            </button>
            <input
              type="text"
              placeholder="o pega un link de Google Maps"
              value={linkTexto}
              onChange={(e) => aplicarLink(e.target.value)}
              data-testid="workspace-entrega-link"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
            />
          </div>
        )}
        {error && <p className="text-[11px] text-red-600" data-testid="workspace-entrega-ubicacion-error">{error}</p>}
      </div>
  )
}
