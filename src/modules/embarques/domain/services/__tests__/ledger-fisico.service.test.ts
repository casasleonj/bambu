// @tests FASE 2 — ledger físico (validación de dominio pura)
// ADR-FISICO-001, contrato §8/§9.
// Verifica: cantidad positiva, AJUSTE_AUTORIZADO exige effect+authorization+
// userId, y sustitución produce dos movimientos físicos separados.

import { describe, it, expect } from 'vitest'
import {
  validarMovimientoFisico,
  construirMovimientosSustitucion,
  CUSTODIAS,
} from '../ledger-fisico.service'

describe('validarMovimientoFisico — contrato §8', () => {
  it('rechaza cantidad <= 0', () => {
    expect(validarMovimientoFisico({ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 0 }))
      .toContain('cantidad debe ser un entero positivo')
    expect(validarMovimientoFisico({ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: -1 }))
      .toContain('cantidad debe ser un entero positivo')
  })

  it('rechaza cantidad no entera', () => {
    expect(validarMovimientoFisico({ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1.5 }))
      .toContain('cantidad debe ser un entero positivo')
  })

  it('rechaza producto vacío', () => {
    expect(validarMovimientoFisico({ tipo: 'ENTREGA', producto: '', cantidad: 1 }))
      .toContain('producto es obligatorio')
  })

  it('acepta un movimiento ENTREGA normal', () => {
    expect(validarMovimientoFisico({ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 2 }))
      .toEqual([])
  })

  it('AJUSTE_AUTORIZADO sin metadata.effect se rechaza', () => {
    const errores = validarMovimientoFisico({
      tipo: 'AJUSTE_AUTORIZADO',
      producto: 'PACA_AGUA',
      cantidad: 1,
      authorization: 'auth-1',
      userId: 'user-1',
      metadata: {},
    })
    expect(errores).toContain('AJUSTE_AUTORIZADO exige metadata.effect INCREASE|DECREASE')
  })

  it('AJUSTE_AUTORIZADO sin authorization se rechaza', () => {
    const errores = validarMovimientoFisico({
      tipo: 'AJUSTE_AUTORIZADO',
      producto: 'PACA_AGUA',
      cantidad: 1,
      userId: 'user-1',
      metadata: { effect: 'INCREASE' },
    })
    expect(errores).toContain('AJUSTE_AUTORIZADO exige authorization')
  })

  it('AJUSTE_AUTORIZADO sin userId se rechaza', () => {
    const errores = validarMovimientoFisico({
      tipo: 'AJUSTE_AUTORIZADO',
      producto: 'PACA_AGUA',
      cantidad: 1,
      authorization: 'auth-1',
      metadata: { effect: 'INCREASE' },
    })
    expect(errores).toContain('AJUSTE_AUTORIZADO exige userId')
  })

  it('AJUSTE_AUTORIZADO completo se acepta', () => {
    const errores = validarMovimientoFisico({
      tipo: 'AJUSTE_AUTORIZADO',
      producto: 'PACA_AGUA',
      cantidad: 1,
      authorization: 'auth-1',
      userId: 'user-1',
      metadata: { effect: 'DECREASE' },
    })
    expect(errores).toEqual([])
  })
})

describe('construirMovimientosSustitucion — contrato §9', () => {
  it('produce DOS movimientos físicos separados', () => {
    const { recepcion, entrega } = construirMovimientosSustitucion({
      producto: 'PACA_AGUA',
      cantidad: 1,
    })

    // Recepción: RETORNO repartidor → inspección (RECEPCION_DEFECTUOSA del §9).
    expect(recepcion.tipo).toBe('RETORNO')
    expect(recepcion.origen).toBe('VEHICULO')
    expect(recepcion.destino).toBe('INSPECCION')
    expect(recepcion.cantidad).toBe(1)

    // Entrega: ENTREGA repartidor → cliente.
    expect(entrega.tipo).toBe('ENTREGA')
    expect(entrega.origen).toBe('VEHICULO')
    expect(entrega.destino).toBe('CLIENTE')
    expect(entrega.cantidad).toBe(1)

    // Son hechos separados, no un único movimiento con dos efectos.
    expect(recepcion.tipo).not.toBe(entrega.tipo)
  })

  it('ambos movimientos son válidos', () => {
    const { recepcion, entrega } = construirMovimientosSustitucion({
      producto: 'BOTELLON',
      cantidad: 3,
    })
    expect(validarMovimientoFisico(recepcion)).toEqual([])
    expect(validarMovimientoFisico(entrega)).toEqual([])
  })
})

describe('CUSTODIAS', () => {
  it('incluye los valores de custodia documentados', () => {
    expect(CUSTODIAS).toContain('VEHICULO')
    expect(CUSTODIAS).toContain('INSPECCION')
    expect(CUSTODIAS).toContain('CLIENTE')
    expect(CUSTODIAS).toContain('ALMACEN')
  })
})
