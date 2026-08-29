// @tests unit/wizard-gating (Fase 7) — el wizard no deja avanzar pasos incompletos
import { describe, it, expect } from 'vitest'
import { pasoPedidosValido, pasoFisicoValido, pasoConfirmarValido } from '../wizard-gating'
import type { CuadrePedido } from '../types'

function mkCuadre(over: Partial<CuadrePedido> = {}): CuadrePedido {
  return {
    pedidoId: 'p1',
    entregado: 'COMPLETO',
    productosEntregados: {
      cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
      cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    },
    preciosReales: {
      pacaAgua: 5000, pacaHielo: 3000, botellonFab: 5000,
      botellonDom: 5000, bolsaAgua: 1000, bolsaHielo: 1000,
    },
    pagado: 'COMPLETO',
    pagos: [{ metodo: 'EFECTIVO', monto: 10000 }],
    ...over,
  }
}

describe('pasoPedidosValido (paso 0)', () => {
  it('es válido cuando los pagos no exceden el total entregado', () => {
    // totalReal = 2 * 5000 = 10000, pagado = 10000 → OK
    expect(pasoPedidosValido({ p1: mkCuadre() }).valido).toBe(true)
  })

  it('bloquea cuando un pedido tiene pagos que exceden el total entregado', () => {
    const cuadre = mkCuadre({ pagos: [{ metodo: 'EFECTIVO', monto: 15000 }] }) // 15000 > 10000
    const res = pasoPedidosValido({ p1: cuadre })
    expect(res.valido).toBe(false)
    expect(res.motivos.length).toBe(1)
    expect(res.motivos[0]).toContain('p1')
  })

  it('permite fiado (pagos menores al total)', () => {
    const cuadre = mkCuadre({ pagos: [{ metodo: 'EFECTIVO', monto: 6000 }] }) // 6000 < 10000 → fiado
    expect(pasoPedidosValido({ p1: cuadre }).valido).toBe(true)
  })
})

describe('pasoFisicoValido (paso 2)', () => {
  it('es válido sin discrepancia', () => {
    expect(pasoFisicoValido(0, '').valido).toBe(true)
  })

  it('es válido con discrepancia justificada', () => {
    expect(pasoFisicoValido(3, 'Se rompió una paca').valido).toBe(true)
  })

  it('bloquea con discrepancia sin justificar', () => {
    const res = pasoFisicoValido(3, '  ')
    expect(res.valido).toBe(false)
    expect(res.motivos[0]).toContain('3')
  })
})

describe('pasoConfirmarValido (paso 4)', () => {
  it('bloquea mientras el preview carga', () => {
    expect(pasoConfirmarValido(false, true).valido).toBe(false)
  })

  it('bloquea si el preview no se verificó', () => {
    expect(pasoConfirmarValido(false, false).valido).toBe(false)
  })

  it('habilita solo con preview verificado', () => {
    expect(pasoConfirmarValido(true, false).valido).toBe(true)
  })
})
