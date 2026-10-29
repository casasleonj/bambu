import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ leer: vi.fn() }))
vi.mock('@/modules/dashboard/application', () => ({
  getDashboardData: mocks.leer,
}))
import { fetchCurrentDashboardData } from '../index'
beforeEach(() => vi.clearAllMocks())
describe('un solo reloj para los días del dashboard', () => {
  it.each([
    [
      '2026-11-01T04:59:59.999Z',
      '2026-10-31T05:00:00.000Z',
      '2026-11-01T05:00:00.000Z',
      '2026-10-30T05:00:00.000Z',
    ],
    [
      '2026-11-01T05:00:00.000Z',
      '2026-11-01T05:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
      '2026-10-31T05:00:00.000Z',
    ],
  ])(
    'ancla %s en Bogotá, incluidos cambio de mes y medianoche',
    async (ahora, inicio, fin, ayer) => {
      await fetchCurrentDashboardData(new Date(ahora))
      expect(mocks.leer).toHaveBeenCalledWith(
        { start: new Date(inicio), end: new Date(fin) },
        { start: new Date(ayer), end: new Date(inicio) },
        expect.any(Object),
      )
    },
  )
})
