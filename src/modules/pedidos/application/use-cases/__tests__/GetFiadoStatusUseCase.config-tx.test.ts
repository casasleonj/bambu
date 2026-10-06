/**
 * GetFiadoStatusUseCase — lectura de `LIMITE_PEDIDOS_FIADOS_DEFAULT` dentro de
 * la transacción del caller (bug de concurrencia `pedido-dedup`, P2028).
 *
 * Con `tx`, la Config se lee por ESA tx (nunca por el `prisma` global: dentro
 * de `executeWithLock('SECUENCIA', 'pedido', ...)` eso pedía una segunda
 * conexión mientras se retenía el advisory lock). Sin `tx`, se conserva
 * `getConfigInt` y su caché. El fallback debe ser idéntico en los dos caminos:
 * por eso este archivo usa el `getConfigInt` REAL (con `prisma.config` y
 * `unstable_cache` mockeados), no un mock de `@/lib/config`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const globalConfigFindUnique = vi.fn()

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { config: { findUnique: (...args: unknown[]) => globalConfigFindUnique(...args) } },
}))

import { GetFiadoStatusUseCase } from '../GetFiadoStatusUseCase'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'

function makeUseCase() {
  const pedidoRepo = { findPendingByCliente: vi.fn().mockResolvedValue([]) } as never
  const clienteRepo = {
    findById: vi.fn().mockResolvedValue({
      id: 'c1', bloqueado: false, verificado: true, creadoPorRol: 'ADMIN',
      // null → el límite sale del Config global (el que se está probando).
      limitePedidosFiados: null,
    }),
  } as never
  return new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)
}

function makeTx(row: { valor: string } | null) {
  return { config: { findUnique: vi.fn().mockResolvedValue(row) } }
}

describe('GetFiadoStatusUseCase — LIMITE_PEDIDOS_FIADOS_DEFAULT vía tx', () => {
  beforeEach(() => {
    globalConfigFindUnique.mockReset()
  })

  it('con tx: consulta la Config por ESA tx y nunca por el prisma global', async () => {
    const tx = makeTx({ valor: '5' })
    const r = await makeUseCase().execute({ clienteId: 'c1', tx: tx as never })

    expect(tx.config.findUnique).toHaveBeenCalledTimes(1)
    expect(tx.config.findUnique).toHaveBeenCalledWith({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
    expect(globalConfigFindUnique).not.toHaveBeenCalled()
    expect(r.limite).toBe(5)
  })

  it('sin tx: conserva getConfigInt (prisma global + caché) para consultas de UI', async () => {
    globalConfigFindUnique.mockResolvedValue({ valor: '5' })
    const r = await makeUseCase().execute({ clienteId: 'c1' })

    expect(globalConfigFindUnique).toHaveBeenCalledWith({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
    expect(r.limite).toBe(5)
  })

  // Fallback idéntico a getConfigInt: ausente / no numérico / no entero →
  // LIMITE_FIADOS_DEFAULT. '7.5' distingue el chequeo de entero (parseInt
  // daría 7); '' → 0 → resolverLimiteFiados cae al default (<= 0).
  const casos: Array<[string, { valor: string } | null, number]> = [
    ['ausente', null, LIMITE_FIADOS_DEFAULT],
    ['no numérico', { valor: 'abc' }, LIMITE_FIADOS_DEFAULT],
    ['no entero', { valor: '7.5' }, LIMITE_FIADOS_DEFAULT],
    ['vacío', { valor: '' }, LIMITE_FIADOS_DEFAULT],
    ['Infinity', { valor: 'Infinity' }, LIMITE_FIADOS_DEFAULT],
    ['entero válido', { valor: '9' }, 9],
  ]

  it.each(casos)('Config %s: con tx y sin tx producen el mismo límite', async (_nombre, row, esperado) => {
    const conTx = await makeUseCase().execute({ clienteId: 'c1', tx: makeTx(row) as never })

    globalConfigFindUnique.mockResolvedValue(row)
    const sinTx = await makeUseCase().execute({ clienteId: 'c1' })

    expect(conTx.limite).toBe(esperado)
    expect(sinTx.limite).toBe(esperado)
  })
})
