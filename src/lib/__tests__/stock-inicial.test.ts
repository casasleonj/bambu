import { describe, it, expect } from 'vitest'
import { resolverStockInicial } from '../stock-inicial'

type Db = Parameters<typeof resolverStockInicial>[0]

function fakeDb(
  cierre: { stockFinAgua: number; stockFinHielo: number } | null,
  configs: Array<{ clave: string; valor: string }>,
): Db {
  return {
    cierreDia: { findFirst: async () => cierre },
    config: { findMany: async () => configs },
  } as unknown as Db
}

describe('resolverStockInicial (#545)', () => {
  it('sin cierre previo usa Config STOCK_INI_AGUA / STOCK_INI_HIELO', async () => {
    const db = fakeDb(null, [
      { clave: 'STOCK_INI_AGUA', valor: '281' },
      { clave: 'STOCK_INI_HIELO', valor: '12' },
    ])
    expect(await resolverStockInicial(db)).toEqual({ stockIniAgua: 281, stockIniHielo: 12 })
  })

  it('sin cierre previo ni Config devuelve 0', async () => {
    expect(await resolverStockInicial(fakeDb(null, []))).toEqual({ stockIniAgua: 0, stockIniHielo: 0 })
  })

  it('con cierre previo manda su stock final y la Config se ignora', async () => {
    const db = fakeDb({ stockFinAgua: 254, stockFinHielo: 5 }, [{ clave: 'STOCK_INI_AGUA', valor: '281' }])
    expect(await resolverStockInicial(db)).toEqual({ stockIniAgua: 254, stockIniHielo: 5 })
  })
})
