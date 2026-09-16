// @tests F5 (convergencia semántica física, P0 — bug de integridad real)
//
// Hallazgo: POST /api/promociones escribe el ledger físico
// (EmbarqueMovimiento{tipo:PROMOCION}) pero nunca tocaba Pedido/PedidoItem
// ni EmbarqueProducto. CierreEmbarqueService.calcularDiscrepancia() solo
// conocía cargadas/entregadas/devueltas/cambios/rotas — una unidad
// promocional aparecía como "faltante" y podía disparar un
// ResponsibilityCase (DISCREPANCIA_INVENTARIO) contra el trabajador por
// una discrepancia que nunca existió.
//
// Fix: CerrarEmbarqueUseCase.conciliarProductos() ahora lee
// EmbarqueMovimiento{tipo:PROMOCION} de ESTE embarque (única fuente del
// hecho físico — nunca Pedido) y las resta en la fórmula de discrepancia,
// igual que ENTREGA/VENTA_RUTA. No toca Pedido.entregadas ni ninguna
// autoridad comercial.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

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

async function crearEmbarqueConCarga(cargadas: number) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `Promo Conciliacion ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: {
      trabajadorId: trabajador.id,
      fecha: new Date(),
      estado: 'EN_RUTA',
      baseDinero: 0,
      productos: { create: [{ producto: 'PACA_AGUA', cargadas, devueltas: 0, cambios: 0, rotas: 0 }] },
    },
  })
  return { trabajador, embarque }
}

describe('F5 P0 — PROMOCIÓN no debe generar discrepancia falsa en el cierre', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })

  afterAll(async () => { await disconnect() })

  it('promoción == toda la carga → discrepancia 0, sin ResponsibilityCase', async () => {
    const { embarque } = await crearEmbarqueConCarga(10)
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 10, origen: 'VEHICULO', destino: 'CLIENTE' },
    })

    const result = await buildUseCase().execute({ id: embarque.id, pedidos: [], dineroEntregado: 0 })

    expect(result.discrepanciaTotal).toBe(0)
    expect(result.responsibilityCases).toHaveLength(0)

    const casos = await testPrisma.responsibilityCase.findMany({ where: { embarqueId: embarque.id } })
    expect(casos).toHaveLength(0)
  })

  it('promoción parcial: cargadas=10, promoción=6 → disponible real (faltante genuino=4) se sigue detectando', async () => {
    const { embarque } = await crearEmbarqueConCarga(10)
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 6, origen: 'VEHICULO', destino: 'CLIENTE' },
    })

    const result = await buildUseCase().execute({ id: embarque.id, pedidos: [], dineroEntregado: 0 })

    // 10 cargadas - 6 promoción = 4 sin explicar (ni entregado, ni devuelto, ni promoción) → discrepancia real, no absorbida silenciosamente.
    expect(result.discrepanciaTotal).toBe(4)
    expect(result.responsibilityCases.some((c) => c.tipo === 'DISCREPANCIA_INVENTARIO')).toBe(true)
  })

  it('sin promoción, comportamiento histórico intacto: cargadas=10 sin nada más → discrepancia 10', async () => {
    const { embarque } = await crearEmbarqueConCarga(10)

    const result = await buildUseCase().execute({ id: embarque.id, pedidos: [], dineroEntregado: 0 })

    expect(result.discrepanciaTotal).toBe(10)
  })
})
