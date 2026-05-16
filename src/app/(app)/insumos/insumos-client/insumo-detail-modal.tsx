import { Modal } from '@/components/modal'
import { formatCurrency } from '@/lib/utils'
import type { Insumo } from './types'

interface InsumoDetailModalProps {
  open: boolean
  onClose: () => void
  insumo: Insumo | null
  onEdit: (insumo: Insumo) => void
  onDelete: (insumo: Insumo) => void
}

export function InsumoDetailModal({ open, onClose, insumo, onEdit, onDelete }: InsumoDetailModalProps) {
  if (!insumo) return null

  const stockPct = insumo.stockMin > 0
    ? Math.round((insumo.stock / insumo.stockMin) * 100)
    : insumo.stock > 0 ? 100 : 0

  const stockColor = stockPct <= 0
    ? 'bg-red-600'
    : stockPct < 50
      ? 'bg-red-500'
      : stockPct < 100
        ? 'bg-amber-500'
        : 'bg-emerald-500'

  return (
    <Modal open={open} onClose={onClose} title="Detalle del insumo" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{insumo.nombre}</h2>
          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium mt-2">
            {insumo.unidad}
          </span>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-600 dark:text-zinc-400">Stock</span>
            <span className={`font-medium ${insumo.stock <= insumo.stockMin ? 'text-red-600' : 'text-emerald-600'}`}>
              {insumo.stock} / {insumo.stockMin} mín
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stockColor}`}
              style={{ width: `${Math.min(stockPct, 100)}%` }}
            />
          </div>
          {insumo.stock <= insumo.stockMin && (
            <p className="text-xs text-red-600 mt-1">⚠ Stock bajo</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Precio unitario</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{formatCurrency(insumo.precioUnit)}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Valor en stock</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{formatCurrency(insumo.stock * insumo.precioUnit)}</p>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Proveedor</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{insumo.proveedor?.nombre || 'Sin proveedor asignado'}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => { onClose(); onEdit(insumo); }}
            className="flex-1 inline-flex items-center justify-center rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>
          <button
            onClick={() => { onClose(); onDelete(insumo); }}
            className="flex-1 inline-flex items-center justify-center rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        </div>
      </div>
    </Modal>
  )
}
