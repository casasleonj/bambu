/**
 * Botellones — movimientos físicos separados (FASE 8, ADR-BOTELLONES-001).
 *
 * Contrato §16: un botellón recogido sin entrega sigue siendo un estado válido
 * y consultable. Se conserva la diferencia `recogido ≠ entregado`, y NO se
 * transforma automáticamente una recogida en una entrega.
 *
 * Recogida y entrega se registran como movimientos físicos SEPARADOS del ledger
 * (RETORNO repartidor→almacén vs ENTREGA repartidor→cliente).
 */

import type { MovimientoFisicoInput } from './ledger-fisico.service'

export function construirMovimientoRecogidaBotellon(input: {
  cantidad: number
}): MovimientoFisicoInput {
  return {
    tipo: 'RETORNO',
    producto: 'BOTELLON',
    cantidad: input.cantidad,
    origen: 'VEHICULO',
    destino: 'ALMACEN',
    metadata: { tipoEnvase: 'RECOGIDO' },
  }
}

export function construirMovimientoEntregaBotellon(input: {
  cantidad: number
}): MovimientoFisicoInput {
  return {
    tipo: 'ENTREGA',
    producto: 'BOTELLON',
    cantidad: input.cantidad,
    origen: 'VEHICULO',
    destino: 'CLIENTE',
    metadata: { tipoEnvase: 'ENTREGADO' },
  }
}
