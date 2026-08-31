import { cargaVacia, derivarCarga, type Carga, PRODUCTOS_CARGA } from './derivar-carga'
import { horaActualBogota } from './defaults'
import type { PedidoSeleccionable } from './filtrar-pedidos'

/**
 * Máquina de estados del wizard de "Nuevo Embarque" (plan del equipo §17).
 *
 * Reemplaza los ~10 `useState` dispersos + booleanos del form viejo por un
 * único `useReducer` con transiciones explícitas. Objetivos:
 *  - imposible el doble submit (SUBMITTING no acepta SUBMIT de nuevo);
 *  - la selección y los campos del Paso 2 sobreviven al ir y volver entre pasos;
 *  - cada fase sabe qué puede hacer el usuario.
 */

export type Fase =
  | 'LOADING_ORDERS'
  | 'SELECTING_ORDERS'
  | 'REVIEWING'
  | 'SUBMITTING'
  | 'CREATED'
  | 'ASSIGNING'
  | 'SUCCESS'
  | 'CONFLICT'
  | 'OFFLINE_PENDING'
  | 'ERROR'

export interface WizardData {
  pedidos: PedidoSeleccionable[]
  selectedIds: string[]
  verFuturos: boolean
  buscar: string
  // Paso 2
  trabajadorId: string
  carga: Carga
  /** true si el usuario editó la carga a mano; deja de re-derivarse de los pedidos. */
  cargaEditada: boolean
  horaSalida: string
  baseDinero: number
  rutaId: string
  tipoMoto: string
  obs: string
  confirmOverride: boolean
  overrideMotivo: string
}

export interface WizardState {
  fase: Fase
  data: WizardData
  /** Resultado del submit. */
  embarqueId?: string
  /** Nombres/números de pedidos que no se pudieron asignar (409). */
  noAsignados?: string[]
  /** Mensaje humano de error recuperable. */
  error?: string
}

export type WizardAction =
  | { type: 'RESET'; horaSalida?: string }
  | { type: 'ORDERS_LOADED'; pedidos: PedidoSeleccionable[] }
  | { type: 'ORDERS_LOAD_ERROR' }
  | { type: 'SET_BUSCAR'; value: string }
  | { type: 'SET_VER_FUTUROS'; value: boolean }
  | { type: 'TOGGLE_PEDIDO'; id: string }
  | { type: 'DESELECCIONAR'; ids: string[] } // pedidos tomados por otro (realtime)
  | { type: 'REFRESH_PEDIDOS'; pedidos: PedidoSeleccionable[] }
  | { type: 'GOTO_CONFIRM' }
  | { type: 'GOTO_ORDERS' }
  | { type: 'SET_FIELD'; field: 'trabajadorId' | 'horaSalida' | 'rutaId' | 'tipoMoto' | 'obs' | 'overrideMotivo'; value: string }
  | { type: 'SET_BASE'; value: number }
  | { type: 'SET_CONFIRM_OVERRIDE'; value: boolean }
  | { type: 'SET_CARGA_ITEM'; producto: string; value: number }
  | { type: 'RESTORE_CARGA' }
  | { type: 'SUBMIT_START' }
  | { type: 'CREATED'; embarqueId: string }
  | { type: 'ASSIGN_START' }
  | { type: 'SUCCESS'; embarqueId: string }
  | { type: 'CONFLICT'; embarqueId: string; noAsignados: string[] }
  | { type: 'OFFLINE' }
  | { type: 'ERROR'; message: string }

export function initialData(horaSalida = horaActualBogota()): WizardData {
  return {
    pedidos: [],
    selectedIds: [],
    verFuturos: false,
    buscar: '',
    trabajadorId: '',
    carga: cargaVacia(),
    cargaEditada: false,
    horaSalida,
    baseDinero: 0,
    rutaId: '',
    tipoMoto: '',
    obs: '',
    confirmOverride: false,
    overrideMotivo: '',
  }
}

export function initialState(horaSalida?: string): WizardState {
  return { fase: 'LOADING_ORDERS', data: initialData(horaSalida) }
}

/** Carga derivada de la selección actual (si el usuario no la editó a mano). */
function recomputarCarga(data: WizardData): Carga {
  if (data.cargaEditada) return data.carga
  const elegidos = data.pedidos.filter((p) => data.selectedIds.includes(p.id))
  return derivarCarga(elegidos)
}

const SUBMIT_FASES: Fase[] = ['SUBMITTING', 'CREATED', 'ASSIGNING']

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const { data } = state

  switch (action.type) {
    case 'RESET':
      return initialState(action.horaSalida)

    case 'ORDERS_LOADED':
      return { fase: 'SELECTING_ORDERS', data: { ...data, pedidos: action.pedidos } }

    case 'ORDERS_LOAD_ERROR':
      return { ...state, fase: 'ERROR', error: 'No se pudieron cargar los pedidos. Reintentá.' }

    case 'REFRESH_PEDIDOS': {
      // realtime: refrescar la lista, deseleccionar los que ya tienen embarque
      const idsLibres = new Set(action.pedidos.filter((p) => !p.embarqueId).map((p) => p.id))
      const selectedIds = data.selectedIds.filter((id) => idsLibres.has(id))
      const next = { ...data, pedidos: action.pedidos, selectedIds }
      return { ...state, data: { ...next, carga: recomputarCarga(next) } }
    }

    case 'DESELECCIONAR': {
      const selectedIds = data.selectedIds.filter((id) => !action.ids.includes(id))
      const next = { ...data, selectedIds }
      return { ...state, data: { ...next, carga: recomputarCarga(next) } }
    }

    case 'SET_BUSCAR':
      return { ...state, data: { ...data, buscar: action.value } }

    case 'SET_VER_FUTUROS':
      return { ...state, data: { ...data, verFuturos: action.value } }

    case 'TOGGLE_PEDIDO': {
      const has = data.selectedIds.includes(action.id)
      const selectedIds = has
        ? data.selectedIds.filter((id) => id !== action.id)
        : [...data.selectedIds, action.id]
      const next = { ...data, selectedIds }
      return { ...state, data: { ...next, carga: recomputarCarga(next) } }
    }

    case 'GOTO_CONFIRM':
      if (state.fase !== 'SELECTING_ORDERS') return state
      return { fase: 'REVIEWING', data: { ...data, carga: recomputarCarga(data) } }

    case 'GOTO_ORDERS':
      if (state.fase !== 'REVIEWING') return state
      return { fase: 'SELECTING_ORDERS', data }

    case 'SET_FIELD':
      return { ...state, data: { ...data, [action.field]: action.value } }

    case 'SET_BASE':
      return { ...state, data: { ...data, baseDinero: Math.max(0, action.value) } }

    case 'SET_CONFIRM_OVERRIDE':
      return { ...state, data: { ...data, confirmOverride: action.value } }

    case 'SET_CARGA_ITEM': {
      if (!(PRODUCTOS_CARGA as readonly string[]).includes(action.producto)) return state
      return {
        ...state,
        data: {
          ...data,
          cargaEditada: true,
          carga: { ...data.carga, [action.producto]: Math.max(0, action.value) },
        },
      }
    }

    case 'RESTORE_CARGA': {
      const elegidos = data.pedidos.filter((p) => data.selectedIds.includes(p.id))
      return { ...state, data: { ...data, cargaEditada: false, carga: derivarCarga(elegidos) } }
    }

    case 'SUBMIT_START':
      if (SUBMIT_FASES.includes(state.fase)) return state // no doble submit
      return { ...state, fase: 'SUBMITTING', error: undefined, noAsignados: undefined }

    case 'CREATED':
      return { ...state, fase: 'CREATED', embarqueId: action.embarqueId }

    case 'ASSIGN_START':
      return { ...state, fase: 'ASSIGNING' }

    case 'SUCCESS':
      return { ...state, fase: 'SUCCESS', embarqueId: action.embarqueId }

    case 'CONFLICT':
      return { ...state, fase: 'CONFLICT', embarqueId: action.embarqueId, noAsignados: action.noAsignados }

    case 'OFFLINE':
      return { ...state, fase: 'OFFLINE_PENDING' }

    case 'ERROR':
      // Error recuperable: vuelve a REVIEWING para corregir.
      return { ...state, fase: 'REVIEWING', error: action.message }

    default:
      return state
  }
}

/** ¿Se puede confirmar (crear)? Solo en REVIEWING y con repartidor elegido. */
export function puedeConfirmar(state: WizardState): boolean {
  return state.fase === 'REVIEWING' && state.data.trabajadorId !== ''
}
