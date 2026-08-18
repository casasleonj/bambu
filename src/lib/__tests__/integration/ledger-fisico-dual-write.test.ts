// @tests FASE 8 — dual-write del ledger físico al crear embarque
// ADR-FISICO-001 / ADR-STOCK-001: al crear un embarque, además del mirror
// legacy (EmbarqueProducto), se escribe la carga en el ledger físico
// (EmbarqueCarga + EmbarqueCargaProducto). EmbarqueCargaProducto.cantidad es el
// hecho físico; availabilityBasis es metadata de validación (§10).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CrearEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CrearEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTrabajadorEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaTrabajadorEmbarqueRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { StockValidator } from '@/modules/embarques/infrastructure/stock/StockValidator'

describe('FASE 8 — dual-write del ledger físico (EmbarqueCarga)', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('al crear un embarque se escribe EmbarqueCarga + EmbarqueCargaProducto', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Dual Write', rol: 'REPARTIDOR', usaMoto: true, capacidadKg: 500 },
    })

    const useCase = new CrearEmbarqueUseCase(
      new PrismaEmbarqueRepository(),
      new PrismaTrabajadorEmbarqueRepository(),
      new StockValidator(),
      new PrismaEmbarqueProductoRepository(),
      new PrismaTransactionManager(),
    )

    const embarque = await useCase.execute({
      trabajadorId: trabajador.id,
      carga: { PACA_AGUA: 5, PACA_HIELO: 2, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 },
      baseDinero: 50000,
      createdById: adminId,
      verificarStock: false,
      availabilityBasis: 'CONFIRMED_STOCK',
    })

    const carga = await testPrisma.embarqueCarga.findFirst({
      where: { embarqueId: embarque.id },
      include: { productos: true },
    })
    expect(carga).not.toBeNull()
    expect(carga!.availabilityBasis).toBe('CONFIRMED_STOCK')

    const productos = carga!.productos
    expect(productos).toHaveLength(2)
    const agua = productos.find((p) => p.producto === 'PACA_AGUA')
    const hielo = productos.find((p) => p.producto === 'PACA_HIELO')
    expect(agua?.cantidad).toBe(5)
    expect(hielo?.cantidad).toBe(2)
  })
})
