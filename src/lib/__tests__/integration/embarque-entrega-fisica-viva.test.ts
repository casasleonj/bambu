// @tests PR-1B/1C — evento físico vivo atribuido (`/entrega`) + cierre por misión
// (AB-ALS-EMB-2026-10-13 + Adenda v1.2 §3.1-§3.2, B-01 y B-09).
//
// Contrato bajo prueba:
//  - `/entrega` con `embarqueEntregaId` escribe, en la MISMA transacción que
//    `PedidoItem.cantEntrega`, un `EmbarqueMovimiento{ENTREGA}` por línea, con la
//    cantidad realmente aplicada tras el clamp, atribuido al pedido y deduplicado
//    por `entrega:<offlineId>:<PRODUCTO>`.
//  - El cierre de un embarque en modo "entrega viva" concilia con los eventos de
//    la misión + el delta propio, NUNCA con el acumulado histórico `pedidosRaw.cXEnt`.
//  - Un embarque que no usa el modo vivo conserva la lógica anterior (excepción histórica).
// Datos 100% sintéticos; el caso #331 (2 BOTELLON) se reproduce anonimizado.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
  requireOwnership: vi.fn(async () => true),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

import { comisionRepartidoresDelDia } from '@/lib/comision-repartidor'
import { todayStringBogota } from '@/lib/dates'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

const FLAG = 'EMBARQUE_ENTREGA_VIVA_DESDE'
const FLAG_ON = '2000-01-01T00:00:00.000Z'

let adminId: string
let clienteId: string

type Producto = 'PACA_AGUA' | 'BOTELLON'

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

const SIN_ENTREGA = {
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
  cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
}

function entregaDe(producto: Producto, n: number) {
  return producto === 'PACA_AGUA'
    ? { ...SIN_ENTREGA, cPacaAguaEnt: n }
    : { ...SIN_ENTREGA, cBotellonFabEnt: n }
}

async function crearEmbarque(carga: Partial<Record<Producto, number>>, estado: 'EN_RUTA' | 'CERRADO' = 'EN_RUTA') {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `PR1BC ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado, baseDinero: 0 },
  })
  for (const [producto, cargadas] of Object.entries(carga)) {
    await testPrisma.embarqueProducto.create({ data: { embarqueId: embarque.id, producto, cargadas } })
  }
  return embarque
}

async function crearPedidoPrepago(opts: {
  embarqueId: string
  producto: Producto
  cantPedido: number
  entAcum?: number
  botellonCanal?: 'FAB' | 'DOM'
  origen?: 'PEDIDO' | 'VENTA_LIBRE'
}) {
  const { embarqueId, producto, cantPedido, entAcum = 0, botellonCanal = 'FAB', origen = 'PEDIDO' } = opts
  const precio = producto === 'PACA_AGUA' ? 1_000 : 7_500
  const total = precio * cantPedido
  const legacy =
    producto === 'PACA_AGUA'
      ? { cPacaAguaPed: cantPedido, cPacaAguaEnt: entAcum, precioPacaAgua: precio }
      : botellonCanal === 'FAB'
        ? { cBotellonFabPed: cantPedido, cBotellonFabEnt: entAcum, precioBotellonFab: precio }
        : { cBotellonDomPed: cantPedido, cBotellonDomEnt: entAcum, precioBotellonDom: precio }
  const entregado = origen === 'VENTA_LIBRE' && entAcum === cantPedido
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: producto === 'BOTELLON' && botellonCanal === 'FAB' ? 'PUNTO' : 'DOMICILIO',
      origen,
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega: entregado ? 'ENTREGADO' : 'EN_RUTA',
      estado: entregado ? 'ENTREGADO' : 'EN_RUTA',
      estadoPago: entregado ? 'PAGADO' : 'ANTICIPADO',
      embarqueId,
      ...legacy,
      items: { create: [{ producto, cantPedido, cantEntrega: entAcum, precio, subtotal: total }] },
    },
  })
  await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: total, confirmacion: 'CONFIRMADO' } })
  await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA',
    },
  })
  return pedido
}

function req(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

/** Invoca el handler REAL de `/api/pedidos/[id]/entrega`. */
async function entregar(pedidoId: string, body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
  const res = await POST(req(body), { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: await res.json() }
}

async function movimientos(embarqueId: string, tipo = 'ENTREGA') {
  return testPrisma.embarqueMovimiento.findMany({
    where: { embarqueId, tipo: tipo as 'ENTREGA' },
    orderBy: { createdAt: 'asc' },
  })
}
const suma = (ms: Array<{ cantidad: number }>) => ms.reduce((s, m) => s + m.cantidad, 0)

describe('PR-1B/1C — evento físico vivo atribuido + cierre por misión', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    authUser.id = adminId
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'PR1BC Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1', activo: true,
      },
    })
    clienteId = c.id
  })

  beforeEach(() => { process.env[FLAG] = FLAG_ON })
  afterEach(() => { delete process.env[FLAG] })
  afterAll(async () => { await disconnect() })

  it('#499: parcial en dos misiones conserva 3/2, tarifa propia, preview sin efectos y replay sin duplicación', async () => {
    const a = await crearEmbarque({ PACA_AGUA: 3 })
    const b = await crearEmbarque({ PACA_AGUA: 2 })
    await testPrisma.trabajador.update({ where: { id: a.trabajadorId }, data: { tipoPago: 'COMISION', comRepartAgua: 200 } })
    await testPrisma.trabajador.update({ where: { id: b.trabajadorId }, data: { tipoPago: 'COMISION', comRepartAgua: 400 } })
    const pedido = await crearPedidoPrepago({ embarqueId: a.id, producto: 'PACA_AGUA', cantPedido: 5 })
    expect((await entregar(pedido.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 3 }], embarqueEntregaId: a.id, offlineId: 'com-a-parcial' })).status).toBe(200)
    // La asignación actual cambia; la evidencia de las primeras 3 queda en A.
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { embarqueId: b.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })
    const entregaB = await entregar(pedido.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }], embarqueEntregaId: b.id, offlineId: 'com-b-final' })
    expect(entregaB.status, JSON.stringify(entregaB.body)).toBe(200)
    const cierreA = { id: a.id, pedidos: [], gastos: [], dineroEntregado: 0, offlineId: 'com-cierre-a' }
    const preview = await buildUseCase().execute({ ...cierreA, dryRun: true })
    expect(preview.comision).toBe(600)
    expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: a.id } })).estado).toBe('EN_RUTA')
    const ra = await buildUseCase().execute(cierreA)
    const rb = await buildUseCase().execute({ id: b.id, pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }], gastos: [], dineroEntregado: 0 })
    expect(ra.comision).toBe(600)
    expect(rb.comision).toBe(800)
    expect(ra.comisionDetalle?.entregasAgua).toBe(3)
    expect(rb.comisionDetalle?.entregasAgua).toBe(2)
    expect((await buildUseCase().execute(cierreA)).comision).toBe(600)
    // El rollback del flag no vuelve a atribuir el acumulado 5 al último trabajador.
    delete process.env[FLAG]
    const dia = await comisionRepartidoresDelDia(testPrisma, todayStringBogota())
    expect(dia.find(r => r.trabajadorId === a.trabajadorId)?.total).toBe(600)
    expect(dia.find(r => r.trabajadorId === b.trabajadorId)?.total).toBe(800)
    expect(suma(await movimientos(a.id))).toBe(3)
    expect(suma(await movimientos(b.id))).toBe(2)
  })

  it('#499: botellón de pedido PUNTO entregado por vehículo sí usa la evidencia física, no cambia el canal comercial', async () => {
    const emb = await crearEmbarque({ BOTELLON: 2 })
    await testPrisma.trabajador.update({ where: { id: emb.trabajadorId }, data: { tipoPago: 'COMISION', comRepartBotellon: 350 } })
    const p = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2, botellonCanal: 'FAB' })
    const r = await buildUseCase().execute({ id: emb.id, pedidos: [{ pedidoId: p.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }], gastos: [], dineroEntregado: 0 })
    expect(r.comision).toBe(700)
    expect(r.comisionDetalle?.revisiones).toHaveLength(0)
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).canal).toBe('PUNTO')
  })

  // ── Prueba 1 (caso #331 / B-01) ─────────────────────────────────────────
  it('prueba 1: carga 2 BOTELLON, cierre recién entregado 2 → 2 salidas efectivas y discrepancia 0', async () => {
    const emb = await crearEmbarque({ BOTELLON: 2 })
    const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })

    const r = await buildUseCase().execute({
      id: emb.id,
      pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }],
      gastos: [],
      dineroEntregado: 0,
    })

    expect(r.discrepanciaTotal).toBe(0)
    expect(r.responsibilityCases).toHaveLength(0)
    expect(suma(await movimientos(emb.id))).toBe(2)
  })

  // ── Prueba 3 (B-01 / I-08): acumulado histórico ≠ misión ────────────────
  it('prueba 3: pedido de 10 con 3 de una misión anterior; E2 carga 7 y entrega 7 → discrepancia 0 y 7 salidas', async () => {
    const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
    const pedido = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

    const r = await buildUseCase().execute({
      id: emb2.id,
      pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 7), pagos: [] }],
      gastos: [],
      dineroEntregado: 0,
    })

    expect(r.discrepanciaTotal).toBe(0)
    expect(suma(await movimientos(emb2.id))).toBe(7)
  })

  // ── Prueba 2: la entrega viva no se vuelve a crear en el cierre ─────────
  it('prueba 2: /entrega con embarqueEntregaId escribe 1 evento atribuido y el cierre (delta 0) no lo duplica', async () => {
    const emb = await crearEmbarque({ PACA_AGUA: 5 })
    const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

    const res = await entregar(pedido.id, {
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      embarqueEntregaId: emb.id,
      offlineId: 'ev-prueba2',
    })
    expect(res.status).toBe(200)

    const evs = await movimientos(emb.id)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({ producto: 'PACA_AGUA', cantidad: 5, origen: 'VEHICULO', destino: 'CLIENTE', offlineId: 'entrega:ev-prueba2:PACA_AGUA' })
    expect(evs[0].metadata).toMatchObject({ captura: 'ENTREGA_PEDIDO', pedidoId: pedido.id, eventoEntregaId: 'ev-prueba2' })

    const r = await buildUseCase().execute({
      id: emb.id,
      pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }],
      gastos: [],
      dineroEntregado: 0,
    })
    expect(r.discrepanciaTotal).toBe(0)
    expect(suma(await movimientos(emb.id))).toBe(5)
  })

  // ── Prueba 9: idempotencia, incluido el replay viejo tras varios parciales
  describe('prueba 9 — idempotencia del evento', () => {
    it('mismo offlineId dos veces → un solo evento por línea', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const body = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ev-dup' }

      expect((await entregar(pedido.id, body)).status).toBe(200)
      expect((await entregar(pedido.id, body)).status).toBe(200)

      expect(await movimientos(emb.id)).toHaveLength(1)
    })

    it('replay VIEJO tras dos parciales (entregaOfflineId solo guarda la última clave) no re-aplica ni duplica', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })
      const a = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 3 }], embarqueEntregaId: emb.id, offlineId: 'ev-A' }
      const b = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 4 }], embarqueEntregaId: emb.id, offlineId: 'ev-B' }

      await entregar(pedido.id, a)
      // Tras un parcial el pedido queda PENDIENTE; vuelve a salir a ruta (re-despacho).
      await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })
      await entregar(pedido.id, b)
      // Reintento tardío de A (cola offline): debe ser un no-op total.
      const replay = await entregar(pedido.id, a)
      expect(replay.status).toBe(200)

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cPacaAguaEnt).toBe(7)
      expect(p.items[0].cantEntrega).toBe(7)
      expect(suma(await movimientos(emb.id))).toBe(7)
      expect(await movimientos(emb.id)).toHaveLength(2)
    })

    it('dos requests concurrentes con el mismo offlineId → exactamente un evento', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const body = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ev-race' }

      const [r1, r2] = await Promise.all([entregar(pedido.id, body), entregar(pedido.id, body)])
      expect([r1.status, r2.status]).toEqual([200, 200])
      expect(await movimientos(emb.id)).toHaveLength(1)
    })
  })

  // ── Reglas de identidad y contexto (Adenda §3.2) ────────────────────────
  describe('contexto físico explícito', () => {
    it('la cantidad del evento es la realmente aplicada tras el clamp, no la pedida', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      await entregar(pedido.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 9 }], embarqueEntregaId: emb.id, offlineId: 'ev-clamp' })

      expect(suma(await movimientos(emb.id))).toBe(5)
    })

    it('sin embarqueEntregaId (punto/oficina, sin custodia de vehículo) → no se crea ENTREGA', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], offlineId: 'ev-punto' })

      expect(res.status).toBe(200)
      expect(await movimientos(emb.id)).toHaveLength(0)
    })

    it('embarqueEntregaId sin offlineId → 400 (no se inventa una clave nueva en cada reintento)', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id })

      expect(res.status).toBe(400)
      expect(await movimientos(emb.id)).toHaveLength(0)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.cPacaAguaEnt).toBe(0)
    })

    it('embarqueEntregaId inexistente → 400 y nada cambia', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: 'no-existe', offlineId: 'ev-x',
      })

      expect(res.status).toBe(400)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).cPacaAguaEnt).toBe(0)
    })

    it('flag apagado → /entrega no escribe eventos (comportamiento anterior intacto)', async () => {
      delete process.env[FLAG]
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ev-off',
      })

      expect(res.status).toBe(200)
      expect(await movimientos(emb.id)).toHaveLength(0)
    })

    it('evento tardío a un embarque ya CERRADO: no se bloquea ni se reatribuye; queda marcado posCierre', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 }, 'CERRADO')
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ev-tardio',
      })

      expect(res.status).toBe(200)
      const evs = await movimientos(emb.id)
      expect(evs).toHaveLength(1)
      expect(evs[0].metadata).toMatchObject({ captura: 'ENTREGA_PEDIDO', posCierre: true, pedidoId: pedido.id })
      expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('CERRADO')
    })
  })

  // ── Retiro del cliente y reglas por rol (decisión del PO, 2026-10-22) ────
  describe('retiro del cliente y reglas de GPS/foto por rol', () => {
    const setConfig = (clave: string, valor: string) =>
      testPrisma.config.upsert({ where: { clave }, create: { clave, valor }, update: { valor } })
    const clearConfig = () =>
      testPrisma.config.deleteMany({ where: { clave: { in: ['requerirGpsParaEntrega', 'REQUIERE_FOTO_ENTREGA'] } } })

    afterEach(async () => {
      authUser.role = 'ADMIN'
      await clearConfig()
    })

    it('clienteRetiro: entrega, suelta el pedido del embarque en la misma petición y NO anota salida del vehículo', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], clienteRetiro: true, offlineId: 'ret-1',
      })

      expect(res.status).toBe(200)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(p.embarqueId).toBeNull()
      expect(p.items[0].cantEntrega).toBe(5)
      expect(await movimientos(emb.id)).toHaveLength(0)
    })

    it('clienteRetiro es repetible: el mismo offlineId no cambia nada la segunda vez', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const body = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], clienteRetiro: true, offlineId: 'ret-2' }

      expect((await entregar(pedido.id, body)).status).toBe(200)
      const otra = await entregar(pedido.id, body)

      expect(otra.status).toBe(200)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).embarqueId).toBeNull()
    })

    it('clienteRetiro + embarqueEntregaId es contradictorio → 400 y nada cambia', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], clienteRetiro: true, embarqueEntregaId: emb.id, offlineId: 'ret-3',
      })

      expect(res.status).toBe(400)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.embarqueId).toBe(emb.id)
      expect(p.estadoEntrega).not.toBe('ENTREGADO')
    })

    it('"lo entregó el vehículo" sobre un embarque ABIERTO (aún no sale) se rechaza', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      await testPrisma.embarque.update({ where: { id: emb.id }, data: { estado: 'ABIERTO' } })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const res = await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ab-1',
      })

      expect(res.status).toBe(400)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).cPacaAguaEnt).toBe(0)
      expect(await movimientos(emb.id)).toHaveLength(0)
    })

    it('GPS: ADMIN/ASISTENTE no lo llenan (200 sin GPS); REPARTIDOR sí lo necesita (400 sin GPS)', async () => {
      await setConfig('requerirGpsParaEntrega', 'true')
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const p1 = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const p2 = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const items = [{ producto: 'PACA_AGUA', cantidad: 5 }]

      authUser.role = 'ASISTENTE'
      expect((await entregar(p1.id, { itemsEntregados: items, offlineId: 'gps-of' })).status).toBe(200)

      authUser.role = 'REPARTIDOR'
      const sinGps = await entregar(p2.id, { itemsEntregados: items, offlineId: 'gps-rep' })
      expect(sinGps.status).toBe(400)
      const conGps = await entregar(p2.id, { itemsEntregados: items, gpsLat: 4.7, gpsLng: -74.07, entregadoConGps: true, offlineId: 'gps-rep2' })
      expect(conGps.status).toBe(200)
    })

    it('foto: ADMIN/ASISTENTE no la necesitan (200 sin foto); REPARTIDOR sí (400 sin foto)', async () => {
      await setConfig('REQUIERE_FOTO_ENTREGA', 'true')
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const p1 = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const p2 = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      const items = [{ producto: 'PACA_AGUA', cantidad: 5 }]

      authUser.role = 'ADMIN'
      expect((await entregar(p1.id, { itemsEntregados: items, offlineId: 'foto-ad' })).status).toBe(200)

      authUser.role = 'REPARTIDOR'
      expect((await entregar(p2.id, { itemsEntregados: items, offlineId: 'foto-rep' })).status).toBe(400)
    })
  })

  // ── B-09: doble movimiento físico ───────────────────────────────────────
  describe('B-09 — un hecho físico = una salida', () => {
    it('ENTREGA manual de botellón (POST /botellones) + pedido ya entregado por /entrega sin evento: el cierre con delta 0 no agrega una segunda salida', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2, entAcum: 2 })
      await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' } })
      await testPrisma.embarqueMovimiento.create({
        data: { embarqueId: emb.id, tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE', metadata: { tipoEnvase: 'ENTREGADO' } },
      })

      const r = await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 0), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      expect(suma(await movimientos(emb.id))).toBe(2)
      expect(r.discrepanciaTotal).toBe(0)
    })

    it('[LATENTE] ENTREGA manual 2 + entrega de 2 en el cierre con carga 2: se rechaza o las salidas no superan la carga', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })
      await testPrisma.embarqueMovimiento.create({
        data: { embarqueId: emb.id, tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE', metadata: { tipoEnvase: 'ENTREGADO' } },
      })

      let rechazado = false
      try {
        await buildUseCase().execute({
          id: emb.id,
          pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }],
          gastos: [],
          dineroEntregado: 0,
        })
      } catch { rechazado = true }

      if (!rechazado) expect(suma(await movimientos(emb.id))).toBeLessThanOrEqual(2)
      else expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('EN_RUTA')
    })

    it('guarda: salidas del ledger + delta superan la carga → SALIDAS_EXCEDEN_CARGA, sin efectos parciales', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })
      await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'BOTELLON', cantidad: 2 }], embarqueEntregaId: emb.id, offlineId: 'ev-b09',
      })
      // Mismo hecho físico registrado a mano además de /entrega: sin identidad común no se fusionan.
      await testPrisma.embarqueMovimiento.create({
        data: { embarqueId: emb.id, tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE', metadata: { tipoEnvase: 'ENTREGADO' } },
      })

      await expect(buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 0), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })).rejects.toThrow(/SALIDAS_EXCEDEN_CARGA/)

      expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('EN_RUTA')
      expect(await movimientos(emb.id)).toHaveLength(2)
    })
  })

  // ── Venta libre previa al cierre ────────────────────────────────────────
  it('una venta libre ya creada en la misión cuenta como salida (no genera faltante artificial)', async () => {
    const emb = await crearEmbarque({ PACA_AGUA: 2 })
    const vl = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 2, entAcum: 2, origen: 'VENTA_LIBRE' })

    const r = await buildUseCase().execute({
      id: emb.id,
      pedidos: [{ pedidoId: vl.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }],
      gastos: [],
      dineroEntregado: 0,
    })

    expect(r.discrepanciaTotal).toBe(0)
  })

  // ── Preview == cierre ───────────────────────────────────────────────────
  it('entrega parcial viva (el pedido sale del embarque) + retorno declarado: preview y cierre coinciden y no hay faltante artificial', async () => {
    const emb = await crearEmbarque({ PACA_AGUA: 5 })
    const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
    await entregar(pedido.id, {
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 3 }], embarqueEntregaId: emb.id, offlineId: 'ev-prev',
    })
    // Tras un parcial el pedido queda PENDIENTE y SIN embarque (se replanifica):
    // la foto `pedidosRaw` ya no lo ve; solo el evento vivo conserva la salida.
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).embarqueId).toBeNull()
    const input = {
      id: emb.id,
      pedidos: [],
      productosRetorno: [{ producto: 'PACA_AGUA', devueltas: 2, cambios: 0, rotas: 0 }],
      gastos: [],
      dineroEntregado: 0,
    }

    const antes = await movimientos(emb.id)
    const prev = await buildUseCase().execute({ ...input, dryRun: true })
    expect(await movimientos(emb.id)).toHaveLength(antes.length)
    expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('EN_RUTA')

    const real = await buildUseCase().execute(input)
    expect(real.discrepanciaTotal).toBe(prev.discrepanciaTotal)
    expect(real.discrepanciaTotal).toBe(0)
    expect(suma(await movimientos(emb.id))).toBe(3)
  })

  // ── Transición y rollback ───────────────────────────────────────────────
  describe('selección por procedencia (flag, rollback, histórico)', () => {
    it('embarque anterior a la fecha de activación → lógica anterior: el acumulado del pedido sigue contando', async () => {
      process.env[FLAG] = '2999-01-01T00:00:00.000Z'
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5, entAcum: 5 })
      await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' } })

      const r = await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      expect(r.discrepanciaTotal).toBe(0)
    })

    it('rollback del flag a mitad de misión: el embarque con eventos atribuidos sigue cerrando por el camino nuevo (sin doble salida)', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })
      await entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: 'ev-rb',
      })

      delete process.env[FLAG] // rollback operativo

      const r = await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      expect(r.discrepanciaTotal).toBe(0)
      expect(suma(await movimientos(emb.id))).toBe(5)
    })
  })

  // ── Concurrencia real: PEDIDO:{id} vs CIERRE:{embarqueId} ───────────────
  it('carrera /entrega vs cierre del mismo pedido: nunca queda más de una salida por unidad entregada', async () => {
    for (let i = 0; i < 5; i++) {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 5 })

      const cierre = buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 5), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      }).then(() => 'ok' as const, (e: Error) => e.message)
      const ent = entregar(pedido.id, {
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], embarqueEntregaId: emb.id, offlineId: `ev-carrera-${i}`,
      })
      await Promise.all([cierre, ent])

      const evs = await movimientos(emb.id)
      const vivas = evs.filter((m) => !(m.metadata as { posCierre?: boolean } | null)?.posCierre)
      // 5 unidades entregadas ⇒ a lo sumo 5 salidas de misión (entrega viva O delta del cierre, no ambas).
      expect(suma(vivas)).toBeLessThanOrEqual(5)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.cPacaAguaEnt).toBe(5)
    }
  })
})
