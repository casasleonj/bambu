import { describe, it, expect } from 'vitest'
import { calcularStock, determinarStockInicial, type StockInput } from '@/modules/dashboard/domain/stock.service'
import type { ProduccionDiaria, StockSnapshot } from '@/modules/dashboard/domain/types'

describe('calcularStock (Bloque 3 — passthrough botellones)', () => {
  const produccionVacia: ProduccionDiaria = {
    aguaProducida: 0,
    hieloProducido: 0,
    perdidasAgua: 0,
    perdidasHielo: 0,
    piezasProducidas: 0,
    perdidasTotales: 0,
    eficiencia: 0,
  }

  it('NO retorna campo botellon en el snapshot (passthrough)', () => {
    const input: StockInput = {
      stockIniAgua: 100,
      stockIniHielo: 50,
      produccion: produccionVacia,
      aguaVendida: 10,
      hieloVendido: 5,
    }
    const stock: StockSnapshot = calcularStock(input)
    expect(stock).not.toHaveProperty('botellon')
    expect(stock).toEqual({ agua: 90, hielo: 45 })
  })

  it('agua y hielo se calculan correctamente con producción y ventas', () => {
    const input: StockInput = {
      stockIniAgua: 100,
      stockIniHielo: 50,
      produccion: { aguaProducida: 200, hieloProducido: 100, perdidasAgua: 0, perdidasHielo: 0, piezasProducidas: 300, perdidasTotales: 0, eficiencia: 100 },
      aguaVendida: 30,
      hieloVendido: 20,
    }
    const stock = calcularStock(input)
    expect(stock.agua).toBe(270) // 100 + 200 - 30
    expect(stock.hielo).toBe(130) // 50 + 100 - 20
  })

  it('pérdidas se restan del stock', () => {
    const input: StockInput = {
      stockIniAgua: 100,
      stockIniHielo: 50,
      produccion: { aguaProducida: 100, hieloProducido: 50, perdidasAgua: 10, perdidasHielo: 5, piezasProducidas: 150, perdidasTotales: 15, eficiencia: 90 },
      aguaVendida: 0,
      hieloVendido: 0,
    }
    const stock = calcularStock(input)
    expect(stock.agua).toBe(190) // 100 + 100 - 0 - 10
    expect(stock.hielo).toBe(95) // 50 + 50 - 0 - 5
  })

  it('stock nunca es negativo (Math.max con 0)', () => {
    const input: StockInput = {
      stockIniAgua: 10,
      stockIniHielo: 5,
      produccion: produccionVacia,
      aguaVendida: 100, // mucho más que el stock
      hieloVendido: 50,
    }
    const stock = calcularStock(input)
    expect(stock.agua).toBe(0)
    expect(stock.hielo).toBe(0)
  })
})

describe('determinarStockInicial (Bloque 3 — sin botellon)', () => {
  it('usa stockFinAgua/Hielo del cierre previo si existe', () => {
    const inicial = determinarStockInicial(150, 80, true, {})
    expect(inicial).toEqual({ stockIniAgua: 150, stockIniHielo: 80 })
    expect(inicial).not.toHaveProperty('stockIniBotellon')
  })

  it('usa config fallback si no hay cierre previo', () => {
    const inicial = determinarStockInicial(null, null, false, {
      STOCK_INI_AGUA: '200',
      STOCK_INI_HIELO: '100',
    })
    expect(inicial).toEqual({ stockIniAgua: 200, stockIniHielo: 100 })
    expect(inicial).not.toHaveProperty('stockIniBotellon')
  })

  it('ignora STOCK_INI_BOTELLON del config (botellones son passthrough)', () => {
    const inicial = determinarStockInicial(null, null, false, {
      STOCK_INI_AGUA: '100',
      STOCK_INI_HIELO: '50',
      STOCK_INI_BOTELLON: '999', // ← debe ser ignorado
    })
    expect(inicial).toEqual({ stockIniAgua: 100, stockIniHielo: 50 })
    // explícitamente verifica que botellon no se filtra al resultado
    expect(inicial).not.toHaveProperty('stockIniBotellon')
  })

  it('usa 0 si no hay cierre ni config', () => {
    const inicial = determinarStockInicial(null, null, false, {})
    expect(inicial).toEqual({ stockIniAgua: 0, stockIniHielo: 0 })
  })
})

describe('VendidosHoy (sin cambios en ventas — botellones siguen contándose como ventas)', () => {
  it('VendidosHoy.botellon sigue existiendo (es venta, no stock)', async () => {
    const { calcularVendidos } = await import('@/modules/dashboard/domain/ventas.service')
    const pedidos = [
      { estadoEntrega: 'ENTREGADO', cBotellonFabEnt: 5, cBotellonDomEnt: 3 },
    ] as any
    const vendidos = calcularVendidos(pedidos)
    expect(vendidos.botellon).toBe(8)
  })
})
