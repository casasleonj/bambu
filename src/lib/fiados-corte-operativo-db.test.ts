import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { leerCierresOperativos } from './fiados-corte-operativo-db'
import { clasificarCobrosDePedido } from './cobro-clasificacion'

const fecha = (s: string) => new Date(s)
describe('#796 cierre operativo conectado al clasificador', () => {
  it('deduplica jornadas e ignora cierres tardíos y nulos', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { fecha: fecha('2026-11-23T00:00:00-05:00'), horaCierre: fecha('2026-11-23T18:00:00-05:00') },
      { fecha: fecha('2026-11-22T00:00:00-05:00'), horaCierre: fecha('2026-11-23T09:00:00-05:00') },
      { fecha: fecha('2026-11-21T00:00:00-05:00'), horaCierre: null },
    ])
    const db = { cierreDia: { findMany } } as unknown as Pick<Prisma.TransactionClient, 'cierreDia'>
    const cierres = await leerCierresOperativos(db, ['2026-11-23', '2026-11-23', '2026-11-22', '2026-11-21'])
    expect(cierres.size).toBe(1)
    expect(findMany.mock.calls[0][0].where.fecha.in).toHaveLength(3)
    const entrega = fecha('2026-11-23T10:00:00-05:00')
    const resultado = clasificarCobrosDePedido({
      fecha: entrega, estadoEntrega: 'ENTREGADO', total: 46000, entregadoAt: entrega,
      porciones: [], cierresPorDia: cierres,
    }, [
      { id: 'antes', at: fecha('2026-11-23T17:59:59-05:00'), monto: 20000 },
      { id: 'corte', at: fecha('2026-11-23T18:00:00-05:00'), monto: 26000 },
    ])
    expect(resultado.get('antes')).toMatchObject({ ventaDiaCentavos: 2000000, carteraCentavos: 0 })
    expect(resultado.get('corte')).toMatchObject({ ventaDiaCentavos: 0, carteraCentavos: 2600000 })
  })
})
