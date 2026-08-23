// @tests A.3.4 (plan de convergencia Embarques) — el cuadre de caja que
// ve el usuario en Reconciliation debía pedirse en modo dry-run al mismo
// CerrarEmbarqueUseCase que hace el cierre real, no reimplementarse en el
// cliente (riesgo: el useMemo del cliente diverge del backend y el usuario
// ve "cuadre perfecto" mientras el backend genera una deuda, o viceversa).
//
// Verifica contra Postgres real:
//   1. `dryRun: true` calcula el mismo resultado que un cierre real
//      posterior con el mismo input (mismos números de caja).
//   2. `dryRun: true` NO persiste nada: el embarque sigue EN_RUTA después,
//      no se crean movimientos/gastos/deudas.
//   3. El cierre real posterior (mismo input, dryRun: false) sí persiste.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

async function crearEmbarqueEnRuta(baseDinero: number) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: 'Dry Run Preview', rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: {
      trabajadorId: trabajador.id,
      fecha: new Date(),
      estado: 'EN_RUTA',
      baseDinero,
    },
  })
  return { trabajador, embarque }
}

let adminId: string

function buildUseCase() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

describe('CerrarEmbarqueUseCase — dry-run preview (A.3.4)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dryRun:true no persiste nada — el embarque sigue EN_RUTA y sin gastos', async () => {
    const { embarque } = await crearEmbarqueEnRuta(50000)

    const useCase = buildUseCase()
    const result = await useCase.execute({
      id: embarque.id,
      pedidos: [],
      gastos: [{ categoria: 'Gasolina', monto: 10000 }],
      dineroEntregado: 40000,
      dryRun: true,
    })

    expect(result.estado).toBe('CERRADO') // el resultado calculado sí lo dice — no el DB
    expect(result.caja.efectivoReal).toBe(40000) // baseDinero 50000 - gastos 10000

    const embarqueDb = await testPrisma.embarque.findUniqueOrThrow({ where: { id: embarque.id } })
    expect(embarqueDb.estado).toBe('EN_RUTA') // NO se persistió el cierre

    const gastosDb = await testPrisma.gasto.findMany({ where: { embarqueId: embarque.id } })
    expect(gastosDb.length).toBe(0) // el gasto del dry-run se rollbackeó

    // Cleanup
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
  })

  it('dryRun:true calcula EXACTAMENTE lo mismo que el cierre real posterior', async () => {
    const { embarque } = await crearEmbarqueEnRuta(30000)
    const input = {
      id: embarque.id,
      pedidos: [],
      gastos: [{ categoria: 'Peajes', monto: 5000 }],
      dineroEntregado: 25000,
    }

    const preview = await buildUseCase().execute({ ...input, dryRun: true })
    // Nueva instancia — mismo patrón que usan los dos route.ts (cerrar y
    // cerrar/preview) al construir el use case por request.
    const real = await buildUseCase().execute({ ...input, dryRun: false })

    expect(real.caja).toEqual(preview.caja)
    expect(real.discrepanciaTotal).toBe(preview.discrepanciaTotal)

    const embarqueDb = await testPrisma.embarque.findUniqueOrThrow({ where: { id: embarque.id } })
    expect(embarqueDb.estado).toBe('CERRADO') // el segundo (real) sí persistió

    // Cleanup
    await testPrisma.gasto.deleteMany({ where: { embarqueId: embarque.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
  })
})
