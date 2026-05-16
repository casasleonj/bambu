'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CierreStockBlockProps {
  label: string
  icon: React.ReactNode
  ini: number
  prod: number
  vend: number
  fin: number
  onIniChange: (v: number) => void
  onProdChange: (v: number) => void
  onFinChange: (v: number) => void
}

export default function CierreStockBlock({ label, icon, ini, prod, vend, fin, onIniChange, onProdChange, onFinChange }: CierreStockBlockProps) {
  const esperado = ini + prod - vend
  const cuadra = esperado === fin
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h4 className="text-sm font-semibold">{label}</h4>
        {cuadra ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Cuadrado</span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> No cuadra</span>
        )}

      </div>

      {/* Fórmula visual */}
      <div className="flex items-center gap-2 text-sm flex-wrap mb-3">
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Inicial</span>
          <span className="font-bold text-lg">{ini}</span>
        </div>
        <span className="text-muted-foreground text-lg font-medium">+</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Producción</span>
          <span className="font-bold text-lg">{prod}</span>
        </div>
        <span className="text-muted-foreground text-lg font-medium">−</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Vendido</span>
          <span className="font-bold text-lg">{vend}</span>
        </div>
        <span className="text-muted-foreground text-lg font-medium">=</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Esperado</span>
          <span className={cn('font-bold text-lg', cuadra ? 'text-green-600' : 'text-red-600')}>{esperado}</span>
        </div>
      </div>

      {/* Input stock final */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">Tu conteo final:</label>
        <Input
          type="number"
          min="0"
          value={fin}
          onChange={(e) => onFinChange(Number(e.target.value))}
          className={cn('w-20 h-8 text-sm', !cuadra && 'border-red-300 bg-red-50')}
        />
        {!cuadra && (
          <span className="text-xs text-red-600 font-medium">
            Diferencia: {fin - esperado > 0 ? '+' : ''}{fin - esperado}
          </span>
        )}
      </div>

      {/* Inputs editables para ini y prod */}
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t">
        <div>
          <label className="text-xs text-muted-foreground">Stock Inicial</label>
          <Input type="number" min="0" value={ini} onChange={(e) => onIniChange(Number(e.target.value))} className="mt-0.5 h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Producción hoy</label>
          <Input type="number" min="0" value={prod} onChange={(e) => onProdChange(Number(e.target.value))} className="mt-0.5 h-8 text-sm" />
        </div>
      </div>
    </div>
  )
}
