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
    expect(pasoConfirmarValido(false, true, false).valido).toBe(false)
  })

  it('bloquea en el estado inicial (preview aún no arrancó)', () => {
    expect(pasoConfirmarValido(false, false, false).valido).toBe(false)
  })

  it('habilita con preview verificado y sin advertencias', () => {
    const res = pasoConfirmarValido(true, false, false)
    expect(res.valido).toBe(true)
    expect(res.advertencias ?? []).toHaveLength(0)
  })

  it('NO bloquea si el preview falló (best-effort) pero muestra advertencia', () => {
    const res = pasoConfirmarValido(false, false, true)
    expect(res.valido).toBe(true)
    expect(res.motivos).toHaveLength(0)
    expect(res.advertencias?.length).toBeGreaterThan(0)
  })
})

// ─── Cierre V2 (épica #447, Fase A) ─────────────────────────────────────
import { pasoPedidosValidoV2, pasoVentasLibresValido } from '../wizard-gating'
import type { Pedido, VentaLibre } from '../types'

function mkPedidoV2(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', numero: 11, clienteId: 'c1', nombreCli: 'Carlos', cliente: { id: 'c1', nombre: 'Carlos', telefono: '300' }, tipo: 'DOMICILIO',
    cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
    total: 23000, totalPagado: 0, saldo: 23000, ...over,
  }
}
const ent = (agua: number) => ({ cPacaAguaEnt: agua, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 })
function cuadreV2(agua: number, over: Partial<CuadrePedido> = {}): CuadrePedido {
  return { pedidoId: 'p1', entregado: 'COMPLETO', productosEntregados: ent(agua), preciosReales: { pacaAgua: 2300, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 }, pagado: 'NO_PAGADO', pagos: [], ...over }
}

describe('pasoPedidosValidoV2', () => {
  it('entrega completa sin cobro es válida (queda fiado)', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(10) }).valido).toBe(true)
  })
  it('entrega parcial sin decidir qué pasa con el resto bloquea, con el # del pedido', () => {
    const r = pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(5) })
    expect(r.valido).toBe(false)
    expect(r.motivos[0]).toContain('#11')
    expect(r.motivos[0]).toMatch(/5/)
  })
  it('entrega parcial con decisión «otra visita» es válida', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(5, { decisionPendiente: 'OTRA_VISITA' }) }).valido).toBe(true)
  })
  it('entrega parcial con «ya no quiere el resto» también es válida (queda pendiente de oficina)', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(5, { decisionPendiente: 'NO_QUIERE_RESTO' }) }).valido).toBe(true)
  })
  it('exceso bloquea y manda a venta libre', () => {
    const r = pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(15) })
    expect(r.valido).toBe(false)
    expect(r.motivos.join(' ')).toMatch(/venta libre/i)
  })
  it('no entregado (0) es válido sin decisión', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2()], { p1: cuadreV2(0) }).valido).toBe(true)
  })
  it('cobro mayor al saldo pendiente bloquea (PAGOS_EXCEDIDOS del servidor)', () => {
    const r = pasoPedidosValidoV2([mkPedidoV2({ totalPagado: 3000 })], { p1: cuadreV2(10, { pagos: [{ metodo: 'EFECTIVO', monto: 20001 }] }) })
    expect(r.valido).toBe(false)
    expect(r.motivos[0]).toContain('#11')
  })
  it('cobrar justo el saldo es válido', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2({ totalPagado: 3000 })], { p1: cuadreV2(10, { pagos: [{ metodo: 'EFECTIVO', monto: 20000 }] }) }).valido).toBe(true)
  })
  it('un pedido sin cuadre se ignora', () => {
    expect(pasoPedidosValidoV2([mkPedidoV2()], {}).valido).toBe(true)
  })
})

describe('pasoVentasLibresValido', () => {
  const v: VentaLibre = { clienteId: 'c1', clienteNombre: 'C', cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0, pagos: [{ metodo: 'EFECTIVO', monto: 5600 }], obs: '' }
  it('sin ventas es válido (paso opcional)', () => {
    expect(pasoVentasLibresValido([], []).valido).toBe(true)
  })
  it('agrupa los motivos por venta con su número', () => {
    const r = pasoVentasLibresValido([{ ...v, clienteId: '' }], [5600])
    expect(r.valido).toBe(false)
    expect(r.motivos[0]).toContain('Venta 1')
  })
  it('venta válida pasa', () => {
    expect(pasoVentasLibresValido([v], [5600]).valido).toBe(true)
  })
})

describe('pasoConfirmarValido con rechazo del servidor', () => {
  it('un rechazo de negocio bloquea y muestra el mensaje real', () => {
    const r = pasoConfirmarValido(false, false, false, 'el pedido #11 no está completo')
    expect(r.valido).toBe(false)
    expect(r.motivos[0]).toContain('el pedido #11 no está completo')
  })
  it('sin rechazo mantiene el comportamiento actual (red = no bloquea)', () => {
    expect(pasoConfirmarValido(false, false, true).valido).toBe(true)
  })
})

describe('pasoFisicoValido con sobrantes', () => {
  it('un sobrante (entregó más de lo cargado) también exige justificación', () => {
    expect(pasoFisicoValido(2, '').valido).toBe(false)
  })
})
