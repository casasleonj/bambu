import { describe, expect, it } from 'vitest'
import { previewRequestKey, entregaDraftKey, compradorDestinoKey } from '../preview-request'
import type { DraftPedido } from '../types'

const draft = (regalos: number): DraftPedido => ({
  clienteId: 'c1', negocioId: null, canal: 'DOMICILIO', origen: 'PEDIDO', pagos: [],
  items: [{ producto: 'PACA_AGUA', cantidad: 60, cantidadRegalo: regalos, precioManual: 2300 }],
})

describe('#795 · regalos y revisión vigente del preview', () => {
  it('cambiar el regalo cambia la clave y el cuerpo del preview', () => {
    expect(previewRequestKey(draft(3))).not.toBe(previewRequestKey(draft(4)))
    const body: unknown = JSON.parse(previewRequestKey(draft(3)))
    expect(body).toMatchObject({ items: [{ producto: 'PACA_AGUA', cantidad: 60, cantidadRegalo: 3, precioManual: 2300 }] })
  })
  it('editar el regalo conserva la identidad del comprador y del destino', () => {
    expect(entregaDraftKey(draft(3))).toBe(entregaDraftKey(draft(4)))
    expect(compradorDestinoKey(draft(3))).toBe(compradorDestinoKey(draft(4)))
  })
})
