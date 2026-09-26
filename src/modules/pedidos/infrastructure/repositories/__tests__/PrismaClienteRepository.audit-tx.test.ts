/**
 * PrismaClienteRepository.updateDireccion — la auditoría respeta el boundary
 * transaccional del caller.
 *
 * Con `tx` (CrearPedidoUseCase bajo `SECUENCIA:pedido`, ActualizarPedidoUseCase
 * bajo `PEDIDO:{id}`), `logAudit` se escribe por ESA tx y se espera: si la tx
 * hace rollback, no queda un Historial de un cambio de dirección que nunca se
 * persistió, y no se toma una segunda conexión del pool mientras se retiene
 * el advisory lock. Sin `tx` se conserva el comportamiento previo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logAuditMock = vi.fn()
const globalClienteFindUnique = vi.fn()
const globalClienteUpdate = vi.fn()

vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: {
      findUnique: (...args: unknown[]) => globalClienteFindUnique(...args),
      update: (...args: unknown[]) => globalClienteUpdate(...args),
    },
  },
}))

import { PrismaClienteRepository } from '../PrismaClienteRepository'

const previo = { direccion: 'Calle 1', barrio: 'Centro', barrioId: null }

function makeTx() {
  return {
    cliente: {
      findUnique: vi.fn().mockResolvedValue(previo),
      update: vi.fn().mockResolvedValue({}),
    },
    // Misma dirección/barrio en los tests de abajo → EvaluarImpactoUbicacion
    // no consulta pedidos (early return "sin cambio real"); se deja por si acaso.
    pedido: { findMany: vi.fn().mockResolvedValue([]) },
    pedidoImpactoUbicacion: { createMany: vi.fn() },
  }
}

describe('PrismaClienteRepository.updateDireccion — auditoría dentro de la tx', () => {
  beforeEach(() => {
    logAuditMock.mockReset().mockResolvedValue(undefined)
    globalClienteFindUnique.mockReset().mockResolvedValue(previo)
    globalClienteUpdate.mockReset().mockResolvedValue({})
  })

  it('con tx: logAudit recibe la MISMA tx (no el prisma global)', async () => {
    const tx = makeTx()
    await new PrismaClienteRepository().updateDireccion('c1', 'Calle 1', 'Centro', tx as never, { usuarioId: 'u1' })

    expect(logAuditMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock.mock.calls[0][1]).toBe(tx)
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({ entidad: 'Cliente', registroId: 'c1', accion: 'UPDATE', usuarioId: 'u1' })
    expect(globalClienteUpdate).not.toHaveBeenCalled()
  })

  it('con tx: espera a logAudit — un fallo de auditoría propaga y hace rollback de la tx', async () => {
    logAuditMock.mockRejectedValue(new Error('audit down'))
    const tx = makeTx()
    await expect(
      new PrismaClienteRepository().updateDireccion('c1', 'Calle 1', 'Centro', tx as never),
    ).rejects.toThrow('audit down')
  })

  it('sin tx: comportamiento previo (logAudit sin tx, fire-and-forget)', async () => {
    let resolveAudit: () => void = () => {}
    logAuditMock.mockReturnValue(new Promise<void>((r) => { resolveAudit = r }))

    // No debe quedarse esperando a la auditoría.
    await new PrismaClienteRepository().updateDireccion('c1', 'Calle 1', 'Centro')

    expect(logAuditMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock.mock.calls[0]).toHaveLength(1)
    resolveAudit()
  })
})
