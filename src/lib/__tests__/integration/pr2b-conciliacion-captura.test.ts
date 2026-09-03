// @tests PR-2b — ADR-PAGO-EMBARQUE-CAPTURA-001 §5/§7: la conciliación de caja
// del cierre usa el CONTEXTO REAL DE CAPTURA (`Pago.embarqueId`), no el snapshot
// de `pedidosRaw` ni `embarqueOrigenId`. El cierre YA NO precarga el prepago;
// `cuadre.pagos` = solo dinero nuevo de la misión; `totalPagado` se INCREMENTA.
//
// Matriz de aceptación del ADR — casos cubiertos aquí:
//   2  — fiado cobrado en el cierre → caja del embarque += cobro
//   5  — prueba definitiva multi-embarque ($60k en E70, $40k en E78)
//   7  — cierre repetido (replay) no duplica el cobro
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

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

async function crearEmbarque(baseDinero = 0) {
  const t = await testPrisma.trabajador.create({
    data: { nombre: `P2b ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero },
  })
}

/** Pedido fiado de N pacas de agua a $10.000 (sin pagar), EN_RUTA en `embarqueId`. */
async function crearPedidoFiado(embarqueId: string, pacas: number) {
  const total = pacas * 10_000
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total,
      totalPagado: 0,
      saldo: total,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'PENDIENTE',
      embarqueId,
      cPacaAguaPed: pacas,
      cPacaAguaEnt: 0,
      precioPacaAgua: 10_000,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: pacas, cantEntrega: 0, precio: 10_000, subtotal: total }] },
    },
  })
}

describe('PR-2b — conciliación de caja por contexto de captura', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'P2b Cli',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('caso 2 — fiado cobrado en el cierre: caja del embarque += cobro, Pago.embarqueId = E', async () => {
    const emb = await crearEmbarque(0)
    const pedido = await crearPedidoFiado(emb.id, 5) // $50k

    const result = await buildUseCase().execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 50_000 }],
      }],
      gastos: [],
      dineroEntregado: 50_000,
    })

    expect(result.caja.efectivoEsperado).toBe(50_000)
    expect(result.caja.sobranteFaltante).toBe(0)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.totalPagado)).toBe(50_000)
    expect(Number(p.saldo)).toBe(0)

    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].embarqueId).toBe(emb.id)
  })

  it('caso 5 — prueba definitiva: $60k capturado en E70, $40k en E78; obligación ≠ ejecución ≠ captura', async () => {
    const e70 = await crearEmbarque(0)
    const pedido = await crearPedidoFiado(e70.id, 10) // $100k, 10 pacas

    // Cierre E70: entrega 6/10, cobra $60k.
    const r70 = await buildUseCase().execute({
      id: e70.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 6, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 60_000 }],
      }],
      gastos: [],
      dineroEntregado: 60_000,
    })
    expect(r70.caja.efectivoEsperado).toBe(60_000)

    const pMid = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(pMid.estadoEntrega).toBe('PENDIENTE')
    expect(Number(pMid.total)).toBe(100_000)
    expect(Number(pMid.totalPagado)).toBe(60_000)
    expect(Number(pMid.saldo)).toBe(40_000)
    expect(pMid.embarqueId).toBeNull()

    // Re-planificar a E78.
    const e78 = await crearEmbarque(0)
    await testPrisma.pedido.update({
      where: { id: pedido.id },
      data: { embarqueId: e78.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' },
    })

    // Cierre E78: entrega las 4 restantes, cobra $40k.
    const r78 = await buildUseCase().execute({
      id: e78.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 4, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 40_000 }],
      }],
      gastos: [],
      dineroEntregado: 40_000,
    })
    // El cierre de E78 SOLO ve el pago capturado en E78.
    expect(r78.caja.efectivoEsperado).toBe(40_000)

    const pFin = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(pFin.estadoEntrega).toBe('ENTREGADO')
    expect(Number(pFin.total)).toBe(100_000)      // obligación
    expect(Number(pFin.totalPagado)).toBe(100_000) // recibido total
    expect(Number(pFin.saldo)).toBe(0)

    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id }, orderBy: { monto: 'asc' } })
    expect(pagos.map((x) => [Number(x.monto), x.embarqueId])).toEqual([
      [40_000, e78.id],
      [60_000, e70.id],
    ])
  })

  it('caso 7 — cierre repetido (replay) del mismo embarque no duplica el cobro', async () => {
    const emb = await crearEmbarque(0)
    const pedido = await crearPedidoFiado(emb.id, 3) // $30k

    const input = {
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'COMPLETO' as const,
        productosEntregados: { cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 30_000 }],
      }],
      gastos: [],
      dineroEntregado: 30_000,
    }

    await buildUseCase().execute(input)
    // Segundo intento: el embarque ya está CERRADO → replay idempotente.
    await buildUseCase().execute(input).catch(() => { /* dedup devuelve el resultado previo o rechaza la transición */ })

    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id } })
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(30_000)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.totalPagado)).toBe(30_000)
  })
})
