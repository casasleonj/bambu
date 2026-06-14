'use client'

/**
 * CoordsPreview — feedback client-side de qué tan parseable es el link.
 *
 * Detecta el formato del link de Google Maps y muestra:
 *   - ✓ Verde: "📍 4.6520, -74.0540 detectado"
 *   - ⚠️ Amber: "Link no reconocido, pegá el link 'Compartir' de Google Maps"
 *
 * No persiste nada. Solo es UI feedback. La persistencia ocurre al guardar
 * el cliente (que llama al backfill server-side).
 *
 * Por qué client-side: el parser es pure function, sin I/O. Safe para
 * ejecutarlo en cada keystroke. Zero latencia.
 */

import { useMemo } from 'react'
import {
  parseGoogleMapsLink,
  isShortMapsUrl,
} from '@/lib/geo/parse-google-maps-link'

interface CoordsPreviewProps {
  url: string | null | undefined
}

export function CoordsPreview({ url }: CoordsPreviewProps) {
  const result = useMemo(() => {
    if (!url || !url.trim()) return null
    return parseGoogleMapsLink(url)
  }, [url])

  if (!url || !url.trim()) return null

  // Short URLs — explicación específica.
  if (isShortMapsUrl(url)) {
    return (
      <div
        className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
        data-testid="coords-preview-short"
      >
        <span className="font-medium">⚠️ Link acortado detectado.</span>{' '}
        Abrí Google Maps → toca Compartir → Copiar enlace. Pegá ese link largo,
        no la versión corta (goo.gl).
      </div>
    )
  }

  // Link reconocido con coords.
  if (result) {
    return (
      <div
        className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 flex items-center gap-1.5"
        data-testid="coords-preview-ok"
      >
        <span>📍</span>
        <span>
          <span className="font-medium">Detectado:</span>{' '}
          {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
        </span>
        <span className="text-emerald-600/70 text-[10px] uppercase tracking-wide">
          ({result.source})
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
