// @tests #533 / ADR-SALDO-FAVOR-EXCEDENTE-001 — excedente de una corrección de precio o de una
// reducción comercial → saldo a favor. Batería adversarial contra Postgres real:
//   - el excedente pasa al saldo del cliente sin tocar los Pago ni la caja;
//   - ida y vuelta (bajar y volver a subir) reaplica solo el crédito DE ESE pedido;
//   - un pago sin confirmar no respalda crédito; la venta anónima no tiene a quién acreditar;
//   - anular/cancelar no borra el crédito (es dinero del cliente) y las sumas cuadran;
//   - idempotencia, solicitudes pendientes que cambian antes de autorizarse, concurrencia;
//   - propiedad: tras cualquier secuencia, el dinero se conserva y el verificador V1–V16 no se queja.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente, uniqueId } from './setup'
import { SolicitarCorreccionPrecioUseCase, ResolverCorreccionPrecioUseCase } from '@/modules/pedidos/application/use-cases/CorreccionPrecioUseCases'
import { SolicitarReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { CancelarPedidoUseCase } from '@/modules/pedidos/application/use-cases/CancelarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { reaplicarCreditoDelPedido, creditoNetoDelPedido, proyectarReversionCredito } from '@/modules/pedidos/application/services/saldo-favor-excedente.service'
import { withAdvisoryLock } from '@/lib/locks'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'
import { verificarIntegridad } from '@/lib/integridad/verificar'

let adminId: string
let autorizadorId: string
let asistenteId: string

const solPrecio = new SolicitarCorreccionPrecioUseCase()
const resPrecio = new ResolverCorreccionPrecioUseCase()
const solRed = new SolicitarReduccionComercialUseCase()
const anular = () => new AnularPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaNotaCreditoRepository(), new PrismaTransactionManager())
const cancelar = () => new CancelarPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaNotaCreditoRepository(), new PrismaTransactionManager())

type PagoFix = { monto: number; metodo?: 'EFECTIVO' | 'NEQUI'; confirmacion?: 'CONFIRMADO' | 'REPORTADO' | 'DISCREPANTE' }

/** 10 PACA_AGUA a $2.500 = $25.000 (entregado), con factura y los pagos dados. */
async function crearPedido(clienteId: string, pagos: PagoFix[], extra: { estado?: 'ENTREGADO' | 'PENDIENTE'; cant?: number; ent?: number } = {}) {
  const estado = extra.estado ?? 'ENTREGADO'
  const cant = extra.cant ?? 10
  const total = cant * 2500
  const pagado = pagos.reduce((s, p) => s + p.monto, 0)
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: estado, estado,
      estadoPago: calcularEstadoPago(total, pagado, estado), total, totalPagado: pagado, saldo: total - pagado,
      cPacaAguaPed: cant, cPacaAguaEnt: extra.ent ?? (estado === 'ENTREGADO' ? cant : 0), precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: cant, cantEntrega: extra.ent ?? (estado === 'ENTREGADO' ? cant : 0), precio: 2500, subtotal: total }] },
    },
  })
  const f = await testPrisma.factura.create({
    data: {
      numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: total - pagado, montoPagado: pagado,
      estado: pagado === 0 ? 'EMITIDA' : pagado >= total ? 'PAGADA' : 'PARCIAL',
    },
  })
  for (const p of pagos) {
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: p.metodo ?? 'EFECTIVO', monto: p.monto, confirmacion: p.confirmacion ?? 'CONFIRMADO' } })
    await testPrisma.receivableEntry.create({ data: { pedidoId: pedido.id, facturaId: f.id, clienteId, tipo: 'PAGO', monto: p.monto, saldoResultante: total - pagado, totalPagadoResultante: pagado } })
  }
  return pedido
}

const saldoFavor = async (clienteId: string) => Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })).saldoFavor)
const fijarSaldoFavor = (clienteId: string, v: number) => testPrisma.cliente.update({ where: { id: clienteId }, data: { saldoFavor: v } })

async function estado(pedidoId: string) {
  const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { factura: true } })
  return {
    total: Number(p.total), totalPagado: Number(p.totalPagado), saldo: Number(p.saldo), estadoPago: p.estadoPago,
    facTotal: Number(p.factura?.total), facPagado: Number(p.factura?.montoPagado), facSaldo: Number(p.factura?.saldo), facEstado: p.factura?.estado,
  }
}

/** Reglas del verificador (V1–V16) que señalan ESTE pedido. Debe ser []. */
async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas
    // V7 (pago sin ReceivableEntry) y V11 no dependen del traslado: el fixture crea los Pago directo.
    .filter((r) => r.id !== 'V7' && r.id !== 'V11')
    .flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

async function mensajeDe(p: Promise<unknown>): Promise<string> {
  try { await p; return 'NO_LANZO' } catch (e) { return e instanceof Error ? e.message : String(e) }
}

const bajar = (pedidoId: string, precioNuevo: number, actorId = adminId, offlineId?: string) =>
  solPrecio.execute({ pedidoId, producto: 'PACA_AGUA', precioNuevo, motivo: 'ajuste de precio', actorId, actorRol: 'ADMIN', offlineId })
const reducir = (pedidoId: string, cantidadReducida: number, actorId = autorizadorId, offlineId?: string) =>
  solRed.execute({ pedidoId, producto: 'PACA_AGUA', cantidadReducida, motivo: 'ya no quiere', aceptadoPor: 'Cliente', medio: 'TELEFONO', actorId, offlineId })

describe('Excedente → saldo a favor (#533)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const asistente = await testPrisma.user.findUniqueOrThrow({ where: { username: 'asistente' } })
    asistenteId = asistente.id
    autorizadorId = asistenteId
    await testPrisma.user.update({ where: { id: autorizadorId }, data: { puedeAutorizarReduccionComercial: true } })
  })
  afterAll(async () => { await disconnect() })

  describe('el traslado', () => {
    it('baja el precio con el pedido pagado: el excedente es crédito, los Pago y la caja no se tocan y todo cuadra', async () => {
      const c = await createTestCliente('exc1')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      const r = await bajar(p.id, 2300)
      expect(r).toMatchObject({ estado: 'APLICADA', excedenteAcreditado: 2000, creditoReaplicado: 0 })
      expect(await estado(p.id)).toEqual({ total: 23000, totalPagado: 23000, saldo: 0, estadoPago: 'PAGADO', facTotal: 23000, facPagado: 23000, facSaldo: 0, facEstado: 'PAGADA' })
      expect(await saldoFavor(c.id)).toBe(2000)
      expect((await testPrisma.pago.findMany({ where: { pedidoId: p.id } })).map((g) => Number(g.monto))).toEqual([25000])
      const mv = await testPrisma.pedidoSaldoFavorMovimiento.findMany({ where: { pedidoId: p.id } })
      expect(mv).toHaveLength(1)
      expect(mv[0]).toMatchObject({ tipo: 'ACREDITACION', origenTipo: 'CORRECCION_PRECIO', origenId: r.id, autorId: adminId, clienteId: c.id })
      expect(Number(mv[0].monto)).toBe(2000)
      const rev = await testPrisma.receivableEntry.findMany({ where: { pedidoId: p.id, tipo: 'REVERSION' } })
      expect(rev.map((e) => Number(e.monto))).toEqual([2000])
      expect(await violaciones(p.id)).toEqual([])
    })

    it('a mitad de camino: pagado parcial y el nuevo total queda por debajo de lo pagado', async () => {
      const c = await createTestCliente('exc2')
      const p = await crearPedido(c.id, [{ monto: 24000 }])
      await bajar(p.id, 2000) // total 20.000, pagado 24.000
      expect(await estado(p.id)).toMatchObject({ total: 20000, totalPagado: 20000, saldo: 0, estadoPago: 'PAGADO' })
      expect(await saldoFavor(c.id)).toBe(4000)
      expect(await violaciones(p.id)).toEqual([])
    })

    it('sin excedente (pagó menos que el nuevo total): no se acredita nada', async () => {
      const c = await createTestCliente('exc3')
      const p = await crearPedido(c.id, [{ monto: 10000 }])
      const r = await bajar(p.id, 2300)
      expect(r.excedenteAcreditado).toBe(0)
      expect(await saldoFavor(c.id)).toBe(0)
      expect(await testPrisma.pedidoSaldoFavorMovimiento.count({ where: { pedidoId: p.id } })).toBe(0)
      expect(await estado(p.id)).toMatchObject({ total: 23000, totalPagado: 10000, saldo: 13000 })
    })

    it('un centavo de más ya es excedente y se acredita exacto', async () => {
      const c = await createTestCliente('exc4')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantPedido: 10, cantEntrega: 10 } })
      await bajar(p.id, 2499.99) // total 24.999,90 → excedente 0,10
      expect(await saldoFavor(c.id)).toBe(0.1)
      expect(await estado(p.id)).toMatchObject({ total: 24999.9, totalPagado: 24999.9, saldo: 0 })
    })

    it('la reducción comercial traslada el excedente igual y la nota de crédito sigue siendo por lo reducido', async () => {
      const c = await createTestCliente('exc5')
      const p = await crearPedido(c.id, [{ monto: 25000 }], { cant: 10, ent: 6 })
      const r = await reducir(p.id, 4) // quita 4 × 2.500 = 10.000 → total 15.000
      expect(r).toMatchObject({ estado: 'APLICADA', monto: 10000, totalDespues: 15000, excedenteAcreditado: 10000 })
      expect(await estado(p.id)).toMatchObject({ total: 15000, totalPagado: 15000, saldo: 0, estadoPago: 'PAGADO', facPagado: 15000, facEstado: 'PAGADA' })
      expect(await saldoFavor(c.id)).toBe(10000)
      expect(Number((await testPrisma.notaCredito.findUniqueOrThrow({ where: { id: r.notaCreditoId } })).monto)).toBe(10000)
      expect(await violaciones(p.id)).toEqual([])
    })
  })

  describe('ida y vuelta: bajar el precio y volver a subirlo', () => {
    it('reaplica el crédito de ESE pedido y deja todo como al inicio', async () => {
      const c = await createTestCliente('rt1')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // excedente 5.000
      expect(await saldoFavor(c.id)).toBe(5000)
      const r = await bajar(p.id, 2500)
      expect(r).toMatchObject({ estado: 'APLICADA', excedenteAcreditado: 0, creditoReaplicado: 5000 })
      expect(await estado(p.id)).toEqual({ total: 25000, totalPagado: 25000, saldo: 0, estadoPago: 'PAGADO', facTotal: 25000, facPagado: 25000, facSaldo: 0, facEstado: 'PAGADA' })
      expect(await saldoFavor(c.id)).toBe(0)
      const tipos = (await testPrisma.pedidoSaldoFavorMovimiento.findMany({ where: { pedidoId: p.id }, orderBy: { createdAt: 'asc' } })).map((m) => `${m.tipo}:${Number(m.monto)}`)
      expect(tipos).toEqual(['ACREDITACION:5000', 'REAPLICACION:5000'])
      expect(await creditoNetoDelPedido(testPrisma as never, p.id)).toBe(0)
      expect(await violaciones(p.id)).toEqual([])
    })

    it('si el cliente ya gastó parte del crédito, se reaplica solo lo que queda y el resto es deuda real del pedido', async () => {
      const c = await createTestCliente('rt2')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // crédito 5.000
      await fijarSaldoFavor(c.id, 1200) // el cliente gastó 3.800 en otro pedido
      const r = await bajar(p.id, 2500) // el total vuelve a 25.000
      expect(r.creditoReaplicado).toBe(1200)
      expect(await estado(p.id)).toMatchObject({ total: 25000, totalPagado: 21200, saldo: 3800, estadoPago: 'PARCIAL', facSaldo: 3800, facEstado: 'PARCIAL' })
      expect(await saldoFavor(c.id)).toBe(0)
      expect(await violaciones(p.id)).toEqual([])
    })

    it('no toca el saldo a favor que el cliente tiene por otros motivos', async () => {
      const c = await createTestCliente('rt3')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await fijarSaldoFavor(c.id, 7000) // crédito ajeno a este pedido
      const sinCredito = await crearPedido(c.id, [{ monto: 10000 }])
      const r = await bajar(sinCredito.id, 2600) // total sube: este pedido NUNCA trasladó nada
      expect(r.creditoReaplicado).toBe(0)
      expect(await saldoFavor(c.id)).toBe(7000)
      expect(await estado(sinCredito.id)).toMatchObject({ total: 26000, totalPagado: 10000, saldo: 16000 })
      void p
    })

    it('nunca reaplica más de lo que el pedido trasladó, aunque el cliente tenga mucho crédito', async () => {
      const c = await createTestCliente('rt4')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2300) // crédito de este pedido: 2.000
      await fijarSaldoFavor(c.id, 50000)
      const r = await bajar(p.id, 3000) // total 30.000; faltan 7.000 pero solo se reaplican 2.000
      expect(r.creditoReaplicado).toBe(2000)
      expect(await saldoFavor(c.id)).toBe(48000)
      expect(await estado(p.id)).toMatchObject({ total: 30000, totalPagado: 25000, saldo: 5000 })
    })
  })

  describe('anular y cancelar (#577: se resta el crédito que salió del pedido)', () => {
    const movs = (pedidoId: string) => testPrisma.pedidoSaldoFavorMovimiento.findMany({ where: { pedidoId }, orderBy: { createdAt: 'asc' } })

    it('anular resta el crédito del pedido: el saldo a favor queda en cero y la nota no cambia', async () => {
      const c = await createTestCliente('an1')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // total 20.000, pagado 20.000, crédito 5.000
      const res = await anular().execute({ pedidoId: p.id, motivo: 'venta mal hecha', offlineId: uniqueId('an'), actorId: adminId })
      expect(res.saldoFavorRevertido).toBe(5000)
      expect(res.saldoFavorYaUsado).toBeUndefined()
      expect(await saldoFavor(c.id)).toBe(0)
      // La nota cubre solo lo pagado en el pedido: subirla restaría dos veces las ventas en el cierre.
      const nota = await testPrisma.notaCredito.findFirstOrThrow({ where: { pedidoId: p.id } })
      expect(Number(nota.monto)).toBe(20000)
      const mv = await movs(p.id)
      expect(mv.map((m) => [m.tipo, Number(m.monto)])).toEqual([['ACREDITACION', 5000], ['REVERSION_ANULACION', 5000]])
      expect(mv[1]).toMatchObject({ origenTipo: 'ANULACION', autorId: adminId, clienteId: c.id, motivo: 'venta mal hecha' })
      expect(await creditoNetoDelPedido(testPrisma, p.id)).toBe(0)
      const auditoria = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: p.id } })
      expect(auditoria.some((h) => h.datos.includes('"saldoFavorRevertido":5000'))).toBe(true)
      expect(await violaciones(p.id)).toEqual([])
    })

    it('solo resta lo que salió de este pedido: el crédito que el cliente tenía por otras vías no se toca', async () => {
      const c = await createTestCliente('an1b')
      await fijarSaldoFavor(c.id, 3000)
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // +5.000 → 8.000
      const res = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an'), actorId: adminId })
      expect(res.saldoFavorRevertido).toBe(5000)
      expect(await saldoFavor(c.id)).toBe(3000)
    })

    it('si el cliente ya usó una parte en otros pedidos, resta lo disponible, informa lo usado y no deja saldo negativo', async () => {
      const c = await createTestCliente('an1c')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // crédito 5.000
      await fijarSaldoFavor(c.id, 2000) // el cliente gastó 3.000 en otros pedidos
      const res = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an'), actorId: adminId })
      expect(res.saldoFavorRevertido).toBe(2000)
      expect(res.saldoFavorYaUsado).toBe(3000)
      expect(await saldoFavor(c.id)).toBe(0)
      expect((await movs(p.id)).map((m) => [m.tipo, Number(m.monto)])).toEqual([['ACREDITACION', 5000], ['REVERSION_ANULACION', 2000]])
      // Lo que quedó pendiente en el pedido anulado es exactamente lo que el cliente ya había usado.
      expect(await creditoNetoDelPedido(testPrisma, p.id)).toBe(3000)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estadoEntrega).toBe('ANULADO')
    })

    it('si el cliente ya usó todo el crédito, la anulación igual se hace y todo se informa como ya usado', async () => {
      const c = await createTestCliente('an1d')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      await fijarSaldoFavor(c.id, 0)
      const res = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an'), actorId: adminId })
      expect(res.saldoFavorRevertido).toBeUndefined()
      expect(res.saldoFavorYaUsado).toBe(5000)
      expect(await saldoFavor(c.id)).toBe(0)
      expect((await movs(p.id)).map((m) => m.tipo)).toEqual(['ACREDITACION'])
    })

    it('repetir la anulación (misma clave o ya anulado) no resta dos veces', async () => {
      const c = await createTestCliente('an1e')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      await fijarSaldoFavor(c.id, 9000) // crédito de otra fuente que no debe tocarse
      const offlineId = uniqueId('an')
      await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId, actorId: adminId })
      const otra = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId, actorId: adminId })
      const sinClave = await anular().execute({ pedidoId: p.id, motivo: 'error', actorId: adminId })
      expect(otra.deduped).toBe(true)
      expect(sinClave.deduped).toBe(true)
      expect(await saldoFavor(c.id)).toBe(4000)
      expect((await movs(p.id)).filter((m) => m.tipo === 'REVERSION_ANULACION')).toHaveLength(1)
    })

    it('dos anulaciones simultáneas del mismo pedido restan una sola vez', async () => {
      const c = await createTestCliente('an1f')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      await fijarSaldoFavor(c.id, 9000)
      await Promise.all([
        anular().execute({ pedidoId: p.id, motivo: 'a', offlineId: uniqueId('an'), actorId: adminId }),
        anular().execute({ pedidoId: p.id, motivo: 'b', offlineId: uniqueId('an'), actorId: adminId }),
      ])
      expect(await saldoFavor(c.id)).toBe(4000)
    })

    it('sin indicar quién anula y con crédito que restar: falla y no cambia nada', async () => {
      const c = await createTestCliente('an1g')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      expect(await mensajeDe(anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an') }))).toMatch(/^ACTOR_REQUERIDO/)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estadoEntrega).toBe('ENTREGADO')
      expect(await saldoFavor(c.id)).toBe(5000)
    })

    it('cancelar un pedido pagado por adelantado que ya trasladó excedente también lo resta', async () => {
      const c = await createTestCliente('an2')
      const p = await crearPedido(c.id, [{ monto: 25000 }], { estado: 'PENDIENTE', ent: 0 })
      await bajar(p.id, 2000)
      const res = await cancelar().execute({ pedidoId: p.id, motivo: 'el cliente canceló', actorId: adminId })
      expect(res.saldoFavorRevertido).toBe(5000)
      expect(await saldoFavor(c.id)).toBe(0)
      expect(Number((await testPrisma.notaCredito.findFirstOrThrow({ where: { pedidoId: p.id } })).monto)).toBe(20000)
      expect((await movs(p.id))[1]).toMatchObject({ tipo: 'REVERSION_ANULACION', origenTipo: 'CANCELACION' })
    })

    it('anular un pedido sin traslados no informa crédito ni toca el saldo del cliente', async () => {
      const c = await createTestCliente('an3')
      await fijarSaldoFavor(c.id, 1500)
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      const res = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an') })
      expect(res.saldoFavorRevertido).toBeUndefined()
      expect(res.saldoFavorYaUsado).toBeUndefined()
      expect(await saldoFavor(c.id)).toBe(1500)
    })

    it('la proyección (lo que ve el diálogo) coincide con lo que la anulación hace', async () => {
      const c = await createTestCliente('an4')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      await fijarSaldoFavor(c.id, 2000)
      const proy = await proyectarReversionCredito(testPrisma, p.id, c.id)
      expect(proy).toEqual({ salioDelPedido: 5000, seResta: 2000, yaUsado: 3000, saldoActual: 2000, saldoDespues: 0 })
      const res = await anular().execute({ pedidoId: p.id, motivo: 'error', offlineId: uniqueId('an'), actorId: adminId })
      expect([res.saldoFavorRevertido, res.saldoFavorYaUsado]).toEqual([proy.seResta, proy.yaUsado])
    })
  })

  describe('adversarial', () => {
    it('venta anónima: no hay a quién acreditar → EXCEDENTE_SIN_CLIENTE y no cambia nada', async () => {
      const p = await crearPedido('CONSUMIDOR_FINAL', [{ monto: 25000 }])
      const antes = await estado(p.id)
      expect(await mensajeDe(bajar(p.id, 2300))).toMatch(/^EXCEDENTE_SIN_CLIENTE/)
      expect(await estado(p.id)).toEqual(antes)
      expect(await testPrisma.pedidoCorreccionPrecio.count({ where: { pedidoId: p.id } })).toBe(0)
      expect(await testPrisma.pedidoSaldoFavorMovimiento.count({ where: { pedidoId: p.id } })).toBe(0)
      expect(await saldoFavor('CONSUMIDOR_FINAL')).toBe(0)
    })

    it('un pago digital sin confirmar no respalda crédito: EXCEDENTE_SIN_CONFIRMAR y no cambia nada', async () => {
      const c = await createTestCliente('adv2')
      const p = await crearPedido(c.id, [{ monto: 25000, metodo: 'NEQUI', confirmacion: 'REPORTADO' }])
      const antes = await estado(p.id)
      expect(await mensajeDe(bajar(p.id, 2300))).toMatch(/^EXCEDENTE_SIN_CONFIRMAR/)
      expect(await estado(p.id)).toEqual(antes)
      expect(await saldoFavor(c.id)).toBe(0)
    })

    it('un pago DISCREPANTE tampoco respalda crédito', async () => {
      const c = await createTestCliente('adv3')
      const p = await crearPedido(c.id, [{ monto: 25000, metodo: 'NEQUI', confirmacion: 'DISCREPANTE' }])
      expect(await mensajeDe(bajar(p.id, 2300))).toMatch(/^EXCEDENTE_SIN_CONFIRMAR/)
    })

    it('con pagos mixtos solo se acredita hasta lo confirmado', async () => {
      const c = await createTestCliente('adv4')
      const p = await crearPedido(c.id, [{ monto: 5000 }, { monto: 20000, metodo: 'NEQUI', confirmacion: 'REPORTADO' }])
      // Total 15.000 → excedente 10.000, pero solo hay 5.000 confirmados.
      expect(await mensajeDe(bajar(p.id, 1500))).toMatch(/^EXCEDENTE_SIN_CONFIRMAR/)
      expect(await saldoFavor(c.id)).toBe(0)
      expect(await estado(p.id)).toMatchObject({ total: 25000, totalPagado: 25000 })
    })

    it('con pagos mixtos, un excedente dentro de lo confirmado sí se acredita', async () => {
      const c = await createTestCliente('adv5')
      const p = await crearPedido(c.id, [{ monto: 20000 }, { monto: 5000, metodo: 'NEQUI', confirmacion: 'REPORTADO' }])
      await bajar(p.id, 2300) // total 23.000 → excedente 2.000 ≤ 20.000 confirmados
      expect(await saldoFavor(c.id)).toBe(2000)
      expect(await estado(p.id)).toMatchObject({ total: 23000, totalPagado: 23000, saldo: 0 })
    })

    it('solicitud pendiente que llega a ser inválida antes de autorizarse: se rechaza al aplicar y sigue PENDIENTE', async () => {
      const c = await createTestCliente('adv6')
      const p = await crearPedido(c.id, [{ monto: 25000, metodo: 'NEQUI', confirmacion: 'CONFIRMADO' }])
      const s = await solPrecio.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE' })
      expect(s.estado).toBe('PENDIENTE')
      // Mientras tanto el pago se marca discrepante.
      await testPrisma.pago.updateMany({ where: { pedidoId: p.id }, data: { confirmacion: 'DISCREPANTE' } })
      expect(await mensajeDe(resPrecio.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' }))).toMatch(/^EXCEDENTE_SIN_CONFIRMAR/)
      expect((await testPrisma.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('PENDIENTE')
      expect(await saldoFavor(c.id)).toBe(0)
      expect(await estado(p.id)).toMatchObject({ total: 25000, totalPagado: 25000 })
    })

    it('solicitud pendiente sin excedente cuando se pidió, con excedente cuando se autoriza: se calcula con los datos de ese momento', async () => {
      const c = await createTestCliente('adv7')
      const p = await crearPedido(c.id, [{ monto: 10000 }])
      const s = await solPrecio.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2000, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE' })
      // El cliente completa el pago antes de que el admin autorice.
      await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 15000, confirmacion: 'CONFIRMADO' } })
      await testPrisma.pedido.update({ where: { id: p.id }, data: { totalPagado: 25000, saldo: 0, estadoPago: 'PAGADO' } })
      await testPrisma.factura.updateMany({ where: { pedidoId: p.id }, data: { montoPagado: 25000, saldo: 0, estado: 'PAGADA' } })
      const r = await resPrecio.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' })
      expect(r).toMatchObject({ estado: 'APLICADA', excedenteAcreditado: 5000 })
      expect(await saldoFavor(c.id)).toBe(5000)
      expect(await estado(p.id)).toMatchObject({ total: 20000, totalPagado: 20000, saldo: 0 })
    })

    it('replay con el mismo offlineId no acredita dos veces', async () => {
      const c = await createTestCliente('adv8')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      const offlineId = uniqueId('rp')
      await bajar(p.id, 2000, adminId, offlineId)
      const otra = await bajar(p.id, 2000, adminId, offlineId)
      expect(otra.deduped).toBe(true)
      expect(await saldoFavor(c.id)).toBe(5000)
      expect(await testPrisma.pedidoSaldoFavorMovimiento.count({ where: { pedidoId: p.id } })).toBe(1)
    })

    it('autorizar dos veces la misma solicitud no acredita dos veces', async () => {
      const c = await createTestCliente('adv9')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      const s = await solPrecio.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2000, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE' })
      await resPrecio.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' })
      const otra = await resPrecio.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' })
      expect(otra.deduped).toBe(true)
      expect(await saldoFavor(c.id)).toBe(5000)
    })

    it('dos cambios simultáneos sobre el mismo pedido se serializan: el crédito es la suma exacta y todo cuadra', async () => {
      const c = await createTestCliente('adv10')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      const resultados = await Promise.allSettled([bajar(p.id, 2300), bajar(p.id, 2000)])
      const ok = resultados.filter((r) => r.status === 'fulfilled')
      expect(ok.length).toBeGreaterThanOrEqual(1)
      const e = await estado(p.id)
      expect(e.totalPagado + e.saldo).toBe(e.total)
      expect(e.totalPagado).toBeLessThanOrEqual(e.total)
      // Dinero conservado: lo pagado (25.000) = lo que queda en el pedido + el crédito del cliente.
      expect(e.totalPagado + (await saldoFavor(c.id))).toBe(25000)
      expect(await violaciones(p.id)).toEqual([])
    })

    it('el crédito que otro pedido gasta al mismo tiempo nunca deja el saldo negativo ni se reaplica dos veces', async () => {
      const c = await createTestCliente('adv11')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000) // crédito 5.000
      // En paralelo: una reaplicación (el total vuelve a subir) y otro consumidor que gasta 4.000 con el mismo patrón atómico.
      const consumir = () => testPrisma.cliente.updateMany({ where: { id: c.id, saldoFavor: { gte: 4000 } }, data: { saldoFavor: { decrement: 4000 } } })
      const [reapl, consumo] = await Promise.all([bajar(p.id, 2500), consumir()])
      const final = await saldoFavor(c.id)
      expect(final).toBeGreaterThanOrEqual(0)
      const reaplicado = reapl.creditoReaplicado ?? 0
      const gastado = consumo.count === 1 ? 4000 : 0
      expect(final).toBe(5000 - reaplicado - gastado)
      const e = await estado(p.id)
      expect(e.totalPagado).toBe(20000 + reaplicado + 0)
      expect(e.totalPagado + e.saldo).toBe(e.total)
    })

    it('reaplicar con el crédito en cero no hace nada y no falla', async () => {
      const c = await createTestCliente('adv12')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      await bajar(p.id, 2000)
      await fijarSaldoFavor(c.id, 0)
      const r = await withAdvisoryLock('PEDIDO', p.id, (tx) =>
        reaplicarCreditoDelPedido(tx, {
          pedidoId: p.id, clienteId: c.id, facturaId: null, origenTipo: 'CORRECCION_PRECIO', origenId: 'x', motivo: 'm', actorId: adminId,
          faltante: 5000, totalPagadoAntes: 20000, saldoResultanteFn: () => 0,
        }),
      )
      expect(r).toBe(0)
    })

    it('una reducción y una corrección de precio seguidas sobre el mismo pedido conservan el dinero', async () => {
      const c = await createTestCliente('adv13')
      const p = await crearPedido(c.id, [{ monto: 25000 }], { cant: 10, ent: 6 })
      await reducir(p.id, 4) // quita las 4 pendientes: 10.000 → total 15.000, crédito 10.000
      await bajar(p.id, 2000) // 6 × 2.000 = 12.000 → crédito +3.000
      const e = await estado(p.id)
      expect(e).toMatchObject({ total: 12000, totalPagado: 12000, saldo: 0 })
      expect(await saldoFavor(c.id)).toBe(13000)
      expect(e.totalPagado + (await saldoFavor(c.id))).toBe(25000)
      expect(await violaciones(p.id)).toEqual([])
    })
  })

  describe('propiedad: cualquier secuencia conserva el dinero y no da falsos positivos', () => {
    it('secuencia pseudoaleatoria de cambios de precio y consumos de crédito', async () => {
      const c = await createTestCliente('prop')
      const p = await crearPedido(c.id, [{ monto: 25000 }])
      let semilla = 12345
      const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff }
      let consumidoTotal = 0
      for (let i = 0; i < 25; i++) {
        const precio = [1800, 2000, 2200, 2400, 2500, 2700, 3000][Math.floor(rnd() * 7)]
        const actual = Number((await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } })).precio)
        if (precio !== actual) await bajar(p.id, precio)
        if (rnd() < 0.4) {
          const disp = await saldoFavor(c.id)
          const gasto = Math.floor(disp * rnd())
          if (gasto > 0) {
            const r = await testPrisma.cliente.updateMany({ where: { id: c.id, saldoFavor: { gte: gasto } }, data: { saldoFavor: { decrement: gasto } } })
            if (r.count === 1) consumidoTotal += gasto
          }
        }
        const e = await estado(p.id)
        // Invariantes después de CADA paso.
        expect(e.totalPagado + e.saldo).toBe(e.total)
        expect(e.totalPagado).toBeGreaterThanOrEqual(0)
        expect(e.totalPagado).toBeLessThanOrEqual(e.total)
        expect(await saldoFavor(c.id)).toBeGreaterThanOrEqual(0)
        expect(e.facSaldo).toBe(e.saldo)
        const mv = await testPrisma.pedidoSaldoFavorMovimiento.findMany({ where: { pedidoId: p.id } })
        const acred = mv.filter((m) => m.tipo === 'ACREDITACION').reduce((s, m) => s + Math.round(Number(m.monto) * 100), 0)
        const reapl = mv.filter((m) => m.tipo === 'REAPLICACION').reduce((s, m) => s + Math.round(Number(m.monto) * 100), 0)
        // Conservación: lo pagado por el cliente (25.000) = lo que queda en el pedido + el crédito neto trasladado.
        expect(Math.round(e.totalPagado * 100) + (acred - reapl)).toBe(2500000)
        // El saldo del cliente = lo trasladado y no reaplicado − lo que gastó en otros pedidos.
        expect(Math.round((await saldoFavor(c.id)) * 100)).toBe(acred - reapl - consumidoTotal * 100)
      }
      expect(await violaciones(p.id)).toEqual([])
    })
  })
})
