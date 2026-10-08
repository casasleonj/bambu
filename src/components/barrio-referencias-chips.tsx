'use client'

import { useEffect, useState } from 'react'
import { normalizeName } from '@/lib/import/normalizer'

interface RelacionLite {
  id: string
  texto: string
}

interface BarrioDetalle {
  id: string
  aliases: RelacionLite[]
  referencias: RelacionLite[]
}

interface BarrioReferenciasChipsProps {
  /** Barrio canónico ya seleccionado (null si no hay ninguno todavía). */
  barrioId: string | null
  /** Valor actual del campo Dirección, para la protección anti-duplicado. */
  direccion: string
  /** Se llama SOLO cuando el usuario toca un chip — nunca automático. */
  onInsertarEnDireccion: (nuevaDireccion: string) => void
}

/**
 * Muestra "También se conoce como" (informativo) y "Referencias comunes"
 * (chips tocables) del Barrio ya seleccionado — F4, equipo 2026-10-07.
 *
 * Decisión confirmada con evidencia de código: el chip inserta en
 * `direccion`, NUNCA en `referencia` — `direccion` es lo que efectivamente
 * ve el repartidor (`pickDireccionTexto` solo lee `direccion`+`barrio`) y
 * ya invita a este tipo de contenido en su propio copy ("Incluye
 * referencias conocidas"); `referencia` es un campo distinto (señas de
 * cómo llegar), invisible para el repartidor, y sin UI en Negocio.
 *
 * Reglas de inserción (nunca automáticas, solo por click explícito):
 *  - Dirección vacía → el texto del chip la llena.
 *  - Dirección con contenido → se antepone "texto, " al contenido existente,
 *    preservándolo íntegro.
 *  - Protección anti-duplicado normalizada (no estructurada, solo evita la
 *    duplicación evidente): si Dirección ya contiene ese texto (acentos/
 *    mayúsculas normalizados), el chip queda deshabilitado — tocarlo de
 *    nuevo no inserta una segunda vez.
 *
 * Mismo componente para Cliente y Negocio — una sola experiencia, no dos.
 */
export function BarrioReferenciasChips({ barrioId, direccion, onInsertarEnDireccion }: BarrioReferenciasChipsProps) {
  const [detalle, setDetalle] = useState<BarrioDetalle | null>(null)

  useEffect(() => {
    if (!barrioId) return
    let cancelado = false
    fetch(`/api/barrios/${barrioId}`)
      .then((r) => r.json())
      .then((data: { success: boolean; barrio?: BarrioDetalle }) => {
        if (!cancelado && data.success && data.barrio) setDetalle(data.barrio)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [barrioId])

  // Si barrioId cambió (o se limpió) y `detalle` todavía es del Barrio
  // anterior, no se muestra nada hasta que la nueva búsqueda resuelva —
  // evita un parpadeo con chips del Barrio equivocado (reset en render,
  // no en el efecto, para cumplir react-hooks/set-state-in-effect).
  if (!barrioId || !detalle || detalle.id !== barrioId) return null
  if (detalle.aliases.length === 0 && detalle.referencias.length === 0) return null

  const direccionContiene = (texto: string) => {
    const textoNormalizado = normalizeName(texto)
    if (!textoNormalizado) return false
    return normalizeName(direccion).includes(textoNormalizado)
  }

  const handleInsertar = (texto: string) => {
    if (direccionContiene(texto)) return
    const direccionTrim = direccion.trim()
    onInsertarEnDireccion(direccionTrim ? `${texto}, ${direccionTrim}` : texto)
  }

  return (
    <div className="space-y-2">
      {detalle.aliases.length > 0 && (
        <div>
          <span className="text-xs text-gray-500">También se conoce como</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {detalle.aliases.map((a) => (
              <span key={a.id} className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {a.texto}
              </span>
            ))}
          </div>
        </div>
      )}

      {detalle.referencias.length > 0 && (
        <div>
          <span className="text-xs text-gray-500">Referencias comunes — toca una para agregarla a Dirección</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {detalle.referencias.map((r) => {
              const yaIncluida = direccionContiene(r.texto)
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={yaIncluida}
                  onClick={() => handleInsertar(r.texto)}
                  title={yaIncluida ? 'Ya está en Dirección' : `Agregar "${r.texto}" a Dirección`}
                  className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 active:bg-blue-200 transition disabled:opacity-50 disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-gray-100"
                >
                  {r.texto}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
