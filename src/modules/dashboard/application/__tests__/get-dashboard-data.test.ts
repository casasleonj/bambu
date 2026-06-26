import { describe, it, expect, vi } from 'vitest'
import { getDashboardData } from '@/modules/dashboard/application/get-dashboard-data'
import type { GetDashboardDeps } from '@/modules/dashboard/application/get-dashboard-data'

vi.mock('@/lib/dates', () => ({
  getTodayString: vi.fn(() => '2026-06-25'),
}))

function makeDeps(overrides = {}) {
  return {
    pedidos: {
      findByDateRange: vi.fn().mockResolvedValue([]),
      countDisputasAbiertas: vi.fn().mockResolvedValue(0),
      countPromesasProximasVencer: vi.fn().mockResolvedValue(0),
      sumFiadosEntregados: vi.fn().mockResolvedValue(0),
    },
    produccion: {
      aggregateByDateRange: vi.fn().mockResolvedValue({
        aguaProducida: 0,
        hieloProducido: 0,
        perdidasAgua: 0,
        perdidasHielo: 0,
      }),
    },
    config: {
      getBaseDia: vi.fn().mockResolvedValue(0),
      getLastCierre: vi.fn().mockResolvedValue(null),
      getStockConfigs: vi.fn().mockResolvedValue({}),
    },
    alertas: {
      getStockAlertas: vi.fn().mockResolvedValue([]),
      getRiskAlerts: vi.fn().mockResolvedValue({
        disputasAbiertas: 0,
        clientesBloqueados: 0,
        clientesConflictivos: 0,
        promesasProximasVencer: 0,
        clientesNoVerificados: 0,
      }),
      getActiveCases: vi.fn().mockResolvedValue({
        total: 0,
        criticos: 0,
        sinResolver48h: 0,
      }),
      countClientesConFiado: vi.fn().mockResolvedValue(0),
    },
    gastos: {
      sumByDateRange: vi.fn().mockResolvedValue(0),
    },
    embarques: {
      countAbiertos: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  }
}

describe('getDashboardData', () => {
  it('usa la fecha de Bogota para el key de BASE_DIA_', async () => {
    const deps = makeDeps()
    const todayRange = {
      start: new Date('2026-06-25T05:00:00Z'),
      end: new Date('2026-06-26T04:59:59.999Z'),
    }
    const yesterdayRange = {
      start: new Date('2026-06-24T05:00:00Z'),
      end: new Date('2026-06-25T04:59:59.999Z'),
    }

    await getDashboardData(todayRange, yesterdayRange, deps as unknown as GetDashboardDeps)

    expect(deps.config.getBaseDia).toHaveBeenCalledWith('BASE_DIA_2026-06-25')
  })
})
