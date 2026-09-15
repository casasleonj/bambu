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

  // F5 (convergencia CARGA/RECARGA v1.1): además de EmbarqueCarga, ahora
  // también se escribe el ledger físico canónico (EmbarqueMovimiento) —
  // ADR-FISICO-001 define CARGA con efecto propio; ADR-STOCK-001 dice que
  // el ledger debe reflejar el hecho "posteriormente". Un movimiento por
  // producto (granularidad verificada §4.1 del doc de convergencia),
  // cargaId auto-referenciado (cierra también el hallazgo C).
  it('al crear un embarque también se escribe un EmbarqueMovimiento{tipo:CARGA} por producto, con cargaId auto-referenciado', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Dual Write Ledger', rol: 'REPARTIDOR', usaMoto: true, capacidadKg: 500 },
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
    })

    const carga = await testPrisma.embarqueCarga.findFirstOrThrow({ where: { embarqueId: embarque.id } })

    const movimientos = await testPrisma.embarqueMovimiento.findMany({
      where: { embarqueId: embarque.id, tipo: 'CARGA' },
      orderBy: { producto: 'asc' },
    })

    // Un movimiento por producto (no uno solo con detalle) — 2 productos
    // cargados con cantidad > 0, 0 para BOTELLON/BOLSA_AGUA/BOLSA_HIELO
    // (no se inventan movimientos de cantidad cero).
    expect(movimientos).toHaveLength(2)
    const movAgua = movimientos.find((m) => m.producto === 'PACA_AGUA')
    const movHielo = movimientos.find((m) => m.producto === 'PACA_HIELO')
    expect(movAgua?.cantidad).toBe(5)
    expect(movHielo?.cantidad).toBe(2)
    // cargaId auto-referenciado a la EmbarqueCarga recién creada — cierra
    // el hallazgo C (el único escritor real que le daba sentido).
    expect(movAgua?.cargaId).toBe(carga.id)
    expect(movHielo?.cargaId).toBe(carga.id)
    expect(movAgua?.destino).toBe('VEHICULO')

    // La conciliación de control (EmbarqueProducto/Carga) es una autoridad
    // distinta y no debe verse afectada por este dual-write — sigue con el
    // mismo dato que antes.
    const embarqueProducto = await testPrisma.embarqueProducto.findMany({ where: { embarqueId: embarque.id } })
    expect(embarqueProducto.find((p) => p.producto === 'PACA_AGUA')?.cargadas).toBe(5)
  })
})
