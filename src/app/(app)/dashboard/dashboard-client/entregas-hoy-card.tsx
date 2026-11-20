'use client'

import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'

interface EntregasHoy {
  total: number
  deHoy: number
  deDiasAnteriores: number
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'ok'; entregas: EntregasHoy }

const esNumero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Pedidos con entrega registrada hoy, de hoy o de días anteriores (#650).
 * Se consulta aparte del resto del dashboard: si falla, solo esta tarjeta
 * muestra el error y las demás cifras no se tocan. Un error nunca se pinta
 * como cero.
 */
export function EntregasHoyCard({ rango }: { rango?: { from: string; to: string } | null }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)
  const clavePeriodo = rango ? `${rango.from}/${rango.to}` : 'hoy'
  const [claveLectura, setClaveLectura] = useState('hoy')

  // Cada cambio de `intento` (montaje, reintento, evento de pedido) relee.
  useEffect(() => {
    let vigente = true
    setEstado({ tipo: 'cargando' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const leer = async () => {
      try {
        const res = await fetch(rango ? `/api/dashboard/entregas-hoy?from=${encodeURIComponent(rango.from)}&to=${encodeURIComponent(rango.to)}` : '/api/dashboard/entregas-hoy', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('respuesta no válida')
        const json = await res.json()
        const e = json?.entregas
        if (
          !json?.success ||
          !esNumero(e?.total) ||
          !esNumero(e?.deHoy) ||
          !esNumero(e?.deDiasAnteriores)
        )
          throw new Error('lectura incompleta')
        if (vigente) {
          setClaveLectura(clavePeriodo)
          setEstado({ tipo: 'ok', entregas: e })
        }
      } catch {
        // Con una lectura buena previa se conserva; solo la primera falla es error.
        if (vigente)
          setEstado((previo) =>
            previo.tipo === 'ok' && claveLectura === clavePeriodo ? previo : { tipo: 'error' },
          )
      } finally {
        clearTimeout(timer)
      }
    }
    void leer()
    return () => {
      vigente = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [intento, rango?.from, rango?.to, clavePeriodo])

  useRealtimeListener(['pedido.created', 'pedido.updated'], () => {
    setIntento((n) => n + 1)
  })

  const reintentar = () => {
    setEstado({ tipo: 'cargando' })
    setIntento((n) => n + 1)
  }

  const visible = claveLectura === clavePeriodo ? estado : { tipo: 'cargando' as const }
  return (
    <div
      className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-sky-500"
      data-testid="entregas-hoy-card"
    >
      <p className="flex items-center justify-between gap-2 text-sm text-gray-500">
        {rango ? 'Entregas del período' : 'Entregas de hoy'}
        <Truck aria-hidden="true" className="h-6 w-6 text-sky-600" />
      </p>
      <p className="text-xs text-gray-400">
        Pedidos con entrega registrada {rango ? 'en el período' : 'hoy'}
      </p>
      {visible.tipo === 'cargando' && (
        <div
          role="status"
          aria-label="Cargando entregas de hoy"
          className="mt-2 space-y-2 animate-pulse"
        >
          <div className="h-8 w-16 rounded bg-gray-200" />
          <div className="h-3 w-40 rounded bg-gray-100" />
          <div className="h-3 w-48 rounded bg-gray-100" />
        </div>
      )}
      {visible.tipo === 'error' && (
        <div aria-live="polite" className="mt-2">
          <p className="text-xs text-red-700">
            No se pudo cargar. Las demás tarjetas siguen correctas.
          </p>
          <button
            type="button"
            onClick={reintentar}
            className="mt-2 min-h-11 rounded-lg border bg-white px-3 text-xs font-medium text-gray-700"
          >
            Reintentar
          </button>
        </div>
      )}
      {visible.tipo === 'ok' && (
        <>
          <p
            className="text-3xl font-bold text-gray-800"
            data-testid="entregas-hoy-total"
          >
            {(visible.tipo === 'ok' ? visible.entregas : { total: 0, deHoy: 0, deDiasAnteriores: 0 }).total}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {(visible.tipo === 'ok' ? visible.entregas : { total: 0, deHoy: 0, deDiasAnteriores: 0 }).deHoy} de pedidos de hoy
          </p>
          <p className="text-xs text-gray-400">
            {(visible.tipo === 'ok' ? visible.entregas : { total: 0, deHoy: 0, deDiasAnteriores: 0 }).deDiasAnteriores} de pedidos de días anteriores
          </p>
        </>
      )}
    </div>
  )
}
