'use client'

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CierreStockBlockProps {
  label: string
  icon: React.ReactNode
  /** Stock inicial: sale del último cierre (solo lectura, #645). */
  ini: number
  /** Producido del día: viene de la(s) producción(es) registrada(s) (solo lectura, #645). */
  prod: number
  vend: number
  /** Pérdidas del día: filtradas + merma (rotas) + consumo interno (#645). */
  perdidas: number
  fin: number
  /** Si el día no tiene producción registrada, el conteo final se digita aquí; con producción viene de ella. */
  onFinChange?: (v: number) => void
  /** ¿Hay producción registrada ese día? Sin ella el bloque avisa que falta (o que se marcó «no se produjo»). */
  hayProduccion: boolean
  sinProduccion?: boolean
  /** Unidades de pedidos sin detalle por día incluidas en «Vendido» (aviso del cierre). */
  aproximadas?: number
  /** #618: botellones llenos: «Llenados» en vez de «Producido» y sin pérdidas. */
  esBotellon?: boolean
}

export default function CierreStockBlock({ label, icon, ini, prod, vend, perdidas, fin, onFinChange, hayProduccion, sinProduccion, aproximadas = 0, esBotellon }: CierreStockBlockProps) {
  const esperado = ini + prod - vend - perdidas
  const cuadra = esperado === fin
  const falta = !hayProduccion && !sinProduccion
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h4 className="text-sm font-semibold">{label}</h4>
        {falta ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full" data-testid="stock-falta-produccion"><AlertTriangle className="w-3 h-3" /> Falta producción</span>
        ) : cuadra ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Cuadrado</span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> No cuadra</span>
        )}
      </div>

      {/* Fórmula visual: Inicial + Producido − Vendido − Pérdidas = Esperado (botellones: sin pérdidas) */}
      <div className="flex items-center gap-2 text-sm flex-wrap mb-3">
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Inicial</span>
          <span className="font-bold text-lg">{ini}</span>
        </div>
        <span className="text-muted-foreground text-lg font-medium">+</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">{esBotellon ? 'Llenados' : 'Producido'}</span>
          <span className="font-bold text-lg">{hayProduccion || sinProduccion ? prod : '—'}</span>
        </div>
        <span className="text-muted-foreground text-lg font-medium">−</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Vendido</span>
          <span className="font-bold text-lg">{vend}</span>
        </div>
        {!esBotellon && (
          <>
            <span className="text-muted-foreground text-lg font-medium">−</span>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">Pérdidas</span>
              <span className="font-bold text-lg">{perdidas}</span>
            </div>
          </>
        )}
        <span className="text-muted-foreground text-lg font-medium">=</span>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Esperado</span>
          <span className={cn('font-bold text-lg', falta ? '' : cuadra ? 'text-green-600' : 'text-red-600')}>{falta ? '—' : esperado}</span>
        </div>
      </div>

      {aproximadas > 0 && (
        <p className="mb-2 text-xs text-amber-700" data-testid="stock-incluye-aproximadas">
          Incluye {aproximadas} de pedidos sin detalle por día (ver aviso)
        </p>
      )}

      {onFinChange ? (
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Tu conteo final:</label>
          <Input
            type="number"
            min="0"
            value={fin}
            onChange={(e) => onFinChange(Number(e.target.value))}
            className={cn('w-20 h-8 text-sm', !falta && !cuadra && 'border-red-300 bg-red-50')}
          />
          {!falta && !cuadra && (
            <span className="text-xs text-red-600 font-medium">
              Diferencia: {fin - esperado > 0 ? '+' : ''}{fin - esperado}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Conteo final: <b>{fin}</b> (el que se registró con la producción)
          {!cuadra && <span className="ml-2 text-red-600 font-medium">Diferencia: {fin - esperado > 0 ? '+' : ''}{fin - esperado}</span>}
        </p>
      )}
    </div>
  )
}
