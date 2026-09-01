import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de infra ANTES de importar el use-case.
const crearEmbarque = vi.fn()
const marcarGrupoMaterializado = vi.fn()
const updateMany = vi.fn()
const findManyPedido = vi.fn()
const findUniquePlan = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    planDia: { findUnique: (...a: unknown[]) => findUniquePlan(...a) },
    pedido: {
      findMany: (...a: unknown[]) => findManyPedido(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/modules/embarques/application/use-cases/CrearEmbarqueUseCase', () => ({
  CrearEmbarqueUseCase: class {
    execute = crearEmbarque
  },
}))
vi.mock('@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository', () => ({ PrismaEmbarqueRepository: class {} }))
vi.mock('@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository', () => ({ PrismaEmbarqueProductoRepository: class {} }))
vi.mock('@/modules/embarques/infrastructure/repositories/PrismaTrabajadorEmbarqueRepository', () => ({ PrismaTrabajadorEmbarqueRepository: class {} }))
vi.mock('@/modules/embarques/infrastructure/transactions/PrismaTransactionManager', () => ({ PrismaTransactionManager: class {} }))
vi.mock('@/modules/embarques/infrastructure/stock/StockValidator', () => ({ StockValidator: class {} }))

import { MaterializarPlanUseCase } from '../MaterializarPlanUseCase'

function fakeRepo(grupos: unknown[]) {
  return {
    gruposParaMaterializar: vi.fn().mockResolvedValue(grupos),
    marcarGrupoMaterializado,
  } as never
}

function grupo(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    nombreLogico: 'Norte',
    embarqueId: null,
    trabajadorFinalId: 't1',
    trabajadorPropuestoId: 't1',
    rutaId: null,
    horaSalidaPropuesta: '08:00',
    paradas: [
      { actividades: [{ tipo: 'ENTREGA', pedidoIds: ['p1', 'p2'], snapshotCantidades: { PACA_AGUA: 3 } }] },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findUniquePlan.mockResolvedValue({ fecha: new Date('2026-08-30T00:00:00-05:00') })
  findManyPedido.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
})

describe('MaterializarPlanUseCase', () => {
  it('1 grupo → 1 embarque; pedidos asignados EN_RUTA; grupo marcado', async () => {
    crearEmbarque.mockResolvedValue({ id: 'e1', numero: 5, numeroDia: 1 })
    const uc = new MaterializarPlanUseCase(fakeRepo([grupo()]))

    const res = await uc.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })

    expect(crearEmbarque).toHaveBeenCalledOnce()
    expect(crearEmbarque.mock.calls[0][0]).toMatchObject({
      trabajadorId: 't1',
      carga: { PACA_AGUA: 3, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 },
      verificarStock: true,
    })
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ embarqueId: 'e1', estadoEntrega: 'EN_RUTA' }) }),
    )
    expect(marcarGrupoMaterializado).toHaveBeenCalledWith('g1', 'e1')
    expect(res.completo).toBe(true)
    expect(res.creados).toHaveLength(1)
  })

  it('offlineId determinista: mismo plan+version+grupo → misma clave', async () => {
    crearEmbarque.mockResolvedValue({ id: 'e1', numero: 1, numeroDia: 1 })
    const uc = new MaterializarPlanUseCase(fakeRepo([grupo()]))
    await uc.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })
    const key1 = crearEmbarque.mock.calls[0][0].offlineId

    vi.clearAllMocks()
    findUniquePlan.mockResolvedValue({ fecha: new Date('2026-08-30T00:00:00-05:00') })
    findManyPedido.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
    crearEmbarque.mockResolvedValue({ id: 'e1', numero: 1, numeroDia: 1 })
    const uc2 = new MaterializarPlanUseCase(fakeRepo([grupo()]))
    await uc2.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })

    expect(crearEmbarque.mock.calls[0][0].offlineId).toBe(key1)
  })

  it('grupo sin repartidor → fallido, no llama CrearEmbarque', async () => {
    const uc = new MaterializarPlanUseCase(fakeRepo([grupo({ trabajadorFinalId: null, trabajadorPropuestoId: null })]))
    const res = await uc.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })
    expect(crearEmbarque).not.toHaveBeenCalled()
    expect(res.completo).toBe(false)
    expect(res.fallidos[0].error).toMatch(/repartidor/i)
  })

  it('fallo parcial: grupo 2 falla → completo=false, grupo 1 sí se creó', async () => {
    crearEmbarque
      .mockResolvedValueOnce({ id: 'e1', numero: 1, numeroDia: 1 })
      .mockRejectedValueOnce(new Error('STOCK_INSUFFICIENT: PACA_AGUA'))
    const uc = new MaterializarPlanUseCase(
      fakeRepo([grupo({ id: 'g1' }), grupo({ id: 'g2', nombreLogico: 'Sur' })]),
    )
    const res = await uc.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })
    expect(res.creados).toHaveLength(1)
    expect(res.fallidos).toHaveLength(1)
    expect(res.fallidos[0].error).toMatch(/STOCK/)
    expect(res.completo).toBe(false)
  })

  it('grupo con embarqueId ya seteado → se saltea (reintento)', async () => {
    const uc = new MaterializarPlanUseCase(fakeRepo([grupo({ embarqueId: 'e-existente' })]))
    const res = await uc.execute({ planId: 'plan1', version: 1, maxUnidades: 70 })
    expect(crearEmbarque).not.toHaveBeenCalled()
    expect(res.creados).toHaveLength(0)
    expect(res.completo).toBe(true)
  })
})
