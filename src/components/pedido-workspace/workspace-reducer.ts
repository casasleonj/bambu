import type {
  DraftItem,
  DraftPedido,
  ProductoCodigo,
  WorkspaceAction,
  WorkspacePhase,
  WorkspaceState,
} from './types'
import { compradorDestinoKey, entregaDraftKey, isPreviewable, previewRequestKey } from './preview-request'

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

export function initWorkspace(draft?: Partial<DraftPedido>, pedidoId?: string): WorkspaceState {
  const merged = { ...EMPTY_DRAFT, ...draft }
  return {
    phase: isPreviewable(merged) ? 'DRAFTING' : (merged.clienteId || merged.clienteNuevo) ? 'CONTEXT_READY' : 'EMPTY',
    previewRevision: 0,
    destinoRevision: 0,
    previewPedidoId: pedidoId,
    draft: merged,
    valueOrigins: {},
    preview: null,
    previewPending: false,
    precioBajoConfirmado: {},
    reviewMotivo: '',
    sinConexion: false,
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
  const mismoDestino = entregaDraftKey(state.draft) === entregaDraftKey(draft)
  const destinoRevision = state.destinoRevision + Number(compradorDestinoKey(state.draft) !== compradorDestinoKey(draft))
  if (previewRequestKey(state.draft, state.previewPedidoId) === previewRequestKey(draft, state.previewPedidoId)) return { ...state, draft, destinoRevision }
  const entregaVisual = mismoDestino && isPreviewable(draft) ? (state.preview?.entrega ?? state.entregaVisual) : undefined
  if (state.phase === 'COMMITTING' || state.phase === 'COMMITTED') {
    return { ...state, draft, destinoRevision, entregaVisual: undefined, previewRevision: state.previewRevision + 1, preview: null, previewPending: false, sinConexion: false, reviewMotivo: '' }
  }
  let phase: WorkspacePhase
  if (!draft.clienteId && !draft.clienteNuevo) phase = 'EMPTY'
  else if (hasItems(draft)) phase = 'DRAFTING'
  else phase = 'CONTEXT_READY'
  // #347: corregir/registrar el pago de una venta ya offline no corta el flujo.
  // Solo conserva el fallo de transporte YA aceptado y para el mismo pedido
  // (excepto pagos); cambiar comprador, destino o cantidades exige comprobar de nuevo.
  const conservaOffline = state.sinConexion && !state.previewPedidoId && phase === 'DRAFTING' &&
    previewRequestKey({ ...state.draft, pagos: [] }) === previewRequestKey({ ...draft, pagos: [] })
  // un cambio en el draft invalida también el motivo de revisión capturado.
  return { ...state, phase, draft, destinoRevision, entregaVisual, previewRevision: state.previewRevision + 1, preview: null, previewPending: false, sinConexion: conservaOffline, reviewMotivo: '', error: null }
}

function acceptsPreview(state: WorkspaceState, revision: number): boolean {
  return revision === state.previewRevision && isPreviewable(state.draft) &&
    (state.phase === 'DRAFTING' || state.phase === 'PREVIEW_READY' || state.phase === 'REVIEW_REQUIRED')
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_CLIENTE': {
      const draft = {
        ...state.draft,
        clienteNuevo: undefined,
        excepcionId: undefined, // la excepción es de UN cliente
        clienteId: action.clienteId,
        negocioId: action.negocioId ?? null,
        // el destino propio y la casilla de guardar son de UN comprador (P1-4)
        entregaLat: null,
        entregaLng: null,
        guardarDireccionEnCliente: false,
        // CONSUMIDOR_FINAL ⇒ origen VENTA_RAPIDA (ventaRapida→origen, PO 2026-09-06)
        origen: action.clienteId === 'CONSUMIDOR_FINAL' || state.draft.ventaEnRuta ? 'VENTA_RAPIDA' as const : 'PEDIDO' as const,
        // sin comprador no hay «entregar después» (P2-2)
        ...(action.clienteId === 'CONSUMIDOR_FINAL' && state.draft.entregado === false ? { entregado: true, programacionFecha: undefined, programacionHora: undefined } : {}),
      }
      return afterDraftChange(state, draft)
    }
    case 'CLEAR_CLIENTE':
      // «Entregar después» exige comprador (P2-2): sin él vuelve a «ahora».
      return afterDraftChange(state, { ...state.draft, ...(state.draft.entregado === false ? { entregado: true, programacionFecha: undefined, programacionHora: undefined } : {}), clienteId: null, clienteNuevo: undefined, excepcionId: undefined, negocioId: null, entregaLat: null, entregaLng: null, guardarDireccionEnCliente: false })
    case 'SET_EXCEPCION':
      return afterDraftChange(state, { ...state.draft, excepcionId: action.excepcionId })
    case 'SET_CLIENTE_NUEVO': {
      // un cliente nuevo es siempre un cliente real: origen PEDIDO (D-OC4) y
      // sin cliente existente seleccionado ni negocio.
      if (action.clienteNuevo) {
        return afterDraftChange(state, {
          ...state.draft, clienteId: null, negocioId: null, origen: state.draft.ventaEnRuta ? 'VENTA_RAPIDA' : 'PEDIDO', clienteNuevo: action.clienteNuevo, excepcionId: undefined,
        })
      }
      return afterDraftChange(state, { ...state.draft, clienteNuevo: undefined })
    }
    case 'SET_NEGOCIO': {
      const draft = { ...state.draft, negocioId: action.negocioId, entregaLat: null, entregaLng: null, guardarDireccionEnCliente: false }
      // el selector de negocio resuelve la dirección de entrega efectiva
      if (action.direccion !== undefined) draft.direccionEntrega = action.direccion ?? ''
      if (action.barrio !== undefined) draft.barrioEntrega = action.barrio ?? ''
      // con negocio, "solo para este pedido" no aplica (nunca se persiste al Cliente)
      if (action.negocioId) draft.soloParaEstePedido = false
      return afterDraftChange(state, draft)
    }
    case 'SET_CANAL':
      // «Entregar después» solo existe en Punto (P2-2): al pasar a Domicilio vuelve a «ahora».
      return afterDraftChange(state, {
        ...state.draft,
        canal: action.canal,
        ...(action.canal !== state.draft.canal ? { programacionFecha: undefined, programacionHora: undefined } : {}),
        ...(action.canal !== 'PUNTO' && state.draft.entregado === false ? { entregado: true } : {}),
      })
    case 'SET_GUARDAR_DIRECCION_EN_CLIENTE':
      return { ...state, draft: { ...state.draft, guardarDireccionEnCliente: action.value } }
    case 'SET_SOLO_PARA_ESTE_PEDIDO':
      return { ...state, draft: { ...state.draft, soloParaEstePedido: action.value } }
    case 'SET_ITEM_CANTIDAD':
      return afterDraftChange(state, {
        ...state.draft,
        items: upsertItem(state.draft.items, action.producto, { cantidad: Math.max(0, action.cantidad) }),
      })
    case 'SET_ITEM_REGALO':
      return afterDraftChange(state, {
        ...state.draft,
        items: upsertItem(state.draft.items, action.producto, { cantidadRegalo: action.cantidad }),
      })
    case 'SET_ITEM_PRECIO_MANUAL': {
      const s = afterDraftChange(state, {
        ...state.draft,
        items: upsertItem(state.draft.items, action.producto, { precioManual: action.precioManual }),
      })
      return {
        ...s,
        valueOrigins: { ...s.valueOrigins, [`item.${action.producto}.precio`]: 'USER' },
        // cambiar el precio manual invalida cualquier confirmación previa de "precio bajo"
        precioBajoConfirmado: { ...s.precioBajoConfirmado, [action.producto]: state.draft.items.find(i => i.producto === action.producto)?.precioManual === action.precioManual
          ? (state.precioBajoConfirmado[action.producto] ?? false) : false },
      }
    }
    case 'CONFIRMAR_PRECIO_BAJO':
      return {
        ...state,
        precioBajoConfirmado: { ...state.precioBajoConfirmado, [action.producto]: true },
      }
    case 'SET_PAGOS':
      // edición manual de pagos: deja de seguir al total.
      return afterDraftChange(state, { ...state.draft, pagos: action.pagos, pagoCompleto: null })
    case 'PAGAR_COMPLETO': {
      // El total lo calcula el backend; si ya hay preview se usa, si no se
      // completa al llegar (PREVIEW_RECEIVED). El reducer no calcula precios.
      const total = state.preview?.calculation.total ?? action.total ?? 0
      return afterDraftChange(state, {
        ...state.draft,
        pagoCompleto: action.metodo,
        pagos: total > 0 ? [{ metodo: action.metodo, monto: total }] : [],
      })
    }
    case 'SET_ENTREGADO':
      return afterDraftChange(state, { ...state.draft, entregado: action.entregado, ...(action.entregado ? { programacionFecha: undefined, programacionHora: undefined } : {}) })
    case 'SET_PROGRAMACION':
      // El compromiso no cambia la cotización ni invalida el preview financiero.
      return { ...state, draft: { ...state.draft, programacionFecha: action.fecha || undefined, programacionHora: action.hora || undefined } }
    case 'SET_OBS':
      return { ...state, draft: { ...state.draft, obs: action.obs } } // obs no invalida el preview
    case 'SET_DIRECCION':
      return afterDraftChange(state, {
        ...state.draft,
        direccionEntrega: action.direccion,
        barrioEntrega: action.barrio,
      })
    case 'SET_UBICACION':
      if (action.destinoRevision !== undefined && action.destinoRevision !== state.destinoRevision) return state
      return afterDraftChange(state, {
        ...state.draft,
        entregaLat: action.lat,
        entregaLng: action.lng,
      })
    case 'APPLY_PROPOSAL': {
      const draft = { ...state.draft, ...action.draft }
      if (draft.canal !== state.draft.canal) { draft.programacionFecha = undefined; draft.programacionHora = undefined }
      const s = afterDraftChange(state, draft)
      return { ...s, valueOrigins: { ...s.valueOrigins, ...action.origins } }
    }
    case 'PREVIEW_PENDING':
      if (!acceptsPreview(state, action.revision)) return state
      return { ...state, previewPending: true }
    case 'PREVIEW_RECEIVED': {
      if (!acceptsPreview(state, action.revision)) return state
      // "Pagar completo": si el total del backend cambió, el pago lo sigue.
      // Re-sincronizar invalida este preview y dispara uno nuevo con el pago
      // correcto (el total no depende de los pagos, así que converge en una
      // vuelta). Nunca se confirma con un pago desactualizado.
      const metodoCompleto = state.draft.pagoCompleto
      if (metodoCompleto) {
        const total = action.preview.calculation.total
        const sincronizado =
          state.draft.pagos.length === 1 &&
          state.draft.pagos[0].metodo === metodoCompleto &&
          state.draft.pagos[0].monto === total
        if (!sincronizado && total > 0) {
          return {
            ...afterDraftChange({ ...state, sinConexion: false }, { ...state.draft, pagos: [{ metodo: metodoCompleto, monto: total }] }),
            entregaVisual: action.preview.entrega,
            previewPending: false,
          }
        }
      }
      const nextPhase: WorkspacePhase = action.preview.requiresAuthorization ? 'REVIEW_REQUIRED' : 'PREVIEW_READY'
      return { ...state, phase: nextPhase, previewPending: false, preview: action.preview, entregaVisual: action.preview.entrega, error: null, sinConexion: false }
    }
    case 'PREVIEW_ERROR':
      if (!acceptsPreview(state, action.revision)) return state
      // solo un fallo de RED habilita guardar sin conexión; una respuesta de
      // error del servidor (validación, 404…) sigue bloqueando el commit.
      return {
        ...state,
        phase: 'DRAFTING',
        preview: null,
        entregaVisual: undefined,
        reviewMotivo: '',
        previewPending: false,
        sinConexion: action.kind === 'NETWORK_ERROR',
        error: { kind: action.kind, message: action.message },
      }
    case 'ACKNOWLEDGE_REVIEW': {
      // motivo obligatorio (ALS A8 — nada se muta silenciosamente). El motivo
      // + `auditPreview` del backend son la traza; el paso AUTHORIZATION real
      // (aprobación de un tercero) es trabajo futuro con su propia acción y
      // política (PENDIENTE DE NEGOCIO §8.2) — no lo simula el acknowledge.
      if (state.phase !== 'REVIEW_REQUIRED' || action.motivo.trim().length === 0) return state
      return { ...state, reviewMotivo: action.motivo.trim(), phase: 'PREVIEW_READY' }
    }
    case 'RETURN_TO_DRAFTING':
      if (state.phase !== 'REVIEW_REQUIRED' && state.phase !== 'AUTHORIZATION_REQUIRED') return state
      return { ...state, phase: hasItems(state.draft) ? 'DRAFTING' : 'CONTEXT_READY', reviewMotivo: '' }
    case 'COMMIT_START':
      if (state.phase !== 'PREVIEW_READY' && state.phase !== 'AUTHORIZATION_REQUIRED' && !(state.sinConexion && state.phase === 'DRAFTING')) return state
      return { ...state, phase: 'COMMITTING', previewPending: false, error: null }
    case 'COMMIT_SUCCESS':
      return { ...state, phase: 'COMMITTED' }
    case 'COMMIT_CONFLICT':
      return { ...state, entregaVisual: undefined, phase: 'DRAFTING', previewRevision: state.previewRevision + 1, preview: null, previewPending: false, sinConexion: false, reviewMotivo: '', error: { kind: 'CONFLICT_ERROR', message: action.message } }
    case 'COMMIT_ERROR':
      return { ...state, phase: state.sinConexion || !state.preview ? 'DRAFTING' : 'PREVIEW_READY',
        previewRevision: !state.preview && !state.sinConexion ? state.previewRevision + 1 : state.previewRevision,
        error: { kind: 'VALIDATION_ERROR', message: action.message } }
    case 'RESET':
      return { ...initWorkspace(action.draft, state.previewPedidoId), destinoRevision: state.destinoRevision + 1, previewRevision: state.previewRevision + 1 }
    default:
      return state
  }
}

/** ¿el commit está permitido en el estado actual? (se cruza con allowedActions del preview) */
export function canCommit(state: WorkspaceState, accion: 'crear' | 'actualizar' = 'crear'): boolean {
  // B-20: sin red no hay preview. Solo se puede GUARDAR un pedido nuevo (la
  // edición es un PUT que no se encola) y el servidor valida al sincronizar.
  if (state.sinConexion && !state.previewPedidoId && accion === 'crear' && state.phase === 'DRAFTING' && isPreviewable(state.draft)) return true
  if (state.previewPending) return false
  if (state.phase !== 'PREVIEW_READY') return false
  return state.preview?.allowedActions.includes(accion) ?? false
}
