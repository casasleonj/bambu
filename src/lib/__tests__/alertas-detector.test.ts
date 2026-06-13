import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calcularAlertas, calcularAlertasCliente, calcularPromedioCliente, calcularAlertasRepartidor, findPrecioMinimo } from '@/lib/alertas-detector'
import type { PedidoBase, EmbarqueBase } from '@/lib/alertas-detector'
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

function makeEmbarque(overrides: Partial<EmbarqueBase> = {}): EmbarqueBase {
  return {
    id: 'emb-default',
    fecha: new Date().toISOString(),
    trabajadorId: 'rep-1',
    devueltasAgua: 0,
    devueltasHielo: 0,
    rotasAgua: 0,
    rotasHielo: 0,
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

describe('calcularAlertas — PRECIO_POR_DEBAJO_TABLA (commit 1.1)', () => {
  it('detecta cuando item.precio < precioMinimo del tier correspondiente', () => {
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 2000 }],
      }),
    ]
    const result = calcularAlertas(pedidos, {
      precioMinimos: [
        { producto: 'PACA_AGUA', cantMin: 1, cantMax: 9, precioMinimo: 2500 },
      ],
    })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(true)
  })

  it('NO detecta cuando item.precio >= precioMinimo', () => {
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 3000 }],
      }),
    ]
    const result = calcularAlertas(pedidos, {
      precioMinimos: [
        { producto: 'PACA_AGUA', cantMin: 1, cantMax: 9, precioMinimo: 2500 },
      ],
    })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(false)
  })

  it('respeta el tier por cantidad (cantMin/cantMax)', () => {
    // 5 pacas cae en tier [1,9] minimo=2500
    // 15 pacas cae en tier [10,null] minimo=1800
    // ambos items estan por debajo de su respectivo minimo
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [
          { producto: 'PACA_AGUA', cantPedido: 5, precio: 2000 }, // < 2500 → alerta
          { producto: 'PACA_AGUA', cantPedido: 15, precio: 1500 }, // < 1800 → alerta
        ],
      }),
    ]
    const result = calcularAlertas(pedidos, {
      precioMinimos: [
        { producto: 'PACA_AGUA', cantMin: 1, cantMax: 9, precioMinimo: 2500 },
        { producto: 'PACA_AGUA', cantMin: 10, cantMax: null, precioMinimo: 1800 },
      ],
    })
    const flat = result.flatMap((r) => r.alertas).filter((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')
    expect(flat).toHaveLength(2)
  })

  it('NO detecta si precioMinimos es null (sin restriccion)', () => {
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 100 }], // ridiculo bajo
      }),
    ]
    const result = calcularAlertas(pedidos, {
      precioMinimos: [
        { producto: 'PACA_AGUA', cantMin: 1, cantMax: 9, precioMinimo: null },
      ],
    })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(false)
  })

  it('NO detecta si no hay match (producto sin tier configurado)', () => {
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 100 }],
      }),
    ]
    const result = calcularAlertas(pedidos, {
      precioMinimos: [
        { producto: 'PACA_HIELO', cantMin: 1, cantMax: 9, precioMinimo: 5000 },
      ],
    })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(false)
  })

  it('NO detecta si precioMinimos no se provee (opcional)', () => {
    const pedidos = [
      makePedido({
        id: 'p1',
        clienteId: 'c1',
        items: [{ producto: 'PACA_AGUA', cantPedido: 5, precio: 100 }],
      }),
    ]
    // sin precioMinimos
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(false)
  })
})

describe('findPrecioMinimo (helper)', () => {
  const rows = [
    { producto: 'PACA_AGUA', cantMin: 1, cantMax: 9, precioMinimo: 2500 },
    { producto: 'PACA_AGUA', cantMin: 10, cantMax: null, precioMinimo: 1800 },
    { producto: 'PACA_HIELO', cantMin: 1, cantMax: null, precioMinimo: 3000 },
  ]

  it('encuentra el tier correcto por cantidad', () => {
    expect(findPrecioMinimo(rows, 'PACA_AGUA', 5)).toBe(2500)
    expect(findPrecioMinimo(rows, 'PACA_AGUA', 10)).toBe(1800)
    expect(findPrecioMinimo(rows, 'PACA_AGUA', 100)).toBe(1800)
  })

  it('filtra por producto', () => {
    expect(findPrecioMinimo(rows, 'PACA_HIELO', 1)).toBe(3000)
  })

  it('retorna null si no hay match', () => {
    expect(findPrecioMinimo(rows, 'BOTELLON', 1)).toBeNull()
    expect(findPrecioMinimo([], 'PACA_AGUA', 1)).toBeNull()
    expect(findPrecioMinimo(undefined, 'PACA_AGUA', 1)).toBeNull()
  })
})

// commit 1.2 plan antifraude: DEVOLUCIONES_ANORMALES + ROTURAS_ANORMALES
describe('calcularAlertasRepartidor (commit 1.2)', () => {
  it('detecta DEVOLUCIONES_ANORMALES cuando un embarque supera 2x el promedio', () => {
    // 5 embarques historicos con devueltas bajas (1 paca cada uno)
    // 1 embarque outlier con 10 devueltas
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e6', devueltasAgua: 10 }), // outlier
    ]
    const result = calcularAlertasRepartidor(embarques)
    expect(result).toHaveLength(1)
    const row = result[0]
    expect(row.repartidorId).toBe('rep-1')
    const flat = row.alertas
    expect(flat.some((a) => a.tipo === 'DEVOLUCIONES_ANORMALES')).toBe(true)
  })

  it('detecta ROTURAS_ANORMALES independientemente de DEVOLUCIONES', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', rotasAgua: 1 }),
      makeEmbarque({ id: 'e2', rotasAgua: 1 }),
      makeEmbarque({ id: 'e3', rotasAgua: 1 }),
      makeEmbarque({ id: 'e4', rotasAgua: 1 }),
      makeEmbarque({ id: 'e5', rotasAgua: 1 }),
      makeEmbarque({ id: 'e6', rotasAgua: 8 }), // outlier en rotas
    ]
    const result = calcularAlertasRepartidor(embarques)
    const row = result[0]
    const flat = row.alertas
    expect(flat.some((a) => a.tipo === 'ROTURAS_ANORMALES')).toBe(true)
    // DEVOLUCIONES_NO_ANORMALES (todos tienen 0 devueltas)
    expect(flat.some((a) => a.tipo === 'DEVOLUCIONES_ANORMALES')).toBe(false)
  })

  it('detecta DEVOLUCIONES y ROTURAS en el mismo embarque (independientes)', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e6', devueltasAgua: 10, rotasAgua: 8 }), // outlier en ambos
    ]
    const result = calcularAlertasRepartidor(embarques)
    const row = result[0]
    const tipos = row.alertas.map((a) => a.tipo)
    expect(tipos).toContain('DEVOLUCIONES_ANORMALES')
    expect(tipos).toContain('ROTURAS_ANORMALES')
  })

  it('NO detecta si repartidor tiene < minEmbarquesMuestral (datos insuficientes)', () => {
    const embarques: EmbarqueBase[] = [
      // solo 3 embarques (minimo es 5)
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 100 }), // outlier
    ]
    const result = calcularAlertasRepartidor(embarques)
    expect(result).toEqual([])
  })

  it('respeta minEmbarquesMuestral custom', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 100 }),
    ]
    // con minEmbarquesMuestral=2, 3 embarques >= 2 → evalua
    const result = calcularAlertasRepartidor(embarques, { minEmbarquesMuestral: 2 })
    expect(result.length).toBeGreaterThan(0)
  })

  it('NO dispara si multiplicador es muy alto (todos pasan el filtro)', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e6', devueltasAgua: 1000 }), // outlier
    ]
    // multiplicador 1000 → umbral muy permisivo → no alerta
    const result = calcularAlertasRepartidor(embarques, { multiplicador: 1000 })
    expect(result).toEqual([])
  })

  it('suma devueltas y rotas de agua + hielo', () => {
    const embarques: EmbarqueBase[] = [
      // historico: 0 agua + 0 hielo = 0
      makeEmbarque({ id: 'e1', devueltasAgua: 0, devueltasHielo: 0 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 0, devueltasHielo: 0 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 0, devueltasHielo: 0 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 0, devueltasHielo: 0 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 0, devueltasHielo: 0 }),
      // outlier: 2 agua + 3 hielo = 5 (sobre umbral)
      makeEmbarque({ id: 'e6', devueltasAgua: 2, devueltasHielo: 3 }),
    ]
    const result = calcularAlertasRepartidor(embarques)
    const row = result[0]
    const flat = row.alertas
    expect(flat.some((a) => a.tipo === 'DEVOLUCIONES_ANORMALES')).toBe(true)
  })

  it('separa alertas por repartidor', () => {
    // Repartidor A: 6 embarques, 1 outlier en devueltas
    // Repartidor B: 6 embarques, normal
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'a1', trabajadorId: 'rep-A', devueltasAgua: 1 }),
      makeEmbarque({ id: 'a2', trabajadorId: 'rep-A', devueltasAgua: 1 }),
      makeEmbarque({ id: 'a3', trabajadorId: 'rep-A', devueltasAgua: 1 }),
      makeEmbarque({ id: 'a4', trabajadorId: 'rep-A', devueltasAgua: 1 }),
      makeEmbarque({ id: 'a5', trabajadorId: 'rep-A', devueltasAgua: 1 }),
      makeEmbarque({ id: 'a6', trabajadorId: 'rep-A', devueltasAgua: 10 }),
      // B normal
      makeEmbarque({ id: 'b1', trabajadorId: 'rep-B', devueltasAgua: 1 }),
      makeEmbarque({ id: 'b2', trabajadorId: 'rep-B', devueltasAgua: 1 }),
      makeEmbarque({ id: 'b3', trabajadorId: 'rep-B', devueltasAgua: 1 }),
      makeEmbarque({ id: 'b4', trabajadorId: 'rep-B', devueltasAgua: 1 }),
      makeEmbarque({ id: 'b5', trabajadorId: 'rep-B', devueltasAgua: 1 }),
      makeEmbarque({ id: 'b6', trabajadorId: 'rep-B', devueltasAgua: 1 }),
    ]
    const result = calcularAlertasRepartidor(embarques)
    expect(result).toHaveLength(1)
    expect(result[0].repartidorId).toBe('rep-A')
  })

  it('usa el nombre del mapa nombres si se provee', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e6', devueltasAgua: 10 }),
    ]
    const nombres = new Map([['rep-1', 'Yesid Ramírez']])
    const result = calcularAlertasRepartidor(embarques, { nombres })
    expect(result[0].nombreRep).toBe('Yesid Ramírez')
  })

  it('usa el id como nombre si no hay mapa de nombres', () => {
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e6', devueltasAgua: 10 }),
    ]
    const result = calcularAlertasRepartidor(embarques)
    expect(result[0].nombreRep).toBe('rep-1')
  })

  it('calcula severidadMasAlta correctamente (MEDIA gana sobre BAJA)', () => {
    const embarques: EmbarqueBase[] = [
      // historico bajo
      makeEmbarque({ id: 'e1', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e2', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e3', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e4', devueltasAgua: 1, rotasAgua: 0 }),
      makeEmbarque({ id: 'e5', devueltasAgua: 1, rotasAgua: 0 }),
      // outlier: alta devueltas (MEDIA) y alta rotas (BAJA)
      makeEmbarque({ id: 'e6', devueltasAgua: 10, rotasAgua: 8 }),
    ]
    const result = calcularAlertasRepartidor(embarques)
    expect(result[0].severidadMasAlta).toBe('MEDIA')
  })
})

// commit 1.3 plan antifraude: NOTA_CREDITO_FRECUENTE
describe('calcularAlertas — NOTA_CREDITO_FRECUENTE (commit 1.3)', () => {
  it('detecta cuando count >= 2 (default)', () => {
    const pedidos = [
      makePedido({ id: 'p1', clienteId: 'cli-X' }),
    ]
    const notasCreditoCount = new Map([['cli-X', 3]])
    const result = calcularAlertas(pedidos, { notasCreditoCount })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(true)
  })

  it('NO detecta cuando count < 2', () => {
    const pedidos = [makePedido({ id: 'p1', clienteId: 'cli-X' })]
    const notasCreditoCount = new Map([['cli-X', 1]])
    const result = calcularAlertas(pedidos, { notasCreditoCount })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(false)
  })

  it('respeta minNotasCreditoCount custom', () => {
    const pedidos = [makePedido({ id: 'p1', clienteId: 'cli-X' })]
    const notasCreditoCount = new Map([['cli-X', 3]])
    // min=5 → 3 < 5 → no alerta
    const result = calcularAlertas(pedidos, {
      notasCreditoCount,
      minNotasCreditoCount: 5,
    })
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(false)
  })

  it('agrega alerta a cliente existente en el map (sin duplicar)', () => {
    const pedidos = [
      makePedido({ id: 'p1', clienteId: 'cli-X', estadoPago: 'VENCIDO' }), // CLIENTE_BLOQUEADO
    ]
    const notasCreditoCount = new Map([['cli-X', 5]])
    const result = calcularAlertas(pedidos, { notasCreditoCount })
    const row = result[0]
    const tipos = row.alertas.map((a) => a.tipo)
    expect(tipos).toContain('CLIENTE_BLOQUEADO')
    expect(tipos).toContain('NOTA_CREDITO_FRECUENTE')
    // Exactamente 1 NC alert (no duplica)
    expect(tipos.filter((t) => t === 'NOTA_CREDITO_FRECUENTE')).toHaveLength(1)
  })

  it('crea row nuevo para cliente sin alertas previas', () => {
    const pedidos: PedidoBase[] = [] // sin pedidos
    const notasCreditoCount = new Map([['cli-new', 4]])
    const result = calcularAlertas(pedidos, { notasCreditoCount })
    expect(result).toHaveLength(1)
    expect(result[0].clienteId).toBe('cli-new')
    expect(result[0].severidadMasAlta).toBe('ALTA')
  })

  it('NO detecta si notasCreditoCount no se provee', () => {
    const pedidos = [makePedido({ id: 'p1', clienteId: 'cli-X' })]
    const result = calcularAlertas(pedidos)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(false)
  })

  it('procesa multiples clientes con counts independientes', () => {
    const pedidos: PedidoBase[] = []
    const notasCreditoCount = new Map([
      ['cli-A', 5], // alerta
      ['cli-B', 1], // no alerta
      ['cli-C', 3], // alerta
    ])
    const result = calcularAlertas(pedidos, { notasCreditoCount })
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.clienteId).sort()
    expect(ids).toEqual(['cli-A', 'cli-C'])
  })
})

describe('calcularAlertasCliente — NOTA_CREDITO_FRECUENTE (commit 1.3)', () => {
  const clienteBase = {
    id: 'cli-1',
    nombre: 'Test',
    telefono: '300',
  }

  it('detecta con notasCreditoCount >= 2 (default)', () => {
    const result = calcularAlertasCliente(clienteBase, [], {
      notasCreditoCount: 2,
    })
    expect(result.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(true)
  })

  it('NO detecta con count = 1', () => {
    const result = calcularAlertasCliente(clienteBase, [], {
      notasCreditoCount: 1,
    })
    expect(result.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(false)
  })

  it('NO detecta si no se provee count', () => {
    const result = calcularAlertasCliente(clienteBase, [])
    expect(result.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')).toBe(false)
  })
})

// commit 1.4 plan antifraude: DESCUENTO_NO_JUSTIFICADO
describe('calcularAlertasRepartidor — DESCUENTO_NO_JUSTIFICADO (commit 1.4)', () => {
  // El test usa descuentos de un repartidor con 5+ embarques (cumple
  // minEmbarquesMuestral) para que el row se cree
  function setupRepartidorWithEmbarques(repartidorId: string): EmbarqueBase[] {
    return [
      makeEmbarque({ id: 'e1', trabajadorId: repartidorId, devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', trabajadorId: repartidorId, devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', trabajadorId: repartidorId, devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', trabajadorId: repartidorId, devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', trabajadorId: repartidorId, devueltasAgua: 1 }),
    ]
  }

  it('detecta descuento sin justificar como alerta MEDIA', () => {
    const embarques = setupRepartidorWithEmbarques('rep-X')
    const descuentosSinJustificar = [
      { id: 'd1', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 50000, motivo: 'Producto perdido' },
    ]
    const result = calcularAlertasRepartidor(embarques, { descuentosSinJustificar })
    expect(result).toHaveLength(1)
    const flat = result[0].alertas
    expect(flat.some((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')).toBe(true)
  })

  it('genera multiples alertas si hay multiples descuentos', () => {
    const embarques = setupRepartidorWithEmbarques('rep-X')
    const descuentosSinJustificar = [
      { id: 'd1', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 50000, motivo: 'Perdido' },
      { id: 'd2', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 30000, motivo: 'Roto' },
      { id: 'd3', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 10000, motivo: 'Cliente reclamó' },
    ]
    const result = calcularAlertasRepartidor(embarques, { descuentosSinJustificar })
    const flat = result[0].alertas.filter((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')
    expect(flat).toHaveLength(3)
  })

  it('NO detecta descuentos de OTRO repartidor', () => {
    const embarques = setupRepartidorWithEmbarques('rep-X')
    const descuentosSinJustificar = [
      { id: 'd1', repartidorId: 'rep-OTHER', fecha: new Date().toISOString(), monto: 50000, motivo: 'Perdido' },
    ]
    const result = calcularAlertasRepartidor(embarques, { descuentosSinJustificar })
    // El row se crea por los descuentos de rep-OTHER, no de rep-X
    // (que tambien esta en el map por los embarques)
    const tipos = result.flatMap((r) => r.alertas).map((a) => a.tipo)
    expect(tipos).toContain('DESCUENTO_NO_JUSTIFICADO')
    // Solo del otro repartidor
    const rowOther = result.find((r) => r.repartidorId === 'rep-OTHER')
    expect(rowOther?.alertas.some((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')).toBe(true)
    const rowX = result.find((r) => r.repartidorId === 'rep-X')
    expect(rowX?.alertas.some((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')).toBeFalsy()
  })

  it('NO detecta si descuentosSinJustificar no se provee', () => {
    const embarques = setupRepartidorWithEmbarques('rep-X')
    const result = calcularAlertasRepartidor(embarques)
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')).toBe(false)
  })

  it('coexiste con DEVOLUCIONES_ANORMALES (alertas independientes)', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      // outlier: alta devueltas
      makeEmbarque({ id: 'e6', trabajadorId: 'rep-X', devueltasAgua: 10 }),
    ]
    const descuentosSinJustificar = [
      { id: 'd1', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 20000, motivo: 'Sin justificar' },
    ]
    const result = calcularAlertasRepartidor(embarques, { descuentosSinJustificar })
    const tipos = result[0].alertas.map((a) => a.tipo)
    expect(tipos).toContain('DEVOLUCIONES_ANORMALES')
    expect(tipos).toContain('DESCUENTO_NO_JUSTIFICADO')
  })

  it('el detalle de la alerta incluye monto formateado y motivo', () => {
    const embarques = setupRepartidorWithEmbarques('rep-X')
    const descuentosSinJustificar = [
      { id: 'd1', repartidorId: 'rep-X', fecha: new Date().toISOString(), monto: 75000, motivo: 'Pérdida de carga' },
    ]
    const result = calcularAlertasRepartidor(embarques, { descuentosSinJustificar })
    const alerta = result[0].alertas.find((a) => a.tipo === 'DESCUENTO_NO_JUSTIFICADO')
    expect(alerta?.detalle).toContain('Pérdida de carga')
    // formatCurrency usa Intl.NumberFormat 'es-CO' currency COP
    expect(alerta?.detalle).toMatch(/\$/)
  })
})

// commit 1.5 plan antifraude: REPARTIDOR_DEUDA_ALTA
describe('calcularAlertasRepartidor — REPARTIDOR_DEUDA_ALTA (commit 1.5)', () => {
  it('detecta cuando deudaAgua + deudaHielo > umbral', () => {
    // deuda total 60 (30 agua + 30 hielo) > 50 umbral
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 30, deudaHielo: 30 }],
    ])
    const result = calcularAlertasRepartidor([], { deudasPorRepartidor })
    expect(result).toHaveLength(1)
    const flat = result[0].alertas
    expect(flat.some((a) => a.tipo === 'REPARTIDOR_DEUDA_ALTA')).toBe(true)
  })

  it('NO detecta si deuda <= umbral', () => {
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 20, deudaHielo: 20 }], // total 40 < 50
    ])
    const result = calcularAlertasRepartidor([], { deudasPorRepartidor })
    expect(result).toEqual([])
  })

  it('respeta umbralDeudaPacas custom', () => {
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 10, deudaHielo: 0 }], // total 10
    ])
    // Con default 50: no alerta. Con custom 5: si alerta
    const resultDefault = calcularAlertasRepartidor([], { deudasPorRepartidor })
    expect(resultDefault).toEqual([])

    const resultCustom = calcularAlertasRepartidor([], {
      deudasPorRepartidor,
      umbralDeudaPacas: 5,
    })
    expect(resultCustom).toHaveLength(1)
  })

  it('NO requiere minEmbarquesMuestral (deuda es acumulativa)', () => {
    // Sin embarques: 0 embarques historicos. Pero deuda > umbral → alerta
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 100, deudaHielo: 0 }],
    ])
    const result = calcularAlertasRepartidor([], { deudasPorRepartidor })
    expect(result).toHaveLength(1)
  })

  it('multiples repartidores con deudas procesadas independientemente', () => {
    const deudasPorRepartidor = new Map([
      ['rep-A', { deudaAgua: 60, deudaHielo: 0 }], // alerta
      ['rep-B', { deudaAgua: 10, deudaHielo: 0 }], // no alerta
      ['rep-C', { deudaAgua: 100, deudaHielo: 50 }], // alerta
    ])
    const result = calcularAlertasRepartidor([], { deudasPorRepartidor })
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.repartidorId).sort()
    expect(ids).toEqual(['rep-A', 'rep-C'])
  })

  it('el detalle incluye agua + hielo + umbral desglosados', () => {
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 35, deudaHielo: 20 }],
    ])
    const result = calcularAlertasRepartidor([], { deudasPorRepartidor })
    const alerta = result[0].alertas.find((a) => a.tipo === 'REPARTIDOR_DEUDA_ALTA')
    expect(alerta?.detalle).toContain('55 pacas adeudadas')
    expect(alerta?.detalle).toContain('agua: 35')
    expect(alerta?.detalle).toContain('hielo: 20')
    expect(alerta?.detalle).toContain('umbral: 50')
  })

  it('coexiste con otras alertas de repartidor en el mismo row', () => {
    // 5 embarques con devueltas outlier + deuda alta
    const embarques: EmbarqueBase[] = [
      makeEmbarque({ id: 'e1', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e2', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e3', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e4', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e5', trabajadorId: 'rep-X', devueltasAgua: 1 }),
      makeEmbarque({ id: 'e6', trabajadorId: 'rep-X', devueltasAgua: 10 }), // outlier
    ]
    const deudasPorRepartidor = new Map([
      ['rep-X', { deudaAgua: 100, deudaHielo: 0 }],
    ])
    const result = calcularAlertasRepartidor(embarques, { deudasPorRepartidor })
    const tipos = result[0].alertas.map((a) => a.tipo)
    expect(tipos).toContain('DEVOLUCIONES_ANORMALES')
    expect(tipos).toContain('REPARTIDOR_DEUDA_ALTA')
  })

  it('NO detecta si deudasPorRepartidor no se provee', () => {
    const result = calcularAlertasRepartidor([])
    const flat = result.flatMap((r) => r.alertas)
    expect(flat.some((a) => a.tipo === 'REPARTIDOR_DEUDA_ALTA')).toBe(false)
  })
})
