// @tests #796 paso 1 — GET /api/facturas/[id] devuelve el historial desde los pagos, con visibilidad por rol
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))

describe('#796 · historial de pagos de la factura', () => {
  let facturaId = ''
  let pedidoId = ''
  const llamar = async () => {
    const { GET } = await import('@/app/api/facturas/[id]/route')
    const res = await GET({} as never, { params: Promise.resolve({ id: facturaId }) })
    return (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>
  }
  const cuerpo = (j: Record<string, unknown>) => (j.data ?? j) as {
    factura: { id: string; abonos: unknown[]; montoPagado: number }
    historialPagos: { pagos: Array<{ clave: string; origen: string; numero: number; monto: number; confirmacion: string | null }>; correcciones: Array<{ numero: string; monto: number; motivo: string | null; autorizadoPor: string | null; sobrePagoNumero: number | null }>; totalNeto: number } | null
    historialPagosError: boolean
  }

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
    const c = await testPrisma.cliente.create({ data: { nombre: 'Cli hist 796', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
    const pedido = await testPrisma.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', total: 46000, totalPagado: 32000, saldo: 14000, estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL' } })
    const factura = await testPrisma.factura.create({ data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId: c.id, pedidoId: pedido.id, subtotal: 46000, total: 46000, saldo: 14000, montoPagado: 32000, estado: 'PARCIAL' } })
    facturaId = factura.id
    pedidoId = pedido.id
    // Pago 1: efectivo con abono espejo. Pago 2: Nequi SIN abono, por confirmar. Abono independiente de $5.000 con una corrección.
    const p1 = await testPrisma.pago.create({ data: { pedidoId, metodo: 'EFECTIVO', monto: 20000, createdAt: new Date('2026-11-17T15:15:00Z'), confirmacion: 'CONFIRMADO' } })
    await testPrisma.abono.create({ data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId, clienteId: c.id, pedidoId, monto: 20000, metodoPago: 'EFECTIVO', fecha: p1.createdAt, origenCobro: 'ESPEJO_PAGO', pagoOrigenId: p1.id } })
    await testPrisma.pago.create({ data: { pedidoId, metodo: 'NEQUI', monto: 15000, createdAt: new Date('2026-11-17T20:40:00Z'), confirmacion: 'REPORTADO' } })
    const indep = await testPrisma.abono.create({ data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId, clienteId: c.id, pedidoId, monto: 5000, metodoPago: 'EFECTIVO', fecha: new Date('2026-11-18T14:00:00Z'), origenCobro: 'INDEPENDIENTE', offlineId: uniqueId('off') } })
    await testPrisma.correccionAbono.create({ data: { numero: `COR-${uniqueId('c').slice(0, 8)}`, abonoId: indep.id, tipo: 'NO_RECIBIDO', montoRevertido: 3000, motivo: 'no llegó', autorizadoPorId: admin.id } })
  })
  afterAll(async () => { await disconnect() })

  it('lista cada pago una vez (el pago sin abono sí aparece; el espejo no se duplica) y el abono independiente', async () => {
    authUser.role = 'ADMIN'
    const j = cuerpo(await llamar())
    expect(j.historialPagosError).toBe(false)
    expect(j.historialPagos?.pagos.map((p) => [p.numero, p.origen, p.monto, p.confirmacion])).toEqual([
      [1, 'PAGO', 20000, 'CONFIRMADO'], [2, 'PAGO', 15000, 'REPORTADO'], [3, 'ABONO', 5000, null],
    ])
    expect(j.historialPagos?.totalNeto).toBe(37000) // 20.000 + 15.000 + 5.000 − 3.000
  })

  it('compatibilidad: `abonos` sigue en la respuesta (consumidores anteriores y rollback)', async () => {
    const j = cuerpo(await llamar())
    expect(Array.isArray(j.factura.abonos)).toBe(true)
    expect(j.factura.abonos).toHaveLength(2)
  })

  it('ADMIN y CONTADOR ven el detalle de la corrección; ASISTENTE solo el hecho financiero', async () => {
    for (const rol of ['ADMIN', 'CONTADOR']) {
      authUser.role = rol
      const c = cuerpo(await llamar()).historialPagos?.correcciones[0]
      expect(c).toMatchObject({ monto: 3000, motivo: 'no llegó' })
      expect(c?.autorizadoPor).toBeTruthy()
    }
    authUser.role = 'ASISTENTE'
    const c = cuerpo(await llamar()).historialPagos?.correcciones[0]
    expect(c).toMatchObject({ monto: 3000, motivo: null, autorizadoPor: null })
  })

  it('una factura sin ningún pago devuelve el historial vacío, no un error', async () => {
    const c = await testPrisma.cliente.findFirst()
    const ped = await testPrisma.pedido.create({ data: { clienteId: c!.id, canal: 'DOMICILIO', total: 1000, totalPagado: 0, saldo: 1000, estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE' } })
    const fac = await testPrisma.factura.create({ data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId: c!.id, pedidoId: ped.id, subtotal: 1000, total: 1000, saldo: 1000, montoPagado: 0, estado: 'EMITIDA' } })
    facturaId = fac.id
    authUser.role = 'ADMIN'
    const j = cuerpo(await llamar())
    expect(j.historialPagosError).toBe(false)
    expect(j.historialPagos?.pagos).toEqual([])
  })
})
