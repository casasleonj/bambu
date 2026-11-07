'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'

/** Un solo lugar de revisión/confirmación: la pantalla de Habituales (#515). */
export function RecurrentesDelDia() {
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const params = useShallowSearchParams()
  const volver = `/pedidos${params.toString() ? `?${params.toString()}` : ''}`
  const href = `/recurrentes?volver=${encodeURIComponent(volver)}#revision-habituales`
  const cargar = useCallback(async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const response = await fetch('/api/pedidos/recurrentes', {
        cache: 'no-store',
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(25000)]),
      })
      const data = await response.json()
      if (ctrl.signal.aborted) return
      if (
        !response.ok ||
        !data.success ||
        !Array.isArray(data.preview) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.hoy) ||
        !data.preview.every((p: { proximaFecha: string }) =>
          Number.isFinite(Date.parse(p.proximaFecha)),
        )
      )
        throw new Error('Preview no disponible')
      setCantidad(
        data.preview.filter(
          (p: { proximaFecha: string }) =>
            new Date(p.proximaFecha).toLocaleDateString('en-CA', {
              timeZone: 'America/Bogota',
            }) <= data.hoy,
        ).length,
      )
      setError(false)
    } catch {
      if (!ctrl.signal.aborted) setError(true)
    }
  }, [])
  useEffect(() => {
    // Consulta real; no genera pedidos al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
    return () => abort.current?.abort()
  }, [cargar])
  if (error)
    return (
      <div
        role="status"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        No se pudo consultar lo previsto para hoy.{' '}
        <button
          type="button"
          onClick={() => void cargar()}
          className="min-h-11 px-2 font-semibold underline"
        >
          Reintentar consulta
        </button>
        <a
          href={href}
          className="inline-flex min-h-11 items-center px-2 font-semibold underline"
        >
          Consultar habituales →
        </a>
      </div>
    )
  if (!cantidad) return null
  return (
    <a
      href={href}
      data-testid="recurrentes-del-dia-cta"
      className="block rounded-lg border border-stone-200 bg-[#f7f3eb] px-3 py-3 text-sm font-semibold text-stone-800"
    >
      ↻ {cantidad} pedido{cantidad === 1 ? '' : 's'} habitual
      {cantidad === 1 ? '' : 'es'} para revisar hoy →
    </a>
  )
}
