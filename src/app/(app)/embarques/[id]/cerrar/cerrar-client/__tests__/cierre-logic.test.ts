// @tests unit/cierre-logic (épica #447, Fase A) — entrega derivada, dinero, conciliación, venta libre
import { describe, it, expect } from 'vitest'
import {
  lineasEntrega,
  derivarEntrega,
  entregaCompleta,
  resumenDineroPedido,
  conciliar,
  clasificarErrorPreview,
  validarVentaLibre,
  totalVentaLibre,
  notaReduccionPendiente,
} from '../cierre-logic'
import type { Pedido, CuadrePedido, VentaLibre } from '../types'

function mkPedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', numero: 11, clienteId: 'c1', nombreCli: 'Carlos', cliente: { id: 'c1', nombre: 'Carlos', telefono: '300' },
    tipo: 'DOMICILIO',
    cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
    total: 23000, totalPagado: 0, saldo: 23000,
    ...over,
  }
}

const CERO = { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }

describe('lineasEntrega / derivarEntrega', () => {
  it('solo muestra productos pedidos y calcula pendiente descontando lo ya entregado', () => {
    const p = mkPedido({ cPacaAguaEnt: 4 })
    const l = lineasEntrega(p, { ...CERO, cPacaAguaEnt: 3 })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ pidio: 10, yaEntregado: 4, pendiente: 6, ahora: 3, falta: 3, exceso: 0 })
  })

  it('10 de 10 → COMPLETO sin decisión', () => {
    const r = derivarEntrega(lineasEntrega(mkPedido(), { ...CERO, cPacaAguaEnt: 10 }))
    expect(r).toMatchObject({ estado: 'COMPLETO', requiereDecision: false, hayExceso: false })
  })

  it('5 de 10 → PARCIAL y exige decisión', () => {
    const r = derivarEntrega(lineasEntrega(mkPedido(), { ...CERO, cPacaAguaEnt: 5 }))
    expect(r).toMatchObject({ estado: 'PARCIAL', requiereDecision: true, totalFalta: 5 })
  })

  it('0 de 10 → NO_ENTREGADO (sin decisión de pendiente: es explícito)', () => {
    const r = derivarEntrega(lineasEntrega(mkPedido(), CERO))
    expect(r).toMatchObject({ estado: 'NO_ENTREGADO', requiereDecision: false })
  })

  it('15 de 10 → exceso (la UI lo bloquea; el cliente pidió más = venta libre)', () => {
    const r = derivarEntrega(lineasEntrega(mkPedido(), { ...CERO, cPacaAguaEnt: 15 }))
    expect(r.hayExceso).toBe(true)
    expect(r.totalExceso).toBe(5)
  })

  it('pedido ya entregado en cierres anteriores y nada nuevo → COMPLETO', () => {
    const p = mkPedido({ cPacaAguaEnt: 10 })
    const r = derivarEntrega(lineasEntrega(p, CERO))
    expect(r.estado).toBe('COMPLETO')
  })

  it('botellón: una sola línea, usa la columna que el pedido realmente tiene', () => {
    const dom = mkPedido({ cPacaAguaPed: 0, cBotellonDomPed: 2 })
    const l = lineasEntrega(dom, { ...CERO, cBotellonDomEnt: 2 })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ key: 'cBotellonDomEnt', label: 'Botellón', pidio: 2, ahora: 2 })
    const fab = mkPedido({ cPacaAguaPed: 0, cBotellonFabPed: 3 })
    expect(lineasEntrega(fab, CERO)[0].key).toBe('cBotellonFabEnt')
  })

  it('entregaCompleta rellena con el pendiente de cada línea', () => {
    const p = mkPedido({ cPacaAguaEnt: 4, cBotellonDomPed: 2 })
    expect(entregaCompleta(p)).toEqual({ ...CERO, cPacaAguaEnt: 6, cBotellonDomEnt: 2 })
  })
})

describe('resumenDineroPedido', () => {
  const pedido = mkPedido({ total: 23000, totalPagado: 3000 })
  it('lo que queda por cobrar pasa a ser fiado', () => {
    const r = resumenDineroPedido(pedido, [{ metodo: 'EFECTIVO', monto: 10000 }])
    expect(r).toMatchObject({ valorPedido: 23000, yaPagado: 3000, cobrarAhora: 10000, saldoPrevio: 20000, queda: 10000, esFiado: true, excede: false, pagadoCompleto: false })
  })
  it('cobrar el saldo deja el pedido pagado completo', () => {
    const r = resumenDineroPedido(pedido, [{ metodo: 'NEQUI', monto: 20000 }])
    expect(r).toMatchObject({ queda: 0, esFiado: false, pagadoCompleto: true, digitalPorVerificar: 20000 })
  })
  it('detecta cobro mayor al saldo (el servidor lo rechaza con PAGOS_EXCEDIDOS)', () => {
    expect(resumenDineroPedido(pedido, [{ metodo: 'EFECTIVO', monto: 20001 }]).excede).toBe(true)
  })
  it('prepago completo: nada por cobrar', () => {
    const r = resumenDineroPedido(mkPedido({ total: 23000, totalPagado: 23000 }), [])
    expect(r).toMatchObject({ queda: 0, pagadoCompleto: true, esFiado: false })
  })
  it('efectivo y digital se separan (el efectivo es lo que entrega el repartidor)', () => {
    const r = resumenDineroPedido(pedido, [{ metodo: 'EFECTIVO', monto: 5000 }, { metodo: 'DAVIPLATA', monto: 2000 }])
    expect(r.efectivo).toBe(5000)
    expect(r.digitalPorVerificar).toBe(2000)
  })
})

describe('conciliar (espejo de CierreEmbarqueService)', () => {
  const carga = { PACA_AGUA: 3, PACA_HIELO: 2, BOTELLON: 1, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
  it('entregar más de lo cargado es discrepancia (antes decía «sin discrepancias»)', () => {
    const r = conciliar(carga, { PACA_AGUA: 5, PACA_HIELO: 2, BOTELLON: 1, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }, {})
    expect(r.porProducto.PACA_AGUA).toBe(-2)
    expect(r.totalSobrantes).toBe(2)
    expect(r.total).toBe(2)
  })
  it('cambios descuentan como en el servidor', () => {
    const r = conciliar(carga, { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }, { PACA_AGUA: { devueltas: 1, cambios: 1, rotas: 1 } })
    expect(r.porProducto.PACA_AGUA).toBe(0)
    expect(r.totalFaltantes).toBe(2 + 1)
  })
})

describe('clasificarErrorPreview', () => {
  it('400/409/422 son rechazos de negocio: se muestran y bloquean', () => {
    expect(clasificarErrorPreview(400, 'el pedido #11 no está completo')).toEqual({ tipo: 'rechazo', mensaje: 'el pedido #11 no está completo' })
    expect(clasificarErrorPreview(409, 'x').tipo).toBe('rechazo')
  })
  it('sin respuesta, 5xx y 429 son de red/servidor: estimado local', () => {
    expect(clasificarErrorPreview(null).tipo).toBe('red')
    expect(clasificarErrorPreview(500, 'Error al calcular').tipo).toBe('red')
    expect(clasificarErrorPreview(429).tipo).toBe('red')
  })
  it('401/403 son de sesión', () => {
    expect(clasificarErrorPreview(401).tipo).toBe('sesion')
  })
  it('rechazo sin mensaje usa uno genérico', () => {
    expect(clasificarErrorPreview(400).mensaje).toMatch(/revisa/i)
  })
})

describe('validarVentaLibre', () => {
  const base: VentaLibre = {
    clienteId: 'c1', clienteNombre: 'Carlos', cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
    pagos: [{ metodo: 'EFECTIVO', monto: 5600 }], obs: '',
  }
  it('venta válida, pagada completa', () => {
    expect(validarVentaLibre(base, 5600)).toEqual([])
  })
  it('sin cliente y sin «venta al paso» → pide elegir', () => {
    expect(validarVentaLibre({ ...base, clienteId: '' }, 5600).join(' ')).toMatch(/cliente|al paso/i)
  })
  it('pago sin productos no se descarta en silencio: bloquea', () => {
    const v = { ...base, cPacaAgua: 0 }
    expect(validarVentaLibre(v, 0).join(' ')).toMatch(/producto/i)
  })
  it('pago mayor al total bloquea', () => {
    expect(validarVentaLibre({ ...base, pagos: [{ metodo: 'EFECTIVO', monto: 90000 }] }, 5600).join(' ')).toMatch(/excede/i)
  })
  it('venta al paso sin pago completo bloquea (deuda invisible)', () => {
    const v = { ...base, clienteId: 'CONSUMIDOR_FINAL', anonima: true, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] }
    expect(validarVentaLibre(v, 5600).join(' ')).toMatch(/pago completo/i)
  })
  it('venta al paso con pago completo es válida', () => {
    const v = { ...base, clienteId: 'CONSUMIDOR_FINAL', anonima: true }
    expect(validarVentaLibre(v, 5600)).toEqual([])
  })
  it('cliente bloqueado con saldo bloquea; si paga completo, no', () => {
    const fiada = { ...base, clienteBloqueado: true, pagos: [] }
    expect(validarVentaLibre(fiada, 5600).join(' ')).toMatch(/bloquead/i)
    expect(validarVentaLibre({ ...base, clienteBloqueado: true }, 5600)).toEqual([])
  })
  it('fiado a cliente normal es válido', () => {
    expect(validarVentaLibre({ ...base, pagos: [] }, 5600)).toEqual([])
  })
})

describe('totalVentaLibre', () => {
  it('suma por producto con los precios resueltos; botellón único', () => {
    const v: VentaLibre = { clienteId: 'c', clienteNombre: '', cPacaAgua: 2, cPacaHielo: 1, cBotellonFab: 0, cBotellonDom: 1, cBolsaAgua: 0, cBolsaHielo: 0, pagos: [], obs: '' }
    expect(totalVentaLibre(v, { PACA_AGUA: 2800, PACA_HIELO: 2500, BOTELLON: 10000 })).toBe(2 * 2800 + 2500 + 10000)
  })
  it('producto sin precio resuelto aporta 0 (precio pendiente)', () => {
    const v: VentaLibre = { clienteId: 'c', clienteNombre: '', cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0, pagos: [], obs: '' }
    expect(totalVentaLibre(v, {})).toBe(0)
  })
})

describe('forma del cuadre', () => {
  it('CuadrePedido acepta decisionPendiente', () => {
    const c: Partial<CuadrePedido> = { decisionPendiente: 'OTRA_VISITA' }
    expect(c.decisionPendiente).toBe('OTRA_VISITA')
  })
})

describe('notaReduccionPendiente (#451: sin cambio de total)', () => {
  const ped = mkPedido()
  const cuadre = (over: Partial<CuadrePedido>): CuadrePedido => ({
    pedidoId: 'p1', entregado: 'PARCIAL', productosEntregados: { ...CERO, cPacaAguaEnt: 5 },
    preciosReales: { pacaAgua: 2300, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
    pagado: 'NO_PAGADO', pagos: [], ...over,
  })
  it('escribe el hecho con el número de pedido y las unidades', () => {
    const n = notaReduccionPendiente([ped], { p1: cuadre({ decisionPendiente: 'NO_QUIERE_RESTO' }) })
    expect(n).toContain('#11')
    expect(n).toContain('5 unidad')
    expect(n).toMatch(/no cambi/)
  })
  it('no dice nada si la decisión es otra visita o no hay pendiente', () => {
    expect(notaReduccionPendiente([ped], { p1: cuadre({ decisionPendiente: 'OTRA_VISITA' }) })).toBe('')
    expect(notaReduccionPendiente([ped], { p1: cuadre({ decisionPendiente: 'NO_QUIERE_RESTO', productosEntregados: { ...CERO, cPacaAguaEnt: 10 } }) })).toBe('')
  })
})
