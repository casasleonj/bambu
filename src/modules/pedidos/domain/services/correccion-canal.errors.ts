/**
 * Errores de la corrección de canal de un pedido (TEMPORAL-SIN-EMBARQUE, #472).
 *
 * Cada error lleva un `codigo` estable para la API y un mensaje en lenguaje
 * sencillo: es lo que la pantalla le muestra al administrador tal cual.
 */
export type CorreccionCanalCodigo =
  | 'MOTIVO_REQUERIDO'
  | 'CANAL_SIN_CAMBIO'
  | 'PEDIDO_CERRADO'
  | 'PEDIDO_EN_EMBARQUE'
  | 'YA_HAY_ENTREGA'
  | 'N2_ACTIVO'
  | 'DESTINO_INSUFICIENTE'
  | 'TOTAL_MENOR_A_PAGADO'

export class CorreccionCanalError extends Error {
  constructor(
    readonly codigo: CorreccionCanalCodigo,
    mensaje: string,
    /** Cifras para mostrar el impacto (solo `TOTAL_MENOR_A_PAGADO`). */
    readonly impacto?: { totalNuevo: number; totalPagado: number; diferencia: number },
  ) {
    super(mensaje)
    this.name = 'CorreccionCanalError'
  }
}

/** Estado HTTP de cada error de la corrección de canal. */
export const ESTADO_HTTP_CORRECCION_CANAL: Record<CorreccionCanalCodigo, number> = {
  MOTIVO_REQUERIDO: 422,
  CANAL_SIN_CAMBIO: 422,
  PEDIDO_CERRADO: 409,
  PEDIDO_EN_EMBARQUE: 409,
  YA_HAY_ENTREGA: 409,
  N2_ACTIVO: 409,
  DESTINO_INSUFICIENTE: 422,
  TOTAL_MENOR_A_PAGADO: 409,
}
