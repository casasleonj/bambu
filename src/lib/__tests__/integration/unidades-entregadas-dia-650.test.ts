// #650 (2b): «vendido» se cuenta por el día en que se entregó, no por el día de creación.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed } from './setup'
import { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'
import { getVentasDelDia } from '@/lib/ventas'
import { construirResumenCierre } from '@/lib/cierre-resumen'

const d1 = new Date('2031-04-03T00:00:00-05:00')
const d2 = new Date(+d1 + 86_400_000)
const d3 = new Date(+d2 + 86_400_000)
const r = (a: Date, b: Date) => ({ desde: a, hasta: b })
const H = 3600_000

describe('unidadesEntregadasDelDia (#650 2b)', () => {
  let clienteId: string
  const pedido = (o: { fecha: Date; hielo: number; entregadoAt?: Date | null; estadoEntrega?: 'ENTREGADO' | 'PENDIENTE' | 'ANULADO' }) =>
    db.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'ENTREGADO',
        estadoEntrega: o.estadoEntrega ?? 'ENTREGADO',
        estadoPago: o.estadoEntrega === 'ANULADO' ? 'ANULADO' : 'PENDIENTE',
        total: 1000, saldo: 1000, totalPagado: 0, fecha: o.fecha,
        entregadoAt: o.entregadoAt ?? null, cPacaHieloEnt: o.hielo,
      },
    })
  const evento = (pedidoId: string, fecha: Date, hielo: number) =>
    db.historial.create({
      data: {
        entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE', usuarioId: 'sistema', fecha,
        datos: JSON.stringify({
          accion: 'ENTREGA',
          consultaEntrega: {
            version: 1, fecha: fecha.toISOString(), eventoEntregaId: randomUUID(),
            repartidorId: null, precisionFecha: 'INSTANTE',
            cantidades: [{ producto: 'PACA_HIELO', cantidad: hielo }],
          },
        }),
      },
    })

  let p693: string, pViejo: string
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await db.cliente.create({ data: { nombre: 'Vendido por día', telefono: randomUUID() } })).id
    // Caso 693: creado el día 1, 5 entregadas el día 1 y 10 el día 2.
    const a = await pedido({ fecha: new Date(+d1 + 9 * H), hielo: 15, entregadoAt: new Date(+d2 + 10 * H) })
    p693 = a.id
    await evento(a.id, new Date(+d1 + 15 * H), 5)
    await evento(a.id, new Date(+d2 + 10 * H), 10)
    // Creado y entregado el mismo día 1, con detalle.
    const b = await pedido({ fecha: new Date(+d1 + 8 * H), hielo: 4, entregadoAt: new Date(+d1 + 9 * H) })
    await evento(b.id, new Date(+d1 + 9 * H), 4)
    // Viejo sin historial: creado día 1, entregado día 2 → aproximado, cuenta en el día 1.
    pViejo = (await pedido({ fecha: new Date(+d1 + 7 * H), hielo: 3, entregadoAt: new Date(+d2 + 7 * H) })).id
    // Anulado: nunca cuenta.
    await pedido({ fecha: new Date(+d1 + 6 * H), hielo: 9, estadoEntrega: 'ANULADO' })
  })

  it('día 1 cuenta lo entregado ese día: 5 del 693 + 4 + 3 aproximados', async () => {
    const u = await unidadesEntregadasDelDia(db, r(d1, d2))
    expect(u.hielo).toBe(5 + 4 + 3)
    expect(u.aproximados.map((x) => x.pedidoId)).toEqual([pViejo])
  })
  it('día 2 cuenta los 10 que completaron el 693 (no los del día 1)', async () => {
    const u = await unidadesEntregadasDelDia(db, r(d2, d3))
    expect(u.hielo).toBe(10)
    expect(u.aproximados).toEqual([])
  })
  it('la suma de días iguala el acumulado de los pedidos con detalle', async () => {
    const u = await unidadesEntregadasDelDia(db, r(d1, d3))
    expect(u.hielo).toBe(15 + 4 + 3)
    expect(p693).toBeTruthy()
  })
  it('cierre = Producción: misma cifra de hielo para el día 1 y el día 2', async () => {
    for (const [dia, esperado] of [['2031-04-03', 12], ['2031-04-04', 10]] as const) {
      const cierre = await construirResumenCierre(db, dia)
      const prod = await getVentasDelDia(new Date(`${dia}T12:00:00-05:00`))
      expect(cierre.cierre.hieloVendido).toBe(esperado)
      expect(prod.hieloVendido).toBe(esperado)
    }
  })
})
