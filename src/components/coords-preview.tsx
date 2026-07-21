'use client'

/**
 * CoordsPreview — feedback client-side de qué tan parseable es el link.
 *
 * Detecta el formato del link de Google Maps y muestra:
 *   - ✓ Verde: "📍 4.6520, -74.0540 detectado"
 *   - ⚠️ Amber: "Link no reconocido, pegá el link 'Compartir' de Google Maps"
 *
 * Para links acortados (maps.app.goo.gl, goo.gl/maps) llama a la API
 * server-side /api/geo/expand-maps para resolverlos de forma segura.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  parseGoogleMapsLink,
  isShortMapsUrl,
  type ParsedCoords,
} from '@/lib/geo/parse-google-maps-link'

interface CoordsPreviewProps {
  url: string | null | undefined
}

export function CoordsPreview({ url }: CoordsPreviewProps) {
  const [expanded, setExpanded] = useState<{ coords: ParsedCoords | null; loading: boolean; error?: string } | null>(null)

  const immediateResult = useMemo(() => {
    if (!url || !url.trim()) return null
    return parseGoogleMapsLink(url)
  }, [url])

  useEffect(() => {
    if (!url || !url.trim()) {
      setExpanded(null)
      return
    }
    if (!isShortMapsUrl(url)) {
      setExpanded(null)
      return
    }

    let cancelled = false
    setExpanded({ coords: null, loading: true })
    fetch('/api/geo/expand-maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setExpanded({ coords: null, loading: false, error: data.formErrors?.[0] || 'No se pudo expandir el link' })
          return
        }
        setExpanded({ coords: data.coords || null, loading: false })
      })
      .catch(() => {
        if (!cancelled) setExpanded({ coords: null, loading: false, error: 'Error de red' })
      })

    return () => { cancelled = true }
  }, [url])

  if (!url || !url.trim()) return null

  // Short URLs — resolver via API.
  if (isShortMapsUrl(url)) {
    if (expanded?.loading) {
      return (
        <div className="mt-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 flex items-center gap-2" data-testid="coords-preview-short-loading">
          <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          Resolviendo link acortado…
        </div>
      )
    }

    if (expanded?.coords) {
      return (
        <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 flex items-center gap-1.5" data-testid="coords-preview-short-ok">
          <span>📍</span>
          <span>
            <span className="font-medium">Detectado:</span>{' '}
            {expanded.coords.lat.toFixed(6)}, {expanded.coords.lng.toFixed(6)}
          </span>
        </div>
      )
    }

    return (
      <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5" data-testid="coords-preview-short">
        <span className="font-medium">⚠️ Link acortado.</span>{' '}
        {expanded?.error || 'No se pudo resolver. Abrí Google Maps → toca Compartir → Copiar enlace y pegá ese link largo.'}
      </div>
    )
  }

  // Link reconocido con coords.
  if (immediateResult) {
    return (
      <div
        className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 flex items-center gap-1.5"
        data-testid="coords-preview-ok"
      >
        <span>📍</span>
        <span>
          <span className="font-medium">Detectado:</span>{' '}
          {immediateResult.lat.toFixed(6)}, {immediateResult.lng.toFixed(6)}
        </span>
        <span className="text-emerald-600/70 text-[10px] uppercase tracking-wide">
          ({immediateResult.source})
        </span>
      </div>
    )
  }

  // Link no reconocido.
  return (
    <div
      className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
      data-testid="coords-preview-unknown"
    >
      <span className="font-medium">⚠️ Link no reconocido.</span>{' '}
      Pegá el link &quot;Compartir&quot; de Google Maps. Formatos soportados:
      <code className="block mt-1 text-[11px] text-amber-800 bg-amber-100/50 rounded px-1.5 py-0.5 font-mono">
        https://maps.google.com/?q=4.65,-74.05
      </code>
    </div>
  )
}
