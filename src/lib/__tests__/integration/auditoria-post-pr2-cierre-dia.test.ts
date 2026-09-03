// @tests Auditoría post-PR-2 — F-B: caracterización del blind spot del cierre de día.
//
// docs/pedidos/AUDITORIA_REGRESION_POST_PR2_PEDIDO_PAGO_CIERRE.md §F-B
//
// El cierre de día (`/api/cierre`) deriva TODAS sus cifras financieras de
// `prisma.pedido.findMany({ where: { fecha: dateRange }, include: { pagos: true } })`
// — o sea, de la fecha de CREACIÓN del pedido. Un `Pago` capturado durante el
// cierre de un embarque, sobre un pedido creado un día anterior (caso que
// PR-2b F9 hizo frecuente al re-habilitar el registro de pagos en la rama
// PARCIAL), NO aparece en ese query y por lo tanto es invisible a `cobrado` /
// `efectivo` / `cobroVentasHoy` del día de la entrega.
//
// Este test NO afirma que sea un bug a corregir ya — fija el comportamiento
// actual con evidencia para que el equipo decida si el cierre de día concilia
// caja física o es un reporte por fecha de venta (ver el doc, "Clasificación").

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'

let clienteId: string

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

describe('Auditoría post-PR-2 — F-B: cierre de día vs efectivo cobrado en ruta', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await getAdminUser()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'FB Cli',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('un Pago EFECTIVO capturado hoy sobre un pedido creado hace 3 días NO entra al query del cierre de HOY', async () => {
    const hoy = new Date()
    const hace3dias = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000)

    const trab = await testPrisma.trabajador.create({
      data: { nombre: `FB ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
    })
    const emb = await testPrisma.embarque.create({
      data: { trabajadorId: trab.id, fecha: hoy, estado: 'CERRADO', baseDinero: 0 },
    })

    // Pedido fiado creado hace 3 días, entregado y cobrado $100k HOY en el cierre del embarque.
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        fecha: hace3dias,
        total: 100_000,
        totalPagado: 100_000,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estado: 'ENTREGADO',
        estadoPago: 'PAGADO',
        cPacaAguaPed: 10,
        cPacaAguaEnt: 10,
        precioPacaAgua: 10_000,
      },
    })
    await testPrisma.pago.create({
      data: {
        pedidoId: pedido.id,
        metodo: 'EFECTIVO',
        monto: 100_000,
        embarqueId: emb.id,
        confirmacion: 'CONFIRMADO',
        confirmadoAt: hoy,
        createdAt: hoy,
      },
    })

    // --- Query EXACTO del cierre de día (src/app/api/cierre/route.ts:191-197) ---
    const dateRange = { gte: startOfDayInBogota(ymd(hoy)), lt: endOfDayInBogota(ymd(hoy)) }
    const pedidosDelDia = await testPrisma.pedido.findMany({
      where: { fecha: dateRange, estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] } },
      include: { pagos: true },
    })

    // El pedido NO está (su fecha es de hace 3 días).
    expect(pedidosDelDia.some((p) => p.id === pedido.id)).toBe(false)

    // Y por lo tanto el efectivo del día calculado como lo hace el cierre
    // (route.ts:286-289) NO incluye los $100k realmente cobrados hoy.
    const efectivoDelDia = pedidosDelDia
      .flatMap((p) => p.pagos)
      .filter((pg) => pg.metodo === 'EFECTIVO')
      .reduce((acc, pg) => acc + Number(pg.monto), 0)
    expect(efectivoDelDia).toBe(0)

    // --- En cambio, el cierre de EMBARQUE sí lo ve (coleccionarPagosDeMision) ---
    const pagosMision = await testPrisma.pago.findMany({
      where: {
        embarqueId: emb.id,
        pedido: { estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] } },
      },
      select: { metodo: true, monto: true },
    })
    const efectivoMision = pagosMision
      .filter((pg) => pg.metodo === 'EFECTIVO')
      .reduce((acc, pg) => acc + Number(pg.monto), 0)
    expect(efectivoMision).toBe(100_000)
  })

  it('el cruce por `createdAt` del cierre de día (pagosReportadosHoyRaw) tampoco lo captura — el efectivo nace CONFIRMADO', async () => {
    const hoy = new Date()
    // Query de route.ts:269-272: solo confirmacion REPORTADO.
    const dateRange = { gte: startOfDayInBogota(ymd(hoy)), lt: endOfDayInBogota(ymd(hoy)) }
    const reportadosHoy = await testPrisma.pago.findMany({
      where: { confirmacion: 'REPORTADO', createdAt: dateRange },
      select: { metodo: true, monto: true },
    })
    // El pago del test anterior es EFECTIVO/CONFIRMADO → no está en este set.
    expect(reportadosHoy.some((p) => p.metodo === 'EFECTIVO' && Number(p.monto) === 100_000)).toBe(false)
  })
})
