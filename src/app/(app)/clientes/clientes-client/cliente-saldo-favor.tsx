'use client'

// #696 — Saldo a favor del cliente en su detalle: cuánto es, y de dónde viene cada movimiento.
// Un saldo que no se pudo leer NO se muestra como cero: dice que falta consultarlo y deja reintentar.
import { useCallback, useEffect, useState } from 'react'
import { ListaLimitada } from '@/components/ui/desplegable'
import { MovimientoSaldoFavor } from '@/components/saldo-favor/saldo-favor-movimiento'
import { formatCurrency } from '@/lib/utils'
import type { SaldoFavorCliente } from '@/lib/saldo-favor-cliente'
import { loadClienteSaldoFavor, peekClienteSaldoFavor } from './panel-prefetch'

export function ClienteSaldoFavor({ clienteId }: { clienteId: string }) {
  const [lectura, setLectura] = useState<SaldoFavorCliente | null>(() => peekClienteSaldoFavor(clienteId))
  const [cargando, setCargando] = useState(() => peekClienteSaldoFavor(clienteId) === null)
  const [error, setError] = useState(false)
  const [clienteAnterior, setClienteAnterior] = useState(clienteId)

  // Al cambiar de cliente se reinicia durante el render (no en un efecto): https://react.dev/learn/you-might-not-need-an-effect
  if (clienteId !== clienteAnterior) {
    setClienteAnterior(clienteId)
    const enCache = peekClienteSaldoFavor(clienteId)
    setLectura(enCache)
    setCargando(enCache === null)
    setError(false)
  }

  useEffect(() => {
    let cancelado = false
    if (peekClienteSaldoFavor(clienteId)) return
    // Comparte la promesa en vuelo del prefetch si existe (cero duplicados).
    void loadClienteSaldoFavor(clienteId).then((data) => {
      if (cancelado) return
      if (data) {
        setLectura(data)
        setError(false)
      } else {
        setError(true)
      }
      setCargando(false)
    })
    return () => { cancelado = true }
  }, [clienteId])

  const reintentar = useCallback(() => {
    setError(false)
    setCargando(true)
    void loadClienteSaldoFavor(clienteId).then((data) => {
      if (data) setLectura(data)
      setError(!data)
      setCargando(false)
    })
  }, [clienteId])

  if (cargando) {
    return (
      <div data-testid="saldo-favor-cargando" aria-busy="true" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-7 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
      </div>
    )
  }

  if (error || !lectura) {
    return (
      <div data-testid="saldo-favor-error" role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>No se pudo leer el saldo a favor de este cliente. No es cero: falta consultarlo.</span>
        <button type="button" onClick={reintentar} className="min-h-11 rounded-lg border border-red-300 bg-white px-3 font-semibold text-red-800">
          Reintentar
        </button>
      </div>
    )
  }

  const { saldo, movimientos, hayMas } = lectura
  return (
    <section data-testid="saldo-favor-seccion" aria-label="Saldo a favor" className="space-y-3">
      {saldo > 0 ? (
        <div data-testid="saldo-favor-card" className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Saldo a favor</p>
          <p className="text-3xl font-bold tabular-nums text-teal-700" data-testid="saldo-favor-monto">{formatCurrency(saldo)}</p>
          <p className="mt-1 text-sm text-slate-700">Es dinero de este cliente que ya tiene la empresa. Se descuenta solo de su próximo pedido.</p>
        </div>
      ) : (
        <div data-testid="saldo-favor-vacio" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Saldo a favor:</span> no tiene. Aparece aquí cuando el cliente entregue de más o se corrija un precio a la baja.
        </div>
      )}

      {movimientos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Movimientos del saldo a favor</h3>
          <ListaLimitada
            items={movimientos}
            limite={5}
            render={(m) => <MovimientoSaldoFavor key={m.id} m={m} />}
          />
          <p className="pb-2 pt-1 text-xs text-slate-500">
            Aquí no aparece cuándo se descontó saldo en un pedido nuevo: ese dato todavía no se guarda.
            {hayMas ? ' Se muestran los 50 movimientos más recientes.' : ''}
          </p>
        </div>
      )}
    </section>
  )
}
