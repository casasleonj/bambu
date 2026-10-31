// @tests #451 / ADR-REDUCCION-COMERCIAL-001 — traducción de errores de la reducción comercial a HTTP.
import { describe, it, expect } from 'vitest'
import { mapReduccionComercialError } from '../reduccion-comercial-http'

describe('mapReduccionComercialError', () => {
  it.each([
    ['FORBIDDEN: sin permiso', 403],
    ['PEDIDO_NOT_FOUND', 404],
    ['REDUCCION_NOT_FOUND', 404],
    ['LINEA_NO_ENCONTRADA: x', 404],
    ['CANTIDAD_INVALIDA: x', 400],
    ['MOTIVO_REQUERIDO: x', 400],
    ['CONSENTIMIENTO_REQUERIDO: x', 400],
    ['REDUCCION_SOBRE_ENTREGADO: x', 409],
    ['REDUCCION_TOTAL: x', 409],
    ['PEDIDO_NO_REDUCIBLE: x', 409],
    ['REDUCCION_PENDIENTE: x', 409],
    ['REDUCCION_OBSOLETA: x', 409],
    ['REDUCCION_GENERARIA_SOBREPAGO: x', 422],
  ])('%s → %i', (msg, status) => {
    expect(mapReduccionComercialError(msg)?.status).toBe(status)
  })

  it('devuelve el código y el texto sin el prefijo', () => {
    expect(mapReduccionComercialError('REDUCCION_GENERARIA_SOBREPAGO: ya pagó de más')).toEqual({
      status: 422,
      message: 'ya pagó de más',
      code: 'REDUCCION_GENERARIA_SOBREPAGO',
    })
  })

  it('un error desconocido no se traduce', () => {
    expect(mapReduccionComercialError('boom')).toBeNull()
  })
})
