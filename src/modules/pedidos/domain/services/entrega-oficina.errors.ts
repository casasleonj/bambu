/**
 * Errores de la entrega de oficina (TEMPORAL-SIN-EMBARQUE, #472).
 *
 * Cada error lleva un `codigo` estable para la API y un mensaje en lenguaje
 * sencillo: es lo que la pantalla le muestra al administrador tal cual.
 */
export type EntregaOficinaCodigo =
  | 'REPARTIDOR_REQUERIDO'
  | 'REPARTIDOR_INVALIDO'
  | 'REPARTIDOR_DISTINTO'
  | 'QUIEN_RECIBIO_REQUERIDO'
  | 'FECHA_FUTURA'
  | 'FECHA_MUY_ANTIGUA'
  | 'DIA_CERRADO'
  | 'NOMINA_EXISTENTE'
  | 'DEUDOR_REQUERIDO'
  | 'PROMESA_REQUERIDA'
  | 'PROMESA_PASADA'
  | 'SIN_UNIDADES'

export class EntregaOficinaError extends Error {
  constructor(
    readonly codigo: EntregaOficinaCodigo,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'EntregaOficinaError'
  }
}

/** Días hacia atrás que se permite registrar una entrega de oficina. */
export const DIAS_MAX_ATRAS_ENTREGA_OFICINA = 7

/** Estado HTTP de cada error, compartido por las rutas de la gestión de oficina. */
export const ESTADO_HTTP_OFICINA: Record<EntregaOficinaCodigo, number> = {
  REPARTIDOR_REQUERIDO: 422,
  REPARTIDOR_INVALIDO: 422,
  REPARTIDOR_DISTINTO: 409,
  QUIEN_RECIBIO_REQUERIDO: 422,
  FECHA_FUTURA: 422,
  FECHA_MUY_ANTIGUA: 422,
  DIA_CERRADO: 409,
  NOMINA_EXISTENTE: 409,
  DEUDOR_REQUERIDO: 422,
  PROMESA_REQUERIDA: 422,
  PROMESA_PASADA: 422,
  SIN_UNIDADES: 422,
}
