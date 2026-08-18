// @tests FASE 2 — ledger físico: CHECK constraints en DB (contrato §8)
// Verifica la defensa a nivel de base de datos:
//   - cantidad siempre positiva en EmbarqueMovimiento/EmbarqueCargaProducto/Retorno.
//   - AJUSTE_AUTORIZADO exige authorization + userId + metadata.effect válido.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'

describe('ledger físico — CHECK constraints (contrato §8)', () => {
  let embarqueId: string

  beforeAll(async () => {
    await resetAndSeed()
    const trabajador = await testPrisma.trabajador.findFirst()
    if (!trabajador) throw new Error('No trabajador — ¿corriste seed-test?')
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, fecha: new Date() },
    })
    embarqueId = embarque.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('rechaza EmbarqueMovimiento con cantidad <= 0', async () => {
    await expect(
      testPrisma.embarqueMovimiento.create({
        data: { embarqueId, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 0 },
      }),
    ).rejects.toThrow()
  })

  it('rechaza AJUSTE_AUTORIZADO sin authorization', async () => {
    await expect(
      testPrisma.embarqueMovimiento.create({
        data: {
          embarqueId,
          tipo: 'AJUSTE_AUTORIZADO',
          producto: 'PACA_AGUA',
          cantidad: 1,
          metadata: { effect: 'INCREASE' },
          // sin authorization ni userId → debe fallar el CHECK
        },
      }),
    ).rejects.toThrow()
  })

  it('rechaza AJUSTE_AUTORIZADO con metadata.effect inválido', async () => {
    await expect(
      testPrisma.embarqueMovimiento.create({
        data: {
          embarqueId,
          tipo: 'AJUSTE_AUTORIZADO',
          producto: 'PACA_AGUA',
          cantidad: 1,
          metadata: { effect: 'ALGO_RARO' },
          authorization: 'auth-1',
          userId: 'user-1',
        },
      }),
    ).rejects.toThrow()
  })

  it('rechaza EmbarqueCargaProducto con cantidad <= 0', async () => {
    const carga = await testPrisma.embarqueCarga.create({ data: { embarqueId } })
    await expect(
      testPrisma.embarqueCargaProducto.create({
        data: { cargaId: carga.id, producto: 'PACA_AGUA', cantidad: 0 },
      }),
    ).rejects.toThrow()
  })

  it('rechaza Retorno con cantidad <= 0', async () => {
    await expect(
      testPrisma.retorno.create({
        data: { embarqueId, producto: 'PACA_AGUA', cantidad: 0 },
      }),
    ).rejects.toThrow()
  })

  it('acepta un movimiento ENTREGA válido (cantidad positiva + custodia)', async () => {
    const m = await testPrisma.embarqueMovimiento.create({
      data: {
        embarqueId,
        tipo: 'ENTREGA',
        producto: 'PACA_AGUA',
        cantidad: 1,
        origen: 'VEHICULO',
        destino: 'CLIENTE',
      },
    })
    expect(m.cantidad).toBe(1)
    await testPrisma.embarqueMovimiento.delete({ where: { id: m.id } })
  })

  it('acepta AJUSTE_AUTORIZADO completo (authorization + userId + effect)', async () => {
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('No admin — ¿corriste seed-test?')
    const m = await testPrisma.embarqueMovimiento.create({
      data: {
        embarqueId,
        tipo: 'AJUSTE_AUTORIZADO',
        producto: 'PACA_AGUA',
        cantidad: 1,
        metadata: { effect: 'INCREASE' },
        authorization: 'auth-1',
        userId: admin.id,
      },
    })
    expect(m.tipo).toBe('AJUSTE_AUTORIZADO')
    await testPrisma.embarqueMovimiento.delete({ where: { id: m.id } })
  })
})
