// @tests #796 / ADR-CORRECCION-MONETARIA-002 — corregir un Pago que no tiene Abono (PostgreSQL real)
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { resumirAbonosDelDia } from '@/lib/cobro-cartera'
import { verificarIntegridad } from '@/lib/integridad/verificar'

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request
const llamar = async (pagoId: string, body: unknown) => {
  const { POST } = await import('@/app/api/pagos/[id]/corregir/route')
  const res = await POST(req(body) as never, { params: Promise.resolve({ id: pagoId }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('#796 · POST /api/pagos/[id]/corregir', () => {
  let adminId = ''
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    adminId = admin.id
    authUser.id = admin.id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => { process.env.CORRECCION_PAGO_SIN_ABONO = 'true' })
  afterEach(() => { delete process.env.CORRECCION_PAGO_SIN_ABONO })

  /** Pedido de $46.000 con dos pagos SIN abono (efectivo $20.000 y Nequi $15.000) y su factura. */
  async function escenario(o: { estadoEntrega?: string; sinFactura?: boolean; conEspejo?: boolean } = {}) {
    const c = await testPrisma.cliente.create({ data: { nombre: 'Cli pago 796', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
    const estado = (o.estadoEntrega ?? 'ENTREGADO') as never
    // Un pedido anulado o cancelado tiene totalPagado 0 (su flujo ya emitió la reversión) aunque sus Pago sigan existiendo.
    const cerrado = ['ANULADO', 'CANCELADO'].includes(o.estadoEntrega ?? '')
    const pedido = await testPrisma.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', total: 46000, totalPagado: cerrado ? 0 : 35000, saldo: cerrado ? 0 : 11000, estadoEntrega: estado, estado, estadoPago: cerrado ? 'ANULADO' : 'PARCIAL' } })
    const factura = o.sinFactura ? null : await testPrisma.factura.create({ data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId: c.id, pedidoId: pedido.id, subtotal: 46000, total: 46000, saldo: 11000, montoPagado: 35000, estado: 'PARCIAL' } })
    const efectivo = await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 20000, confirmacion: 'CONFIRMADO' } })
    const nequi = await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'NEQUI', monto: 15000, confirmacion: 'REPORTADO' } })
    if (o.conEspejo && factura) {
      await testPrisma.abono.create({ data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId: c.id, pedidoId: pedido.id, monto: 15000, metodoPago: 'NEQUI', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: nequi.id } })
    }
    return { c, pedido, factura, efectivo, nequi }
  }

  it('bandera apagada: 403 FUNCION_DESACTIVADA y no cambia nada', async () => {
    delete process.env.CORRECCION_PAGO_SIN_ABONO
    const { nequi, pedido } = await escenario()
    const r = await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'no llegó' })
    expect(r.status).toBe(403)
    expect(JSON.stringify(r.json)).toContain('FUNCION_DESACTIVADA')
    expect(await testPrisma.correccionAbono.count({ where: { pagoId: nequi.id } })).toBe(0)
    expect(Number((await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))?.totalPagado)).toBe(35000)
  })

  it('reversión total de un pago sin abono: ancla en el pago, recalcula pedido y factura, deja REVERSION y abre el caso; el Pago queda intacto', async () => {
    const { nequi, pedido, factura } = await escenario()
    const r = await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'el cliente nunca lo envió' })
    expect(r.status).toBe(201)
    const cor = await testPrisma.correccionAbono.findFirst({ where: { pagoId: nequi.id } })
    expect(cor).toMatchObject({ abonoId: null, pagoId: nequi.id, tipo: 'NO_RECIBIDO', autorizadoPorId: adminId })
    expect(Number(cor?.montoRevertido)).toBe(15000)
    expect(cor?.responsibilityCaseId).toBeTruthy()
    const ped = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect([Number(ped?.totalPagado), Number(ped?.saldo), ped?.estadoPago]).toEqual([20000, 26000, 'PARCIAL'])
    const fac = await testPrisma.factura.findUnique({ where: { id: factura!.id } })
    expect([Number(fac?.montoPagado), Number(fac?.saldo)]).toEqual([20000, 26000])
    const rev = await testPrisma.receivableEntry.findMany({ where: { pedidoId: pedido.id, tipo: 'REVERSION' } })
    expect(rev.map((x) => Number(x.monto))).toEqual([15000])
    expect(Number((await testPrisma.pago.findUnique({ where: { id: nequi.id } }))?.monto)).toBe(15000) // append-only
    expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(2)
  })

  it('MONTO parcial y luego el resto; no se puede exceder lo que queda por revertir', async () => {
    const { nequi, pedido } = await escenario()
    expect((await llamar(nequi.id, { tipo: 'MONTO', montoRevertido: 3000, motivo: 'monto mal digitado' })).status).toBe(201)
    expect((await llamar(nequi.id, { tipo: 'MONTO', montoRevertido: 13000, motivo: 'excede' })).status).toBe(400)
    expect((await llamar(nequi.id, { tipo: 'MONTO', montoRevertido: 12000, motivo: 'resto' })).status).toBe(201)
    expect((await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'ya no queda nada' })).status).toBe(400)
    expect(Number((await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))?.totalPagado)).toBe(20000)
  })

  it('un pago que SÍ tiene abono se corrige por su abono: 409 PAGO_CON_ABONO y no se revierte dos veces', async () => {
    const { nequi, pedido } = await escenario({ conEspejo: true })
    const r = await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'x' })
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.json)).toContain('PAGO_CON_ABONO')
    expect(await testPrisma.correccionAbono.count({ where: { pagoId: nequi.id } })).toBe(0)
    expect(Number((await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))?.totalPagado)).toBe(35000)
  })

  it('pedido ANULADO o CANCELADO: 409 PEDIDO_CERRADO (esa reversión ya la emitió su propio flujo)', async () => {
    for (const estado of ['ANULADO', 'CANCELADO']) {
      const { nequi } = await escenario({ estadoEntrega: estado })
      const r = await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'x' })
      expect(r.status).toBe(409)
      expect(JSON.stringify(r.json)).toContain('PEDIDO_CERRADO')
    }
  })

  it('sin factura (crear pedido no implica facturar, #840): corrige igual y recalcula el pedido', async () => {
    const { efectivo, pedido } = await escenario({ sinFactura: true })
    const r = await llamar(efectivo.id, { tipo: 'MONTO', montoRevertido: 5000, motivo: 'se contó de más' })
    expect(r.status).toBe(201)
    expect(Number((await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))?.totalPagado)).toBe(30000)
  })

  it('pago inexistente: 404', async () => {
    expect((await llamar('no-existe', { tipo: 'NO_RECIBIDO', motivo: 'x' })).status).toBe(404)
  })

  it('idempotente por correccionOfflineId: el reintento no crea otra corrección; reusarlo en otro pago es 409', async () => {
    const a = await escenario()
    const b = await escenario()
    const off = uniqueId('off')
    const r1 = await llamar(a.nequi.id, { tipo: 'MONTO', montoRevertido: 1000, motivo: 'x', correccionOfflineId: off })
    const r2 = await llamar(a.nequi.id, { tipo: 'MONTO', montoRevertido: 1000, motivo: 'x', correccionOfflineId: off })
    expect([r1.status, r2.status]).toEqual([201, 200])
    expect(r2.json).toMatchObject({ deduped: true })
    expect(await testPrisma.correccionAbono.count({ where: { pagoId: a.nequi.id } })).toBe(1)
    expect((await llamar(b.nequi.id, { tipo: 'MONTO', montoRevertido: 1000, motivo: 'x', correccionOfflineId: off })).status).toBe(409)
  })

  it('dos correcciones totales a la vez del mismo pago: una gana y la otra se rechaza (no se revierte dos veces)', async () => {
    const { nequi, pedido } = await escenario()
    const [x, y] = await Promise.all([
      llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'A' }),
      llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'B' }),
    ])
    expect([x.status, y.status].sort()).toEqual([201, 400])
    expect(Number((await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))?.totalPagado)).toBe(20000)
    expect(await testPrisma.correccionAbono.count({ where: { pagoId: nequi.id } })).toBe(1)
  })

  it('espera al lock de PEDIDO de otro flujo (cobro o entrega) y recién entonces aplica', async () => {
    const { nequi, pedido } = await escenario()
    let soltar: () => void = () => {}
    const compuerta = new Promise<void>((r) => { soltar = r })
    let tomado: () => void = () => {}
    const lockTomado = new Promise<void>((r) => { tomado = r })
    const otro = testPrisma.$transaction(async (tx) => { await acquireAdvisoryLockTx(tx, 'PEDIDO', pedido.id); tomado(); await compuerta }, { timeout: 30_000 })
    await lockTomado
    let terminada = false
    const corr = llamar(nequi.id, { tipo: 'MONTO', montoRevertido: 1000, motivo: 'x' }).then((r) => { terminada = true; return r })
    await dormir(1500)
    expect(terminada).toBe(false)
    soltar(); await otro
    expect((await corr).status).toBe(201)
  })

  it('Cierre: la corrección resta de la caja del día del pago (solo en efectivo si el pago fue en efectivo)', async () => {
    const { efectivo, nequi } = await escenario()
    const desde = new Date(Date.now() - 3_600_000)
    const hasta = new Date(Date.now() + 3_600_000)
    const antes = await resumirAbonosDelDia(testPrisma as never, desde, hasta)
    await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'no llegó' })
    const trasDigital = await resumirAbonosDelDia(testPrisma as never, desde, hasta)
    expect(trasDigital.ajustesDeCobros - antes.ajustesDeCobros).toBe(15000)
    expect(trasDigital.totalEfectivo - antes.totalEfectivo).toBe(0) // Nequi no sale de la caja física
    await llamar(efectivo.id, { tipo: 'MONTO', montoRevertido: 4000, motivo: 'se contó de más' })
    const trasEfectivo = await resumirAbonosDelDia(testPrisma as never, desde, hasta)
    expect(trasEfectivo.totalEfectivo - trasDigital.totalEfectivo).toBe(-4000)
    expect(trasEfectivo.detalle.correcciones.some((c) => c.abonoNumero.startsWith('Pago '))).toBe(true)
  })

  it('integridad V2: la corrección anclada a un pago no genera falso positivo en «totalPagado = Σ Pago + Σ Abono − correcciones»', async () => {
    const { nequi, pedido } = await escenario()
    await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'no llegó' })
    const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
    const hallazgos = reporte.reglas.find((r) => r.id === 'V2')!.hallazgos.filter((h) => h.numero === pedido.numero)
    expect(hallazgos).toEqual([])
  })

  it('historial del cliente: la corrección anclada a un pago aparece y no rompe la lectura', async () => {
    const { nequi, c } = await escenario()
    await llamar(nequi.id, { tipo: 'NO_RECIBIDO', motivo: 'no llegó' })
    const { GET } = await import('@/app/api/clientes/[id]/historial/route')
    const res = await GET({ nextUrl: { searchParams: new URLSearchParams('') }, url: 'http://localhost/x' } as never, { params: Promise.resolve({ id: c.id }) })
    expect(res.status).toBe(200)
    const txt = JSON.stringify(await res.json())
    expect(txt).toContain('CORRECCION_ABONO')
    expect(txt).toContain('Pago NEQUI')
  })
})
