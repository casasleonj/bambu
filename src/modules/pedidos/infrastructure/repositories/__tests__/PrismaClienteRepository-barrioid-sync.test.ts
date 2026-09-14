// @tests PrismaClienteRepository.updateDireccion — F1-BARRIO-CANONICO
// (fix hallazgo cross-módulo, flujo Pedidos)
//
// Hallazgo: a diferencia de PUT /api/clientes/[id], este método (usado por
// CrearPedidoUseCase/ActualizarPedidoUseCase cuando el checkbox "actualizar
// cliente" del form de Pedidos está activo) nunca tocaba `barrioId`. El
// checkbox solo captura `barrio` como texto libre (nunca tuvo un barrioId
// resuelto para ofrecer), así que la única vinculación posible sigue siendo
// vía el form de Cliente -- pero si el texto legacy cambiaba en el flujo de
// Pedidos, el `barrioId` viejo quedaba huérfano, apuntando a un Barrio que
// ya no correspondía al texto guardado. Prueba el comportamiento real
// (no solo la estructura del código): el fix nunca ASIGNA un barrioId nuevo
// por heurística -- solo LIMPIA el vínculo existente cuando deja de
// corresponder al texto nuevo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaClienteRepository } from '../PrismaClienteRepository'
import type { TransactionClient } from '../../transactions/PrismaTransactionManager'

const { mockLogAudit } = vi.hoisted(() => ({ mockLogAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

function makeTx(findUniqueResult: unknown) {
  const update = vi.fn().mockResolvedValue({})
  const findUnique = vi.fn().mockResolvedValue(findUniqueResult)
  const tx = { cliente: { findUnique, update } } as unknown as TransactionClient
  return { tx, findUnique, update }
}

describe('PrismaClienteRepository.updateDireccion — sync de barrioId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('barrio nuevo == barrio previo (solo cambió direccion): NO toca barrioId', async () => {
    const { tx, update } = makeTx({ direccion: 'Calle vieja', barrio: 'La Esperanza', barrioId: 'b1' })
    const repo = new PrismaClienteRepository()

    await repo.updateDireccion('cli_1', 'Calle nueva', 'La Esperanza', tx)

    const data = update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('barrioId')
    expect(data.barrio).toBe('La Esperanza')
  })

  it('barrio nuevo difiere del texto legacy vinculado: LIMPIA barrioId (nunca lo reasigna)', async () => {
    const { tx, update } = makeTx({ direccion: 'Calle vieja', barrio: 'La Esperanza', barrioId: 'b1' })
    const repo = new PrismaClienteRepository()

    await repo.updateDireccion('cli_1', 'Calle nueva', 'Otro Barrio', tx)

    const data = update.mock.calls[0][0].data
    expect(data.barrioId).toBeNull()
    expect(data.barrio).toBe('Otro Barrio')
  })

  it('barrio nuevo vacío con barrioId previamente vinculado: LIMPIA barrioId', async () => {
    const { tx, update } = makeTx({ direccion: 'Calle vieja', barrio: 'La Esperanza', barrioId: 'b1' })
    const repo = new PrismaClienteRepository()

    await repo.updateDireccion('cli_1', 'Calle nueva', undefined, tx)

    const data = update.mock.calls[0][0].data
    expect(data.barrioId).toBeNull()
    expect(data.barrio).toBeNull()
  })

  it('cliente legacy sin barrioId (nunca vinculado): nunca incluye barrioId en el update (no inventa un vínculo)', async () => {
    const { tx, update } = makeTx({ direccion: 'Calle vieja', barrio: 'Texto libre', barrioId: null })
    const repo = new PrismaClienteRepository()

    await repo.updateDireccion('cli_1', 'Calle nueva', 'Texto libre distinto', tx)

    const data = update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('barrioId')
  })

  it('al limpiar barrioId, audita el id desvinculado', async () => {
    const { tx } = makeTx({ direccion: 'Calle vieja', barrio: 'La Esperanza', barrioId: 'b1' })
    const repo = new PrismaClienteRepository()

    await repo.updateDireccion('cli_1', 'Calle nueva', 'Otro Barrio', tx)

    const call = mockLogAudit.mock.calls[0][0]
    expect(call.datos.barrioIdDesvinculado).toBe('b1')
  })
})
