// @tests POST /api/cartera/abonos/[id]/corregir (ADR-CORRECCION-MONETARIA-001 g2.2)
// Ejecuta el route real contra Postgres: crea CorreccionAbono + ReceivableEntry
// REVERSION, recalcula Factura + Pedido, y (tipo NO_RECIBIDO) abre un
// ResponsibilityCase. Append-only: el Abono original nunca se toca.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

// Holder mutable: el id real del admin se resuelve en beforeAll (FK real a User).
const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

function req(body: unknown) {
  return { json: async () => body } as unknown as Request
}

async function seedAbono(monto: number, opts?: { estadoEntrega?: string; total?: number }) {
  const total = opts?.total ?? 20000
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: 'Cli Corr',
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: 'x',
      activo: true,
    },
  })
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      total,
      totalPagado: monto,
      saldo: total - monto,
      estadoEntrega: (opts?.estadoEntrega ?? 'ENTREGADO') as never,
      estado: (opts?.estadoEntrega ?? 'ENTREGADO') as never,
      estadoPago: monto >= total ? 'PAGADO' : 'PARCIAL',
    },
  })
  const factura = await testPrisma.factura.create({
    data: {
      numero: `FAC-${uniqueId('f').slice(0, 8)}`,
      clienteId: cliente.id,
      pedidoId: pedido.id,
      subtotal: total,
      total,
      saldo: total - monto,
      montoPagado: monto,
      estado: monto >= total ? 'PAGADA' : 'PARCIAL',
    },
  })
  const abono = await testPrisma.abono.create({
    data: {
      numero: `ABO-${uniqueId('a').slice(0, 8)}`,
      facturaId: factura.id,
      clienteId: cliente.id,
      pedidoId: pedido.id,
      monto,
      metodoPago: 'NEQUI',
    },
  })
  return { cliente, pedido, factura, abono }
}

describe('POST /api/cartera/abonos/[id]/corregir', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id // autorizadoPorId es FK real a User
  })

  afterAll(async () => {
    await disconnect()
  })

  it('reversión total: CorreccionAbono + ReceivableEntry REVERSION + recalc Factura/Pedido; Abono intacto', async () => {
    const { pedido, factura, abono } = await seedAbono(12000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')

    const res = await POST(req({ tipo: 'FACTURA', motivo: 'Abono aplicado a la factura equivocada' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.correccion.numero).toMatch(/^COR-\d{5}$/)
    expect(Number(json.correccion.montoRevertido)).toBe(12000)

    // Abono original NO se toca
    const abonoPost = await testPrisma.abono.findUnique({ where: { id: abono.id } })
    expect(Number(abonoPost?.monto)).toBe(12000)

    // Pedido recalculado
    const pedidoPost = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(Number(pedidoPost?.totalPagado)).toBe(0)
    expect(Number(pedidoPost?.saldo)).toBe(20000)
    expect(pedidoPost?.estadoPago).toBe('PENDIENTE')

    // Factura recalculada
    const facturaPost = await testPrisma.factura.findUnique({ where: { id: factura.id } })
    expect(Number(facturaPost?.montoPagado)).toBe(0)
    expect(facturaPost?.estado).toBe('EMITIDA')

    // ReceivableEntry REVERSION
    const rev = await testPrisma.receivableEntry.findMany({ where: { pedidoId: pedido.id, tipo: 'REVERSION' } })
    expect(rev).toHaveLength(1)
    expect(Number(rev[0].monto)).toBe(12000)
  })

  it('tipo MONTO: reversión parcial; una segunda que excede el saldo no revertido → 400', async () => {
    const { pedido, abono } = await seedAbono(10000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')

    const r1 = await POST(req({ tipo: 'MONTO', montoRevertido: 3000, motivo: 'capturé de más' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(r1.status).toBe(201)
    const p1 = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(Number(p1?.totalPagado)).toBe(7000)

    const r2 = await POST(req({ tipo: 'MONTO', montoRevertido: 8000, motivo: 'otra vez' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(r2.status).toBe(400)
  })

  it('tipo NO_RECIBIDO: abre ResponsibilityCase PAGO_NO_CONFIRMADO vinculado', async () => {
    const { abono } = await seedAbono(9000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')

    const res = await POST(req({ tipo: 'NO_RECIBIDO', motivo: 'el cliente niega el pago' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    const corr = await testPrisma.correccionAbono.findUnique({
      where: { id: json.correccion.id },
      include: { responsibilityCase: true },
    })
    expect(corr?.responsibilityCase?.tipo).toBe('PAGO_NO_CONFIRMADO')
    expect(Number(corr?.responsibilityCase?.montoEstimado)).toBe(9000)
  })

  it('idempotencia: replay con el mismo correccionOfflineId → deduped, sin doble reversión', async () => {
    const { pedido, abono } = await seedAbono(5000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    const off = uniqueId('cor-off')

    const r1 = await POST(req({ tipo: 'CLIENTE', motivo: 'cliente equivocado', correccionOfflineId: off }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(r1.status).toBe(201)
    const r2 = await POST(req({ tipo: 'CLIENTE', motivo: 'cliente equivocado', correccionOfflineId: off }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(r2.status).toBe(200)
    expect((await r2.json()).deduped).toBe(true)

    const p = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(Number(p?.totalPagado)).toBe(0) // una sola reversión
    const corrs = await testPrisma.correccionAbono.count({ where: { abonoId: abono.id } })
    expect(corrs).toBe(1)
  })

  it('abono inexistente → 404', async () => {
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    const res = await POST(req({ tipo: 'FACTURA', motivo: 'x' }) as never, {
      params: Promise.resolve({ id: 'no-existe' }),
    })
    expect(res.status).toBe(404)
  })

  it('reusar correccionOfflineId para OTRO abono → 409', async () => {
    const a1 = await seedAbono(4000)
    const a2 = await seedAbono(4000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    const off = uniqueId('shared-off')
    const r1 = await POST(req({ tipo: 'CLIENTE', motivo: 'x', correccionOfflineId: off }) as never, {
      params: Promise.resolve({ id: a1.abono.id }),
    })
    expect(r1.status).toBe(201)
    const r2 = await POST(req({ tipo: 'CLIENTE', motivo: 'x', correccionOfflineId: off }) as never, {
      params: Promise.resolve({ id: a2.abono.id }),
    })
    expect(r2.status).toBe(409)
  })

  it('cierre: cobroCartera del día resta la corrección de un abono de ese día', async () => {
    // limpiar CierreDia de hoy para forzar el cálculo (no el snapshot)
    await testPrisma.cierreDia.deleteMany({})
    const { abono } = await seedAbono(15000)
    // el abono se sembró con fecha now() → cuenta en el cobroCartera de hoy
    const { GET: cierreGet } = await import('@/app/api/cierre/route')
    const nextReq = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as import('next/server').NextRequest

    const before = await (await cierreGet(nextReq)).json()
    const cobroAntes = before.cierre?.cobroCartera ?? before.cobroCartera ?? 0

    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    await POST(req({ tipo: 'MONTO', montoRevertido: 5000, motivo: 'de más' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })

    const after = await (await cierreGet(nextReq)).json()
    const cobroDespues = after.cierre?.cobroCartera ?? after.cobroCartera ?? 0
    expect(cobroAntes - cobroDespues).toBe(5000)
  })

  it('historial del cliente: la corrección aparece como evento CORRECCION_ABONO (D.5)', async () => {
    const { cliente, abono } = await seedAbono(9000)
    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    const r = await POST(req({ tipo: 'FACTURA', motivo: 'aplicado a la factura equivocada' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })
    expect(r.status).toBe(201)

    const { GET: historialGet } = await import('@/app/api/clientes/[id]/historial/route')
    const hres = await historialGet(
      { url: 'http://localhost/api/clientes/x/historial', nextUrl: { searchParams: new URLSearchParams() } } as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: cliente.id }) },
    )
    expect(hres.status).toBe(200)
    const json = await hres.json()
    const evt = json.events.find((e: { tipo: string }) => e.tipo === 'CORRECCION_ABONO')
    expect(evt).toBeDefined()
    expect(evt.titulo).toMatch(/^Corrección COR-\d+ — FACTURA/)
    expect(evt.monto).toBe(-9000)
    expect(evt.metadata.abono).toBe(abono.numero)
  })

  it('historial: una corrección de HOY sobre una factura VIEJA aparece en la vista de 12 meses', async () => {
    const { cliente, factura, abono } = await seedAbono(6000)
    // envejecer la factura y el abono 14 meses
    const vieja = new Date(Date.now() - 425 * 86400_000)
    await testPrisma.factura.update({ where: { id: factura.id }, data: { fecha: vieja } })
    await testPrisma.abono.update({ where: { id: abono.id }, data: { fecha: vieja } })

    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    await POST(req({ tipo: 'MONTO', montoRevertido: 2000, motivo: 'de más' }) as never, {
      params: Promise.resolve({ id: abono.id }),
    })

    const { GET: historialGet } = await import('@/app/api/clientes/[id]/historial/route')
    const hres = await historialGet(
      { url: 'http://localhost/api/clientes/x/historial?meses=12', nextUrl: { searchParams: new URLSearchParams('meses=12') } } as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: cliente.id }) },
    )
    const json = await hres.json()
    // la factura vieja NO aparece (fuera de ventana), pero la corrección SÍ
    expect(json.events.some((e: { tipo: string; monto?: number }) => e.tipo === 'CORRECCION_ABONO' && e.monto === -2000)).toBe(true)
  })
})
