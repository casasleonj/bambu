// @tests FASE 8 — botellones (movimientos físicos separados)
// ADR-BOTELLONES-001, contrato §16: recogido ≠ entregado.

import { describe, it, expect } from 'vitest'
import {
  construirMovimientoRecogidaBotellon,
  construirMovimientoEntregaBotellon,
} from '../botellones.service'
import { validarMovimientoFisico } from '../ledger-fisico.service'

describe('botellones — contrato §16', () => {
  it('recogida es un RETORNO (repartidor→almacén), no una entrega', () => {
    const m = construirMovimientoRecogidaBotellon({ cantidad: 3 })
    expect(m.tipo).toBe('RETORNO')
    expect(m.producto).toBe('BOTELLON')
    expect(m.origen).toBe('VEHICULO')
    expect(m.destino).toBe('ALMACEN')
    expect(validarMovimientoFisico(m)).toEqual([])
  })

  it('entrega es un ENTREGA (repartidor→cliente), distinta de la recogida', () => {
    const m = construirMovimientoEntregaBotellon({ cantidad: 2 })
    expect(m.tipo).toBe('ENTREGA')
    expect(m.origen).toBe('VEHICULO')
    expect(m.destino).toBe('CLIENTE')
    expect(validarMovimientoFisico(m)).toEqual([])
  })

  it('recogida y entrega son hechos físicos separados (no se transforma automáticamente)', () => {
    const recogida = construirMovimientoRecogidaBotellon({ cantidad: 1 })
    const entrega = construirMovimientoEntregaBotellon({ cantidad: 1 })
    expect(recogida.tipo).not.toBe(entrega.tipo)
  })
})
