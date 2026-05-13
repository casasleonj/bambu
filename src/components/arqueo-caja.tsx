'use client'

import { useState, useEffect } from 'react'

const DENOMINACIONES = [
  { valor: 100000, tipo: 'BILLETE', label: '$100.000' },
  { valor: 50000, tipo: 'BILLETE', label: '$50.000' },
  { valor: 20000, tipo: 'BILLETE', label: '$20.000' },
  { valor: 10000, tipo: 'BILLETE', label: '$10.000' },
  { valor: 5000, tipo: 'BILLETE', label: '$5.000' },
  { valor: 2000, tipo: 'BILLETE', label: '$2.000' },
  { valor: 1000, tipo: 'BILLETE', label: '$1.000' },
  { valor: 500, tipo: 'MONEDA', label: '$500' },
  { valor: 200, tipo: 'MONEDA', label: '$200' },
  { valor: 100, tipo: 'MONEDA', label: '$100' },
  { valor: 50, tipo: 'MONEDA', label: '$50' },
] as const

export interface ArqueoData {
  [valor: number]: number
}

interface Props {
  netoTeorico: number
  onChange: (data: { arqueo: ArqueoData; totalContado: number; diferencia: number }) => void
}

export default function ArqueoCaja({ netoTeorico, onChange }: Props) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({})

  const totalContado = DENOMINACIONES.reduce((sum, d) => {
    return sum + (cantidades[d.valor] || 0) * d.valor
  }, 0)

  const diferencia = totalContado - netoTeorico

  useEffect(() => {
    onChange({ arqueo: cantidades, totalContado, diferencia })
  }, [cantidades, totalContado, diferencia, onChange])

  const handleChange = (valor: number, cantidad: string) => {
    setCantidades(prev => ({
      ...prev,
      [valor]: Math.max(0, parseInt(cantidad) || 0)
    }))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold mb-2">Billetes</h3>
          <div className="space-y-2">
            {DENOMINACIONES.filter(d => d.tipo === 'BILLETE').map(d => (
              <div key={d.valor} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium w-20 shrink-0">{d.label}</span>
                <span className="text-sm text-muted-foreground">×</span>
                <input
                  type="number"
                  min="0"
                  value={cantidades[d.valor] || ''}
                  onChange={(e) => handleChange(d.valor, e.target.value)}
                  className="w-20 text-right border rounded-md px-2 py-1 text-sm"
                  placeholder="0"
                />
                <span className="text-sm text-muted-foreground w-24 text-right shrink-0">
                  = ${((cantidades[d.valor] || 0) * d.valor).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Monedas</h3>
          <div className="space-y-2">
            {DENOMINACIONES.filter(d => d.tipo === 'MONEDA').map(d => (
              <div key={d.valor} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium w-20 shrink-0">{d.label}</span>
                <span className="text-sm text-muted-foreground">×</span>
                <input
                  type="number"
                  min="0"
                  value={cantidades[d.valor] || ''}
                  onChange={(e) => handleChange(d.valor, e.target.value)}
                  className="w-20 text-right border rounded-md px-2 py-1 text-sm"
                  placeholder="0"
                />
                <span className="text-sm text-muted-foreground w-24 text-right shrink-0">
                  = ${((cantidades[d.valor] || 0) * d.valor).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Neto teórico (sistema)</span>
          <span className="font-medium">${netoTeorico.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total contado (físico)</span>
          <span className="font-medium">${totalContado.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Diferencia</span>
          <span className={diferencia === 0 ? 'text-green-600' : diferencia > 0 ? 'text-blue-600' : 'text-red-600'}>
            {diferencia === 0 ? 'Cuadrado ✅' : diferencia > 0 ? `Sobrante $${diferencia.toLocaleString()}` : `Faltante $${Math.abs(diferencia).toLocaleString()}`}
          </span>
        </div>
      </div>
    </div>
  )
}
