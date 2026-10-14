// @tests PR-1B/1C — reglas puras de selección y clasificación de la entrega física viva.
import { describe, it, expect, afterEach } from 'vitest'
import {
  FLAG_ENTREGA_VIVA,
  claveEventoEntrega,
  embarqueUsaEntregaVivaPorFlag,
  entregaFisicaVivaDesde,
  esEntregaDeMision,
  esEntregaSinAtribucion,
} from '../entrega-fisica-viva'

afterEach(() => { delete process.env[FLAG_ENTREGA_VIVA] })

describe('flag EMBARQUE_ENTREGA_VIVA_DESDE', () => {
  it('sin definir (o vacío / inválido) = apagado: ningún embarque usa el modo vivo', () => {
    expect(entregaFisicaVivaDesde()).toBeNull()
    expect(embarqueUsaEntregaVivaPorFlag(new Date())).toBe(false)
    process.env[FLAG_ENTREGA_VIVA] = ''
    expect(embarqueUsaEntregaVivaPorFlag(new Date())).toBe(false)
    process.env[FLAG_ENTREGA_VIVA] = 'no-es-una-fecha'
    expect(embarqueUsaEntregaVivaPorFlag(new Date())).toBe(false)
  })

  it('solo los embarques creados en/después de la fecha entran al modo vivo', () => {
    process.env[FLAG_ENTREGA_VIVA] = '2026-11-01T00:00:00.000Z'
    expect(embarqueUsaEntregaVivaPorFlag(new Date('2026-10-31T23:59:59.999Z'))).toBe(false)
    expect(embarqueUsaEntregaVivaPorFlag(new Date('2026-11-01T00:00:00.000Z'))).toBe(true)
    expect(embarqueUsaEntregaVivaPorFlag(new Date('2026-12-01T00:00:00.000Z'))).toBe(true)
  })
})

describe('clasificación de eventos ENTREGA', () => {
  it('clave idempotente por línea: entrega:<evento>:<PRODUCTO>', () => {
    expect(claveEventoEntrega('ev-1', 'PACA_AGUA')).toBe('entrega:ev-1:PACA_AGUA')
  })

  it('cuenta como entrega de misión: evento atribuido de /entrega y botellón manual; no post-cierre ni sustitución', () => {
    expect(esEntregaDeMision({ captura: 'ENTREGA_PEDIDO', pedidoId: 'p1' })).toBe(true)
    expect(esEntregaDeMision({ captura: 'ENTREGA_PEDIDO', pedidoId: 'p1', posCierre: true })).toBe(false)
    expect(esEntregaDeMision({ tipoEnvase: 'ENTREGADO' })).toBe(true)
    expect(esEntregaDeMision(null)).toBe(false) // p. ej. la ENTREGA de una Sustitución
  })

  it('sin identidad verificable: todo lo que no sea evento de /entrega ni del propio cierre', () => {
    expect(esEntregaSinAtribucion({ captura: 'ENTREGA_PEDIDO' })).toBe(false)
    expect(esEntregaSinAtribucion({ captura: 'CIERRE' })).toBe(false)
    expect(esEntregaSinAtribucion({ tipoEnvase: 'ENTREGADO' })).toBe(true)
    expect(esEntregaSinAtribucion(null)).toBe(true)
  })
})
