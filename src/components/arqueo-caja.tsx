'use client'

import { useState, useEffect, useCallback } from 'react'
import { Billete100k, Billete50k, Billete20k, Billete10k, Billete5k, Billete2k } from './billetes-svg'

const BILLETE_COMPONENTS: Record<number, typeof Billete100k> = {
  100000: Billete100k,
  50000: Billete50k,
  20000: Billete20k,
  10000: Billete10k,
  5000: Billete5k,
  2000: Billete2k,
}

const BILLETE_COLORS: Record<number, string> = {
  100000: 'bg-red-50 border-red-200',
  50000: 'bg-purple-50 border-purple-200',
  20000: 'bg-orange-50 border-orange-200',
  10000: 'bg-red-50 border-red-100',
  5000: 'bg-blue-50 border-blue-200',
  2000: 'bg-indigo-50 border-indigo-200',
}

const BILLETE_SUBTOTAL_COLORS: Record<number, string> = {
  100000: 'text-red-700',
  50000: 'text-purple-700',
  20000: 'text-orange-700',
  10000: 'text-red-600',
  5000: 'text-blue-700',
  2000: 'text-indigo-700',
}

export const DENOMINACIONES = [
  { valor: 100000, tipo: 'BILLETE', label: '$100.000' },
  { valor: 50000, tipo: 'BILLETE', label: '$50.000' },
  { valor: 20000, tipo: 'BILLETE', label: '$20.000' },
  { valor: 10000, tipo: 'BILLETE', label: '$10.000' },
  { valor: 5000, tipo: 'BILLETE', label: '$5.000' },
  { valor: 2000, tipo: 'BILLETE', label: '$2.000' },
  { valor: 500, tipo: 'MONEDA', label: '$500' },
  { valor: 200, tipo: 'MONEDA', label: '$200' },
  { valor: 100, tipo: 'MONEDA', label: '$100' },
  { valor: 50, tipo: 'MONEDA', label: '$50' },
] as const

export interface ArqueoData {
  [valor: number]: number
}

function MonedaIcon({ valor }: { valor: number }) {
  const size = valor >= 500 ? 28 : valor >= 200 ? 26 : 24
  const colors: Record<number, { bg: string; ring: string }> = {
    500: { bg: '#CD7F32', ring: '#B8860B' },
    200: { bg: '#B87333', ring: '#8B5E3C' },
    100: { bg: '#C0C0C0', ring: '#A8A8A8' },
    50: { bg: '#A8A8A8', ring: '#909090' },
  }
  const c = colors[valor] || { bg: '#C0C0C0', ring: '#A8A8A8' }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <radialGradient id={`coin-${valor}`} cx="40%" cy="35%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor={c.bg} />
        </radialGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={c.bg} stroke={c.ring} strokeWidth="1" />
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={`url(#coin-${valor})`} />
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" fill={valor >= 100 ? '#333' : '#fff'} fontSize={valor >= 500 ? '6' : '5'} fontWeight="bold" fontFamily="sans-serif">${valor}</text>
    </svg>
  )
}

interface Props {
  netoTeorico: number
  onChange: (data: { arqueo: ArqueoData; totalContado: number; diferencia: number }) => void
  onClose?: () => void
}

export default function ArqueoCajaModal({ netoTeorico, onChange, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const totalContado = DENOMINACIONES.reduce((sum, d) => {
    return sum + (cantidades[d.valor] || 0) * d.valor
  }, 0)

  const diferencia = totalContado - netoTeorico

  const emitChange = useCallback(() => {
    if (open) {
      onChange({ arqueo: cantidades, totalContado, diferencia })
    }
  }, [cantidades, totalContado, diferencia, onChange, open])

  useEffect(() => {
    emitChange()
  }, [emitChange])

  const handleChange = (valor: number, cantidad: string) => {
    setCantidades(prev => ({
      ...prev,
      [valor]: Math.max(0, parseInt(cantidad) || 0)
    }))
  }

  const handleIncrement = (valor: number) => {
    setCantidades(prev => ({
      ...prev,
      [valor]: (prev[valor] || 0) + 1
    }))
  }

  const handleDecrement = (valor: number) => {
    setCantidades(prev => ({
      ...prev,
      [valor]: Math.max(0, (prev[valor] || 0) - 1)
    }))
  }

  const handleReset = () => {
    setCantidades({})
    setShowResetConfirm(false)
  }

  const billetes = DENOMINACIONES.filter(d => d.tipo === 'BILLETE')
  const monedas = DENOMINACIONES.filter(d => d.tipo === 'MONEDA')

  const progreso = netoTeorico > 0 ? Math.min((totalContado / netoTeorico) * 100, 100) : 0
  const progresoColor = diferencia === 0 ? 'bg-green-500' : diferencia > 0 ? 'bg-blue-500' : 'bg-red-500'
  const progresoLabel = diferencia === 0 ? 'Cuadrado' : diferencia > 0 ? `Sobran $${diferencia.toLocaleString()}` : `Faltan $${Math.abs(diferencia).toLocaleString()}`
  const progresoLabelColor = diferencia === 0 ? 'text-green-700' : diferencia > 0 ? 'text-blue-700' : 'text-red-700'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition flex items-center justify-center gap-3"
      >
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span className="text-lg font-medium text-gray-500">Contar Efectivo Físico</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-xl font-bold">Arqueo Físico de Caja</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
            >
              Reiniciar
            </button>
            <button onClick={() => { onClose?.(); setOpen(false) }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Cerrar arqueo">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 bg-gray-50 border-b px-6 py-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium">
              Contado <span className="text-blue-600">${totalContado.toLocaleString()}</span>
              {' '}<span className="text-muted-foreground">/ Esperado</span>{' '}
              <span className="font-semibold">${netoTeorico.toLocaleString()}</span>
            </span>
            <span className={`font-semibold ${progresoLabelColor}`}>{progresoLabel}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${progresoColor}`}
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Billetes */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              Billetes
            </h3>
            <div className="space-y-2">
              {billetes.map(d => {
                const BillComp = BILLETE_COMPONENTS[d.valor]
                const cantidad = cantidades[d.valor] || 0
                const subtotal = cantidad * d.valor
                const isActive = cantidad > 0
                const rowBg = isActive ? (BILLETE_COLORS[d.valor] || 'bg-gray-50') : 'bg-gray-50'
                const subtotalColor = isActive ? (BILLETE_SUBTOTAL_COLORS[d.valor] || 'text-gray-900') : 'text-gray-300'

                return (
                  <div key={d.valor} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border transition-colors ${rowBg} ${isActive ? 'border-current' : 'border-transparent'}`}>
                    {/* SVG */}
                    <div className="w-[80px] shrink-0">{BillComp ? <BillComp /> : <span className="text-xs text-muted-foreground">{d.label}</span>}</div>

                    {/* Label */}
                    <span className="text-sm text-muted-foreground shrink-0 w-20">{d.label}</span>

                    {/* Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(d.valor)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border bg-white hover:bg-gray-100 text-gray-600 transition"
                        aria-label={`Restar 1 de ${d.label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                        </svg>
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        value={cantidad || ''}
                        onChange={(e) => handleChange(d.valor, e.target.value)}
                        className="w-14 text-center border rounded-md px-1 py-1 text-sm font-semibold bg-white"
                        placeholder="0"
                      />
                      <button
                        onClick={() => handleIncrement(d.valor)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border bg-white hover:bg-gray-100 text-gray-600 transition"
                        aria-label={`Sumar 1 a ${d.label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Subtotal */}
                    <span className={`text-sm font-bold ml-auto tabular-nums ${subtotalColor}`}>
                      {isActive ? `$${subtotal.toLocaleString()}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Monedas */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor">$</text>
              </svg>
              Monedas
            </h3>
            <div className="space-y-2">
              {monedas.map(d => {
                const cantidad = cantidades[d.valor] || 0
                const subtotal = cantidad * d.valor
                const isActive = cantidad > 0

                return (
                  <div key={d.valor} className={`flex items-center gap-3 py-2 px-3 rounded-lg border transition-colors ${isActive ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-transparent'}`}>
                    {/* Coin icon */}
                    <MonedaIcon valor={d.valor} />

                    {/* Label */}
                    <span className="text-sm text-muted-foreground shrink-0 w-14">{d.label}</span>

                    {/* Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(d.valor)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border bg-white hover:bg-gray-100 text-gray-600 transition"
                        aria-label={`Restar 1 de ${d.label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                        </svg>
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        value={cantidad || ''}
                        onChange={(e) => handleChange(d.valor, e.target.value)}
                        className="w-14 text-center border rounded-md px-1 py-1 text-sm font-semibold bg-white"
                        placeholder="0"
                      />
                      <button
                        onClick={() => handleIncrement(d.valor)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border bg-white hover:bg-gray-100 text-gray-600 transition"
                        aria-label={`Sumar 1 a ${d.label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Subtotal */}
                    <span className={`text-sm font-bold ml-auto tabular-nums ${isActive ? 'text-amber-700' : 'text-gray-300'}`}>
                      {isActive ? `$${subtotal.toLocaleString()}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resumen */}
          <div className={`border-t pt-4 space-y-2 rounded-xl p-4 ${diferencia === 0 ? 'bg-green-50 border-green-200' : diferencia > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Neto teórico (sistema)</span>
              <span className="font-medium">${netoTeorico.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total contado (físico)</span>
              <span className="font-bold text-lg">${totalContado.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Diferencia</span>
              <span className={diferencia === 0 ? 'text-green-600' : diferencia > 0 ? 'text-blue-600' : 'text-red-600'}>
                {diferencia === 0 ? '✓ Cuadrado' : diferencia > 0 ? `+ $${diferencia.toLocaleString()} (Sobrante)` : `− $${Math.abs(diferencia).toLocaleString()} (Faltante)`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-white border-t px-6 py-4 flex justify-end">
          <button
            onClick={() => { onClose?.(); setOpen(false) }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-base transition shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Listo — Terminar conteo
          </button>
        </div>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">¿Reiniciar conteo?</h3>
            <p className="text-sm text-muted-foreground mb-4">Se borrarán todos los valores ingresados. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
              >
                Sí, reiniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
