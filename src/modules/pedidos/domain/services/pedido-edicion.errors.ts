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

/**
 * El PUT no cambia el estado de entrega: entrega, cancelación, anulación,
 * envío, no-entrega y devolución a pendiente tienen su operación (factura/nota de crédito, pagos,
 * trazabilidad física del embarque, reconexión N2). Se rechaza indicando la vía.
 */
export class OperacionEspecializadaError extends Error {
  constructor(readonly destino: string, readonly via: string) {
    super('OPERACION_ESPECIALIZADA')
    this.name = 'OperacionEspecializadaError'
  }
}

/**
 * El pedido tiene gestión N2 (obligación pendiente) o un diferencial ya
 * aplicado: su total es Σ ítems + diferenciales, y recalcularlo desde los
 * ítems borraría o duplicaría ese diferencial. Las cantidades se corrigen con
 * `ajustar-cantidad`, que sí conoce N2.
 */
export class EdicionEconomicaN2Error extends Error {
  constructor() {
    super('PEDIDO_CON_N2_USE_AJUSTAR_CANTIDAD')
    this.name = 'EdicionEconomicaN2Error'
  }
}

/** Identidad de línea = producto. Un pedido con dos líneas del mismo producto es un estado inválido. */
export class LineasDuplicadasError extends Error {
  constructor(readonly productos: string[]) {
    super('LINEAS_DUPLICADAS')
    this.name = 'LineasDuplicadasError'
  }
}

/** Guardia final: lo que se iba a declarar como aplicado no coincide con lo persistido. */
export class EdicionNoPersistidaError extends Error {
  constructor(readonly campos: string[]) {
    super(`EDICION_NO_PERSISTIDA: ${campos.join(', ')}`)
    this.name = 'EdicionNoPersistidaError'
  }
}

/** `entregaLat`/`entregaLng` deben venir juntas y ser una ubicación utilizable (finitas, en rango, ≠ (0,0)). */
export class UbicacionEntregaInvalidaError extends Error {
  constructor() {
    super('UBICACION_ENTREGA_INVALIDA')
    this.name = 'UbicacionEntregaInvalidaError'
  }
}

/** La ubicación de destino solo existe para pedidos DOMICILIO. */
export class UbicacionSoloDomicilioError extends Error {
  constructor() {
    super('UBICACION_SOLO_DOMICILIO')
    this.name = 'UbicacionSoloDomicilioError'
  }
}

/** Vía correcta para cada destino de estado que el PUT NO ejecuta. */
export const VIA_OPERACION_ESPECIALIZADA: Readonly<Record<string, string>> = {
  ENTREGADO: 'Registre la entrega con POST /api/pedidos/[id]/entrega (cantidades, pagos, GPS/foto y reconexión N2).',
  CANCELADO: 'Cancele con POST /api/pedidos/[id]/cancelar (anula la factura y revierte pagos).',
  ANULADO: 'Anule con POST /api/pedidos/[id]/anular (nota de crédito y reversión).',
  EN_RUTA: 'Asigne a un embarque con POST /api/pedidos/[id]/enviar.',
  PENDIENTE: 'Para devolver el pedido a pendiente quítelo de su embarque con DELETE /api/embarques/[id]/pedidos/[pedidoId] (libera la asignación y avisa al repartidor).',
  NO_ENTREGADO: 'La no-entrega se registra al cerrar el embarque (cierre del embarque).',
}
