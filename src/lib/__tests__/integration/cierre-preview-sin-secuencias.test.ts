// @tests ADR-CIERRE-002 §3 (épica #447, Fase B) — hallazgo #438: el preview del
// cierre (dry-run con rollback) consumía números de secuencia, porque
// `nextval()` no se revierte con ROLLBACK. Mirar el resumen no puede cambiar
// nada, ni siquiera los consecutivos de pedidos y facturas.
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

async function estadoSecuencia(nombre: string) {
  const rows = await testPrisma.$queryRawUnsafe<Array<{ last_value: bigint; is_called: boolean }>>(
    `SELECT last_value, is_called FROM ${nombre}`,
  )
  return { last: Number(rows[0].last_value), called: rows[0].is_called }
}

describe('Cierre — el preview no consume secuencias (#438)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('10 previews con venta libre y pedido parcial no mueven pedido_numero_seq ni factura_numero_seq', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: `Sec ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: {
        trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0,
        productos: { create: [{ producto: 'PACA_AGUA', cargadas: 30 }] },
      },
    })
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA',
        estadoPago: 'PENDIENTE', total: 23000, totalPagado: 0, saldo: 23000, cPacaAguaPed: 10, precioPacaAgua: 2300,
        embarqueId: embarque.id,
        items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 2300, subtotal: 23000 }] },
      },
    })

    const antesPedido = await estadoSecuencia('pedido_numero_seq')
    const antesFactura = await estadoSecuencia('factura_numero_seq')

    const input = {
      id: embarque.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL' as const,
        productosEntregados: { cPacaAguaEnt: 4, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [],
      }],
      ventasLibres: [{
        clienteId, cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
        pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
      }],
      dineroEntregado: 5600,
      dryRun: true,
    }
    for (let i = 0; i < 10; i++) {
      const r = await cerrarUC().execute(input)
      expect(r.ventasLibresCreadas).toBe(1)
    }

    expect(await estadoSecuencia('pedido_numero_seq')).toEqual(antesPedido)
    expect(await estadoSecuencia('factura_numero_seq')).toEqual(antesFactura)

    // ...y el cierre real SÍ avanza la numeración con números reales y consecutivos.
    const real = await cerrarUC().execute({ ...input, dryRun: false })
    expect(real.ventasLibresCreadas).toBe(1)
    const despuesPedido = await estadoSecuencia('pedido_numero_seq')
    expect(despuesPedido.last).toBeGreaterThan(antesPedido.last)
    const vl = await testPrisma.pedido.findFirstOrThrow({ where: { embarqueOrigenId: embarque.id, origen: 'VENTA_LIBRE' } })
    expect(vl.numero).toBeLessThan(1_000_000) // número real, no el provisional del preview
  })
})
