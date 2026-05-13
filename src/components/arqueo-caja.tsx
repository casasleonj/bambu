'use client'

import { useState, useEffect } from 'react'

const DENOMINACIONES = [
  { valor: 100000, tipo: 'BILLETE', label: '$100.000', color: '#E86C6C', textColor: '#fff' },
  { valor: 50000, tipo: 'BILLETE', label: '$50.000', color: '#4CAF50', textColor: '#fff' },
  { valor: 20000, tipo: 'BILLETE', label: '$20.000', color: '#E67E22', textColor: '#fff' },
  { valor: 10000, tipo: 'BILLETE', label: '$10.000', color: '#5D8A3C', textColor: '#fff' },
  { valor: 5000, tipo: 'BILLETE', label: '$5.000', color: '#3498DB', textColor: '#fff' },
  { valor: 2000, tipo: 'BILLETE', label: '$2.000', color: '#7B68EE', textColor: '#fff' },
  { valor: 500, tipo: 'MONEDA', label: '$500', color: '#CD7F32', textColor: '#fff' },
  { valor: 200, tipo: 'MONEDA', label: '$200', color: '#B87333', textColor: '#fff' },
  { valor: 100, tipo: 'MONEDA', label: '$100', color: '#C0C0C0', textColor: '#333' },
  { valor: 50, tipo: 'MONEDA', label: '$50', color: '#A8A8A8', textColor: '#333' },
] as const

export interface ArqueoData {
  [valor: number]: number
}

function BilleteIcon({ valor, color, textColor }: { valor: number; color: string; textColor: string }) {
  return (
    <svg width="64" height="32" viewBox="0 0 64 32" className="shrink-0">
      <rect x="1" y="1" width="62" height="30" rx="3" fill={color} stroke={textColor === '#fff' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'} strokeWidth="1" />
      <rect x="4" y="4" width="56" height="24" rx="2" fill="none" stroke={textColor === '#fff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} strokeWidth="0.5" />
      <text x="32" y="19" textAnchor="middle" fill={textColor} fontSize="7" fontWeight="bold">${valor.toLocaleString()}</text>
    </svg>
  )
}

function MonedaIcon({ valor, color, textColor }: { valor: number; color: string; textColor: string }) {
  const size = valor >= 500 ? 28 : valor >= 200 ? 26 : 24
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={color} stroke={textColor === '#fff' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)'} strokeWidth="1" />
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" stroke={textColor === '#fff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} strokeWidth="0.5" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" fill={textColor} fontSize={valor >= 500 ? '6' : '5'} fontWeight="bold">${valor}</text>
    </svg>
  )
}

interface Props {
  netoTeorico: number
  onChange: (data: { arqueo: ArqueoData; totalContado: number; diferencia: number }) => void
}

export default function ArqueoCajaModal({ netoTeorico, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [cantidades, setCantidades] = useState<Record<number, number>>({})

  const totalContado = DENOMINACIONES.reduce((sum, d) => {
    return sum + (cantidades[d.valor] || 0) * d.valor
  }, 0)

  const diferencia = totalContado - netoTeorico

  useEffect(() => {
    if (open) {
      onChange({ arqueo: cantidades, totalContado, diferencia })
    }
  }, [cantidades, totalContado, diferencia, onChange, open])

  const handleChange = (valor: number, cantidad: string) => {
    setCantidades(prev => ({
      ...prev,
      [valor]: Math.max(0, parseInt(cantidad) || 0)
    }))
  }

  const billetes = DENOMINACIONES.filter(d => d.tipo === 'BILLETE')
  const monedas = DENOMINACIONES.filter(d => d.tipo === 'MONEDA')

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-xl font-bold">Arqueo Físico de Caja</h2>
          </div>
          <button onClick={() => setOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
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
              {billetes.map(d => (
                <div key={d.valor} className="flex items-center justify-between gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                  <BilleteIcon valor={d.valor} color={d.color} textColor={d.textColor} />
                  <span className="text-sm text-muted-foreground">×</span>
                  <input
                    type="number"
                    min="0"
                    value={cantidades[d.valor] || ''}
                    onChange={(e) => handleChange(d.valor, e.target.value)}
                    className="w-20 text-right border rounded-md px-2 py-1.5 text-sm font-medium"
                    placeholder="0"
                  />
                  <span className="text-sm font-medium w-28 text-right">
                    = ${((cantidades[d.valor] || 0) * d.valor).toLocaleString()}
                  </span>
                </div>
              ))}
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
              {monedas.map(d => (
                <div key={d.valor} className="flex items-center justify-between gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                  <MonedaIcon valor={d.valor} color={d.color} textColor={d.textColor} />
                  <span className="text-sm text-muted-foreground">×</span>
                  <input
                    type="number"
                    min="0"
                    value={cantidades[d.valor] || ''}
                    onChange={(e) => handleChange(d.valor, e.target.value)}
                    className="w-20 text-right border rounded-md px-2 py-1.5 text-sm font-medium"
                    placeholder="0"
                  />
                  <span className="text-sm font-medium w-28 text-right">
                    = ${((cantidades[d.valor] || 0) * d.valor).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div className="border-t pt-4 space-y-2 bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Neto teórico (sistema)</span>
              <span className="font-medium">${netoTeorico.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total contado (físico)</span>
              <span className="font-medium text-lg">${totalContado.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Diferencia</span>
              <span className={diferencia === 0 ? 'text-green-600' : diferencia > 0 ? 'text-blue-600' : 'text-red-600'}>
                {diferencia === 0 ? 'Cuadrado ✅' : diferencia > 0 ? `Sobrante $${diferencia.toLocaleString()}` : `Faltante $${Math.abs(diferencia).toLocaleString()}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
