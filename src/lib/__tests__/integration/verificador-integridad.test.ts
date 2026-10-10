// @tests src/lib/integridad — verificador de integridad de solo lectura (plan v1.2 §5.A)
// Corre las reglas reales contra Postgres sobre escenarios sintéticos: cada
// regla detecta su caso, los casos legítimos (Abono espejo de pagar-fiado,
// abono suelto sin pedidoId) no generan falsos positivos, y cualquier
// escritura dentro del verificador la rechaza Postgres (25006).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Prisma } from '@prisma/client'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, uniqueId } from './setup'
import { enSoloLectura, verificarIntegridad, type ReporteIntegridad } from '@/lib/integridad/verificar'
import { calcularEstadoPago } from '@/lib/pedido-utils'

const CF = 'CONSUMIDOR_FINAL'
const DIA = 24 * 60 * 60 * 1000

interface PedidoOpts {
  clienteId: string
  total: number
  totalPagado?: number
  canal?: string
  estadoEntrega?: 'ENTREGADO' | 'PENDIENTE'
  anulado?: boolean
  createdAt?: Date
  numero?: number
  cantPedido?: number
  cantEntrega?: number
  conFactura?: boolean
}

async function crearPedido(o: PedidoOpts) {
  const totalPagado = o.totalPagado ?? 0
  const estadoEntrega = o.estadoEntrega ?? 'ENTREGADO'
  const cantPedido = o.cantPedido ?? 1
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId: o.clienteId,
      canal: o.canal ?? 'PUNTO',
      total: o.total,
      totalPagado: o.anulado ? 0 : totalPagado,
      saldo: o.anulado ? o.total : o.total - totalPagado,
      estado: o.anulado ? 'ANULADO' : estadoEntrega,
      estadoEntrega: o.anulado ? 'ANULADO' : estadoEntrega,
      estadoPago: o.anulado ? 'ANULADO' : calcularEstadoPago(o.total, totalPagado, estadoEntrega),
      ...(o.numero !== undefined ? { numero: o.numero } : {}),
      ...(o.createdAt ? { createdAt: o.createdAt, fecha: o.createdAt } : {}),
      items: {
        create: {
          producto: 'PACA_AGUA',
          cantPedido,
          cantEntrega: o.cantEntrega ?? (estadoEntrega === 'ENTREGADO' ? cantPedido : 0),
          precio: o.total / cantPedido,
          subtotal: o.total,
        },
      },
    },
  })
  const factura =
    o.conFactura === false
      ? null
      : await testPrisma.factura.create({
          data: {
            numero: `FAC-${uniqueId('v').slice(0, 10)}`,
            clienteId: o.clienteId,
            pedidoId: pedido.id,
            subtotal: o.total,
            total: o.total,
            saldo: o.anulado ? 0 : o.total - totalPagado,
            montoPagado: o.anulado ? 0 : totalPagado,
            estado: o.anulado ? 'ANULADA' : totalPagado >= o.total ? 'PAGADA' : totalPagado > 0 ? 'PARCIAL' : 'EMITIDA',
          },
        })
  return { pedido, factura }
}

function refs(r: ReporteIntegridad, id: string): string[] {
  const regla = r.reglas.find((x) => x.id === id)
  if (!regla) throw new Error(`regla ${id} no está en el reporte`)
  return regla.hallazgos.map((h) => h.ref)
}

describe('verificador de integridad (solo lectura)', () => {
  const ids: Record<string, string> = {}
  let reporte: ReporteIntegridad

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await createTestCliente('verif')
    const ahora = Date.now()

    // Legítimo: pagar-fiado escribe Pago + Abono espejo por el mismo dinero.
    const espejo = await crearPedido({ clienteId: cliente.id, total: 10000, totalPagado: 10000, canal: 'DOMICILIO' })
    await testPrisma.pago.create({ data: { pedidoId: espejo.pedido.id, metodo: 'EFECTIVO', monto: 10000, confirmacion: 'CONFIRMADO' } })
    await testPrisma.abono.create({
      data: { numero: `ABO-${uniqueId('a')}`, facturaId: espejo.factura!.id, clienteId: cliente.id, pedidoId: espejo.pedido.id, monto: 10000, metodoPago: 'EFECTIVO' },
    })
    await testPrisma.receivableEntry.create({
      data: { pedidoId: espejo.pedido.id, clienteId: cliente.id, tipo: 'PAGO', monto: 10000, saldoResultante: 0, totalPagadoResultante: 10000 },
    })
    ids.espejo = espejo.pedido.id

    // Legítimo: abono suelto de /api/abonos sin pedidoId (solo factura), con su ReceivableEntry por factura.
    const suelto = await crearPedido({ clienteId: cliente.id, total: 7000, totalPagado: 7000, canal: 'DOMICILIO' })
    const abonoSuelto = await testPrisma.abono.create({
      data: { numero: `ABO-${uniqueId('a')}`, facturaId: suelto.factura!.id, clienteId: cliente.id, monto: 7000, metodoPago: 'EFECTIVO' },
    })
    await testPrisma.receivableEntry.create({
      data: { facturaId: suelto.factura!.id, clienteId: cliente.id, tipo: 'ABONO', monto: 7000, saldoResultante: 0, totalPagadoResultante: 7000 },
    })
    ids.suelto = suelto.pedido.id
    ids.abonoSuelto = abonoSuelto.id

    // V2 + V7: forma del incidente B (totalPagado completo, Pago menor, sin ReceivableEntry).
    const incB = await crearPedido({ clienteId: CF, total: 5000, totalPagado: 5000 })
    const pagoIncB = await testPrisma.pago.create({ data: { pedidoId: incB.pedido.id, metodo: 'EFECTIVO', monto: 3000, confirmacion: 'CONFIRMADO' } })
    ids.incB = incB.pedido.id
    ids.pagoIncB = pagoIncB.id

    // V3: pedido sin factura. V4: venta anónima con saldo.
    ids.sinFactura = (await crearPedido({ clienteId: cliente.id, total: 1000, conFactura: false, canal: 'DOMICILIO' })).pedido.id
    ids.cfSaldo = (await crearPedido({ clienteId: CF, total: 2000 })).pedido.id

    // V5: entregado con menos de lo pedido y sin ajuste.
    ids.entregaCorta = (await crearPedido({ clienteId: cliente.id, total: 3000, cantPedido: 3, cantEntrega: 2, canal: 'DOMICILIO' })).pedido.id

    // V6: anulado con pago y sin nota crédito ni reversión.
    const anulado = await crearPedido({ clienteId: cliente.id, total: 4000, anulado: true, canal: 'DOMICILIO' })
    await testPrisma.pago.create({ data: { pedidoId: anulado.pedido.id, metodo: 'EFECTIVO', monto: 4000, confirmacion: 'CONFIRMADO' } })
    ids.anulado = anulado.pedido.id

    // V8 + V15: número repetido y por encima de las secuencias.
    const rep1 = await crearPedido({ clienteId: cliente.id, total: 100, numero: 900001, canal: 'DOMICILIO' })
    await crearPedido({ clienteId: cliente.id, total: 200, numero: 900001, canal: 'DOMICILIO' })
    ids.repetido = rep1.pedido.id

    // V9: Nequi REPORTADO viejo (alerta) y reciente (no alerta).
    const digital = await crearPedido({ clienteId: cliente.id, total: 6000, totalPagado: 6000, canal: 'DOMICILIO' })
    const viejo = await testPrisma.pago.create({
      data: { pedidoId: digital.pedido.id, metodo: 'NEQUI', monto: 3000, createdAt: new Date(ahora - 5 * DIA) },
    })
    const reciente = await testPrisma.pago.create({
      data: { pedidoId: digital.pedido.id, metodo: 'NEQUI', monto: 3000, createdAt: new Date(ahora - DIA) },
    })
    ids.nequiViejo = viejo.id
    ids.nequiReciente = reciente.id

    // V10: saldo a favor del canónico.
    await testPrisma.cliente.update({ where: { id: CF }, data: { saldoFavor: 1500 } })

    // V11: misma venta registrada dos veces con 10 s de diferencia.
    const t0 = new Date(ahora - 3 * DIA)
    await crearPedido({ clienteId: cliente.id, total: 2800, totalPagado: 2800, createdAt: t0 })
    ids.duplicado = (await crearPedido({ clienteId: cliente.id, total: 2800, totalPagado: 2800, createdAt: new Date(t0.getTime() + 10_000) })).pedido.id

    // V13: pedido de punto sin entregar desde hace 2 días.
    ids.puntoPendiente = (await crearPedido({ clienteId: cliente.id, total: 2800, estadoEntrega: 'PENDIENTE', createdAt: new Date(ahora - 2 * DIA) })).pedido.id

    reporte = await verificarIntegridad(testPrisma, { maxMuestras: 10_000 })
  })

  afterAll(async () => {
    await disconnect()
  })

  it('rechaza cualquier escritura dentro de la transacción (25006)', async () => {
    const intento = enSoloLectura(testPrisma, (tx) => tx.$executeRaw`UPDATE "Cliente" SET "saldoFavor" = 0 WHERE id = 'CONSUMIDOR_FINAL'`)
    await expect(intento).rejects.toThrow(Prisma.PrismaClientKnownRequestError)
    await expect(intento).rejects.toMatchObject({ meta: { code: '25006' } })
    const cf = await testPrisma.cliente.findUniqueOrThrow({ where: { id: CF } })
    expect(Number(cf.saldoFavor)).toBe(1500)
  })

  it('V2 no marca el Abono espejo de pagar-fiado ni el abono suelto sin pedidoId', () => {
    expect(refs(reporte, 'V2')).not.toContain(ids.espejo)
    expect(refs(reporte, 'V2')).not.toContain(ids.suelto)
  })

  it('V2 marca el faltante del incidente B con la diferencia', () => {
    const h = reporte.reglas.find((r) => r.id === 'V2')!.hallazgos.find((x) => x.ref === ids.incB)
    expect(h?.detalle).toMatchObject({ totalPagado: 5000, pagos: 3000, diferencia: 2000 })
  })

  it('V7 marca el pago sin ReceivableEntry y no el abono suelto que la tiene por factura', () => {
    expect(refs(reporte, 'V7')).toContain(ids.pagoIncB)
    expect(refs(reporte, 'V7')).not.toContain(ids.abonoSuelto)
  })

  it.each([
    ['V3', 'sinFactura'],
    ['V4', 'cfSaldo'],
    ['V5', 'entregaCorta'],
    ['V6', 'anulado'],
    ['V8', 'repetido'],
    ['V9', 'nequiViejo'],
    ['V11', 'duplicado'],
    ['V13', 'puntoPendiente'],
  ])('%s detecta su caso', (regla, clave) => {
    expect(refs(reporte, regla)).toContain(ids[clave])
  })

  it('V9 no marca un pago digital reportado hace menos de 3 días', () => {
    expect(refs(reporte, 'V9')).not.toContain(ids.nequiReciente)
  })

  it('V10, V12 y V15 detectan saldo a favor anónimo, días sin cierre y secuencia atrasada', () => {
    expect(refs(reporte, 'V10')).toEqual([CF])
    expect(reporte.reglas.find((r) => r.id === 'V12')!.cantidad).toBeGreaterThan(0)
    expect(refs(reporte, 'V15')).toContain('pedido_numero_seq')
  })

  it('V1 no tiene hallazgos (los CHECK de Pedido lo garantizan) y el resumen suma por severidad', () => {
    expect(refs(reporte, 'V1')).toEqual([])
    const criticas = reporte.reglas.filter((r) => r.severidad === 'CRITICA').reduce((s, r) => s + r.cantidad, 0)
    expect(reporte.resumen.CRITICA).toBe(criticas)
  })
})
