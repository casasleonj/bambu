// @tests Habilitar recargas — CrearEmbarqueUseCase + findByTrabajadorAndFecha
// Hallazgo: findByTrabajadorAndFecha bloqueaba un segundo embarque del mismo
// trabajador el mismo día sin importar el estado del primero (incluso ya
// CERRADO), impidiendo que un repartidor hiciera 2+ viajes/día ("recargas").
// Fix: el filtro ahora sólo considera ABIERTO/EN_RUTA como "bloqueante".
// Verifica en ambas direcciones:
//   1. Sigue bloqueando si el embarque previo está ABIERTO o EN_RUTA.
//   2. Permite crear un segundo embarque si el previo está CERRADO o
//      CANCELADO (recarga), sin chocar con el unique constraint de numeroDia.
//   3. findByTrabajadorAndFecha devuelve null/embarque según el estado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayBogota } from '@/lib/dates'
import { CrearEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CrearEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTrabajadorEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaTrabajadorEmbarqueRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { StockValidator } from '@/modules/embarques/infrastructure/stock/StockValidator'

describe('Recargas — CrearEmbarqueUseCase permite 2+ embarques/día si el previo no está activo', () => {
  let useCase: CrearEmbarqueUseCase
  let embarqueRepo: PrismaEmbarqueRepository
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  async function crearTrabajadorRepartidor(nombre: string) {
    const t = await testPrisma.trabajador.create({
      data: { nombre, rol: 'REPARTIDOR', usaMoto: true, capacidadKg: 500, activo: true },
    })
    return t.id
  }

  function nuevoUseCase() {
    return new CrearEmbarqueUseCase(
      new PrismaEmbarqueRepository(),
      new PrismaTrabajadorEmbarqueRepository(),
      new StockValidator(),
      new PrismaEmbarqueProductoRepository(),
      new PrismaTransactionManager(),
    )
  }

  async function crearEmbarque(trabajadorId: string, unidades = 5) {
    return useCase.execute({
      trabajadorId,
      carga: { PACA_AGUA: unidades, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 },
      baseDinero: 50000,
      horaSalida: new Date(),
      createdById: adminId,
      verificarStock: false,
    })
  }

  beforeAll(() => {
    useCase = nuevoUseCase()
    embarqueRepo = new PrismaEmbarqueRepository()
  })

  it('NO REGRESIÓN: bloquea un segundo embarque si el primero sigue ABIERTO', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor Abierto')
    await crearEmbarque(trabajadorId)

    await expect(crearEmbarque(trabajadorId)).rejects.toThrow(
      'El trabajador ya tiene un embarque abierto hoy',
    )
  })

  it('NO REGRESIÓN: bloquea un segundo embarque si el primero está EN_RUTA', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor EnRuta')
    const primero = await crearEmbarque(trabajadorId)
    await testPrisma.embarque.update({ where: { id: primero.id }, data: { estado: 'EN_RUTA' } })

    await expect(crearEmbarque(trabajadorId)).rejects.toThrow(
      'El trabajador ya tiene un embarque abierto hoy',
    )
  })

  it('FIX: permite una recarga (segundo embarque) si el primero ya está CERRADO', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor Cerrado')
    const primero = await crearEmbarque(trabajadorId)
    await testPrisma.embarque.update({ where: { id: primero.id }, data: { estado: 'CERRADO' } })

    const segundo = await crearEmbarque(trabajadorId)

    expect(segundo.id).not.toBe(primero.id)
    expect(segundo.numeroDia).toBeGreaterThan(primero.numeroDia)

    const countEmbarquesTrabajador = await testPrisma.embarque.count({ where: { trabajadorId } })
    expect(countEmbarquesTrabajador).toBe(2)
  })

  it('FIX: permite una recarga (segundo embarque) si el primero está CANCELADO', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor Cancelado')
    const primero = await crearEmbarque(trabajadorId)
    await testPrisma.embarque.update({ where: { id: primero.id }, data: { estado: 'CANCELADO' } })

    const segundo = await crearEmbarque(trabajadorId)

    expect(segundo.id).not.toBe(primero.id)
    expect(segundo.numeroDia).toBeGreaterThan(primero.numeroDia)
  })

  it('findByTrabajadorAndFecha: devuelve null cuando el único embarque del día está CERRADO', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor FindCerrado')
    const embarque = await crearEmbarque(trabajadorId)
    await testPrisma.embarque.update({ where: { id: embarque.id }, data: { estado: 'CERRADO' } })

    const found = await embarqueRepo.findByTrabajadorAndFecha(trabajadorId, startOfDayBogota())
    expect(found).toBeNull()
  })

  it('findByTrabajadorAndFecha: devuelve el embarque cuando está ABIERTO', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor FindAbierto')
    const embarque = await crearEmbarque(trabajadorId)

    const found = await embarqueRepo.findByTrabajadorAndFecha(trabajadorId, startOfDayBogota())
    expect(found).not.toBeNull()
    expect(found!.id.value).toBe(embarque.id)
  })

  it('findByTrabajadorAndFecha: devuelve el embarque cuando está EN_RUTA', async () => {
    const trabajadorId = await crearTrabajadorRepartidor('Test Repartidor FindEnRuta')
    const embarque = await crearEmbarque(trabajadorId)
    await testPrisma.embarque.update({ where: { id: embarque.id }, data: { estado: 'EN_RUTA' } })

    const found = await embarqueRepo.findByTrabajadorAndFecha(trabajadorId, startOfDayBogota())
    expect(found).not.toBeNull()
    expect(found!.id.value).toBe(embarque.id)
  })

  it('#427: el número global no se repite al cambiar de día (el del día sí vuelve a 1)', async () => {
    // Un embarque de "ayer": el primero del día de hoy vuelve a tener numeroDia 1,
    // pero su `numero` global tiene que ser otro (antes era una copia de numeroDia).
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await testPrisma.embarque.updateMany({ data: { fecha: ayer } })
    const t1 = await crearTrabajadorRepartidor('Test 427 ayer')
    const deAyer = await crearEmbarque(t1)
    await testPrisma.embarque.update({ where: { id: deAyer.id }, data: { fecha: ayer } })

    const t2 = await crearTrabajadorRepartidor('Test 427 hoy')
    const deHoy = await crearEmbarque(t2)

    expect(deHoy.numeroDia).toBe(1)
    expect(deHoy.numero).not.toBe(deAyer.numero)
    const usados = await testPrisma.embarque.findMany({ where: { numeroColisionHistorica: false }, select: { numero: true } })
    expect(new Set(usados.map((e) => e.numero)).size).toBe(usados.length)
  })
})
