'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import { PedidoPricingSummary } from '@/components/pedido-form-unified/pedido-pricing-summary'
import { PedidoItemEditor, type PedidoItemEditorItem } from '@/components/pedido-form-unified/pedido-item-editor'
import { workspaceReducer, initWorkspace, canCommit, EMPTY_DRAFT } from './workspace-reducer'
import { usePreview } from './use-preview'
import { useItemPricing } from './use-item-pricing'
import type { DraftPedido, ProductoCodigo, WorkspaceErrorKind } from './types'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { PedidoUnifiedData } from '@/components/pedido-form-unified'

const CODIGO_TO_PRODID: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCTO_INFO).map(([prodId, info]) => [info.codigo, prodId]),
)

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

  const { tabla, configs, loading: pricingLoading, precioBaseFor } = useItemPricing()

  const calc = state.preview?.calculation

  const cantOf = useCallback(
    (codigo: ProductoCodigo) => state.draft.items.find((i) => i.producto === codigo)?.cantidad ?? 0,
    [state.draft.items],
  )

  const editorItems: PedidoItemEditorItem[] = useMemo(() => {
    const prodIds = getProductosForCanal(state.draft.canal, configs)
    return prodIds.map((prodId) => {
      const codigo = PRODUCTO_INFO[prodId].codigo as ProductoCodigo
      const draftItem = state.draft.items.find((i) => i.producto === codigo)
      const previewItem = calc?.items.find((c) => c.producto === codigo)
      const precioBase = precioBaseFor(codigo, state.draft.canal)
      return {
        prodId,
        cantidad: draftItem?.cantidad ?? 0,
        precio: previewItem?.precioUnitario ?? draftItem?.precioManual ?? precioBase,
        precioBase,
        precioManual: draftItem?.precioManual,
        precioOrigen: previewItem?.precioOrigen,
        tiers: tabla[codigo] ?? [],
        precioBajoConfirmado: Boolean(state.precioBajoConfirmado[codigo]),
      }
    })
  }, [state.draft.canal, state.draft.items, state.precioBajoConfirmado, calc, configs, tabla, precioBaseFor])

  const setCantidad = useCallback(
    (prodId: string, cantidad: number) => {
      const codigo = PRODUCTO_INFO[prodId].codigo as ProductoCodigo
      dispatch({ type: 'SET_ITEM_CANTIDAD', producto: codigo, cantidad })
    },
    [],
  )
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
        <PedidoItemEditor
          testIdPrefix="workspace"
          items={editorItems}
          preciosLoading={state.previewPending || pricingLoading}
          onIncrement={(prodId) => setCantidad(prodId, cantOf(PRODUCTO_INFO[prodId].codigo as ProductoCodigo) + 1)}
          onDecrement={(prodId) => setCantidad(prodId, cantOf(PRODUCTO_INFO[prodId].codigo as ProductoCodigo) - 1)}
          onCantidadChange={(prodId, value) => {
            const n = parseInt(value, 10)
            setCantidad(prodId, Number.isNaN(n) ? 0 : n)
          }}
          onPrecioManualChange={(codigo, valor) =>
            dispatch({
              type: 'SET_ITEM_PRECIO_MANUAL',
              producto: codigo as ProductoCodigo,
              precioManual: valor > 0 ? valor : undefined,
            })
          }
          onConfirmarPrecioBajo={(codigo) => dispatch({ type: 'CONFIRMAR_PRECIO_BAJO', producto: codigo as ProductoCodigo })}
        />
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
