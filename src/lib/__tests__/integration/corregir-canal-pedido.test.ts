// @tests #472 — TEMPORAL-SIN-EMBARQUE: el ADMIN corrige el canal (PUNTO ↔ DOMICILIO)
// de un pedido abierto (Postgres real, handler REAL). Cada prueba mira la BASE DE
// DATOS (canal, precios, total, estado de pago, factura, historial) y el
// verificador de integridad (V1–V15) sobre el pedido.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST } from '@/app/api/pedidos/[id]/gestion-admin/canal/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

const SOBRECOSTO = 2500

let adminId: string
let clienteId: string
let clienteSinDestinoId: string

const unico = () => `cc-${randomUUID()}`

async function interruptor(valor: string) {
  await testPrisma.config.upsert({
    where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
    create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor },
    update: { valor },
  })
}

function sesion(role: 'ADMIN' | 'ASISTENTE') {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}

async function crearPedido(o: {
  canal: 'DOMICILIO' | 'PUNTO'
  cant?: number
  pago?: number
  clienteId?: string
  items?: Array<{ producto: 'BOTELLON' | 'PACA_AGUA'; cantidad: number; precioManual?: number }>
}) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: o.clienteId ?? clienteId,
    canal: o.canal,
    origen: 'PEDIDO',
    items: o.items ?? [{ producto: 'BOTELLON', cantidad: o.cant ?? 2 }],
    pagos: o.pago ? [{ metodo: 'EFECTIVO', monto: o.pago }] : [],
    createdById: adminId,
    createdByRole: 'ADMIN',
    offlineId: unico(),
  })
  return pedido.id
}

async function corregir(pedidoId: string, body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}/gestion-admin/canal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offlineId: unico(), precios: 'CONSERVAR', motivo: 'Se registró por error', ...body }),
  })
  const res = await POST(req, { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

const fila = (id: string) => testPrisma.pedido.findUniqueOrThrow({ where: { id }, include: { items: true, factura: true } })
const auditorias = (id: string) =>
  testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: id, datos: { contains: '"correccionCanal":true' } } })

/** Reglas del verificador (V1–V15) que señalan ESTE pedido. Debe ser []. */
async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas
    .filter((r) => r.id !== 'V11')
    .flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

describe('#472 — corregir el canal de un pedido abierto (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    // #493: solo el precio base lleva el recargo de domicilio (manual, especial y volumen son
    // finales). Para que corregir el canal con RECALCULAR cambie el precio, el BOTELLON se
    // cotiza por precio base: sin tramos de volumen.
    await testPrisma.precioVolumen.updateMany({ where: { producto: { codigo: 'BOTELLON' } }, data: { activo: false } })
    await testPrisma.producto.update({ where: { codigo: 'BOTELLON' }, data: { aplicaDomicilio: true, sobreCostoDomicilio: SOBRECOSTO, precioBase: 6500 } })
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Canal', telefono: '3001230003', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
    clienteSinDestinoId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Sin Destino', telefono: '3001230004', direccion: '', barrio: '', limitePedidosFiados: 20, activo: true },
    })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    sesion('ADMIN')
    await interruptor('true')
  })

  it('conservar precios (por defecto): solo cambia el canal; precios y total quedan idénticos', async () => {
    const id = await crearPedido({ canal: 'PUNTO' })
    const antes = await fila(id)
    const r = await corregir(id, { canal: 'DOMICILIO' })
    expect(r.status).toBe(200)

    const p = await fila(id)
    expect(p.canal).toBe('DOMICILIO')
    expect(Number(p.total)).toBe(Number(antes.total))
    expect(p.items.map((i) => Number(i.precio))).toEqual(antes.items.map((i) => Number(i.precio)))
    expect(p.estadoEntrega).toBe('PENDIENTE')
    const [a] = await auditorias(id)
    const datos = JSON.parse(a.datos)
    expect(datos.motivo).toBe('Se registró por error')
    expect(datos.antes.canal).toBe('PUNTO')
    expect(datos.despues.canal).toBe('DOMICILIO')
    expect(a.usuarioId).toBe(adminId)
    expect(await violaciones(id)).toEqual([])
  })

  it('recalcular PUNTO → DOMICILIO: suma el sobrecosto de domicilio y la factura acompaña al pedido', async () => {
    const id = await crearPedido({ canal: 'PUNTO', cant: 2 })
    const antes = await fila(id)
    const r = await corregir(id, { canal: 'DOMICILIO', precios: 'RECALCULAR' })
    expect(r.status).toBe(200)

    const p = await fila(id)
    expect(Number(p.items[0].precio)).toBe(Number(antes.items[0].precio) + SOBRECOSTO)
    expect(Number(p.total)).toBe(Number(antes.total) + SOBRECOSTO * 2)
    expect(Number(p.saldo)).toBe(Number(p.total))
    expect(Number(p.factura?.total)).toBe(Number(p.total))
    expect(Number(p.factura?.saldo)).toBe(Number(p.total))
    expect(await violaciones(id)).toEqual([])
  })

  it('recalcular DOMICILIO → PUNTO con un abono parcial: baja el total y el saldo sigue siendo coherente', async () => {
    const id = await crearPedido({ canal: 'DOMICILIO', cant: 2, pago: 1000 })
    const antes = await fila(id)
    const r = await corregir(id, { canal: 'PUNTO', precios: 'RECALCULAR' })
    expect(r.status).toBe(200)

    const p = await fila(id)
    expect(p.canal).toBe('PUNTO')
    expect(Number(p.total)).toBe(Number(antes.total) - SOBRECOSTO * 2)
    expect(Number(p.totalPagado)).toBe(1000)
    expect(Number(p.saldo)).toBe(Number(p.total) - 1000)
    expect(p.estadoPago).toBe('PARCIAL')
    expect(Number(p.factura?.saldo)).toBe(Number(p.saldo))
    expect(await violaciones(id)).toEqual([])
  })

  it('recalcular respeta un precio puesto a mano: es final y no cambia con el canal (#493)', async () => {
    const id = await crearPedido({ canal: 'PUNTO', items: [{ producto: 'BOTELLON', cantidad: 2, precioManual: 9000 }] })
    expect((await fila(id)).items[0].precioOrigen).toBe('manual')

    expect((await corregir(id, { canal: 'DOMICILIO', precios: 'RECALCULAR' })).status).toBe(200)
    let p = await fila(id)
    expect(Number(p.items[0].precio)).toBe(9000) // el precio escrito ya incluye el domicilio
    expect(p.items[0].precioOrigen).toBe('manual')
    expect(Number(p.total)).toBe(18000)

    expect((await corregir(id, { canal: 'PUNTO', precios: 'RECALCULAR' })).status).toBe(200)
    p = await fila(id)
    expect(Number(p.items[0].precio)).toBe(9000)
    expect(Number(p.total)).toBe(18000)
    expect(await violaciones(id)).toEqual([])
  })

  it('si recalcular dejaría el pedido valiendo menos de lo ya pagado, se rechaza y no cambia nada', async () => {
    const id = await crearPedido({ canal: 'DOMICILIO', cant: 2 })
    const total = Number((await fila(id)).total)
    await testPrisma.pago.create({ data: { pedidoId: id, metodo: 'EFECTIVO', monto: total } })
    await testPrisma.pedido.update({ where: { id }, data: { totalPagado: total, saldo: 0, estadoPago: 'ANTICIPADO' } })

    const r = await corregir(id, { canal: 'PUNTO', precios: 'RECALCULAR' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('TOTAL_MENOR_A_PAGADO')
    expect(r.body.error.impacto.diferencia).toBe(SOBRECOSTO * 2)
    const p = await fila(id)
    expect(p.canal).toBe('DOMICILIO')
    expect(Number(p.total)).toBe(total)
    expect(await auditorias(id)).toHaveLength(0)

    // Conservando precios sí se puede.
    expect((await corregir(id, { canal: 'PUNTO' })).status).toBe(200)
  })

  it('la vista previa muestra el impacto y no escribe nada', async () => {
    const id = await crearPedido({ canal: 'PUNTO', cant: 2 })
    const antes = await fila(id)
    const r = await corregir(id, { canal: 'DOMICILIO', precios: 'RECALCULAR', vistaPrevia: true })
    expect(r.status).toBe(200)
    expect(r.body.aplicado).toBe(false)
    expect(r.body.cambio.totalAntes).toBe(Number(antes.total))
    expect(r.body.cambio.totalDespues).toBe(Number(antes.total) + SOBRECOSTO * 2)
    expect(r.body.cambio.canalDespues).toBe('DOMICILIO')

    const p = await fila(id)
    expect(p.canal).toBe('PUNTO')
    expect(Number(p.total)).toBe(Number(antes.total))
    expect(await auditorias(id)).toHaveLength(0)
  })

  it('un reintento con la misma clave no vuelve a aplicar ni audita dos veces', async () => {
    const id = await crearPedido({ canal: 'PUNTO' })
    const offlineId = unico()
    expect((await corregir(id, { canal: 'DOMICILIO', offlineId })).status).toBe(200)
    const otra = await corregir(id, { canal: 'DOMICILIO', offlineId })
    expect(otra.status).toBe(200)
    expect(otra.body.deduped).toBe(true)
    expect(await auditorias(id)).toHaveLength(1)
    expect((await fila(id)).canal).toBe('DOMICILIO')
  })

  it('rechaza: mismo canal, motivo vacío, pedido cerrado, en un embarque, con entregas y destino insuficiente', async () => {
    const igual = await crearPedido({ canal: 'PUNTO' })
    const mismo = await corregir(igual, { canal: 'PUNTO' })
    expect(mismo.status).toBe(422)
    expect(mismo.body.error.code).toBe('CANAL_SIN_CAMBIO')
    expect((await corregir(igual, { canal: 'DOMICILIO', motivo: '  ' })).status).toBe(400)

    const cerrado = await crearPedido({ canal: 'PUNTO' })
    await testPrisma.pedido.update({ where: { id: cerrado }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', entregadoAt: new Date() } })
    const rc = await corregir(cerrado, { canal: 'DOMICILIO' })
    expect(rc.status).toBe(409)
    expect(rc.body.error.code).toBe('PEDIDO_CERRADO')

    const enEmbarque = await crearPedido({ canal: 'DOMICILIO' })
    const emb = await testPrisma.embarque.create({ data: { trabajadorId: (await testPrisma.trabajador.create({ data: { nombre: 'Rep canal', rol: 'REPARTIDOR', usaMoto: true } })).id, fecha: new Date(), estado: 'ABIERTO' } })
    await testPrisma.pedido.update({ where: { id: enEmbarque }, data: { embarqueId: emb.id } })
    const re = await corregir(enEmbarque, { canal: 'PUNTO' })
    expect(re.status).toBe(409)
    expect(re.body.error.code).toBe('PEDIDO_EN_EMBARQUE')

    const conEntrega = await crearPedido({ canal: 'DOMICILIO', cant: 3 })
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: conEntrega }, data: { cantEntrega: 1 } })
    const rd = await corregir(conEntrega, { canal: 'PUNTO' })
    expect(rd.status).toBe(409)
    expect(rd.body.error.code).toBe('YA_HAY_ENTREGA')

    const sinDestino = await crearPedido({ canal: 'PUNTO', clienteId: clienteSinDestinoId })
    const rs = await corregir(sinDestino, { canal: 'DOMICILIO' })
    expect(rs.status).toBe(422)
    expect(rs.body.error.code).toBe('DESTINO_INSUFICIENTE')

    for (const id of [igual, cerrado, enEmbarque, conEntrega, sinDestino]) {
      expect(await auditorias(id)).toHaveLength(0)
    }
    expect((await fila(sinDestino)).canal).toBe('PUNTO')
  })

  it('con el interruptor apagado, o sin ser ADMIN, se rechaza y el pedido no cambia', async () => {
    const id = await crearPedido({ canal: 'PUNTO' })

    await interruptor('false')
    const apagado = await corregir(id, { canal: 'DOMICILIO' })
    expect(apagado.status).toBe(403)
    expect(apagado.body.error.code).toBe('FUNCION_DESACTIVADA')

    await interruptor('true')
    sesion('ASISTENTE')
    expect((await corregir(id, { canal: 'DOMICILIO' })).status).toBe(403)

    expect((await fila(id)).canal).toBe('PUNTO')
    expect(await auditorias(id)).toHaveLength(0)
  })
})
