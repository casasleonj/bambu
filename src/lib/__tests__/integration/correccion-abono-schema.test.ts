// @tests CorreccionAbono — schema (ADR-CORRECCION-MONETARIA-001 D.3, g2.1)
// Solo la tabla + constraints. El flujo de corrección (endpoint + ReceivableEntry
// REVERSION) va en g2.2.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

describe('CorreccionAbono — schema', () => {
  let abonoId: string
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin no encontrado')
    adminId = admin.id

    const cliente = await testPrisma.cliente.create({
      data: {
        nombre: 'Cliente Correccion',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'x',
        activo: true,
      },
    })
    const pedido = await testPrisma.pedido.create({
      data: { clienteId: cliente.id, canal: 'DOMICILIO', total: 20000, totalPagado: 20000, saldo: 0 },
    })
    const factura = await testPrisma.factura.create({
      data: {
        numero: `FAC-${uniqueId('c').slice(0, 8)}`,
        clienteId: cliente.id,
        pedidoId: pedido.id,
        subtotal: 20000,
        total: 20000,
        saldo: 0,
        montoPagado: 20000,
        estado: 'PAGADA',
      },
    })
    const abono = await testPrisma.abono.create({
      data: {
        numero: `ABO-${uniqueId('a').slice(0, 8)}`,
        facturaId: factura.id,
        clienteId: cliente.id,
        pedidoId: pedido.id,
        monto: 12000,
        metodoPago: 'NEQUI',
      },
    })
    abonoId = abono.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('crea una CorreccionAbono vinculada al abono', async () => {
    const cor = await testPrisma.correccionAbono.create({
      data: {
        numero: `COR-${uniqueId('x').slice(0, 8)}`,
        abonoId,
        tipo: 'MONTO',
        montoRevertido: 2000,
        motivo: 'Monto capturado de más',
        autorizadoPorId: adminId,
      },
    })
    expect(cor.id).toBeTruthy()
    const conAbono = await testPrisma.correccionAbono.findUnique({
      where: { id: cor.id },
      include: { abono: true, autorizadoPor: true },
    })
    expect(conAbono?.abono.id).toBe(abonoId)
    expect(conAbono?.autorizadoPor.id).toBe(adminId)
  })

  it('chk_correccion_monto_pos: montoRevertido <= 0 → rechazado', async () => {
    await expect(
      testPrisma.correccionAbono.create({
        data: {
          numero: `COR-${uniqueId('y').slice(0, 8)}`,
          abonoId,
          tipo: 'MONTO',
          montoRevertido: 0,
          motivo: 'x',
          autorizadoPorId: adminId,
        },
      }),
    ).rejects.toThrow()
  })

  it('correccionOfflineId es UNIQUE (dedup)', async () => {
    const off = uniqueId('off-cor')
    await testPrisma.correccionAbono.create({
      data: {
        numero: `COR-${uniqueId('z1').slice(0, 8)}`,
        abonoId,
        tipo: 'FACTURA',
        montoRevertido: 100,
        motivo: 'x',
        autorizadoPorId: adminId,
        correccionOfflineId: off,
      },
    })
    await expect(
      testPrisma.correccionAbono.create({
        data: {
          numero: `COR-${uniqueId('z2').slice(0, 8)}`,
          abonoId,
          tipo: 'FACTURA',
          montoRevertido: 100,
          motivo: 'x',
          autorizadoPorId: adminId,
          correccionOfflineId: off,
        },
      }),
    ).rejects.toThrow(/Unique constraint|correccionOfflineId/)
  })

  it('onDelete Restrict: no se puede borrar un Abono con correcciones', async () => {
    await expect(testPrisma.abono.delete({ where: { id: abonoId } })).rejects.toThrow()
  })
})
