'use client'

import { useEffect, useRef, useState } from 'react'
import { parseGoogleMapsLink, isShortMapsUrl } from '@/lib/geo/parse-google-maps-link'

const RESOLVER_LINK_DEBOUNCE_MS = 500

/**
 * Captura la UBICACIÓN PROPIA del pedido (destino de la entrega,
 * `Pedido.entregaLat/entregaLng`) a partir del link de Google Maps que manda el
 * cliente (#459). No toma el GPS de quien digita: no es la posición del cliente.
 * Tampoco es el GPS de comprobación de la entrega (`gpsLat/gpsLng`).
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
  const [resolviendo, setResolviendo] = useState(false)
  // callback estable: un re-render del padre no debe reiniciar la resolución en curso.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Los links que manda WhatsApp suelen ser acortados (maps.app.goo.gl): no
  // traen coordenadas y se resuelven en el servidor (allowlist SSRF, ver
  // /api/geo/expand-maps). Se espera a que termine de pegarse (debounce).
  useEffect(() => {
    const texto = linkTexto.trim()
    if (!texto || !isShortMapsUrl(texto)) return
    let cancelado = false
    const timer = setTimeout(() => {
      setResolviendo(true)
      fetch('/api/geo/expand-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: texto }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}))
          if (cancelado) return
          const coords = body?.data?.coords ?? body?.coords ?? null
          if (r.ok && coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
            setError(null)
            setLinkTexto('')
            onChangeRef.current(coords.lat, coords.lng)
          } else {
            setError('No se pudo leer ese link. Pega el link largo de Maps o escribe la dirección.')
          }
        })
        .catch(() => {
          if (!cancelado) setError('Sin conexión para leer ese link. Escribe la dirección o intenta de nuevo.')
        })
        .finally(() => setResolviendo(false))
    }, RESOLVER_LINK_DEBOUNCE_MS)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [linkTexto])

  const aplicarLink = (texto: string) => {
    setLinkTexto(texto)
    setError(null)
    if (!texto.trim()) return
    // acortado: lo resuelve el efecto de arriba (con debounce), no es un error.
    if (isShortMapsUrl(texto.trim())) return
    const parsed = parseGoogleMapsLink(texto)
    if (parsed) {
      onChange(parsed.lat, parsed.lng)
      setLinkTexto('')
    } else {
      setError('Link no reconocido. Pega un link de Maps con coordenadas o escribe la dirección.')
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
          <input
            type="text"
            placeholder="Pega el link de ubicación que te mandó el cliente"
            value={linkTexto}
            onChange={(e) => aplicarLink(e.target.value)}
            data-testid="workspace-entrega-link"
            className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
          />
        )}
        {resolviendo && <p className="text-[11px] text-gray-500" data-testid="workspace-entrega-link-resolviendo">Leyendo el link…</p>}
        {error && <p className="text-[11px] text-red-600" data-testid="workspace-entrega-ubicacion-error">{error}</p>}
      </div>
  )
}
