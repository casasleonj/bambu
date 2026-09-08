import type {
  DraftItem,
  DraftPedido,
  ProductoCodigo,
  WorkspaceAction,
  WorkspacePhase,
  WorkspaceState,
} from './types'

/**
 * Reducer del **estado efímero de la experiencia** del PedidosWorkspace
 * (blueprint §3.3). Modela la máquina de UI de la ALS §6 de forma adaptativa.
 *
 * NO contiene reglas de negocio: no calcula precios, no valida límites de
 * fiado, no decide transiciones de estado. Todo eso vive en el backend y
 * llega vía `PREVIEW_RECEIVED` (respuesta de `POST /api/pedidos/preview`).
 * El commit real (`POST /api/pedidos`) revalida todo.
 */

export const EMPTY_DRAFT: DraftPedido = {
  clienteId: null,
  negocioId: null,
  canal: 'DOMICILIO',
  origen: 'PEDIDO',
  items: [],
  pagos: [],
}

export function initWorkspace(draft?: Partial<DraftPedido>): WorkspaceState {
  const merged = { ...EMPTY_DRAFT, ...draft }
  return {
    phase: merged.clienteId ? (merged.items.length > 0 ? 'DRAFTING' : 'CONTEXT_READY') : 'EMPTY',
    draft: merged,
    valueOrigins: {},
    preview: null,
    previewPending: false,
    error: null,
  }
}

function upsertItem(items: DraftItem[], producto: ProductoCodigo, patch: Partial<DraftItem>): DraftItem[] {
  const idx = items.findIndex((i) => i.producto === producto)
  if (idx === -1) return [...items, { producto, cantidad: 0, ...patch }]
  const next = [...items]
  next[idx] = { ...next[idx], ...patch }
  return next
}

/** ¿el draft tiene al menos un producto con cantidad > 0? */
function hasItems(draft: DraftPedido): boolean {
  return draft.items.some((i) => i.cantidad > 0)
}

/**
 * Un cambio en el draft invalida el preview previo: se vuelve a DRAFTING
 * (salvo estados terminales o de commit en curso).
 */
function afterDraftChange(state: WorkspaceState, draft: DraftPedido): WorkspaceState {
  if (state.phase === 'COMMITTING' || state.phase === 'COMMITTED') {
    return { ...state, draft }
  }
  let phase: WorkspacePhase
  if (!draft.clienteId) phase = 'EMPTY'
  else if (hasItems(draft)) phase = 'DRAFTING'
  else phase = 'CONTEXT_READY'
  return { ...state, phase, draft, preview: null, error: null }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_CLIENTE': {
      const draft = {
        ...state.draft,
        clienteId: action.clienteId,
        negocioId: action.negocioId ?? null,
        // CONSUMIDOR_FINAL ⇒ origen VENTA_RAPIDA (ventaRapida→origen, PO 2026-09-06)
        origen: action.clienteId === 'CONSUMIDOR_FINAL' ? 'VENTA_RAPIDA' as const : 'PEDIDO' as const,
      }
      return afterDraftChange(state, draft)
    }
    case 'CLEAR_CLIENTE':
      return afterDraftChange(state, { ...state.draft, clienteId: null, negocioId: null })
    case 'SET_NEGOCIO':
      return afterDraftChange(state, { ...state.draft, negocioId: action.negocioId })
    case 'SET_CANAL':
      return afterDraftChange(state, { ...state.draft, canal: action.canal })
    case 'SET_ITEM_CANTIDAD':
      return afterDraftChange(state, {
        ...state.draft,
        items: upsertItem(state.draft.items, action.producto, { cantidad: Math.max(0, action.cantidad) }),
      })
    case 'SET_ITEM_PRECIO_MANUAL': {
      const s = afterDraftChange(state, {
        ...state.draft,
        items: upsertItem(state.draft.items, action.producto, { precioManual: action.precioManual }),
      })
      return {
        ...s,
        valueOrigins: { ...s.valueOrigins, [`item.${action.producto}.precio`]: 'USER' },
      }
    }
    case 'SET_PAGOS':
      return afterDraftChange(state, { ...state.draft, pagos: action.pagos })
    case 'SET_ENTREGADO':
      return afterDraftChange(state, { ...state.draft, entregado: action.entregado })
    case 'SET_OBS':
      return { ...state, draft: { ...state.draft, obs: action.obs } } // obs no invalida el preview
    case 'SET_DIRECCION':
      return afterDraftChange(state, {
        ...state.draft,
        direccionEntrega: action.direccion,
        barrioEntrega: action.barrio,
      })
    case 'APPLY_PROPOSAL': {
      const draft = { ...state.draft, ...action.draft }
      const s = afterDraftChange(state, draft)
      return { ...s, valueOrigins: { ...s.valueOrigins, ...action.origins } }
    }
    case 'PREVIEW_PENDING':
      return { ...state, previewPending: true }
    case 'PREVIEW_RECEIVED': {
      // Solo aplica si seguimos en un estado que espera preview.
      if (state.phase !== 'DRAFTING' && state.phase !== 'PREVIEW_READY' && state.phase !== 'REVIEW_REQUIRED') {
        return { ...state, previewPending: false, preview: action.preview }
      }
      const nextPhase: WorkspacePhase = action.preview.requiresAuthorization ? 'REVIEW_REQUIRED' : 'PREVIEW_READY'
      return { ...state, phase: nextPhase, previewPending: false, preview: action.preview, error: null }
    }
    case 'PREVIEW_ERROR':
      return { ...state, previewPending: false, error: { kind: action.kind, message: action.message } }
    case 'ACKNOWLEDGE_REVIEW':
      if (state.phase !== 'REVIEW_REQUIRED') return state
      return { ...state, phase: state.preview?.requiresAuthorization ? 'AUTHORIZATION_REQUIRED' : 'PREVIEW_READY' }
    case 'COMMIT_START':
      if (state.phase !== 'PREVIEW_READY' && state.phase !== 'AUTHORIZATION_REQUIRED') return state
      return { ...state, phase: 'COMMITTING', error: null }
    case 'COMMIT_SUCCESS':
      return { ...state, phase: 'COMMITTED' }
    case 'COMMIT_CONFLICT':
      return { ...state, phase: 'DRAFTING', preview: null, error: { kind: 'CONFLICT_ERROR', message: action.message } }
    case 'COMMIT_ERROR':
      return { ...state, phase: 'PREVIEW_READY', error: { kind: 'VALIDATION_ERROR', message: action.message } }
    case 'RESET':
      return initWorkspace(action.draft)
    default:
      return state
  }
}

/** ¿el commit está permitido en el estado actual? (se cruza con allowedActions del preview) */
export function canCommit(state: WorkspaceState): boolean {
  if (state.phase !== 'PREVIEW_READY' && state.phase !== 'AUTHORIZATION_REQUIRED') return false
  return state.preview?.allowedActions.includes('crear') ?? false
}
