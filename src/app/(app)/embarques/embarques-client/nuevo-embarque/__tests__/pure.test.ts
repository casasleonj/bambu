// @tests funciones puras del wizard de "Nuevo Embarque"
import { describe, it, expect } from 'vitest'
import { derivarCarga, totalUnidadesCarga, resumenSeleccion, cargaVacia } from '../derivar-carga'
import { horaActualBogota } from '../defaults'
import { filtrarPedidosSeleccionables, tieneFiadoPendiente, type PedidoSeleccionable } from '../filtrar-pedidos'
import { sugerirCapacidad } from '../sugerir-capacidad'

// ─── derivar-carga ──────────────────────────────────────────────────────────

describe('derivarCarga', () => {
  it('suma por producto; BOTELLON = fábrica + domicilio', () => {
    const carga = derivarCarga([
      { cPacaAguaPed: 10, cBotellonFabPed: 2, cBotellonDomPed: 3 },
      { cPacaAguaPed: 5, cBolsaHieloPed: 4 },
    ])
    expect(carga).toEqual({ PACA_AGUA: 15, PACA_HIELO: 0, BOTELLON: 5, BOLSA_AGUA: 0, BOLSA_HIELO: 4 })
  })

  it('lista vacía → carga vacía', () => {
    expect(derivarCarga([])).toEqual(cargaVacia())
  })

  it('totalUnidadesCarga suma todo', () => {
    expect(totalUnidadesCarga({ PACA_AGUA: 15, PACA_HIELO: 0, BOTELLON: 5, BOLSA_AGUA: 0, BOLSA_HIELO: 4 })).toBe(24)
  })

  it('resumenSeleccion devuelve unidades y peso', () => {
    const r = resumenSeleccion([{ cPacaAguaPed: 10 }, { cBotellonFabPed: 4 }])
    expect(r.unidades).toBe(14)
    expect(r.pesoKg).toBeGreaterThan(0)
  })
})

// ─── defaults ───────────────────────────────────────────────────────────────

describe('horaActualBogota', () => {
  it('formatea "HH:MM" 24h', () => {
    // 2026-08-31 20:05 UTC = 15:05 Bogotá (UTC-5)
    expect(horaActualBogota(new Date('2026-08-31T20:05:00Z'))).toBe('15:05')
  })
  it('padea a 2 dígitos', () => {
    // 06:05 UTC = 01:05 Bogotá
    expect(horaActualBogota(new Date('2026-08-31T06:05:00Z'))).toBe('01:05')
  })
})

// ─── filtrar-pedidos ────────────────────────────────────────────────────────

function mkPedido(over: Partial<PedidoSeleccionable>): PedidoSeleccionable {
  return {
    id: 'p', numero: 1, estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
    embarqueId: null, fechaEntrega: null, horaPreferida: null, saldo: 0, total: 1000,
    nombreCli: 'Cliente', ...over,
  }
}

describe('filtrarPedidosSeleccionables', () => {
  const hoy = new Date().toISOString()
  const ayer = new Date(Date.now() - 86400000).toISOString()
  const en8dias = new Date(Date.now() + 8 * 86400000).toISOString()

  it('excluye los ya asignados a un embarque', () => {
    const r = filtrarPedidosSeleccionables([mkPedido({ embarqueId: 'e1' })])
    expect(r).toHaveLength(0)
  })

  it('excluye estados que no son PENDIENTE / NO_ENTREGADO', () => {
    const r = filtrarPedidosSeleccionables([mkPedido({ estadoEntrega: 'ENTREGADO' })])
    expect(r).toHaveLength(0)
  })

  it('por defecto oculta los futuros; el toggle los muestra', () => {
    const pedidos = [mkPedido({ id: 'fut', fechaEntrega: en8dias })]
    expect(filtrarPedidosSeleccionables(pedidos)).toHaveLength(0)
    expect(filtrarPedidosSeleccionables(pedidos, { verFuturos: true })).toHaveLength(1)
  })

  it('ordena: vencido → hoy con hora → hoy sin hora → sin fecha', () => {
    const r = filtrarPedidosSeleccionables([
      mkPedido({ id: 'sinfecha', fechaEntrega: null }),
      mkPedido({ id: 'hoy_sin', fechaEntrega: hoy }),
      mkPedido({ id: 'hoy_con', fechaEntrega: hoy, horaPreferida: '16:00' }),
      mkPedido({ id: 'vencido', fechaEntrega: ayer }),
    ])
    expect(r.map((p) => p.id)).toEqual(['vencido', 'hoy_con', 'hoy_sin', 'sinfecha'])
  })

  it('buscador filtra por nombre de cliente o negocio', () => {
    const r = filtrarPedidosSeleccionables(
      [mkPedido({ id: 'a', nombreCli: 'Ana' }), mkPedido({ id: 'b', nombreNegocioCli: 'Tienda El Sol' })],
      { buscar: 'sol' },
    )
    expect(r.map((p) => p.id)).toEqual(['b'])
  })

  it('tieneFiadoPendiente: solo si no está PAGADO y saldo > 0', () => {
    expect(tieneFiadoPendiente(mkPedido({ estadoPago: 'PENDIENTE', saldo: 500 }))).toBe(true)
    expect(tieneFiadoPendiente(mkPedido({ estadoPago: 'PAGADO', saldo: 0 }))).toBe(false)
    expect(tieneFiadoPendiente(mkPedido({ estadoPago: 'PENDIENTE', saldo: 0 }))).toBe(false)
  })
})

// ─── sugerir-capacidad ──────────────────────────────────────────────────────

describe('sugerirCapacidad', () => {
  const carlos = { id: 'c', nombre: 'Carlos', capacidadKg: 200 }
  const pedro = { id: 'p', nombre: 'Pedro', capacidadKg: 600 }

  it('carga liviana → ok, sin mensaje', () => {
    const r = sugerirCapacidad(derivarCarga([{ cPacaAguaPed: 5 }]), carlos, [carlos, pedro], 70)
    expect(r.nivel).toBe('ok')
    expect(r.mensaje).toBe('')
  })

  it('excede unidades → advierte + sugiere quitar o dividir, nunca bloquea', () => {
    const carga = derivarCarga([{ cPacaAguaPed: 90 }])
    const r = sugerirCapacidad(carga, carlos, [carlos, pedro], 70)
    expect(r.nivel).toBe('excede')
    expect(r.mensaje).toContain('90')
    expect(r.sugerencia).toMatch(/quitá|dividí/i)
  })

  it('excede peso pero hay otro repartidor con capacidad → lo sugiere', () => {
    // 30 pacas agua ≈ 30*8 = 240 kg > 200 (Carlos), < 600 (Pedro)
    const carga = derivarCarga([{ cPacaAguaPed: 30 }])
    const r = sugerirCapacidad(carga, carlos, [carlos, pedro], 200)
    expect(r.nivel).toBe('excede')
    expect(r.sugerencia).toContain('Pedro')
  })
})
