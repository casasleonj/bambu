/**
 * Errores de dominio de la EDICIÓN de un Pedido (PUT /api/pedidos/[id]).
 * Cada uno lleva el dato necesario para mostrar el IMPACTO al usuario: la
 * edición se rechaza explícitamente en vez de decidir una política comercial.
 */

/**
 * La edición dejaría `total < totalPagado`. Hacerlo implicaría devolver,
 * acreditar o absorber dinero ya cobrado — una decisión comercial que este
 * endpoint NO toma. Se rechaza mostrando el impacto.
 */
export class TotalMenorAPagadoError extends Error {
  constructor(
    readonly impacto: { totalAnterior: number; totalNuevo: number; totalPagado: number; diferencia: number },
  ) {
    super('TOTAL_MENOR_A_PAGADO')
    this.name = 'TotalMenorAPagadoError'
  }
}

/** Se pidió un cambio de información sobre un pedido ya cerrado (histórico). */
export class PedidoCerradoError extends Error {
  constructor(readonly estado: string, readonly campos: string[]) {
    super('PEDIDO_CERRADO')
    this.name = 'PedidoCerradoError'
  }
}
