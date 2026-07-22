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

type ExpandedState =
  | { coords: ParsedCoords | null; loading: boolean; error?: string }
  | null

const DEBOUNCE_MS = 500

export function CoordsPreview({ url }: CoordsPreviewProps) {
  const [expanded, setExpanded] = useState<ExpandedState>(null)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [fetchUrl, setFetchUrl] = useState<string | null>(null)

  // Render-time synchronization: reset cuando el link deja de ser corto
  // o desaparece. Este es el patrón documentado de React para ajustar estado
  // derivado de props sin necesitar un effect.
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) {
    setPrevUrl(url)
    if (!url || !url.trim() || !isShortMapsUrl(url)) {
      setExpanded(null)
      setExpandedUrl(null)
      setFetchUrl(null)
    }
  }

  // Render-time loading: cuando el URL debounced cambia a un link corto
  // válido, mostramos el estado de carga sin necesitar setState en el body
  // del effect.
  if (fetchUrl && fetchUrl !== expandedUrl) {
    setExpandedUrl(fetchUrl)
    setExpanded({ coords: null, loading: true })
  }

  const immediateResult = useMemo(() => {
    if (!url || !url.trim()) return null
    return parseGoogleMapsLink(url)
  }, [url])

  // Debounce: solo resolvemos links cortos después de que el usuario deje de
  // escribir. En 2G/3G rural esto evita una tormenta de requests por tecla.
  useEffect(() => {
    if (!url || !url.trim() || !isShortMapsUrl(url)) return
    const timeout = setTimeout(() => {
      setFetchUrl(url)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [url])

  // Fetch de la expansión server-side.
  useEffect(() => {
    if (!fetchUrl || !isShortMapsUrl(fetchUrl)) return
    let cancelled = false
    fetch('/api/geo/expand-maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fetchUrl }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setExpanded({
            coords: null,
            loading: false,
            error: data.error?.formErrors?.[0] || data.error?.message || 'No se pudo expandir el link',
          })
          return
        }
        setExpanded({ coords: data.coords || null, loading: false })
      })
      .catch(() => {
        if (!cancelled) setExpanded({ coords: null, loading: false, error: 'Error de red' })
      })

    return () => { cancelled = true }
  }, [fetchUrl])

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
