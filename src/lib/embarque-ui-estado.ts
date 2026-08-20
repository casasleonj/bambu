/**
 * Estado UI derivado del embarque (Command Center — Fase 3).
 *
 * Regla central (ADR-ARQUITECTURA-001 + contrato UX §2): el backend tiene 4
 * estados reales (`ABIERTO | EN_RUTA | CERRADO | CANCELADO`, autoridad en
 * `src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`). Cualquier
 * granularidad adicional de UX se DERIVA en cliente a partir de datos reales
 * (pedidos asignados, carga registrada) y NUNCA se persiste como estado nuevo.
 *
 * Precedencia para `ABIERTO`:
 *   1. tiene pedidos asignados           → CONFIRMADO
 *   2. tiene carga registrada (sin pedidos) → PREPARANDO
 *   3. nada                               → BORRADOR
 *
 * `RETORNADO`/`CONCILIANDO` (del plan de producto) NO es derivable de un
 * elemento de lista: es el contexto de *estar* dentro del flujo
 * `/embarques/[id]/cerrar`, no un valor persistido. Por eso no aparece como
 * fase de esta función.
 */

export type EstadoEmbarqueReal = 'ABIERTO' | 'EN_RUTA' | 'CERRADO' | 'CANCELADO'

export type FaseUIEmbarque =
  | 'BORRADOR'
  | 'PREPARANDO'
  | 'CONFIRMADO'
  | 'EN_RUTA'
  | 'CERRADO'
  | 'CANCELADO'

export interface EmbarqueUIEstadoInput {
  /** Estado real del embarque (string para tolerar datos legacy). */
  estado: string
  /** true si tiene al menos un pedido asignado. */
  tienePedidos?: boolean
  /** Unidades totales de carga registrada (productos cargados). */
  totalUnidadesCarga?: number
}

export interface EstadoUIDerivado {
  estadoReal: EstadoEmbarqueReal
  fase: FaseUIEmbarque
  /** Etiqueta para mostrar (titlecase). */
  label: string
  /** Clases Tailwind del badge. */
  badgeClass: string
}

export const BADGES: Record<FaseUIEmbarque, string> = {
  BORRADOR: 'bg-slate-100 text-slate-700',
  PREPARANDO: 'bg-amber-100 text-amber-800',
  CONFIRMADO: 'bg-green-100 text-green-800',
  EN_RUTA: 'bg-blue-100 text-blue-800',
  CERRADO: 'bg-gray-100 text-gray-800',
  CANCELADO: 'bg-red-100 text-red-800',
}

export const LABELS: Record<FaseUIEmbarque, string> = {
  BORRADOR: 'Borrador',
  PREPARANDO: 'Preparando',
  CONFIRMADO: 'Confirmado',
  EN_RUTA: 'En Ruta',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
}

export function derivarEstadoUI(input: EmbarqueUIEstadoInput): EstadoUIDerivado {
  const estado = input.estado as EstadoEmbarqueReal

  switch (estado) {
    case 'CANCELADO':
      return { estadoReal: 'CANCELADO', fase: 'CANCELADO', label: LABELS.CANCELADO, badgeClass: BADGES.CANCELADO }
    case 'CERRADO':
      return { estadoReal: 'CERRADO', fase: 'CERRADO', label: LABELS.CERRADO, badgeClass: BADGES.CERRADO }
    case 'EN_RUTA':
      return { estadoReal: 'EN_RUTA', fase: 'EN_RUTA', label: LABELS.EN_RUTA, badgeClass: BADGES.EN_RUTA }
    case 'ABIERTO': {
      const tienePedidos = input.tienePedidos === true
      const tieneCarga = (input.totalUnidadesCarga ?? 0) > 0

      if (tienePedidos) {
        return { estadoReal: 'ABIERTO', fase: 'CONFIRMADO', label: LABELS.CONFIRMADO, badgeClass: BADGES.CONFIRMADO }
      }
      if (tieneCarga) {
        return { estadoReal: 'ABIERTO', fase: 'PREPARANDO', label: LABELS.PREPARANDO, badgeClass: BADGES.PREPARANDO }
      }
      return { estadoReal: 'ABIERTO', fase: 'BORRADOR', label: LABELS.BORRADOR, badgeClass: BADGES.BORRADOR }
    }
    default:
      // Estado futuro/desconocido: no romper la lista, mostrar crudo.
      return { estadoReal: 'ABIERTO', fase: 'BORRADOR', label: String(estado), badgeClass: BADGES.BORRADOR }
  }
}

/** Fuente mínima para derivar el estado UI sin acoplar a un tipo de cliente. */
export interface EmbarqueUIEstadoSource {
  estado: string
  pedidos?: readonly unknown[] | null
  totalPacas?: number | null
  productos?: ReadonlyArray<{ cargadas?: number }> | null
}

/** Convierte una fuente real (Embarque) al input canónico de derivación. */
export function toUIEstadoInput(source: EmbarqueUIEstadoSource): EmbarqueUIEstadoInput {
  const totalUnidadesCarga =
    source.totalPacas ??
    source.productos?.reduce((sum, p) => sum + (p.cargadas ?? 0), 0) ??
    0
  return {
    estado: source.estado,
    tienePedidos: (source.pedidos?.length ?? 0) > 0,
    totalUnidadesCarga,
  }
}

export interface ConteoFasesUI {
  BORRADOR: number
  PREPARANDO: number
  CONFIRMADO: number
  EN_RUTA: number
  CERRADO: number
  CANCELADO: number
}

/** Orden canónico de presentación de las fases en el Command Center. */
export const FASES_ORDEN: FaseUIEmbarque[] = [
  'BORRADOR',
  'PREPARANDO',
  'CONFIRMADO',
  'EN_RUTA',
  'CERRADO',
  'CANCELADO',
]

/** Cuenta embarques por fase derivada (para el resumen del Command Center). */
export function contarPorFase(inputs: EmbarqueUIEstadoInput[]): ConteoFasesUI {
  const conteo: ConteoFasesUI = {
    BORRADOR: 0,
    PREPARANDO: 0,
    CONFIRMADO: 0,
    EN_RUTA: 0,
    CERRADO: 0,
    CANCELADO: 0,
  }
  for (const input of inputs) {
    conteo[derivarEstadoUI(input).fase]++
  }
  return conteo
}

/**
 * Mapea una fase UI al estado real que el backend entiende.
 * Las sub-fases de ABIERTO (BORRADOR/PREPARANDO/CONFIRMADO) colapsan a
 * 'ABIERTO'; el resto es 1:1.
 */
export function estadoBackendParaFase(fase: FaseUIEmbarque): EstadoEmbarqueReal {
  switch (fase) {
    case 'BORRADOR':
    case 'PREPARANDO':
    case 'CONFIRMADO':
      return 'ABIERTO'
    default:
      return fase
  }
}

/**
 * Siguiente paso del Preparation Flow (Fase 4).
 *
 * Guía al usuario a través de crear → asignar pedidos → preparar → enviar,
 * derivado de datos reales (nunca persistido). `label` es el siguiente paso
 * recomendado, o `null` si el embarque ya está en un estado terminal.
 * `accion` es la acción concreta que ejecuta ese paso (para la UI guiada).
 */
export type AccionPreparacion = 'REGISTRAR_CARGA' | 'ASIGNAR_PEDIDOS' | 'ENVIAR' | 'CERRAR' | null

export interface SiguientePaso {
  fase: FaseUIEmbarque
  label: string | null
  accion: AccionPreparacion
}

export function derivarSiguientePaso(input: EmbarqueUIEstadoInput): SiguientePaso {
  const { fase } = derivarEstadoUI(input)
  switch (fase) {
    case 'BORRADOR':
      return { fase, accion: 'REGISTRAR_CARGA', label: 'Registra la carga y asigna pedidos para preparar el embarque' }
    case 'PREPARANDO':
      return { fase, accion: 'ASIGNAR_PEDIDOS', label: 'Asigna pedidos al embarque para completar la preparación' }
    case 'CONFIRMADO':
      return { fase, accion: 'ENVIAR', label: 'Todo listo — envía el embarque en ruta' }
    case 'EN_RUTA':
      return { fase, accion: 'CERRAR', label: 'En ruta — cierra el embarque al retornar' }
    case 'CERRADO':
    case 'CANCELADO':
      return { fase, accion: null, label: null }
  }
}
