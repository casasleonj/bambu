import { afterEach, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { leerExigibles, registrarEntregaExigible } from '../entregas-exigibles-db'
afterEach(() => vi.unstubAllEnvs())
it('OFF no consulta la tabla nueva y conserva solo deuda entregada', async () => {
  vi.stubEnv('FIADO_ENTREGA_PARCIAL', 'false')
  const findMany = vi.fn().mockResolvedValue([{ id: 'completo', estadoEntrega: 'ENTREGADO', saldo: 1000 },
    { id: 'parcial', estadoEntrega: 'PENDIENTE', saldo: 5000 }])
  const resultado = await leerExigibles({ pedido: { findMany } } as unknown as Pick<Prisma.TransactionClient, 'pedido'>)
  expect([...resultado]).toEqual([['completo', 1000], ['parcial', 0]])
  expect(findMany).toHaveBeenCalledWith({ where: {}, select: { id: true, estadoEntrega: true, saldo: true } })
  await expect(registrarEntregaExigible({} as Prisma.TransactionClient, {
    pedidoId: 'p', entregadoAt: new Date(), lineas: [{ producto: 'PACA_AGUA', cantidad: 1, precioCents: 100 }],
    pedido: { total: 1, totalPagado: 0, saldo: 1 },
  })).resolves.toBeUndefined()
})
