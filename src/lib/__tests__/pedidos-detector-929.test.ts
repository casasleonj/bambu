import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pedido: { count: vi.fn(), findMany: vi.fn() },
    embarque: { count: vi.fn(), groupBy: vi.fn() },
  },
}))
vi.mock('@/lib/config', () => ({
  getConfigs: vi.fn(),
  getConfigNumber: vi.fn(),
}))
vi.mock('@/lib/pedido-ruta', () => ({ pickRutaId: vi.fn(() => null) }))

import { prisma } from '@/lib/prisma'
import { getConfigs, getConfigNumber } from '@/lib/config'
import { findPedidosEnRiesgo, findPedidosHoyEnRiesgoIds } from '../pedidos-sin-asignar'

const findMany = vi.mocked(prisma.pedido.findMany)
const embarquesCerrados = vi.mocked(prisma.embarque.count)
const hoy = new Date('2026-11-13T07:30:00-05:00')
const ayer = new Date('2026-11-12T17:40:00-05:00')

const base = (id: string, cambios: Record<string, unknown> = {}) => ({
  id, fecha: ayer, createdAt: ayer, fechaEntrega: null, estadoEntrega: 'PENDIENTE',
  embarqueId: null, items: [], cPacaAguaEnt: 0, cPacaHieloEnt: 0,
  cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0,
  cBolsaHieloEnt: 0, cliente: { rutaId: null }, negocio: null,
  ...cambios,
})
const precargar = (pendientes: ReturnType<typeof base>[], enRuta: ReturnType<typeof base>[] = []) => {
  findMany.mockResolvedValueOnce(pendientes).mockResolvedValueOnce(enRuta)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(hoy)
  vi.clearAllMocks()
  vi.mocked(getConfigs).mockResolvedValue({
    HORARIO_MANANA_INICIO: '05:30', HORARIO_MANANA_FIN: '12:00',
    HORARIO_TARDE_INICIO: '14:00', HORARIO_TARDE_FIN: '17:00',
  })
  vi.mocked(getConfigNumber).mockResolvedValue(2)
  vi.mocked(prisma.embarque.groupBy).mockResolvedValue([])
  embarquesCerrados.mockResolvedValue(0)
})
afterEach(() => vi.useRealTimers())

describe('#929 detector compartido: banner, filtro y tarjetas', () => {
  it('incluye a #1084 de ayer en riesgo 07:30 (fixture contrafactual), sin reiniciar por fecha', async () => {
    precargar([base('1084')])
    expect(await findPedidosHoyEnRiesgoIds()).toEqual(['1084'])
    const where = findMany.mock.calls[0][0]!.where!
    expect(where.fecha).toHaveProperty('lte')
    expect(where.fecha).not.toHaveProperty('gte')
  })
  it('antes del umbral de 2h no alerta', async () => {
    vi.setSystemTime(new Date('2026-11-13T07:29:00-05:00'))
    precargar([base('1084')])
    expect(await findPedidosHoyEnRiesgoIds()).toEqual([])
  })
  it('mantiene el mecanismo de los 3 embarques y su causa diferenciada', async () => {
    embarquesCerrados.mockResolvedValue(3)
    precargar([base('actual', {
      fecha: new Date('2026-11-13T05:30:00-05:00'),
      createdAt: new Date('2026-11-13T07:00:00-05:00'),
    })])
    expect((await findPedidosEnRiesgo()).get('actual')).toEqual({
      tipo: 'sin_gestionar', causa: 'embarques', minutosHabiles: null,
    })
  })
  it('no alarma a un programado futuro ni a una entrega parcial', async () => {
    embarquesCerrados.mockResolvedValue(3)
    precargar([
      base('futuro', { fechaEntrega: new Date('2026-11-14T00:00:00-05:00') }),
      base('parcial', { items: [{ cantEntrega: 3, cantRegaloEntrega: 0 }] }),
    ])
    expect((await findPedidosEnRiesgo()).size).toBe(0)
  })
  it('EN_RUTA de ayer conserva su evaluación aunque no sea de hoy', async () => {
    precargar([], [base('ruta', { estadoEntrega: 'EN_RUTA', embarqueId: 'e1' })])
    const resultado = await findPedidosEnRiesgo()
    expect(resultado.get('ruta')?.tipo).toBe('en_ruta')
  })
  it('NO_ENTREGADO sin embarque no desaparece al cambiar de día', async () => {
    precargar([base('reintentar', { estadoEntrega: 'NO_ENTREGADO' })])
    expect((await findPedidosEnRiesgo()).get('reintentar')?.tipo).toBe('sin_reasignar')
  })
})
