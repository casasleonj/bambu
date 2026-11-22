// @tests #630: Producción lee las ventas del día dentro de su propia transacción.
import { describe, it, expect, vi } from 'vitest'
import type { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

const mock = vi.hoisted(() => ({ leer: vi.fn() }))
vi.mock('@/lib/unidades-entregadas-dia', () => ({ unidadesEntregadasDelDia: mock.leer }))

import { getVentasDelDia } from '@/lib/ventas'

type Fuente = Parameters<typeof unidadesEntregadasDelDia>[0]

describe('getVentasDelDia: contexto transaccional #630', () => {
  it('usa exactamente el tx recibido y la ventana Bogotá, no el prisma global', async () => {
    const tx = { origen: 'transaccion-post-bloqueo' } as unknown as Fuente
    mock.leer.mockReset()
    mock.leer.mockResolvedValue({ agua: 12, hielo: 3, botellon: 1, bolsaAgua: 0, bolsaHielo: 0, aproximados: [] })
    const res = await getVentasDelDia(new Date('2026-11-22T17:00:00.000Z'), tx)
    expect(mock.leer).toHaveBeenCalledOnce()
    expect(mock.leer).toHaveBeenCalledWith(tx, {
      desde: new Date('2026-11-22T05:00:00.000Z'),
      hasta: new Date('2026-11-23T05:00:00.000Z'),
    })
    expect(res).toEqual({
      aguaVendida: 12, hieloVendido: 3, botellonVendido: 1,
      bolsaAguaVendida: 0, bolsaHieloVendida: 0,
    })
  })
})
