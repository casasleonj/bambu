import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calcularAlertas, calcularAlertasCliente, calcularPromedioCliente } from '@/lib/alertas-detector'
import type { PedidoBase } from '@/lib/alertas-detector'
import { UMBRALES_DEFAULT } from '@/lib/umbrales'

// Helper para construir un PedidoBase de test
function makePedido(overrides: Partial<PedidoBase> = {}): PedidoBase {
  return {
    id: 'p-default',
    numero: 1,
    clienteId: 'cli-1',
    nombreCli: 'Cliente Test',
    telefonoCli: '3000000000',
    fecha: new Date().toISOString(),
    total: 10000,
    saldo: 0,
    estadoEntrega: 'ENTREGADO',
    estadoPago: 'PAGADO',
    disputaAbierta: false,
    cPacaAguaPed: 0,
    cPacaHieloPed: 0,
    cBotellonFabPed: 0,
    cBotellonDomPed: 0,
    cBolsaAguaPed: 0,
    cBolsaHieloPed: 0,
    precioPacaAgua: 0,
    precioPacaHielo: 0,
    precioBotellonFab: 0,
    precioBotellonDom: 0,
    precioBolsaAgua: 0,
    precioBolsaHielo: 0,
    ...overrides,
  }
}

beforeEach(() => {
  // localStorage mock para estaIgnorada
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size
      },
    } as Storage
  } else {
    globalThis.localStorage.clear()
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('calcularPromedioCliente', () => {
  it('retorna 0 si no hay pedidos validos', () => {
    expect(calcularPromedioCliente([])).toBe(0)
  })

  it('excluye pedidos ANULADO y CANCELADO', () => {
    const pedidos = [
      makePedido({ id: '1', total: 10000 }),
      makePedido({ id: '2', total: 20000, estadoEntrega: 'ANULADO' }),
      makePedido({ id: '3', total: 30000, estadoEntrega: 'CANCELADO' }),
    ]
    // Promedio solo del primer pedido = 10000
    expect(calcularPromedioCliente(pedidos)).toBe(10000)
  })

  it('calcula promedio simple sobre pedidos validos', () => {
    const pedidos = [
      makePedido({ total: 10000 }),
      makePedido({ total: 20000 }),
      makePedido({ total: 30000 }),
    ]
    expect(calcularPromedioCliente(pedidos)).toBe(20000)
  })
})

describe('calcularAlertas — firma backward-compat', () => {
  it('acepta la firma antigua (pedidos, clienteIdIgnorar)', () => {
    const pedidos = [makePedido({ clienteId: 'c1', fecha: new Date().toISOString() })]
    // No debe throw
    const result = calcularAlertas(pedidos, 'c1')
    expect(Array.isArray(result)).toBe(true)
  })

  it('acepta la firma nueva (pedidos, options)', () => {
    const pedidos = [makePedido({ fecha: new Date().toISOString() })]
    const result = calcularAlertas(pedidos, { umbrales: UMBRALES_DEFAULT })
    expect(Array.isArray(result)).toBe(true)
  })

  it('acepta la firma minima (pedidos solo)', () => {
    const pedidos: PedidoBase[] = []
    const result = calcularAlertas(pedidos)
    expect(result).toEqual([])
  })
})

describe('calcularAlertas — detecciones (smoke tests)', () => {
  it('detecta MONTO_ANOMALO cuando pedido es > 2x promedio', () => {
    // Promedio historico: 10000. Pedido actual: 50000 (> 2x)
    const pedidos = [
      makePedido({ id: 'old1', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'old2', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'new', clienteId: 'c1', total: 50000, estadoEntrega: 'PENDIENTE' }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'MONTO_ANOMALO')).toBe(true)
  })

  it('NO detecta MONTO_ANOMALO si el pedido es <= 2x promedio', () => {
    const pedidos = [
      makePedido({ id: 'old1', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'old2', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'new', clienteId: 'c1', total: 15000, estadoEntrega: 'PENDIENTE' }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'MONTO_ANOMALO')).toBe(false)
  })

  it('detecta DISPUTA_ABIERTA', () => {
    const pedidos = [
      makePedido({ id: 'p1', clienteId: 'c1', disputaAbierta: true }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'DISPUTA_ABIERTA')).toBe(true)
  })

  it('detecta CLIENTE_BLOQUEADO cuando estadoPago = VENCIDO', () => {
    const pedidos = [
      makePedido({ id: 'p1', clienteId: 'c1', estadoPago: 'VENCIDO' }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'CLIENTE_BLOQUEADO')).toBe(true)
  })

  it('detecta FIADO_REcurrente (2+ pedidos con saldo en 7 dias)', () => {
    const hoy = new Date()
    const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
    const pedidos = [
      makePedido({ id: 'f1', clienteId: 'c1', saldo: 5000, fecha: ayer.toISOString() }),
      makePedido({ id: 'f2', clienteId: 'c1', saldo: 3000, fecha: hoy.toISOString() }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'FIADO_REcurrente')).toBe(true)
  })

  it('detecta CAMBIO_PRECIO_BRUSCO con variacion > 30%', () => {
    const pedidos = [
      makePedido({
        id: 'old',
        clienteId: 'c1',
        estadoEntrega: 'ENTREGADO',
        fecha: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 2000,
      }),
      makePedido({
        id: 'new',
        clienteId: 'c1',
        fecha: new Date().toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 5000, // 150% mas caro
      }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'CAMBIO_PRECIO_BRUSCO')).toBe(true)
  })

  it('NO detecta CAMBIO_PRECIO_BRUSCO si la variacion es < 30%', () => {
    const pedidos = [
      makePedido({
        id: 'old',
        clienteId: 'c1',
        estadoEntrega: 'ENTREGADO',
        fecha: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 2000,
      }),
      makePedido({
        id: 'new',
        clienteId: 'c1',
        fecha: new Date().toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 2200, // 10% mas caro
      }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'CAMBIO_PRECIO_BRUSCO')).toBe(false)
  })

  it('skipea CAMBIO_PRECIO_BRUSCO si precioOrigen = "manual"', () => {
    // TODO commit 2: este test cambiara cuando se cambie a autorizadoPorAdmin
    const pedidos = [
      makePedido({
        id: 'old',
        clienteId: 'c1',
        estadoEntrega: 'ENTREGADO',
        fecha: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 2000,
      }),
      makePedido({
        id: 'new',
        clienteId: 'c1',
        estadoEntrega: 'PENDIENTE', // explicito para que NO se incluya en el map de precios
        estadoPago: 'PENDIENTE',
        fecha: new Date().toISOString(),
        cPacaAguaPed: 0, // legacy vacio, usa items
        precioPacaAgua: 0,
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 5000, precioOrigen: 'manual' }],
      }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'CAMBIO_PRECIO_BRUSCO')).toBe(false)
  })

  it('detecta NO_ENTREGADO_REPETIDO (2+ en 30 dias)', () => {
    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const pedidos = [
      makePedido({ id: 'ne1', clienteId: 'c1', estadoEntrega: 'NO_ENTREGADO', fecha: hace10dias.toISOString() }),
      makePedido({ id: 'ne2', clienteId: 'c1', estadoEntrega: 'NO_ENTREGADO', fecha: hace5dias.toISOString() }),
    ]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'NO_ENTREGADO_REPETIDO')).toBe(true)
  })
})

describe('calcularAlertas — umbrales respetados', () => {
  it('usa multiplicadorMontoAnomalo del parametro umbrales (no el default)', () => {
    // Promedio de [10000, 10000, 60000] = 26666. Con default (2x): 60000 > 53333 → dispara.
    // Con multiplicador=3: 60000 > 80000 → NO dispara.
    const pedidos = [
      makePedido({ id: 'old1', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'old2', clienteId: 'c1', total: 10000, estadoEntrega: 'ENTREGADO' }),
      makePedido({ id: 'new', clienteId: 'c1', total: 60000, estadoEntrega: 'PENDIENTE' }),
    ]
    // Default (2): 60000 > 26666*2 = 53333 → dispara
    const resultDefault = calcularAlertas(pedidos)
    const flatDefault = resultDefault.flatMap((r) => r.alertas)
    expect(flatDefault.some((a) => a.tipo === 'MONTO_ANOMALO')).toBe(true)

    // Con multiplicador=3: 60000 > 26666*3 = 80000 → NO dispara
    const resultAlto = calcularAlertas(pedidos, {
      umbrales: { ...UMBRALES_DEFAULT, multiplicadorMontoAnomalo: 3 },
    })
    const flatAlto = resultAlto.flatMap((r) => r.alertas)
    expect(flatAlto.some((a) => a.tipo === 'MONTO_ANOMALO')).toBe(false)
  })

  it('usa variacionPrecioBruscoPct del parametro umbrales', () => {
    // 50% de variacion
    const pedidos = [
      makePedido({
        id: 'old',
        clienteId: 'c1',
        estadoEntrega: 'ENTREGADO',
        fecha: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 2000,
      }),
      makePedido({
        id: 'new',
        clienteId: 'c1',
        fecha: new Date().toISOString(),
        cPacaAguaPed: 5,
        precioPacaAgua: 3000, // 50% mas caro
      }),
    ]
    // Default 30%: 50% > 30% → dispara
    const resultDefault = calcularAlertas(pedidos)
    expect(resultDefault.flatMap((r) => r.alertas).some((a) => a.tipo === 'CAMBIO_PRECIO_BRUSCO')).toBe(true)

    // Con variacion 60%: 50% < 60% → NO dispara
    const resultAlto = calcularAlertas(pedidos, {
      umbrales: { ...UMBRALES_DEFAULT, variacionPrecioBruscoPct: 60 },
    })
    expect(resultAlto.flatMap((r) => r.alertas).some((a) => a.tipo === 'CAMBIO_PRECIO_BRUSCO')).toBe(false)
  })
})

describe('calcularAlertasCliente — umbrales respetados', () => {
  const clienteBase = {
    id: 'cli-1',
    nombre: 'Cliente Test',
    telefono: '3000000000',
    verificado: false,
    bloqueado: false,
    reclamaciones: 0,
  }

  it('detecta CLIENTE_NO_VERIFICADO con diasNoVerificado default (30)', () => {
    const hace35Dias = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
    const result = calcularAlertasCliente(
      { ...clienteBase, createdAt: hace35Dias },
      [],
    )
    expect(result.some((a) => a.tipo === 'CLIENTE_NO_VERIFICADO')).toBe(true)
  })

  it('NO detecta CLIENTE_NO_VERIFICADO si dias < default (30)', () => {
    const hace10Dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const result = calcularAlertasCliente(
      { ...clienteBase, createdAt: hace10Dias },
      [],
    )
    expect(result.some((a) => a.tipo === 'CLIENTE_NO_VERIFICADO')).toBe(false)
  })

  it('respeta umbrales.diasNoVerificado del parametro', () => {
    const hace15Dias = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    // Con default 30: 15 dias NO dispara
    const resultDefault = calcularAlertasCliente(
      { ...clienteBase, createdAt: hace15Dias },
      [],
    )
    expect(resultDefault.some((a) => a.tipo === 'CLIENTE_NO_VERIFICADO')).toBe(false)

    // Con diasNoVerificado=7: 15 dias SI dispara
    const resultEstricto = calcularAlertasCliente(
      { ...clienteBase, createdAt: hace15Dias },
      [],
      { umbrales: { ...UMBRALES_DEFAULT, diasNoVerificado: 7 } },
    )
    expect(resultEstricto.some((a) => a.tipo === 'CLIENTE_NO_VERIFICADO')).toBe(true)
  })

  it('detecta RECLAMACIONES_MULTIPLES cuando >= 3', () => {
    const result = calcularAlertasCliente(
      { ...clienteBase, reclamaciones: 3 },
      [],
    )
    expect(result.some((a) => a.tipo === 'RECLAMACIONES_MULTIPLES')).toBe(true)
  })

  it('detecta RECLAMACION_ACTIVA cuando 1-2', () => {
    const result = calcularAlertasCliente(
      { ...clienteBase, reclamaciones: 2 },
      [],
    )
    expect(result.some((a) => a.tipo === 'RECLAMACION_ACTIVA')).toBe(true)
  })
})

describe('calcularAlertas — pedidos invalidos / vacios', () => {
  it('retorna [] si la lista de pedidos esta vacia', () => {
    expect(calcularAlertas([])).toEqual([])
  })

  it('maneja pedidos sin clienteId (no crashea)', () => {
    const pedidos = [makePedido({ clienteId: undefined })]
    expect(() => calcularAlertas(pedidos)).not.toThrow()
  })

  it('maneja pedidos con total como string o number', () => {
    const pedidos = [
      makePedido({ id: '1', clienteId: 'c1', total: '10000' as any }),
      makePedido({ id: '2', clienteId: 'c1', total: 20000 }),
    ]
    expect(() => calcularAlertas(pedidos)).not.toThrow()
  })
})
