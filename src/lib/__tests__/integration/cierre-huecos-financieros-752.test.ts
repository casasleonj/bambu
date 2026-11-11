// @tests #752 — movimientos monetarios que obligan a cerrar una jornada (PostgreSQL real).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { listarDiasPendientes, diasObligatoriosAntesDe } from '@/lib/cierre-huecos'
import { startOfDayInBogota } from '@/lib/date-helpers'

const dia = (fecha: string) => startOfDayInBogota(fecha)
const sumarDias = (fecha: string, dias: number) =>
  new Date(dia(fecha).getTime() + dias * 86_400_000)
const fechaLocal = (instante: Date) =>
  new Date(instante.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)

describe('#752 — detector de jornadas financieras (Postgres)', () => {
  let adminId: string
  let clienteId: string
  let pedidoId: string
  let facturaId: string
  let trabajadorId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const cliente = await testPrisma.cliente.create({
      data: { nombre: 'Cliente sintético 752', telefono: '3120040752', direccion: 'Calle prueba', activo: true },
    })
    clienteId = cliente.id
    const pedido = await testPrisma.pedido.create({
      data: { clienteId, canal: 'PUNTO', total: 10000, totalPagado: 0, saldo: 10000, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PENDIENTE' },
    })
    pedidoId = pedido.id
    const factura = await testPrisma.factura.create({
      data: { numero: 'FAC-TEST-752', clienteId, pedidoId, subtotal: 10000, total: 10000, saldo: 10000, montoPagado: 0, estado: 'EMITIDA' },
    })
    facturaId = factura.id
    trabajadorId = (await testPrisma.trabajador.create({
      data: { nombre: 'Trabajador sintético 752', rol: 'REPARTIDOR', usaMoto: true },
    })).id
  })
  afterAll(async () => { await disconnect() })

  async function verificarUnicoMovimiento(ancla: string, registrar: (instante: Date) => Promise<unknown>) {
    await testPrisma.cierreDia.create({ data: { fecha: dia(ancla), cerradoPor: adminId } })
    const movimiento = sumarDias(ancla, 1)
    const nombreMovimiento = fechaLocal(movimiento)
    const fechaSiguiente = fechaLocal(sumarDias(ancla, 2))
    const antes = await testPrisma.$transaction((tx) => listarDiasPendientes(tx, fechaSiguiente))
    expect(antes.find((x) => x.fecha === nombreMovimiento)?.obligatorio).toBe(false)
    await registrar(new Date(movimiento.getTime() + 3_600_000))
    const pendientes = await testPrisma.$transaction((tx) => listarDiasPendientes(tx, fechaSiguiente))
    const encontrada = pendientes.find((x) => x.fecha === nombreMovimiento)
    expect(encontrada).toEqual({ fecha: nombreMovimiento, operaciones: 1, obligatorio: true })
    const bloquea = await testPrisma.$transaction((tx) => diasObligatoriosAntesDe(tx, fechaSiguiente))
    expect(bloquea.map((x) => x.fecha)).toContain(nombreMovimiento)
  }

  it('un Abono independiente, sin Pago paralelo, hace obligatorio el día', async () => {
    await verificarUnicoMovimiento('2041-01-10', async (fecha) => {
      await testPrisma.abono.create({
        data: { numero: 'ABO-TEST-752-1', facturaId, clienteId, pedidoId, monto: 1000, metodoPago: 'NEQUI', origenCobro: 'INDEPENDIENTE', fecha },
      })
    })
  })

  it('un ingreso de saldo a favor también obliga cierre', async () => {
    await verificarUnicoMovimiento('2041-03-10', async (createdAt) => {
      await testPrisma.ingresoSaldoFavor.create({
        data: { clienteId, metodo: 'EFECTIVO', monto: 500, origen: 'PAGAR_FIADO', createdAt },
      })
    })
  })

  it('una devolución de saldo a favor también obliga cierre', async () => {
    await verificarUnicoMovimiento('2041-05-10', async (createdAt) => {
      await testPrisma.devolucionSaldoFavor.create({
        data: { clienteId, metodo: 'NEQUI', monto: 300, motivo: 'Prueba #752', offlineId: 'dev-752', autorizadoPorId: adminId, createdAt },
      })
    })
  })

  it('una comisión pagada se atribuye al día del desembolso, no al del trabajo', async () => {
    await verificarUnicoMovimiento('2041-07-10', async (createdAt) => {
      await testPrisma.pagoComisionRepartidor.create({
        data: { trabajadorId, fecha: dia('2041-07-09'), monto: 900, metodo: 'EFECTIVO', concepto: 'REPARTO', createdAt },
      })
    })
  })

  it('la corrección de un Abono registra movimiento en su día de ajuste', async () => {
    await testPrisma.abono.create({
      data: { numero: 'ABO-TEST-752-2', facturaId, clienteId, pedidoId, monto: 1000, metodoPago: 'EFECTIVO', origenCobro: 'INDEPENDIENTE', fecha: dia('2041-09-08') },
    }).then(async (abono) => {
      await verificarUnicoMovimiento('2041-09-10', async (createdAt) => {
        await testPrisma.correccionAbono.create({
          data: { numero: 'COR-TEST-752', abonoId: abono.id, tipo: 'MONTO', montoRevertido: 100, motivo: 'Prueba #752', autorizadoPorId: adminId, createdAt },
        })
      })
    })
  })

  it('la nómina pagada por Nequi no requiere un Gasto de efectivo para obligar cierre', async () => {
    await verificarUnicoMovimiento('2041-11-10', async (fechaPago) => {
      await testPrisma.nomina.create({
        data: { trabajadorId, fechaInicio: dia('2041-11-01'), fechaFin: dia('2041-11-09'), total: 2000, estado: 'PAGADA', metodoPago: 'NEQUI', fechaPago },
      })
    })
  })

  it('un Abono legado sin origen explícito requiere conciliación aunque tenga vínculo de Pago', async () => {
    await verificarUnicoMovimiento('2042-05-10', async (fecha) => {
      const pago = await testPrisma.pago.create({
        data: { pedidoId, monto: 3000, metodo: 'EFECTIVO', createdAt: dia('2042-05-09') },
      })
      await testPrisma.abono.create({
        data: { numero: 'ABO-TEST-752-5', facturaId, clienteId, pedidoId, monto: 3000, metodoPago: 'EFECTIVO', origenCobro: null, pagoOrigenId: pago.id, fecha },
      })
    })
  })

  it('un Abono etiquetado espejo pero inconsistente NO se descarta sin conciliar', async () => {
    await verificarUnicoMovimiento('2042-03-10', async (fecha) => {
      const pago = await testPrisma.pago.create({
        data: { pedidoId, monto: 3000, metodo: 'EFECTIVO', createdAt: dia('2042-03-09') },
      })
      await testPrisma.abono.create({
        data: { numero: 'ABO-TEST-752-4', facturaId, clienteId, pedidoId, monto: 2000, metodoPago: 'EFECTIVO', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id, fecha },
      })
    })
  })

  it('un Abono espejo del Pago no duplica la cantidad de hechos del día', async () => {
    await verificarUnicoMovimiento('2042-01-10', async (createdAt) => {
      const pago = await testPrisma.pago.create({
        data: { pedidoId, monto: 3000, metodo: 'EFECTIVO', createdAt },
      })
      await testPrisma.abono.create({
        data: { numero: 'ABO-TEST-752-3', facturaId, clienteId, pedidoId, monto: 3000, metodoPago: 'EFECTIVO', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id, fecha: createdAt },
      })
    })
  })
})
