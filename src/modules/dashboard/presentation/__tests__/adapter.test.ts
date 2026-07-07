import { describe, it, expect } from 'vitest'
import { toLegacyDashboardData } from '@/modules/dashboard/presentation/adapter'
import type { DashboardData as DDDData } from '@/modules/dashboard/domain/types'

function makeDDDData(overrides: Partial<DDDData> = {}): DDDData {
  return {
    kpis: {
      pedidosHoy: 5,
      ventasHoy: 100000,
      fiadosHoy: 20000,
      fiadosTotal: 300000,
      clientesConFiado: 10,
      pedidosPendientes: 2,
      pedidosEntregados: 3,
      baseDia: 50000,
      totalGastos: 15000,
      ventasAyer: 90000,
      ventasTrend: 11.11,
      pedidosTrend: 25,
      embarquesAbiertos: 1,
      prodPiezasHoy: 300,
      prodPiezasAyer: 250,
      prodPiezasTrend: 20,
      prodEficienciaHoy: 95,
      prodEficienciaAyer: 92,
      prodEficienciaTrend: 3.26,
    },
    stock: { agua: 100, hielo: 50 },
    produccion: {
      aguaProducida: 200,
      hieloProducido: 100,
      perdidasAgua: 0,
      perdidasHielo: 0,
      piezasProducidas: 300,
      perdidasTotales: 15,
      eficiencia: 95,
    },
    vendidos: { agua: 10, hielo: 5, botellon: 2 },
    ventasPorPrecio: [],
    franjasHorarias: [
      { label: 'Mañana', range: [6, 11], count: 3 },
      { label: 'Tarde', range: [12, 17], count: 2 },
    ],
    maxFranja: 3,
    stockAlertas: [],
    alertasRiesgo: {
      disputasAbiertas: 0,
      clientesBloqueados: 0,
      clientesConflictivos: 0,
      promesasProximasVencer: 0,
      clientesNoVerificados: 0,
    },
    casosActivos: { total: 0, criticos: 0, sinResolver48h: 0 },
    fechaHoy: 'jueves, 25 de junio de 2026',
    ...overrides,
  }
}

describe('toLegacyDashboardData', () => {
  it('expone pedidosHoy, no pedidos: []', () => {
    const legacy = toLegacyDashboardData(makeDDDData())

    expect(legacy.pedidosHoy).toBe(5)
    expect(legacy).not.toHaveProperty('pedidos')
  })

  it('mapea el resto de KPIs correctamente', () => {
    const legacy = toLegacyDashboardData(makeDDDData())

    expect(legacy.ventas).toBe(100000)
    expect(legacy.fiadosHoy).toBe(20000)
    expect(legacy.pedidosPendientes).toBe(2)
    expect(legacy.pedidosEntregados).toBe(3)
    expect(legacy.embarquesAbiertos).toBe(1)
  })

  it('mapea métricas de producción correctamente', () => {
    const legacy = toLegacyDashboardData(makeDDDData())

    expect(legacy.prodAguaHoy).toBe(200)
    expect(legacy.prodHieloHoy).toBe(100)
    expect(legacy.prodPiezasHoy).toBe(300)
    expect(legacy.prodPerdidasHoy).toBe(15)
    expect(legacy.prodEficienciaHoy).toBe(95)
    expect(legacy.prodPiezasAyer).toBe(250)
    expect(legacy.prodEficienciaAyer).toBe(92)
    expect(legacy.prodPiezasTrend).toBe(20)
    expect(legacy.prodEficienciaTrend).toBe(3.26)
  })

  it('pasa franjas y ventasPorPrecio sin transformar', () => {
    const franjas = [{ label: 'Noche', range: [18, 23] as [number, number], count: 1 }]
    const ventasPorPrecio = [
      { producto: 'PACA_AGUA' as const, precio: 6500, cantidad: 1, subtotal: 6500 },
    ]
    const legacy = toLegacyDashboardData(makeDDDData({ franjasHorarias: franjas, ventasPorPrecio }))

    expect(legacy.franjas).toBe(franjas)
    expect(legacy.ventasPorPrecio).toBe(ventasPorPrecio)
  })
})
