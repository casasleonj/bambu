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

async function crearEmbarqueConDosProductos(cargadasAgua: number, cargadasHielo: number) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `Promo Multi ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: {
      trabajadorId: trabajador.id,
      fecha: new Date(),
      estado: 'EN_RUTA',
      baseDinero: 0,
      productos: {
        create: [
          { producto: 'PACA_AGUA', cargadas: cargadasAgua, devueltas: 0, cambios: 0, rotas: 0 },
          { producto: 'PACA_HIELO', cargadas: cargadasHielo, devueltas: 0, cambios: 0, rotas: 0 },
        ],
      },
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

  // F5 P0, ronda 2 — blindar la AGREGACIÓN del ledger físico, no solo el
  // caso de un único movimiento.
  it('múltiples movimientos PROMOCION del mismo producto se ACUMULAN (no se pisa el último)', async () => {
    const { embarque } = await crearEmbarqueConCarga(10)
    // Dos movimientos separados, mismo producto — simula 2 promociones
    // distintas durante la misión, no una sola operación.
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 3, origen: 'VEHICULO', destino: 'CLIENTE' },
    })
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 4, origen: 'VEHICULO', destino: 'CLIENTE' },
    })

    const result = await buildUseCase().execute({ id: embarque.id, pedidos: [], dineroEntregado: 0 })

    // 10 cargadas - (3+4) acumulado = 3. Si la agregación estuviera rota
    // (ej. `=` en vez de `+=`, o solo lee el último movimiento) el resultado
    // sería 6 (10-4) o 7 (10-3), nunca 3 — el valor exacto distingue
    // "acumula" de "pisa".
    expect(result.discrepanciaTotal).toBe(3)
  })

  it('promociones simultáneas de productos DISTINTOS nunca se mezclan entre sí', async () => {
    const { embarque } = await crearEmbarqueConDosProductos(10, 10)
    // PACA_AGUA: promoción cubre exactamente lo cargado (discrepancia 0).
    // PACA_HIELO: promoción cubre solo una parte (discrepancia real de 7).
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 10, origen: 'VEHICULO', destino: 'CLIENTE' },
    })
    await testPrisma.embarqueMovimiento.create({
      data: { embarqueId: embarque.id, tipo: 'PROMOCION', producto: 'PACA_HIELO', cantidad: 3, origen: 'VEHICULO', destino: 'CLIENTE' },
    })

    const result = await buildUseCase().execute({ id: embarque.id, pedidos: [], dineroEntregado: 0 })

    // Correcto (aislado por producto): discrepancia_AGUA=0 + discrepancia_HIELO=7 = 7.
    // Si las cantidades se mezclaran entre productos (ej. las 13 unidades
    // combinadas se restaran de un solo producto, o el filtro por `producto`
    // se ignorara), el total NO daría 7 — daría otro número (ej. 13 si toda
    // la promoción se le atribuye solo a PACA_AGUA dejando PACA_HIELO sin
    // explicar). El valor exacto 7 solo es posible si cada movimiento se
    // restó del producto que realmente le corresponde.
    expect(result.discrepanciaTotal).toBe(7)
    const casos = await testPrisma.responsibilityCase.findMany({ where: { embarqueId: embarque.id } })
    expect(casos).toHaveLength(1)
    expect(casos[0]?.tipo).toBe('DISCREPANCIA_INVENTARIO')
  })
})
