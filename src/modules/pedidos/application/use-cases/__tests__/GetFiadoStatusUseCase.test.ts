import { describe, it, expect, vi } from 'vitest'
import { GetFiadoStatusUseCase, ClienteNotFoundError } from '../GetFiadoStatusUseCase'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

vi.mock('@/lib/config', () => ({
  getConfigInt: vi.fn().mockResolvedValue(2), // LIMITE_PEDIDOS_FIADOS_DEFAULT
}))

function makeRepos(overrides: {
  cliente?: Partial<{ bloqueado: boolean; verificado: boolean; creadoPorRol: string; limitePedidosFiados: number | null }>
  pendientes?: Array<{ id: string; numero: number; saldo: number }>
} = {}) {
  const pedidoRepo = {
    findPendingByCliente: vi.fn().mockResolvedValue(overrides.pendientes ?? []),
  } as never
  const clienteRepo = {
    findById: vi.fn().mockResolvedValue({
      id: 'c1', bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null,
      ...overrides.cliente,
    }),
  } as never
  return { pedidoRepo, clienteRepo }
}

describe('GetFiadoStatusUseCase — Autoridad de Crédito (F1)', () => {
  it('CONSUMIDOR_FINAL: status NOT_APPLICABLE, sin consultar cliente ni pedidos', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos()
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: CANONICAL_CONSUMIDOR_FINAL_ID })
    expect(r).toEqual({
      count: 0, limite: 0, nivel: 'ok', pedidos: [],
      outstandingAmount: 0, status: 'NOT_APPLICABLE', errorDeuda: null,
    })
    expect((clienteRepo as { findById: ReturnType<typeof vi.fn> }).findById).not.toHaveBeenCalled()
  })

  it('cliente inexistente → ClienteNotFoundError', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos()
    ;(clienteRepo as { findById: ReturnType<typeof vi.fn> }).findById.mockResolvedValue(null)
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    await expect(uc.execute({ clienteId: 'nope' })).rejects.toThrow(ClienteNotFoundError)
  })

  it('exposición monetaria: outstandingAmount = suma de saldo de pedidos pendientes', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({
      pendientes: [{ id: 'a', numero: 1, saldo: 5000 }, { id: 'b', numero: 2, saldo: 3000 }],
    })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1' })
    expect(r.outstandingAmount).toBe(8000)
    expect(r.count).toBe(2)
  })

  it('sin `operacion`: no calcula proyección ni errorDeuda (uso informativo puro)', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({
      cliente: { bloqueado: true }, // aunque bloqueado, sin operación no hay decisión que tomar
      pendientes: [{ id: 'a', numero: 1, saldo: 5000 }],
    })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1' })
    expect(r.operationOutstanding).toBeUndefined()
    expect(r.projectedOutstandingAmount).toBeUndefined()
    expect(r.projectedOpenCount).toBeUndefined()
    expect(r.errorDeuda).toBeNull()
  })

  it('proyección: operationOutstanding y projectedOutstandingAmount reflejan la operación evaluada', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({
      pendientes: [{ id: 'a', numero: 1, saldo: 5000 }],
    })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1', operacion: { total: 13000, totalPagado: 3000 } })
    expect(r.operationOutstanding).toBe(10000)
    expect(r.projectedOutstandingAmount).toBe(15000) // 5000 + 10000
    expect(r.projectedOpenCount).toBe(2) // 1 pendiente + esta operación
  })

  it('operación pagada de contado (operationOutstanding = 0): NO evalúa errorDeuda aunque el cliente esté en el límite', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({
      pendientes: [{ id: 'a', numero: 1, saldo: 5000 }, { id: 'b', numero: 2, saldo: 3000 }], // count=2=limite
    })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1', operacion: { total: 13000, totalPagado: 13000 } })
    expect(r.operationOutstanding).toBe(0)
    expect(r.errorDeuda).toBeNull()
    expect(r.projectedOpenCount).toBe(2) // no suma un fiado nuevo — no queda saldo
  })

  it('operación que deja saldo + cliente sobre el límite → errorDeuda con el mensaje de puedeCrearPedido', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({
      pendientes: [{ id: 'a', numero: 1, saldo: 5000 }, { id: 'b', numero: 2, saldo: 3000 }], // count=2=limite
    })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1', operacion: { total: 13000, totalPagado: 3000 } })
    expect(r.errorDeuda).toContain('2 pedidos fiados')
  })

  it('cliente bloqueado + operación que deja saldo → errorDeuda de bloqueo (prioridad sobre el límite)', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos({ cliente: { bloqueado: true } })
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    const r = await uc.execute({ clienteId: 'c1', operacion: { total: 13000, totalPagado: 3000 } })
    expect(r.errorDeuda).toContain('bloqueado por deuda vencida')
  })

  it('status: OK cuando count < limite, AT_LIMIT cuando count === limite, OVER_LIMIT cuando count > limite', async () => {
    const casos: Array<[number, string]> = [[0, 'OK'], [1, 'OK'], [2, 'AT_LIMIT'], [3, 'OVER_LIMIT']]
    for (const [n, esperado] of casos) {
      const pendientes = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, numero: i, saldo: 100 }))
      const { pedidoRepo, clienteRepo } = makeRepos({ pendientes })
      const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
      const r = await uc.execute({ clienteId: 'c1' })
      expect(r.status).toBe(esperado)
    }
  })

  it('reenvía `tx` a los repos (para correr dentro de la transacción del caller)', async () => {
    const { pedidoRepo, clienteRepo } = makeRepos()
    const fakeTx = { marker: 'tx', config: { findUnique: vi.fn().mockResolvedValue(null) } } as never
    const uc = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
    await uc.execute({ clienteId: 'c1', tx: fakeTx })
    expect((clienteRepo as { findById: ReturnType<typeof vi.fn> }).findById).toHaveBeenCalledWith('c1', fakeTx)
    expect((pedidoRepo as { findPendingByCliente: ReturnType<typeof vi.fn> }).findPendingByCliente).toHaveBeenCalledWith('c1', fakeTx)
  })
})
