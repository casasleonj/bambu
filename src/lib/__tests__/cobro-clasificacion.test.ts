// @tests #796 — un cobro del día de la entrega es venta del día; el de una entrega anterior es cartera (funciones puras).
import { describe, it, expect } from 'vitest'
import { clasificarCobrosDePedido, tipoDeCobro, type PedidoParaClasificar } from '../cobro-clasificacion'

// Bogotá = UTC-5. Todas las horas se dan en UTC con el equivalente local en el comentario.
const d = (iso: string) => new Date(iso)
const base = (p: Partial<PedidoParaClasificar>): PedidoParaClasificar => ({
  fecha: d('2026-11-13T17:11:00Z'), estadoEntrega: 'ENTREGADO', total: 23000, entregadoAt: null, porciones: [], ...p,
})
const una = (r: ReturnType<typeof clasificarCobrosDePedido>, id: string) => {
  const c = r.get(id)
  if (!c) throw new Error(`sin clasificación para ${id}`)
  return c
}

describe('#796 clasificarCobrosDePedido', () => {
  it('caso #1119: entrega parcial hoy y cobro por la tarde del mismo día = venta del día', () => {
    const r = clasificarCobrosDePedido(
      base({ porciones: [{ id: 'e1', entregadoAt: d('2026-11-13T17:12:00Z'), valor: 23000 }] }), // entrega 12:12
      [{ id: 'p', at: d('2026-11-13T23:35:00Z'), monto: 23000 }],                      // cobro 18:35
    )
    expect(una(r, 'p')).toMatchObject({ ventaDiaCentavos: 2300000, carteraCentavos: 0, origenFecha: 'PORCIONES', aproximado: false })
    expect(tipoDeCobro(una(r, 'p'))).toBe('COBRO_DEL_DIA')
  })

  it('casos #1084/#1095: creado ayer, entregado y cobrado hoy = venta del día, no fiado anterior', () => {
    const r = clasificarCobrosDePedido(
      base({ fecha: d('2026-11-12T22:40:00Z'), total: 9000, porciones: [{ id: 'e2', entregadoAt: d('2026-11-13T16:54:00Z'), valor: 9000 }] }),
      [{ id: 'p', at: d('2026-11-13T16:54:00Z'), monto: 7500 }],
    )
    expect(una(r, 'p').ventaDiaCentavos).toBe(750000)
    expect(una(r, 'p').carteraCentavos).toBe(0)
  })

  it('caso #1017: entregado el 11, cobrado el 13 = cartera', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 10000, porciones: [{ id: 'e3', entregadoAt: d('2026-11-11T22:11:00Z'), valor: 10000 }] }),
      [{ id: 'p', at: d('2026-11-13T20:17:00Z'), monto: 10000 }],
    )
    expect(tipoDeCobro(una(r, 'p'))).toBe('CARTERA')
  })

  it('el corte es el día calendario de Bogotá: 23:30 local y 00:30 local son jornadas distintas', () => {
    const p = base({ total: 5000, porciones: [{ id: 'e4', entregadoAt: d('2026-11-14T04:30:00Z'), valor: 5000 }] }) // 23:30 del 13
    const r = clasificarCobrosDePedido(p, [
      { id: 'mismoDia', at: d('2026-11-14T04:45:00Z'), monto: 2000 },   // 23:45 del 13
      { id: 'sigDia', at: d('2026-11-14T05:30:00Z'), monto: 3000 },     // 00:30 del 14
    ])
    expect(tipoDeCobro(una(r, 'mismoDia'))).toBe('COBRO_DEL_DIA')
    expect(tipoDeCobro(una(r, 'sigDia'))).toBe('CARTERA')
  })

  it('pago repartido: 10.000 hoy y 20.000 mañana de una entrega de 30.000', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 30000, porciones: [{ id: 'e5', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 30000 }] }),
      [{ id: 'hoy', at: d('2026-11-13T21:00:00Z'), monto: 10000 }, { id: 'man', at: d('2026-11-14T15:00:00Z'), monto: 20000 }],
    )
    expect(tipoDeCobro(una(r, 'hoy'))).toBe('COBRO_DEL_DIA')
    expect(tipoDeCobro(una(r, 'man'))).toBe('CARTERA')
  })

  it('un cobro que cubre porciones de varias jornadas se parte por antigüedad (FIFO)', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 30000, porciones: [
        { id: 'e6', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 10000 },  // ayer
        { id: 'e7', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 20000 },  // hoy
      ] }),
      [{ id: 'p', at: d('2026-11-13T21:00:00Z'), monto: 25000 }],
    )
    expect(una(r, 'p')).toMatchObject({ carteraCentavos: 1000000, ventaDiaCentavos: 1500000 })
    expect(tipoDeCobro(una(r, 'p'))).toBe('MIXTO')
  })

  it('anticipo antes de la entrega no es cartera', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 10000, porciones: [{ id: 'e8', entregadoAt: d('2026-11-14T15:00:00Z'), valor: 10000 }] }),
      [{ id: 'p', at: d('2026-11-13T15:00:00Z'), monto: 10000 }],
    )
    expect(tipoDeCobro(una(r, 'p'))).toBe('COBRO_DEL_DIA')
  })

  it('sin hechos usa la fecha de entrega del pedido y no marca aproximado', () => {
    const r = clasificarCobrosDePedido(
      base({ entregadoAt: d('2026-11-13T15:00:00Z'), fecha: d('2026-11-12T15:00:00Z') }),
      [{ id: 'p', at: d('2026-11-13T21:00:00Z'), monto: 23000 }],
    )
    expect(una(r, 'p')).toMatchObject({ origenFecha: 'PEDIDO', aproximado: false, carteraCentavos: 0 })
  })

  it('sin ninguna fecha de entrega usa la de creación (regla anterior) y lo marca aproximado', () => {
    const mismo = clasificarCobrosDePedido(base({ total: 10000 }), [{ id: 'p', at: d('2026-11-13T18:00:00Z'), monto: 10000 }])
    expect(una(mismo, 'p')).toMatchObject({ origenFecha: 'CREACION', aproximado: true })
    expect(tipoDeCobro(una(mismo, 'p'))).toBe('COBRO_DEL_DIA')
    const otro = clasificarCobrosDePedido(base({ total: 10000 }), [{ id: 'p', at: d('2026-11-14T18:00:00Z'), monto: 10000 }])
    expect(tipoDeCobro(una(otro, 'p'))).toBe('CARTERA')
  })

  it('un pedido aún sin entregar no se marca aproximado y conserva la regla anterior', () => {
    const r = clasificarCobrosDePedido(base({ estadoEntrega: 'PENDIENTE', total: 8000 }), [{ id: 'p', at: d('2026-11-14T18:00:00Z'), monto: 8000 }])
    expect(una(r, 'p').aproximado).toBe(false)
    expect(tipoDeCobro(una(r, 'p'))).toBe('CARTERA')
  })

  it('conserva el monto exacto en centavos y no pierde ni inventa dinero', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 0.3, porciones: [{ id: 'e9', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 0.1 }, { id: 'e10', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 0.2 }] }),
      [{ id: 'p', at: d('2026-11-13T21:00:00Z'), monto: 0.3 }],
    )
    const c = una(r, 'p')
    expect(c.ventaDiaCentavos + c.carteraCentavos).toBe(30)
    expect(c).toMatchObject({ carteraCentavos: 10, ventaDiaCentavos: 20 })
  })

  it('cada cobro consume solo lo que aún no cubrió otro cobro anterior', () => {
    const r = clasificarCobrosDePedido(
      base({ total: 10000, porciones: [{ id: 'e11', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 10000 }] }),
      [{ id: 'a', at: d('2026-11-13T15:00:00Z'), monto: 6000 }, { id: 'b', at: d('2026-11-13T16:00:00Z'), monto: 6000 }],
    )
    expect(una(r, 'a').carteraCentavos).toBe(600000)
    expect(una(r, 'b')).toMatchObject({ carteraCentavos: 400000, ventaDiaCentavos: 200000 })
  })

  // ── Paso 0 de #796: anticipos, prepagos, ejemplo del PO y determinismo ──────────────────────────────
  it('ejemplo del PO: 20 pacas a $2.300; entrega 10 el lunes sin cobrar y 10 el martes; paga $46.000 el martes', () => {
    const p = base({ fecha: d('2026-11-16T15:00:00Z'), total: 46000, porciones: [
      { id: 'lun', entregadoAt: d('2026-11-16T15:00:00Z'), valor: 23000 }, { id: 'mar', entregadoAt: d('2026-11-17T15:00:00Z'), valor: 23000 }] })
    const c = una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-17T21:00:00Z'), monto: 46000 }]), 'p')
    expect(c).toMatchObject({ carteraCentavos: 2300000, ventaDiaCentavos: 2300000 })
  })

  it('ejemplo del PO: paga $35.000 el martes = $23.000 del lunes + $12.000 del martes (quedan $11.000 sin cobrar)', () => {
    const p = base({ fecha: d('2026-11-16T15:00:00Z'), total: 46000, porciones: [
      { id: 'lun', entregadoAt: d('2026-11-16T15:00:00Z'), valor: 23000 }, { id: 'mar', entregadoAt: d('2026-11-17T15:00:00Z'), valor: 23000 }] })
    const c = una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-17T21:00:00Z'), monto: 35000 }]), 'p')
    expect(c).toMatchObject({ carteraCentavos: 2300000, ventaDiaCentavos: 1200000 })
    expect(tipoDeCobro(c)).toBe('MIXTO')
  })

  it('prepago de un día anterior cubre primero la entrega más antigua: el pago posterior es de la entrega nueva', () => {
    // Prepaga $23.000 el lunes; entrega $23.000 el martes y $23.000 el miércoles; el miércoles paga $23.000.
    const p = base({ fecha: d('2026-11-16T15:00:00Z'), total: 46000, porciones: [
      { id: 'mar', entregadoAt: d('2026-11-17T15:00:00Z'), valor: 23000 }, { id: 'mie', entregadoAt: d('2026-11-18T15:00:00Z'), valor: 23000 }] })
    const r = clasificarCobrosDePedido(p, [
      { id: 'prepago', at: d('2026-11-16T15:00:00Z'), monto: 23000 }, { id: 'miercoles', at: d('2026-11-18T21:00:00Z'), monto: 23000 }])
    expect(tipoDeCobro(una(r, 'prepago'))).toBe('COBRO_DEL_DIA')
    expect(una(r, 'miercoles')).toMatchObject({ ventaDiaCentavos: 2300000, carteraCentavos: 0 })
  })

  it('prepago en un día posterior a la creación ya no se confunde con fiado anterior', () => {
    // Antes (por fecha del pedido) este cobro caía como «fiado anterior»; es un anticipo de la jornada.
    const p = base({ fecha: d('2026-11-16T15:00:00Z'), total: 10000, porciones: [{ id: 'mie', entregadoAt: d('2026-11-18T15:00:00Z'), valor: 10000 }] })
    expect(tipoDeCobro(una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-17T15:00:00Z'), monto: 10000 }]), 'p'))).toBe('COBRO_DEL_DIA')
  })

  it('anticipo mayor que lo entregado: lo entregado hoy y el sobrante son de la jornada; nada pasa a cartera', () => {
    const p = base({ total: 25000, porciones: [{ id: 'hoy', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 10000 }] })
    const c = una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-13T21:00:00Z'), monto: 25000 }]), 'p')
    expect(c).toMatchObject({ ventaDiaCentavos: 2500000, carteraCentavos: 0 })
  })

  it('el sobrante de un cobro de entrega vieja no se vuelve cartera de más: solo cubre lo que se debía', () => {
    const p = base({ total: 25000, porciones: [{ id: 'ayer', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 10000 }] })
    const c = una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-13T21:00:00Z'), monto: 25000 }]), 'p')
    expect(c).toMatchObject({ carteraCentavos: 1000000, ventaDiaCentavos: 1500000 })
  })

  it('un cobro con BONO (crédito del cliente aplicado) se clasifica igual que cualquier otro cobro', () => {
    // El clasificador solo ve monto y fecha: el medio no cambia la regla (el sobrante a saldo a favor no es un Pago).
    const p = base({ total: 8000, porciones: [{ id: 'ayer', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 8000 }] })
    expect(tipoDeCobro(una(clasificarCobrosDePedido(p, [{ id: 'bono', at: d('2026-11-13T21:00:00Z'), monto: 8000 }]), 'bono'))).toBe('CARTERA')
  })

  it('es determinista: el resultado no depende del orden en que llegan entregas y cobros', () => {
    const porciones = [
      { id: 'c', entregadoAt: d('2026-11-14T15:00:00Z'), valor: 7000 }, { id: 'a', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 5000 },
      { id: 'b', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 3000 }, { id: 'd', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 4000 }]
    const cobros = [
      { id: 'x', at: d('2026-11-14T20:00:00Z'), monto: 9000 }, { id: 'y', at: d('2026-11-14T20:00:00Z'), monto: 4000 },
      { id: 'z', at: d('2026-11-14T22:00:00Z'), monto: 6000 }]
    const ref = JSON.stringify([...clasificarCobrosDePedido(base({ total: 19000, porciones }), cobros)].sort())
    for (let i = 0; i < 12; i++) {
      const barajar = <T,>(a: T[]) => a.map((v, k) => [v, (k * 7 + i * 13) % 11] as const).sort((p, q) => p[1] - q[1]).map((v) => v[0])
      const r = clasificarCobrosDePedido(base({ total: 19000, porciones: barajar(porciones) }), barajar(cobros))
      expect(JSON.stringify([...r].sort())).toBe(ref)
    }
  })

  it('el dinero se conserva: ventaDía + cartera = lo cobrado en cualquier combinación', () => {
    const porciones = [
      { id: 'a', entregadoAt: d('2026-11-12T15:00:00Z'), valor: 10000 }, { id: 'b', entregadoAt: d('2026-11-13T15:00:00Z'), valor: 15000 }]
    const cobros = [{ id: 'p1', at: d('2026-11-12T16:00:00Z'), monto: 4000 }, { id: 'p2', at: d('2026-11-13T16:00:00Z'), monto: 30000 }]
    const r = clasificarCobrosDePedido(base({ total: 25000, porciones }), cobros)
    for (const c of cobros) expect(una(r, c.id).ventaDiaCentavos + una(r, c.id).carteraCentavos).toBe(c.monto * 100)
  })

  it('varias entregas el mismo día y un solo cobro ese día: todo es venta del día (escenario 8)', () => {
    const p = base({ total: 30000, porciones: [
      { id: 'm1', entregadoAt: d('2026-11-13T14:00:00Z'), valor: 10000 }, { id: 'm2', entregadoAt: d('2026-11-13T19:00:00Z'), valor: 20000 }] })
    const c = una(clasificarCobrosDePedido(p, [{ id: 'p', at: d('2026-11-13T22:00:00Z'), monto: 30000 }]), 'p')
    expect(c).toMatchObject({ ventaDiaCentavos: 3000000, carteraCentavos: 0 })
    expect(tipoDeCobro(c)).toBe('COBRO_DEL_DIA')
  })
})
