import { describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '../get-dashboard-data'
import type { GetDashboardDeps } from '../get-dashboard-data'

/**
 * #922 — El stock histórico sale del cierre registrado al final del rango.
 *
 * La regla que estas pruebas defienden: bajo un encabezado de fecha pasada no
 * puede aparecer el stock de hoy. Si no hay cierre validado del rango, la cifra
 * no se muestra (alcance.stock = NO_DISPONIBLE) en vez de inventarse.
 */

const dia = (d: string) => {
  const start = new Date(`${d}T00:00:00-05:00`)
  return { start, end: new Date(+start + 86_400_000) }
}

function deps(over: Partial<GetDashboardDeps> & {
  cierreDelRango?: { stockFinAgua: number | null; stockFinHielo: number | null } | null
} = {}): GetDashboardDeps {
  const { cierreDelRango, ...rest } = over
  return {
    pedidos: {
      findByDateRange: vi.fn(async () => []),
      sumFiadosEntregados: vi.fn(async () => 0),
    } as never,
    produccion: {
      aggregateByDateRange: vi.fn(async () => ({
        aguaProducida: 0,
        hieloProducido: 0,
        perdidasAgua: 0,
        perdidasHielo: 0,
        piezasProducidas: 0,
        perdidasTotales: 0,
        eficiencia: 0,
      })),
    } as never,
    config: {
      getBaseDia: vi.fn(async () => 0),
      getStockConfigs: vi.fn(async () => ({})),
      getLastCierre: vi.fn(async () => null),
      getCierreBefore: vi.fn(async () =>
        cierreDelRango === undefined ? null : cierreDelRango,
      ),
    } as never,
    alertas: {
      getStockAlertas: vi.fn(async () => []),
      getRiskAlerts: vi.fn(async () => ({
        disputasAbiertas: 0,
        clientesBloqueados: 0,
        clientesConflictivos: 0,
        promesasProximasVencer: 0,
        clientesNoVerificados: 0,
        pedidosAtrasadosSinAsignar: 0,
        pedidosHoyEnRiesgo: 0,
      })),
      getActiveCases: vi.fn(async () => ({
        total: 0,
        criticos: 0,
        sinResolver48h: 0,
      })),
      countClientesConFiado: vi.fn(async () => 0),
    } as never,
    gastos: { sumByDateRange: vi.fn(async () => 0) } as never,
    embarques: { countAbiertos: vi.fn(async () => 0) } as never,
    ...rest,
  }
}

describe('#922 — stock bajo un rango histórico', () => {
  it('usa el cierre validado del rango, no el stock vivo de hoy', async () => {
    const d = await getDashboardData(dia('2026-11-20'), dia('2026-11-19'), deps({
      cierreDelRango: { stockFinAgua: 42, stockFinHielo: 7 },
    }))
    expect(d.alcance.stock).toBe('PERIODO')
    expect(d.stock).toEqual({ agua: 42, hielo: 7 })
    expect(d.alcance.esPeriodoActual).toBe(false)
  })

  it('sin cierre del rango no presenta stock y lo deja por conciliar', async () => {
    // El stock de HOY tiene que ser distinto de cero, o la prueba no distingue
    // "no hay evidencia" de "el guard funcionó": un 0 contra un 0 pasa siempre.
    const d0 = deps({ cierreDelRango: null })
    ;(d0.config as unknown as { getLastCierre: () => Promise<unknown> }).getLastCierre =
      async () => ({ stockFinAgua: 500, stockFinHielo: 90 })
    ;(d0.produccion as unknown as { aggregateByDateRange: () => Promise<unknown> }).aggregateByDateRange =
      async () => ({
        aguaProducida: 300,
        hieloProducido: 40,
        perdidasAgua: 0,
        perdidasHielo: 0,
        piezasProducidas: 340,
        perdidasTotales: 0,
        eficiencia: 0,
      })

    const d = await getDashboardData(dia('2026-11-20'), dia('2026-11-19'), d0)
    expect(d.alcance.stock).toBe('NO_DISPONIBLE')
    // Si el guard desapareciera, aquí saldría el stock vivo de hoy (800/130).
    expect(d.stock).toEqual({ agua: 0, hielo: 0 })
    expect(d.alcance.motivo).toContain('por conciliar')
  })

  it('marca cartera y alertas como estado actual en histórico', async () => {
    const d = await getDashboardData(dia('2026-11-20'), dia('2026-11-19'), deps({
      cierreDelRango: { stockFinAgua: 1, stockFinHielo: 1 },
    }))
    expect(d.alcance.saldos).toBe('ACTUAL')
    expect(d.alcance.alertas).toBe('ACTUAL')
  })

  it('consulta el cierre ANTERIOR al fin del rango (exclusivo)', async () => {
    const getCierreBefore = vi.fn(async () => null)
    const d = deps({ cierreDelRango: null })
    ;(d.config as unknown as { getCierreBefore: typeof getCierreBefore }).getCierreBefore = getCierreBefore
    const rango = dia('2026-11-20')
    await getDashboardData(rango, dia('2026-11-19'), d)
    expect(getCierreBefore).toHaveBeenCalledWith(rango.end)
  })
})
