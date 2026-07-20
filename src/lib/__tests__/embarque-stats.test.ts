import { describe, it, expect } from 'vitest'
import {
  calcularDuracionMin,
  formatDuracion,
  calcularStatsEmbarque,
  calcularKpiGeneral,
  calcularStatsPorTrabajador,
  calcularStatsPorRuta,
  calcularTendenciaDiaria,
  type EmbarqueStatsInput,
} from '@/lib/embarque-stats'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEmbarque(overrides: Partial<EmbarqueStatsInput> = {}): EmbarqueStatsInput {
  const base: EmbarqueStatsInput = {
    id: 'emb-1',
    numero: 1,
    numeroDia: 1,
    fecha: '2025-01-15T08:00:00Z',
    horaSalida: '2025-01-15T08:30:00Z',
    horaLlegada: '2025-01-15T10:30:00Z',
    estado: 'CERRADO',
    trabajadorId: 'trabajador-1',
    trabajadorNombre: 'Juan Perez',
    rutaId: 'ruta-1',
    rutaNombre: 'Ruta Norte',
    pedidos: [],
    productos: [],
  }
  return { ...base, ...overrides }
}

// ─── calcularDuracionMin ────────────────────────────────────────────────────

describe('calcularDuracionMin', () => {
  it('returns null when inicio is null', () => {
    expect(calcularDuracionMin(null, '2025-01-15T10:00:00Z')).toBeNull()
  })

  it('returns null when fin is null', () => {
    expect(calcularDuracionMin('2025-01-15T08:00:00Z', null)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(calcularDuracionMin(null, null)).toBeNull()
  })

  it('calculates duration for 1 hour', () => {
    const result = calcularDuracionMin('2025-01-15T08:00:00Z', '2025-01-15T09:00:00Z')
    expect(result).toBe(60)
  })

  it('calculates duration for 30 minutes', () => {
    const result = calcularDuracionMin('2025-01-15T08:00:00Z', '2025-01-15T08:30:00Z')
    expect(result).toBe(30)
  })

  it('calculates duration for 2.5 hours', () => {
    const result = calcularDuracionMin('2025-01-15T08:00:00Z', '2025-01-15T10:30:00Z')
    expect(result).toBe(150)
  })

  it('returns null for negative duration (fin before inicio)', () => {
    const result = calcularDuracionMin('2025-01-15T10:00:00Z', '2025-01-15T08:00:00Z')
    expect(result).toBeNull()
  })

  it('returns 0 for same timestamp', () => {
    const ts = '2025-01-15T08:00:00Z'
    expect(calcularDuracionMin(ts, ts)).toBe(0)
  })

  it('rounds to nearest minute', () => {
    const result = calcularDuracionMin('2025-01-15T08:00:00Z', '2025-01-15T08:00:45Z')
    expect(result).toBe(1)
  })
})

// ─── formatDuracion ─────────────────────────────────────────────────────────

describe('formatDuracion', () => {
  it('formats minutes under 60', () => {
    expect(formatDuracion(30)).toBe('30m')
  })

  it('formats exactly 60 minutes', () => {
    expect(formatDuracion(60)).toBe('1h')
  })

  it('formats 90 minutes as 1h 30m', () => {
    expect(formatDuracion(90)).toBe('1h 30m')
  })

  it('formats 120 minutes as 2h', () => {
    expect(formatDuracion(120)).toBe('2h')
  })

  it('formats 150 minutes as 2h 30m', () => {
    expect(formatDuracion(150)).toBe('2h 30m')
  })

  it('formats 0 minutes', () => {
    expect(formatDuracion(0)).toBe('0m')
  })
})

// ─── calcularStatsEmbarque ──────────────────────────────────────────────────

describe('calcularStatsEmbarque', () => {
  it('calculates stats for embarque with no pedidos', () => {
    const emb = makeEmbarque()
    const stats = calcularStatsEmbarque(emb)
    expect(stats.totalPedidos).toBe(0)
    expect(stats.entregados).toBe(0)
    expect(stats.noEntregados).toBe(0)
    expect(stats.parciales).toBe(0)
    expect(stats.tasaEntrega).toBe(0)
    expect(stats.tasaNoEntrega).toBe(0)
    expect(stats.duracionMin).toBe(120) // 08:30 to 10:30
  })

  it('calculates 100% tasaEntrega for all delivered', () => {
    const emb = makeEmbarque({
      pedidos: [
        { id: 'p1', estadoEntrega: 'ENTREGADO' },
        { id: 'p2', estadoEntrega: 'ENTREGADO' },
      ],
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.tasaEntrega).toBe(1)
    expect(stats.tasaNoEntrega).toBe(0)
    expect(stats.entregados).toBe(2)
  })

  it('calculates 0% tasaEntrega for all no-delivered', () => {
    const emb = makeEmbarque({
      pedidos: [
        { id: 'p1', estadoEntrega: 'NO_ENTREGADO' },
        { id: 'p2', estadoEntrega: 'NO_ENTREGADO' },
      ],
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.tasaEntrega).toBe(0)
    expect(stats.tasaNoEntrega).toBe(1)
    expect(stats.noEntregados).toBe(2)
  })

  it('handles mixed delivery states', () => {
    const emb = makeEmbarque({
      pedidos: [
        { id: 'p1', estadoEntrega: 'ENTREGADO' },
        { id: 'p2', estadoEntrega: 'PARCIAL' },
        { id: 'p3', estadoEntrega: 'NO_ENTREGADO' },
      ],
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.totalPedidos).toBe(3)
    expect(stats.entregados).toBe(1)
    expect(stats.parciales).toBe(1)
    expect(stats.noEntregados).toBe(1)
    expect(stats.tasaEntrega).toBeCloseTo(1 / 3, 5)
    expect(stats.tasaNoEntrega).toBeCloseTo(1 / 3, 5)
  })

  it('calculates entregasPorHour correctly', () => {
    const emb = makeEmbarque({
      horaSalida: '2025-01-15T08:00:00Z',
      horaLlegada: '2025-01-15T10:00:00Z', // 2 hours
      pedidos: [
        { id: 'p1', estadoEntrega: 'ENTREGADO' },
        { id: 'p2', estadoEntrega: 'ENTREGADO' },
      ],
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.entregasPorHora).toBe(1) // 2 deliveries / 2 hours
  })

  it('returns null entregasPorHour when duracionMin is 0', () => {
    const emb = makeEmbarque({
      horaSalida: '2025-01-15T08:00:00Z',
      horaLlegada: '2025-01-15T08:00:00Z',
      pedidos: [{ id: 'p1', estadoEntrega: 'ENTREGADO' }],
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.entregasPorHora).toBeNull()
  })

  it('calculates discrepancy percentage', () => {
    const emb = makeEmbarque({
      productos: [
        { producto: 'PACA_AGUA', cargadas: 10, devueltas: 2, cambios: 0, rotas: 1 },
      ],
    })
    const stats = calcularStatsEmbarque(emb)
    // cargadas=10, devueltas=2, rotas=1, entregadas=10-2-1=7, discrepancy=3/10=0.3
    expect(stats.discrepanciaPct).toBeCloseTo(0.3, 5)
  })

  it('returns 0 discrepancy when no products', () => {
    const emb = makeEmbarque()
    const stats = calcularStatsEmbarque(emb)
    expect(stats.discrepanciaPct).toBe(0)
  })

  it('calculates preparacionMin (fecha to horaSalida)', () => {
    const emb = makeEmbarque({
      fecha: '2025-01-15T08:00:00Z',
      horaSalida: '2025-01-15T08:30:00Z',
    })
    const stats = calcularStatsEmbarque(emb)
    expect(stats.preparacionMin).toBe(30)
  })
})

// ─── calcularKpiGeneral ─────────────────────────────────────────────────────

describe('calcularKpiGeneral', () => {
  it('returns zeros for empty array', () => {
    const kpi = calcularKpiGeneral([])
    expect(kpi.totalEmbarques).toBe(0)
    expect(kpi.duracionPromedioMin).toBeNull()
    expect(kpi.tasaEntregaPromedio).toBe(0)
    expect(kpi.totalPedidos).toBe(0)
  })

  it('only counts CERRADO and EN_RUTA embarques (fix #24)', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', estado: 'CERRADO', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T09:00:00Z' }),
      makeEmbarque({ id: 'e2', estado: 'EN_RUTA', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: null }),
      makeEmbarque({ id: 'e3', estado: 'ABIERTO' }),
      makeEmbarque({ id: 'e4', estado: 'CANCELADO' }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.totalEmbarques).toBe(2) // CERRADO + EN_RUTA
  })

  it('calculates average duration', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T09:00:00Z' }),
      makeEmbarque({ id: 'e2', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T10:00:00Z' }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.duracionPromedioMin).toBe(90) // (60 + 120) / 2
  })

  it('calculates median duration (odd count)', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T09:00:00Z' }),
      makeEmbarque({ id: 'e2', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T10:00:00Z' }),
      makeEmbarque({ id: 'e3', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T11:00:00Z' }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.duracionMedianaMin).toBe(120) // median of [60, 120, 180]
  })

  it('calculates median duration (even count)', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T09:00:00Z' }),
      makeEmbarque({ id: 'e2', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T10:00:00Z' }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.duracionMedianaMin).toBe(90) // (60 + 120) / 2
  })

  it('calculates min and max duration', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T09:00:00Z' }),
      makeEmbarque({ id: 'e2', horaSalida: '2025-01-15T08:00:00Z', horaLlegada: '2025-01-15T10:00:00Z' }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.duracionMinMin).toBe(60)
    expect(kpi.duracionMaxMin).toBe(120)
  })

  it('sums total pedidos across all embarques', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', pedidos: [{ id: 'p1', estadoEntrega: 'ENTREGADO' }] }),
      makeEmbarque({ id: 'e2', pedidos: [{ id: 'p2', estadoEntrega: 'ENTREGADO' }, { id: 'p3', estadoEntrega: 'NO_ENTREGADO' }] }),
    ]
    const kpi = calcularKpiGeneral(embarques)
    expect(kpi.totalPedidos).toBe(3)
    expect(kpi.totalEntregados).toBe(2)
    expect(kpi.totalNoEntregados).toBe(1)
  })
})

// ─── calcularStatsPorTrabajador ─────────────────────────────────────────────

describe('calcularStatsPorTrabajador', () => {
  it('returns empty array for no embarques', () => {
    expect(calcularStatsPorTrabajador([])).toEqual([])
  })

  it('groups embarques by trabajadorId', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', trabajadorId: 't1', trabajadorNombre: 'Juan' }),
      makeEmbarque({ id: 'e2', trabajadorId: 't1', trabajadorNombre: 'Juan' }),
      makeEmbarque({ id: 'e3', trabajadorId: 't2', trabajadorNombre: 'Maria' }),
    ]
    const result = calcularStatsPorTrabajador(embarques)
    expect(result.length).toBe(2)
    expect(result.find(w => w.trabajadorId === 't1')?.totalEmbarques).toBe(2)
    expect(result.find(w => w.trabajadorId === 't2')?.totalEmbarques).toBe(1)
  })

  it('sorts by tasaEntrega descending', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', trabajadorId: 't1', trabajadorNombre: 'Juan', pedidos: [{ id: 'p1', estadoEntrega: 'NO_ENTREGADO' }] }),
      makeEmbarque({ id: 'e2', trabajadorId: 't2', trabajadorNombre: 'Maria', pedidos: [{ id: 'p2', estadoEntrega: 'ENTREGADO' }] }),
    ]
    const result = calcularStatsPorTrabajador(embarques)
    expect(result[0].trabajadorId).toBe('t2') // 100% first
    expect(result[1].trabajadorId).toBe('t1') // 0% second
  })
})

// ─── calcularStatsPorRuta ───────────────────────────────────────────────────

describe('calcularStatsPorRuta', () => {
  it('returns empty array for no embarques', () => {
    expect(calcularStatsPorRuta([])).toEqual([])
  })

  it('groups embarques by rutaId', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', rutaId: 'r1', rutaNombre: 'Norte' }),
      makeEmbarque({ id: 'e2', rutaId: 'r1', rutaNombre: 'Norte' }),
      makeEmbarque({ id: 'e3', rutaId: 'r2', rutaNombre: 'Sur' }),
    ]
    const result = calcularStatsPorRuta(embarques)
    expect(result.length).toBe(2)
    expect(result.find(r => r.rutaId === 'r1')?.totalEmbarques).toBe(2)
  })

  it('handles null rutaId', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', rutaId: null, rutaNombre: null }),
    ]
    const result = calcularStatsPorRuta(embarques)
    expect(result.length).toBe(1)
    expect(result[0].rutaId).toBeNull()
  })

  it('sorts by tasaEntrega descending', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', rutaId: 'r1', rutaNombre: 'Norte', pedidos: [{ id: 'p1', estadoEntrega: 'ENTREGADO' }] }),
      makeEmbarque({ id: 'e2', rutaId: 'r2', rutaNombre: 'Sur', pedidos: [{ id: 'p2', estadoEntrega: 'NO_ENTREGADO' }] }),
    ]
    const result = calcularStatsPorRuta(embarques)
    expect(result[0].rutaId).toBe('r1') // 100% first
  })
})

// ─── calcularTendenciaDiaria ────────────────────────────────────────────────

describe('calcularTendenciaDiaria', () => {
  it('returns empty array for no embarques', () => {
    expect(calcularTendenciaDiaria([])).toEqual([])
  })

  it('groups embarques by date', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', fecha: '2025-01-15T08:00:00Z' }),
      makeEmbarque({ id: 'e2', fecha: '2025-01-15T10:00:00Z' }),
      makeEmbarque({ id: 'e3', fecha: '2025-01-16T08:00:00Z' }),
    ]
    const result = calcularTendenciaDiaria(embarques)
    expect(result.length).toBe(2)
    expect(result.find(d => d.fecha === '2025-01-15')?.totalEmbarques).toBe(2)
    expect(result.find(d => d.fecha === '2025-01-16')?.totalEmbarques).toBe(1)
  })

  it('sorts by date ascending', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', fecha: '2025-01-17T08:00:00Z' }),
      makeEmbarque({ id: 'e2', fecha: '2025-01-15T08:00:00Z' }),
      makeEmbarque({ id: 'e3', fecha: '2025-01-16T08:00:00Z' }),
    ]
    const result = calcularTendenciaDiaria(embarques)
    expect(result[0].fecha).toBe('2025-01-15')
    expect(result[1].fecha).toBe('2025-01-16')
    expect(result[2].fecha).toBe('2025-01-17')
  })

  it('groups embarques by Bogotá date, not UTC date', () => {
    const embarques = [
      makeEmbarque({ id: 'e1', fecha: '2025-01-15T23:00:00Z' }), // 18:00 Bogotá -> 2025-01-15
      makeEmbarque({ id: 'e2', fecha: '2025-01-16T00:30:00Z' }), // 19:30 Bogotá -> 2025-01-15
      makeEmbarque({ id: 'e3', fecha: '2025-01-16T06:00:00Z' }), // 01:00 Bogotá -> 2025-01-16
    ]
    const result = calcularTendenciaDiaria(embarques)
    expect(result.find(d => d.fecha === '2025-01-15')?.totalEmbarques).toBe(2)
    expect(result.find(d => d.fecha === '2025-01-16')?.totalEmbarques).toBe(1)
  })
})
