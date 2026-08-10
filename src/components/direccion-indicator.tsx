/**
 * Indicador de dirección: hace explícito cuando un destino (cliente o
 * negocio) no tiene dirección/barrio registrados, en vez de dejar el
 * espacio en blanco silenciosamente. Si hay un link de Maps guardado pero
 * no texto de dirección, lo ofrece como respaldo.
 */

interface DireccionIndicatorProps {
  direccion?: string | null
  barrio?: string | null
  linkUbicacion?: string | null
  className?: string
  /** Usar cuando el indicador queda anidado dentro de otro elemento
   * interactivo (ej. un <button>) — un <a> ahí sería HTML inválido y
   * rompería el click del contenedor. Muestra el mismo mensaje como texto
   * plano, sin link clickeable. */
  sinLink?: boolean
}

export function DireccionIndicator({ direccion, barrio, linkUbicacion, className, sinLink }: DireccionIndicatorProps) {
  if (direccion || barrio) return null

  if (linkUbicacion) {
    if (sinLink) {
      return (
        <span className={`text-xs text-blue-600 ${className || ''}`}>
          📍 Ubicación disponible (link guardado)
        </span>
      )
    }
    return (
      <a
        href={linkUbicacion}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs text-blue-600 hover:text-blue-800 underline ${className || ''}`}
      >
        📍 Ver ubicación en Maps
      </a>
    )
  }

  return (
    <span className={`text-xs text-amber-600 ${className || ''}`}>
      ⚠️ Sin dirección registrada
    </span>
  )
}
