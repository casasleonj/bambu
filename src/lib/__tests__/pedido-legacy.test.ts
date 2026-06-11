// @tests buildPedidoLegacyFields — Sprint 3 (C-2 Fase 1)
// Helper compartido que sincroniza las 18 columnas legacy de Pedido
// desde items[]. Es single source of truth — venta-libre lo usa,
// el dominio DDD tiene su propio toLegacyFields() con la misma lógica.

import { describe, it, expect } from 'vitest'
import { buildPedidoLegacyFields, type LegacyItemInput } from '@/lib/pedido-legacy'

describe('buildPedidoLegacyFields: split botellón por canal', () => {
  it('FIX: canal DOMICILIO con BOTELLON → cBotellonDomPed lleno, cBotellonFabPed = 0', () => {
    // Antes (venta-libre): cBotellonFabPed=0 y cBotellonDomPed=cantidad
    // siempre. El helper ahora respeta el canal.
    const items: LegacyItemInput[] = [
      { producto: 'BOTELLON', cantidad: 3, cantEntrega: 3, precio: 15000 },
    ]
    const result = buildPedidoLegacyFields(items, 'DOMICILIO')
    expect(result.cBotellonDomPed).toBe(3)
    expect(result.cBotellonDomEnt).toBe(3)
    expect(result.cBotellonFabPed).toBe(0)
    expect(result.cBotellonFabEnt).toBe(0)
    expect(result.precioBotellonDom).toBe(15000)
    expect(result.precioBotellonFab).toBe(0)
  })

  it('FIX: canal PUNTO con BOTELLON → cBotellonFabPed lleno, cBotellonDomPed = 0', () => {
    // Antes: venta-libre ignoraba el canal y siempre ponía 0 en Fab.
    // El helper corrige el bug.
    const items: LegacyItemInput[] = [
      { producto: 'BOTELLON', cantidad: 5, cantEntrega: 5, precio: 15000 },
    ]
    const result = buildPedidoLegacyFields(items, 'PUNTO')
    expect(result.cBotellonFabPed).toBe(5)
    expect(result.cBotellonFabEnt).toBe(5)
    expect(result.cBotellonDomPed).toBe(0)
    expect(result.cBotellonDomEnt).toBe(0)
    expect(result.precioBotellonFab).toBe(15000)
    expect(result.precioBotellonDom).toBe(0)
  })
})

describe('buildPedidoLegacyFields: agregados de items múltiples', () => {
  it('FIX: PACA_AGUA + PACA_HIELO + BOLSA_AGUA + BOLSA_HIELO en una sola llamada', () => {
    const items: LegacyItemInput[] = [
      { producto: 'PACA_AGUA', cantidad: 2, precio: 2800 },
      { producto: 'PACA_HIELO', cantidad: 1, precio: 5500 },
      { producto: 'BOLSA_AGUA', cantidad: 10, precio: 500 },
      { producto: 'BOLSA_HIELO', cantidad: 5, precio: 700 },
    ]
    const result = buildPedidoLegacyFields(items, 'DOMICILIO')

    expect(result.cPacaAguaPed).toBe(2)
    expect(result.cPacaHieloPed).toBe(1)
    expect(result.cBolsaAguaPed).toBe(10)
    expect(result.cBolsaHieloPed).toBe(5)
    expect(result.precioPacaAgua).toBe(2800)
    expect(result.precioPacaHielo).toBe(5500)
    expect(result.precioBolsaAgua).toBe(500)
    expect(result.precioBolsaHielo).toBe(700)
  })

  it('FIX: items sin cantidad para un producto legacy = 0', () => {
    const items: LegacyItemInput[] = [{ producto: 'PACA_AGUA', cantidad: 3, precio: 2800 }]
    const result = buildPedidoLegacyFields(items, 'DOMICILIO')
    expect(result.cPacaHieloPed).toBe(0)
    expect(result.cBolsaAguaPed).toBe(0)
    expect(result.cBotellonDomPed).toBe(0)
    expect(result.cBotellonFabPed).toBe(0)
  })

  it('FIX: items vacíos = todos los legacy en 0', () => {
    const result = buildPedidoLegacyFields([], 'DOMICILIO')
    expect(result.cPacaAguaPed).toBe(0)
    expect(result.cPacaHieloPed).toBe(0)
    expect(result.cBotellonDomPed).toBe(0)
    expect(result.cBotellonFabPed).toBe(0)
    expect(result.cBolsaAguaPed).toBe(0)
    expect(result.cBolsaHieloPed).toBe(0)
    expect(result.precioPacaAgua).toBe(0)
  })
})

describe('buildPedidoLegacyFields: cantEntrega independiente de cantPedido', () => {
  it('FIX: cantEntrega opcional, fallback a cantPedido', () => {
    // Si cantEntrega no se provee, se usa cantPedido.
    // Útil para venta-libre donde cantEntrega === cantPedido en creación.
    const items: LegacyItemInput[] = [{ producto: 'PACA_AGUA', cantidad: 4, precio: 2800 }]
    const result = buildPedidoLegacyFields(items, 'DOMICILIO')
    expect(result.cPacaAguaPed).toBe(4)
    expect(result.cPacaAguaEnt).toBe(4)
  })

  it('FIX: cantEntrega explícita puede diferir de cantPedido', () => {
    // Para entregas parciales (futuro): cantEntrega < cantPedido.
    const items: LegacyItemInput[] = [
      { producto: 'PACA_AGUA', cantidad: 5, cantEntrega: 3, precio: 2800 },
    ]
    const result = buildPedidoLegacyFields(items, 'DOMICILIO')
    expect(result.cPacaAguaPed).toBe(5)
    expect(result.cPacaAguaEnt).toBe(3)
  })
})
