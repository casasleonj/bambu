import { describe, expect, it, vi } from 'vitest'
import { resolverStockInicial } from '../stock-inicial'
import { startOfDayInBogota, todayInBogota } from '../date-helpers'
type Db = Parameters<typeof resolverStockInicial>[0]

describe('#668 — fecha del inicial', () => {
  it('por defecto busca antes del día comercial actual, nunca el cierre de hoy', async () => {
    const findFirst = vi.fn(async () => ({ stockFinAgua: 138, stockFinHielo: 3, stockFinBotellon: 0 }))
    const db = { cierreDia: { findFirst }, config: { findMany: async () => [] } } as unknown as Db
    await resolverStockInicial(db)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { fecha: { lt: startOfDayInBogota(todayInBogota()) } },
    }))
  })

  it('consultar el día 3 excluye cierres del 3 y del 4 aunque se capturen después', async () => {
    const filas = [
      { fecha: new Date('2026-11-02T05:00:00Z'), stockFinAgua: 223, stockFinHielo: 12, stockFinBotellon: 0 },
      { fecha: new Date('2026-11-03T05:00:00Z'), stockFinAgua: 143, stockFinHielo: 19, stockFinBotellon: 0 },
      { fecha: new Date('2026-11-04T05:00:00Z'), stockFinAgua: 138, stockFinHielo: 3, stockFinBotellon: 0 },
    ]
    const db = {
      cierreDia: { findFirst: async (q: { where: { fecha: { lt: Date } } }) =>
        filas.filter(f => f.fecha < q.where.fecha.lt).sort((a,b) => b.fecha.getTime()-a.fecha.getTime())[0] ?? null },
      config: { findMany: async () => [] },
    } as unknown as Db
    expect(await resolverStockInicial(db, new Date('2026-11-03T05:00:00Z'))).toEqual({
      stockIniAgua: 223, stockIniHielo: 12, stockIniBotellon: 0,
    })
    expect(await resolverStockInicial(db, new Date('2026-11-05T05:00:00Z'))).toEqual({
      stockIniAgua: 138, stockIniHielo: 3, stockIniBotellon: 0,
    })
  })
})
