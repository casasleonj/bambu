'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { PRODUCTO_INFO } from '@/lib/prices'
import { PedidoPricingSummary } from '@/components/pedido-form-unified/pedido-pricing-summary'
import { workspaceReducer, initWorkspace, canCommit, EMPTY_DRAFT } from './workspace-reducer'
import { usePreview } from './use-preview'
import type { DraftPedido, ProductoCodigo, WorkspaceErrorKind } from './types'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { PedidoUnifiedData } from '@/components/pedido-form-unified'

const CODIGO_TO_PRODID: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCTO_INFO).map(([prodId, info]) => [info.codigo, prodId]),
)
const PRODUCTOS: ProductoCodigo[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

export interface PedidosWorkspaceProps {
  clientes: Array<{ id: string; nombre: string; apellido?: string }>
  /** intención inicial — determina el origen del draft. */
  intent?: 'pedido' | 'venta-rapida'
  initialDraft?: Partial<DraftPedido>
  /** mismo contrato que `PedidoFormUnified.onSubmit` — reusa `handlePedidoSubmit` de pedidos-client. */
  onSubmit: (data: PedidoUnifiedData) => void
  onCancel?: () => void
}

/**
 * PedidosWorkspace (blueprint §3.2) — la captura como **workspace adaptativo**,
 * no un formulario. Zonas que aparecen por `state.phase`. El cálculo, el
 * riesgo y las acciones permitidas vienen del backend (`POST /api/pedidos/preview`,
 * vía `usePreview`) — este componente **muestra y compone**, no recalcula.
 *
 * C1 (fase Composición): shell + reducer + preview + `PedidoPricingSummary`
 * del backend + commit. La recomposición completa de `PedidoContextPanel` /
 * `PedidoItemEditor` (con su maquinaria de fiado / patrón de consumo / tiers)
 * es C1b — ver `docs/pedidos/fase-composicion-plan.md`.
 */
export function PedidosWorkspace({ clientes, intent, initialDraft, onSubmit, onCancel }: PedidosWorkspaceProps) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    { ...EMPTY_DRAFT, origen: intent === 'venta-rapida' ? 'VENTA_RAPIDA' : 'PEDIDO', ...initialDraft },
    initWorkspace,
  )

  const onPending = useCallback(() => dispatch({ type: 'PREVIEW_PENDING' }), [])
  const onReceived = useCallback((preview: PreviewPedidoResult) => dispatch({ type: 'PREVIEW_RECEIVED', preview }), [])
  const onError = useCallback((kind: WorkspaceErrorKind, message: string) => dispatch({ type: 'PREVIEW_ERROR', kind, message }), [])

  usePreview(state.draft, { onPending, onReceived, onError })

  const calc = state.preview?.calculation
  const pricingLineas = useMemo(
    () => state.draft.items
      .filter((i) => i.cantidad > 0)
      .map((i) => {
        const previewItem = calc?.items.find((c) => c.producto === i.producto)
        return {
          prodId: CODIGO_TO_PRODID[i.producto] ?? i.producto,
          cantidad: i.cantidad,
          // el precio unitario viene del backend; sin preview aún, se muestra 0
          precio: previewItem?.precioUnitario ?? 0,
        }
      }),
    [state.draft.items, calc],
  )

  const cantidad = (p: ProductoCodigo) => state.draft.items.find((i) => i.producto === p)?.cantidad ?? 0

  const commitEnabled = canCommit(state) && state.phase === 'PREVIEW_READY'

  const handleCommit = () => {
    dispatch({ type: 'COMMIT_START' })
    onSubmit({
      clienteId: state.draft.clienteId ?? undefined,
      negocioId: state.draft.negocioId ?? undefined,
      canal: state.draft.canal,
      origen: state.draft.origen,
      items: state.draft.items
        .filter((i) => i.cantidad > 0)
        .map((i) => ({ producto: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
      preciosManuales: Object.fromEntries(
        state.draft.items.filter((i) => i.precioManual).map((i) => [i.producto, i.precioManual as number]),
      ),
      pagos: state.draft.pagos,
      obs: state.draft.obs,
      entregado: state.draft.entregado,
    })
  }

  return (
    <div className="space-y-4" data-testid="pedidos-workspace">
      {/* ── Zona: Contexto ── */}
      <section data-testid="workspace-contexto">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Cliente</label>
        <select
          data-testid="workspace-cliente"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={state.draft.clienteId ?? ''}
          onChange={(e) => (e.target.value ? dispatch({ type: 'SET_CLIENTE', clienteId: e.target.value }) : dispatch({ type: 'CLEAR_CLIENTE' }))}
        >
          <option value="">— elegir cliente —</option>
          <option value="CONSUMIDOR_FINAL">Consumidor Final (venta rápida)</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</option>
          ))}
        </select>
        <div className="mt-2 flex gap-2">
          {(['DOMICILIO', 'PUNTO'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              data-testid={`workspace-canal-${ch}`}
              onClick={() => dispatch({ type: 'SET_CANAL', canal: ch })}
              className={`rounded-lg border px-3 py-1.5 text-xs ${state.draft.canal === ch ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'}`}
            >
              {ch === 'DOMICILIO' ? '🚚 Domicilio' : '🏪 Punto'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Zona: Operación ── */}
      <section data-testid="workspace-operacion">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Productos</label>
        <div className="space-y-1.5">
          {PRODUCTOS.map((p) => (
            <div key={p} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{PRODUCTO_INFO[CODIGO_TO_PRODID[p]]?.nombre ?? p}</span>
              <div className="flex items-center gap-2">
                <button type="button" data-testid={`workspace-dec-${p}`} onClick={() => dispatch({ type: 'SET_ITEM_CANTIDAD', producto: p, cantidad: cantidad(p) - 1 })} className="h-7 w-7 rounded border">−</button>
                <span data-testid={`workspace-cant-${p}`} className="w-8 text-center">{cantidad(p)}</span>
                <button type="button" data-testid={`workspace-inc-${p}`} onClick={() => dispatch({ type: 'SET_ITEM_CANTIDAD', producto: p, cantidad: cantidad(p) + 1 })} className="h-7 w-7 rounded border">+</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Zona: Cálculo (del backend) ── */}
      <section data-testid="workspace-calculo">
        <PedidoPricingSummary
          lineas={pricingLineas}
          total={calc?.total ?? 0}
          totalPagado={calc?.totalPagado ?? 0}
          saldoPendiente={calc?.saldoProyectado ?? 0}
        />
        {state.previewPending && <p className="mt-1 text-xs text-gray-400" data-testid="workspace-preview-pending">Calculando…</p>}
        {state.error && (
          <p className="mt-1 text-xs text-amber-700" data-testid="workspace-error">{state.error.message}</p>
        )}
      </section>

      {/* ── Zona: Señales (C2) ── warnings del preview, mínimo en C1 ── */}
      {(state.preview?.warnings.length ?? 0) > 0 && (
        <section data-testid="workspace-warnings" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          {state.preview!.warnings.map((w) => <div key={w.code}>{w.message}</div>)}
        </section>
      )}

      {/* ── Zona: Commit ── */}
      <div className="flex items-center justify-between border-t pt-3" data-testid="workspace-commit-bar">
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-gray-500">Cancelar</button>}
        <button
          type="button"
          data-testid="workspace-commit"
          disabled={!commitEnabled}
          onClick={handleCommit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {state.phase === 'COMMITTING' ? 'Creando…' : `Crear pedido${calc ? ` $${calc.total.toLocaleString()}` : ''}`}
        </button>
      </div>
    </div>
  )
}
