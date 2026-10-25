// TEMPORAL-SIN-EMBARQUE(#472): reglas de la pantalla «Registrar entrega».
import { describe, it, expect } from 'vitest'
import {
  armarPayload, completa, datosIniciales, hayErrores, hoyBogota, itemsAEntregar, montoNumero, resumen, sumarDias, validar,
  type DatosEntrega, type PedidoParaEntrega,
} from '../logica'

const AHORA = new Date('2026-10-24T20:00:00.000Z') // 15:00 en Bogotá
const HOY = hoyBogota(AHORA)

const pedido = (o: Partial<PedidoParaEntrega> = {}): PedidoParaEntrega => ({
  id: 'p1', numero: 351, canal: 'DOMICILIO', clienteId: 'c1', nombreCliente: 'Doña Rosa',
  total: 60000, totalPagado: 0, entregadoPorId: null,
  items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0 }],
  ...o,
})
const datos = (p: PedidoParaEntrega, o: Partial<DatosEntrega> = {}): DatosEntrega => ({ ...datosIniciales(p, AHORA), alcance: 'TODO', repartidorId: 'r1', ...o })
const nombre = (c: string) => c

describe('datosIniciales', () => {
  it('no preselecciona ni el alcance ni quién recibió el dinero; la fecha es hoy en Bogotá', () => {
    const d = datosIniciales(pedido(), AHORA)
    expect(d.alcance).toBeNull()
    expect(d.quienRecibio).toBeNull()
    expect(d.fecha).toBe('2026-10-24')
  })
  it('hoy se calcula en Bogotá, no en UTC (a las 23:30 de Bogotá ya es el día siguiente en UTC)', () => {
    expect(hoyBogota(new Date('2026-10-25T04:30:00.000Z'))).toBe('2026-10-24')
  })
})

describe('validar', () => {
  it('entrega completa con todo en regla: sin errores', () => {
    const p = pedido()
    expect(hayErrores(validar(p, datos(p, { monto: '60000', quienRecibio: 'REPARTIDOR' }), AHORA))).toBe(false)
  })
  it('hay que elegir alcance, repartidor (domicilio) y quién recibió el dinero (si hay cobro)', () => {
    const p = pedido()
    const e = validar(p, { ...datosIniciales(p, AHORA), monto: '1000' }, AHORA)
    expect(e.alcance).toBeTruthy()
    expect(e.repartidor).toBeTruthy()
    expect(e.quienRecibio).toBeTruthy()
  })
  it('un pedido de punto no exige repartidor', () => {
    const p = pedido({ canal: 'PUNTO' })
    expect(validar(p, datos(p, { repartidorId: '', monto: '60000', quienRecibio: 'OFICINA' }), AHORA).repartidor).toBeUndefined()
  })
  it('si el pedido ya tiene repartidor, no se le vuelve a pedir', () => {
    const p = pedido({ entregadoPorId: 'r9' })
    expect(validar(p, datos(p, { repartidorId: '', monto: '60000', quienRecibio: 'OFICINA' }), AHORA).repartidor).toBeUndefined()
  })
  it('«lo recibió el repartidor» sin repartidor elegido se rechaza', () => {
    const p = pedido({ canal: 'PUNTO' })
    expect(validar(p, datos(p, { repartidorId: '', monto: '1000', quienRecibio: 'REPARTIDOR' }), AHORA).quienRecibio).toMatch(/elige primero/)
  })
  it('fecha: no futura y hasta 7 días atrás', () => {
    const p = pedido()
    const base = { monto: '60000', quienRecibio: 'OFICINA' as const }
    expect(validar(p, datos(p, { ...base, fecha: sumarDias(HOY, 1) }), AHORA).fecha).toMatch(/futura/)
    expect(validar(p, datos(p, { ...base, fecha: sumarDias(HOY, -8) }), AHORA).fecha).toMatch(/7 días/)
    expect(validar(p, datos(p, { ...base, fecha: sumarDias(HOY, -7) }), AHORA).fecha).toBeUndefined()
  })
  it('cobro mayor que lo que se debe', () => {
    const p = pedido({ totalPagado: 20000 })
    expect(validar(p, datos(p, { monto: '50000', quienRecibio: 'OFICINA' }), AHORA).monto).toMatch(/mayor/)
  })
  it('si queda debiendo hace falta una promesa futura; con deuda a un anónimo no se permite', () => {
    const p = pedido()
    expect(validar(p, datos(p), AHORA).promesa).toMatch(/hasta cuándo/)
    expect(validar(p, datos(p, { promesa: sumarDias(HOY, -1) }), AHORA).promesa).toMatch(/pasado/)
    expect(validar(p, datos(p, { promesa: sumarDias(HOY, 5) }), AHORA).promesa).toBeUndefined()
    const anonimo = pedido({ clienteId: 'CONSUMIDOR_FINAL' })
    expect(validar(anonimo, datos(anonimo, { promesa: sumarDias(HOY, 5) }), AHORA).monto).toMatch(/sin nombre/)
  })
  it('entrega parcial: no pide promesa (el pedido sigue pendiente) pero sí al menos una unidad', () => {
    const p = pedido()
    const d = datos(p, { alcance: 'MENOS', cantidades: { PACA_AGUA: 8 }, monto: '48000', quienRecibio: 'REPARTIDOR' })
    expect(hayErrores(validar(p, d, AHORA))).toBe(false)
    expect(validar(p, datos(p, { alcance: 'MENOS', cantidades: { PACA_AGUA: 0 } }), AHORA).cantidades).toBeTruthy()
    expect(validar(p, datos(p, { alcance: 'MENOS', cantidades: { PACA_AGUA: 10 } }), AHORA).cantidades).toMatch(/todo/)
  })
})

describe('itemsAEntregar / completa', () => {
  it('«todo» entrega lo que falta de cada línea; «menos» respeta lo escrito sin pasarse de lo pendiente', () => {
    const p = pedido({ items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 4 }, { producto: 'PACA_HIELO', cantPedido: 3, cantEntrega: 0 }] })
    expect(itemsAEntregar(p, datos(p))).toEqual([{ producto: 'PACA_AGUA', cantidad: 6 }, { producto: 'PACA_HIELO', cantidad: 3 }])
    const parcial = datos(p, { alcance: 'MENOS', cantidades: { PACA_AGUA: 99, PACA_HIELO: 1 } })
    expect(itemsAEntregar(p, parcial)).toEqual([{ producto: 'PACA_AGUA', cantidad: 6 }, { producto: 'PACA_HIELO', cantidad: 1 }])
    expect(completa(p, parcial)).toBe(false)
  })
})

describe('montoNumero', () => {
  it('acepta formato colombiano', () => {
    const p = pedido()
    expect(montoNumero(datos(p, { monto: '$60.000' }))).toBe(60000)
    expect(montoNumero(datos(p, { monto: 'abc' }))).toBe(0)
    expect(montoNumero(datos(p, { monto: '' }))).toBe(0)
  })
})

describe('armarPayload', () => {
  it('hoy: sin fechaEntrega (el servidor usa el instante actual); cobro con quién recibió', () => {
    const p = pedido()
    const body = armarPayload(p, datos(p, { monto: '60000', quienRecibio: 'REPARTIDOR', nota: ' ok ' }), 'clave-1', AHORA)
    expect(body).toEqual({
      offlineId: 'clave-1',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      repartidorId: 'r1',
      recibioDinero: 'REPARTIDOR',
      pagos: [{ metodo: 'EFECTIVO', monto: 60000 }],
      nota: 'ok',
    })
  })
  it('otro día: mediodía de Bogotá; el repartidor ya fijado no se reenvía; sin dinero no hay pagos', () => {
    const p = pedido({ entregadoPorId: 'r9' })
    const body = armarPayload(p, datos(p, { fecha: '2026-10-22', promesa: '2026-10-30' }), 'clave-2', AHORA)
    expect(body.fechaEntrega).toBe('2026-10-22T17:00:00.000Z')
    expect(body).not.toHaveProperty('repartidorId')
    expect(body).not.toHaveProperty('pagos')
    expect(body.promesaPagoFecha).toBe('2026-10-30')
  })
})

describe('resumen', () => {
  it('cuenta en palabras sencillas lo que se va a guardar', () => {
    const p = pedido()
    const frases = resumen(p, datos(p, { monto: '12000', quienRecibio: 'REPARTIDOR', promesa: '2026-10-30' }), [{ id: 'r1', nombre: 'Andrés' }], nombre)
    expect(frases.join(' ')).toContain('ENTREGADO')
    expect(frases.join(' ')).toContain('Andrés')
    expect(frases.join(' ')).toMatch(/Los tiene Andrés/)
    expect(frases.join(' ')).toMatch(/Quedan debiendo \$48\.000 hasta el 30 de octubre/)
    expect(frases[0]).toBe('Se marca como ENTREGADO el 24 de octubre.')
  })
  it('entrega parcial: avisa que el pedido sigue pendiente', () => {
    const p = pedido()
    const frases = resumen(p, datos(p, { alcance: 'MENOS', cantidades: { PACA_AGUA: 8 } }), [{ id: 'r1', nombre: 'Andrés' }], nombre)
    expect(frases[0]).toMatch(/parcial/)
    expect(frases.join(' ')).toMatch(/sigue pendiente/)
  })
})
