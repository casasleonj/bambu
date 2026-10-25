// @tests ADR-CIERRE-002 §4 (épica #447, Fase B) — reglas de la venta libre
// capturada al cerrar un embarque (hallazgos #445, #450). Postgres real.
//   - CONSUMIDOR_FINAL ("venta al paso") exige pago completo (DEUDOR_REQUERIDO).
//   - Cliente bloqueado: no se le deja saldo (CLIENTE_DEBE) salvo excepción autorizada.
//   - Precios especiales del cliente/negocio se aplican (antes se ignoraban).
//   - `negocioId` y `pedidoOrigenId` quedan guardados y se validan.
//   - Pago sin productos y pago mayor al total se rechazan (antes: descarte silencioso / 500).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

function cerrarUC() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function embarqueVacio() {
  const t = await testPrisma.trabajador.create({ data: { nombre: `VL ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true } })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0, productos: { create: [{ producto: 'PACA_AGUA', cargadas: 50 }] } },
  })
}

const vl = (over: Record<string, unknown> = {}) => ({
  clienteId, cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
  pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
  ...over,
})

async function cerrar(e: { id: string }, ventas: ReturnType<typeof vl>[], extra: Record<string, unknown> = {}) {
  return cerrarUC().execute({ id: e.id, pedidos: [], ventasLibres: ventas, dineroEntregado: 0, ...extra } as Parameters<ReturnType<typeof cerrarUC>['execute']>[0])
}

async function msg(p: Promise<unknown>) {
  try { await p; return 'NO_LANZO' } catch (e) { return e instanceof Error ? e.message : String(e) }
}

describe('Cierre — reglas de la venta libre (ADR-CIERRE-002 §4)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
    await testPrisma.cliente.update({ where: { id: clienteId }, data: { verificado: true } })
  })
  afterAll(async () => { await disconnect() })

  it('#445: CONSUMIDOR_FINAL sin pago completo → DEUDOR_REQUERIDO', async () => {
    const e = await embarqueVacio()
    const m = await msg(cerrar(e, [vl({ clienteId: 'CONSUMIDOR_FINAL', pagos: [] })]))
    expect(m).toMatch(/^DEUDOR_REQUERIDO/)
  })

  it('CONSUMIDOR_FINAL con pago completo se acepta (dry-run)', async () => {
    const e = await embarqueVacio()
    const r = await cerrar(e, [vl({ clienteId: 'CONSUMIDOR_FINAL', pagos: [{ metodo: 'EFECTIVO', monto: 5600 }] })], { dryRun: true })
    expect(r.ventasLibresCreadas).toBe(1)
  })

  it('#445: cliente bloqueado con saldo → CLIENTE_DEBE; pagando completo se acepta', async () => {
    const bloq = await testPrisma.cliente.create({
      data: { nombre: 'Bloqueado VL', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true, verificado: true, bloqueado: true },
    })
    const e = await embarqueVacio()
    const m = await msg(cerrar(e, [vl({ clienteId: bloq.id, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })]))
    expect(m).toMatch(/^CLIENTE_DEBE/)
    const ok = await cerrar(e, [vl({ clienteId: bloq.id, pagos: [{ metodo: 'EFECTIVO', monto: 5600 }] })], { dryRun: true })
    expect(ok.ventasLibresCreadas).toBe(1)
  })

  it('#445: aplica los precios especiales del cliente (antes los ignoraba)', async () => {
    const esp = await testPrisma.cliente.create({
      data: {
        nombre: 'Especial VL', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true, verificado: true,
        preciosEspeciales: JSON.stringify({ DOMICILIO: { PACA_AGUA: 2000 } }),
      },
    })
    const e = await embarqueVacio()
    await cerrar(e, [vl({ clienteId: esp.id, cPacaAgua: 3, pagos: [{ metodo: 'EFECTIVO', monto: 6000 }] })])
    const ped = await testPrisma.pedido.findFirstOrThrow({ where: { embarqueOrigenId: e.id, origen: 'VENTA_LIBRE' } })
    expect(Number(ped.precioPacaAgua)).toBe(2000)
    expect(Number(ped.total)).toBe(6000)
  })

  it('#445: guarda negocioId y pedidoOrigenId, y los valida', async () => {
    const negocio = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Tienda VL' } })
    const origen = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO', total: 0, totalPagado: 0, saldo: 0 },
    })
    const e = await embarqueVacio()
    await cerrar(e, [vl({ negocioId: negocio.id, pedidoOrigenId: origen.id, pagos: [{ metodo: 'EFECTIVO', monto: 5600 }] })])
    const ped = await testPrisma.pedido.findFirstOrThrow({ where: { embarqueOrigenId: e.id, origen: 'VENTA_LIBRE' } })
    expect(ped.negocioId).toBe(negocio.id)
    expect(ped.pedidoOrigenId).toBe(origen.id)

    const otro = await testPrisma.cliente.create({
      data: { nombre: 'Otro VL', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true, verificado: true },
    })
    const e2 = await embarqueVacio()
    expect(await msg(cerrar(e2, [vl({ clienteId: otro.id, pedidoOrigenId: origen.id, pagos: [{ metodo: 'EFECTIVO', monto: 5600 }] })]))).toMatch(/^PEDIDO_ORIGEN_INVALIDO/)
    expect(await msg(cerrar(e2, [vl({ clienteId: otro.id, negocioId: negocio.id, pagos: [{ metodo: 'EFECTIVO', monto: 5600 }] })]))).toMatch(/^NEGOCIO_INVALIDO/)
  })

  it('#444: pago sin productos → VENTA_LIBRE_PAGO_SIN_PRODUCTOS (antes se descartaba en silencio)', async () => {
    const e = await embarqueVacio()
    const m = await msg(cerrar(e, [vl({ cPacaAgua: 0, pagos: [{ metodo: 'EFECTIVO', monto: 3000 }] })]))
    expect(m).toMatch(/^VENTA_LIBRE_PAGO_SIN_PRODUCTOS/)
  })

  it('#444: pago mayor al total → PAGO_EXCEDE_TOTAL (antes: 500 por constraint)', async () => {
    const e = await embarqueVacio()
    const m = await msg(cerrar(e, [vl({ pagos: [{ metodo: 'EFECTIVO', monto: 99999 }] })]))
    expect(m).toMatch(/^PAGO_EXCEDE_TOTAL/)
  })

  it('una venta vacía sin pago sigue ignorándose (fila en blanco)', async () => {
    const e = await embarqueVacio()
    const r = await cerrar(e, [vl({ cPacaAgua: 0, pagos: [] })], { dryRun: true })
    expect(r.ventasLibresCreadas).toBe(0)
  })
})
