// @tests FASE FINAL — dual-write del cierre → ledger físico
// ADR-FISICO-001 (§8): al cerrar, las entregas/ventas de ruta/retornos se
// escriben como EmbarqueMovimiento (hecho físico dirigido), además de la
// conciliación legacy.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { RegistrarMovimientosCierre } from '@/modules/embarques/domain/services/registrar-movimientos-cierre.service'

describe('FASE FINAL — dual-write del cierre (EmbarqueMovimiento)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('registra ENTREGA/VENTA_RUTA/RETORNO como hechos físicos dirigidos', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Dual Cierre', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, fecha: new Date() },
    })

    const service = new RegistrarMovimientosCierre()
    const count = await service.execute(testPrisma as never, {
      embarqueId: embarque.id,
      pedidosRaw: [{ cPacaAguaEnt: 3 }],
      ventasLibres: [{ cPacaHielo: 2 }],
      productosRetorno: [{ producto: 'PACA_AGUA', devueltas: 1, rotas: 0 }],
    })

    expect(count).toBe(3)

    const movimientos = await testPrisma.embarqueMovimiento.findMany({
      where: { embarqueId: embarque.id },
    })
    const entrega = movimientos.find((m) => m.tipo === 'ENTREGA')
    const venta = movimientos.find((m) => m.tipo === 'VENTA_RUTA')
    const retorno = movimientos.find((m) => m.tipo === 'RETORNO')

    expect(entrega?.cantidad).toBe(3)
    expect(entrega?.origen).toBe('VEHICULO')
    expect(entrega?.destino).toBe('CLIENTE')
    expect(venta?.cantidad).toBe(2)
    expect(retorno?.cantidad).toBe(1)
    expect(retorno?.destino).toBe('INSPECCION')
  })

  it('no escribe movimientos para cantidades cero (no inventa datos, §15)', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Dual Cero', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, fecha: new Date() },
    })

    const service = new RegistrarMovimientosCierre()
    const count = await service.execute(testPrisma as never, {
      embarqueId: embarque.id,
      pedidosRaw: [],
      ventasLibres: [],
      productosRetorno: [],
    })

    expect(count).toBe(0)
  })
})
