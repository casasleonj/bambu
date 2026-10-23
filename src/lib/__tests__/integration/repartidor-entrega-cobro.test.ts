// @tests #318 — el repartidor entrega y cobra en la puerta (antifraude, opción A del PO).
//
// Contrato bajo prueba (handler REAL de `/api/pedidos/[id]/entrega`, Postgres real):
//  - Cobro completo → ENTREGADO + PAGADO, el cobro queda atribuido al embarque de la ruta.
//  - El repartidor NO crea crédito por su cuenta: dejar saldo sin que la oficina haya
//    aceptado la deuda (`promesaPagoFecha`) se rechaza (FIADO_NO_AUTORIZADO) y NO entrega.
//  - Con la deuda aceptada, el cobro parcial / sin cobro (fiado) sí se entrega.
//  - La oficina (ADMIN) no tiene esa restricción.
//  - Nunca se cobra más que el saldo; el reintento no duplica el cobro.
//  - Si la oficina ya entregó mientras el repartidor estaba sin señal, el cobro NO se
//    pierde en silencio: la respuesta avisa `pagosNoAplicados`.
// Datos 100% sintéticos.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'REPARTIDOR' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
  requireOwnership: vi.fn(async () => true),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

const FLAG = 'EMBARQUE_ENTREGA_VIVA_DESDE'
const PRECIO = 1_000
const CANT = 10
const TOTAL = PRECIO * CANT // 10.000

let userId: string
let clienteId: string
let trabajadorId: string

async function crearEmbarqueEnRuta() {
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
  await testPrisma.embarqueProducto.create({ data: { embarqueId: embarque.id, producto: 'PACA_AGUA', cargadas: CANT } })
  return embarque
}

async function crearPedidoConSaldo(opts: { embarqueId: string; promesa?: boolean; cliente?: string }) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId: opts.cliente ?? clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total: TOTAL,
      totalPagado: 0,
      saldo: TOTAL,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'PENDIENTE',
      embarqueId: opts.embarqueId,
      promesaPagoFecha: opts.promesa ? new Date(Date.now() + 3 * 86_400_000) : null,
      cPacaAguaPed: CANT,
      precioPacaAgua: PRECIO,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: CANT, cantEntrega: 0, precio: PRECIO, subtotal: TOTAL }] },
    },
  })
  await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId: opts.cliente ?? clienteId, pedidoId: pedido.id, subtotal: TOTAL, total: TOTAL, saldo: TOTAL, montoPagado: 0, estado: 'EMITIDA',
    },
  })
  return pedido
}

function req(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

async function entregar(pedidoId: string, body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
  const res = await POST(req(body), { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: await res.json() }
}

function cuerpo(embarqueId: string, monto: number, extra: Record<string, unknown> = {}) {
  return {
    itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: CANT }],
    pagos: monto > 0 ? [{ metodo: 'EFECTIVO', monto }] : [],
    embarqueId,
    embarqueEntregaId: embarqueId,
    offlineId: `cobro-${Math.random().toString(36).slice(2, 10)}`,
    ...extra,
  }
}

async function estado(pedidoId: string) {
  const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
  const pagos = await testPrisma.pago.findMany({ where: { pedidoId } })
  return { p, pagos }
}

describe('#318 — repartidor entrega y cobra (antifraude)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    userId = (await getAdminUser()).id
    authUser.id = userId
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Cobro Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1', activo: true,
      },
    })
    clienteId = c.id
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Cobro Rep', rol: 'REPARTIDOR', usaMoto: true, userId } })
    trabajadorId = t.id
  })

  beforeEach(() => { authUser.role = 'REPARTIDOR'; process.env[FLAG] = '2000-01-01T00:00:00.000Z' })
  afterEach(() => { delete process.env[FLAG] })
  afterAll(async () => { await disconnect() })

  it('cobra completo → ENTREGADO + PAGADO, cobro atribuido al embarque y 1 evento físico', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const r = await entregar(ped.id, cuerpo(emb.id, TOTAL))
    expect(r.status).toBe(200)
    const { p, pagos } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PAGADO')
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(TOTAL)
    expect(pagos[0].embarqueId).toBe(emb.id)
    const ev = await testPrisma.embarqueMovimiento.findMany({ where: { embarqueId: emb.id, tipo: 'ENTREGA' } })
    expect(ev.reduce((s, m) => s + m.cantidad, 0)).toBe(CANT)
  })

  it('cobro parcial SIN deuda aceptada → rechazado y NO entrega (opción A)', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const r = await entregar(ped.id, cuerpo(emb.id, 6_000))
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(r.body)).toContain('FIADO_NO_AUTORIZADO')
    const { p, pagos } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('EN_RUTA')
    expect(pagos).toHaveLength(0)
    expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb.id, tipo: 'ENTREGA' } })).toBe(0)
  })

  it('sin cobro y SIN deuda aceptada → rechazado y NO entrega', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const r = await entregar(ped.id, cuerpo(emb.id, 0))
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect((await estado(ped.id)).p.estadoEntrega).toBe('EN_RUTA')
  })

  it('cobro parcial CON deuda aceptada → entregado, PARCIAL y la deuda queda registrada', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id, promesa: true })
    const r = await entregar(ped.id, cuerpo(emb.id, 6_000))
    expect(r.status).toBe(200)
    const { p, pagos } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PARCIAL')
    expect(Number(p.saldo)).toBe(4_000)
    expect(pagos).toHaveLength(1)
  })

  it('sin cobro CON deuda aceptada → entregado y fiado (PENDIENTE), sin Pago', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id, promesa: true })
    const r = await entregar(ped.id, cuerpo(emb.id, 0))
    expect(r.status).toBe(200)
    const { p, pagos } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PENDIENTE')
    expect(Number(p.saldo)).toBe(TOTAL)
    expect(pagos).toHaveLength(0)
  })

  it('la oficina (ADMIN) no tiene la restricción: cobro parcial sin promesa se entrega', async () => {
    authUser.role = 'ADMIN'
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const r = await entregar(ped.id, cuerpo(emb.id, 6_000))
    expect(r.status).toBe(200)
    expect((await estado(ped.id)).p.estadoPago).toBe('PARCIAL')
  })

  it('venta anónima: aunque haya promesa, el repartidor no puede dejar deuda', async () => {
    await testPrisma.cliente.upsert({
      where: { id: 'CONSUMIDOR_FINAL' }, update: {},
      create: { id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', telefono: '', direccion: '', activo: false },
    })
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id, promesa: true, cliente: 'CONSUMIDOR_FINAL' })
    const r = await entregar(ped.id, cuerpo(emb.id, 6_000))
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect((await estado(ped.id)).p.estadoEntrega).toBe('EN_RUTA')
  })

  it('cobrar de más se rechaza y no entrega ni cobra nada', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const r = await entregar(ped.id, cuerpo(emb.id, 1_000_000))
    expect(r.status).toBeGreaterThanOrEqual(400)
    const { p, pagos } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('EN_RUTA')
    expect(pagos).toHaveLength(0)
  })

  it('reintento con el mismo offlineId no duplica el cobro', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    const body = cuerpo(emb.id, TOTAL)
    expect((await entregar(ped.id, body)).status).toBe(200)
    const again = await entregar(ped.id, body)
    expect(again.status).toBe(200)
    expect(again.body.pagosNoAplicados).not.toBe(true) // mismo envío: nada que avisar
    const { pagos } = await estado(ped.id)
    expect(pagos).toHaveLength(1)
  })

  it('la oficina ya entregó (offlineId distinto): el cobro del repartidor NO se pierde en silencio → pagosNoAplicados', async () => {
    const emb = await crearEmbarqueEnRuta()
    const ped = await crearPedidoConSaldo({ embarqueId: emb.id })
    authUser.role = 'ADMIN'
    expect((await entregar(ped.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: CANT }], pagos: [], clienteRetiro: false, embarqueId: undefined, offlineId: 'oficina-1' })).status).toBe(200)
    authUser.role = 'REPARTIDOR'
    const r = await entregar(ped.id, cuerpo(emb.id, TOTAL, { offlineId: 'repartidor-offline-1' }))
    expect(r.status).toBe(200)
    expect(r.body.deduped).toBe(true)
    expect(r.body.pagosNoAplicados).toBe(true)
    expect((await estado(ped.id)).pagos).toHaveLength(0)
  })
})
