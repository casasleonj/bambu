// @tests PR-1 — contrato completo de PUT /api/pedidos/[id] (Postgres real,
// handler REAL). Objetivo del incidente "Pedidos: edición / modalidad":
//   1. Ninguna edición puede responder éxito si omitió un cambio solicitado.
//   2. Cada columna persistente del Pedido (incluidas las claves de
//      idempotencia) y del PedidoItem sobrevive a una edición.
//   3. Una edición NO reescribe precios históricos de líneas que no cambió.
//   4. Se distingue edición de información / modificación económica.
//   5. La auditoría guarda antes/después.
//
// La clasificación de columnas es EXHAUSTIVA contra el DMMF de Prisma: si
// alguien agrega una columna a `Pedido` o `PedidoItem` sin clasificarla acá,
// el primer test falla y obliga a decidir si una edición debe conservarla.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { PUT } from '@/app/api/pedidos/[id]/route'
import { crearPedidoUseCase } from '@/modules/pedidos'

// ─── Clasificación exhaustiva de columnas ──────────────────────────────────

/** Columnas de Pedido que una edición legítimamente recalcula/escribe. */
const PEDIDO_GESTIONADAS = new Set([
  'obs', 'direccionEntrega', 'barrioEntrega', 'entregaLat', 'entregaLng', 'updatedAt',
  // económicas (derivadas de items + pagos)
  'total', 'saldo', 'estadoPago',
  // estado (solo vía `estado`)
  'estadoEntrega', 'estado',
  // espejo legacy derivado de items
  'cPacaAguaPed', 'cPacaAguaEnt', 'precioPacaAgua',
  'cPacaHieloPed', 'cPacaHieloEnt', 'precioPacaHielo',
  'cBotellonFabPed', 'cBotellonFabEnt', 'precioBotellonFab',
  'cBotellonDomPed', 'cBotellonDomEnt', 'precioBotellonDom',
  'cBolsaAguaPed', 'cBolsaAguaEnt', 'precioBolsaAgua',
  'cBolsaHieloPed', 'cBolsaHieloEnt', 'precioBolsaHielo',
])

/** Valores centinela para TODAS las demás columnas: una edición debe dejarlas igual. */
function centinelasPedido(ctx: { adminId: string; embarqueOrigenId: string; pedidoOrigenId: string; sufijo?: string }): Record<string, unknown> {
  const sx = ctx.sufijo ?? 'x'
  const f = new Date('2026-03-04T05:06:07.000Z')
  return {
    createdById: ctx.adminId,
    embarqueOrigenId: ctx.embarqueOrigenId,
    pedidoOrigenId: ctx.pedidoOrigenId,
    fechaEntrega: f,
    fuente: 'CENTINELA_FUENTE',
    promesaPagoFecha: f,
    fotoEntrega: 'https://example.test/foto-centinela.jpg',
    gpsLat: new Prisma.Decimal('4.123456'),
    gpsLng: new Prisma.Decimal('-74.123456'),
    gpsAccuracy: new Prisma.Decimal('12.34'),
    gpsJustificacion: 'centinela justificacion',
    entregadoConGps: false,
    entregadoAt: f,
    adminOverrideNota: 'centinela override',
    adminOverrideBy: ctx.adminId,
    adminOverrideAt: f,
    recurrenteBatchId: 'CENTINELA_BATCH',
    envioOfflineId: `cen-envio-offline-${sx}`,
    entregaOfflineId: `cen-entrega-offline-${sx}`,
    anulacionOfflineId: `cen-anulacion-offline-${sx}`,
    cancelacionOfflineId: `cen-cancelacion-offline-${sx}`,
    offlineId: 'cen-crear-offline',
    occurredAt: f,
    capturedAt: f,
    serverReceivedAt: f,
    clasificacionTemporal: 'TARDIA',
    disputaAbierta: true,
    codigoVisita: 'CEN-123',
    repartidor: 'Centinela Repartidor',
    horaPreferida: '10:30',
    idOrigen: 'CENTINELA_PLANTILLA',
  }
}

/** Columnas que NO se mutan por construcción (identidad / FK / autogeneradas). */
const PEDIDO_IDENTIDAD = new Set([
  'id', 'numero', 'clienteId', 'negocioId', 'embarqueId', 'tipo', 'canal', 'origen', 'fecha', 'createdAt',
  // dinero ya cobrado: ninguna edición lo toca (solo pagos/abonos)
  'totalPagado',
])

const ITEM_GESTIONADAS = new Set(['cantPedido', 'precio', 'subtotal', 'precioOrigen', 'cantEntrega'])
const ITEM_IDENTIDAD = new Set(['id', 'pedidoId', 'producto'])

function columnas(model: 'Pedido' | 'PedidoItem'): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model)
  if (!m) throw new Error(`modelo ${model} no encontrado en DMMF`)
  return m.fields.filter((f) => f.kind !== 'object').map((f) => f.name)
}

const serial = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))

// ─── Harness ────────────────────────────────────────────────────────────────

describe('PR-1 — contrato PUT /api/pedidos/[id] (Postgres real)', () => {
  let adminId: string
  let clienteId: string
  let clienteSinDireccionId: string
  let embarqueOrigenId: string
  let pedidoOrigenId: string

  async function put(pedidoId: string, body: Record<string, unknown>) {
    const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: pedidoId }) })
    return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  async function fila(pedidoId: string) {
    return testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: { orderBy: { producto: 'asc' } }, factura: true } })
  }

  async function historial(pedidoId: string) {
    return testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE' }, orderBy: { fecha: 'asc' } })
  }

  /** Crea un pedido DOMICILIO con 2 líneas y TODAS las columnas libres pobladas. */
  async function crearPedidoPoblado(opts: { clienteId?: string; pago?: number } = {}) {
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId: opts.clienteId ?? clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 2 }],
      pagos: opts.pago ? [{ metodo: 'EFECTIVO', monto: opts.pago }] : [],
      createdById: adminId, createdByRole: 'ADMIN',
      offlineId: `put-contrato-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
    const centinelas = centinelasPedido({ adminId, embarqueOrigenId, pedidoOrigenId, sufijo: Math.random().toString(36).slice(2, 10) })
    // offlineId es UNIQUE y lo usó la creación: se conserva el real y no se pisa.
    const { offlineId: _ignorado, ...resto } = centinelas
    void _ignorado
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: resto as Prisma.PedidoUncheckedUpdateInput })
    // Marcas de autorización por línea (columnas de PedidoItem fuera del dominio).
    await testPrisma.pedidoItem.updateMany({
      where: { pedidoId: pedido.id, producto: 'PACA_AGUA' },
      data: { autorizadoPorAdmin: true, autorizadoPorId: adminId, autorizadoEn: new Date('2026-03-04T05:06:07.000Z') },
    })
    return pedido.id
  }

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente PUT', telefono: '3001112233', direccion: 'Calle 1 # 2-3', barrio: 'Centro', activo: true },
    })).id
    clienteSinDireccionId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente sin dirección', telefono: '3004445566', direccion: '', activo: true },
    })).id
    const trabajador = await testPrisma.trabajador.create({ data: { nombre: 'Rep PUT', rol: 'REPARTIDOR', usaMoto: true } })
    embarqueOrigenId = (await testPrisma.embarque.create({ data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'ABIERTO' } })).id
    const { pedido: origen } = await crearPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: `put-contrato-origen-${Date.now()}`,
    })
    pedidoOrigenId = origen.id
  })

  afterAll(async () => { await disconnect() })

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  // ── 1. La clasificación cubre TODAS las columnas ──────────────────────────
  it('toda columna de Pedido y PedidoItem está clasificada (una columna nueva obliga a decidir)', () => {
    const centinelas = new Set([...Object.keys(centinelasPedido({ adminId: 'x', embarqueOrigenId: 'x', pedidoOrigenId: 'x' })), 'offlineId'])
    const sinClasificar = columnas('Pedido').filter(
      (c) => !PEDIDO_GESTIONADAS.has(c) && !PEDIDO_IDENTIDAD.has(c) && !centinelas.has(c),
    )
    expect(sinClasificar, `Pedido: columnas sin clasificar → ${sinClasificar.join(', ')}`).toEqual([])

    const itemsSinClasificar = columnas('PedidoItem').filter(
      (c) => !ITEM_GESTIONADAS.has(c) && !ITEM_IDENTIDAD.has(c) && !['autorizadoPorAdmin', 'autorizadoPorId', 'autorizadoEn'].includes(c),
    )
    expect(itemsSinClasificar, `PedidoItem: columnas sin clasificar → ${itemsSinClasificar.join(', ')}`).toEqual([])
  })

  /** Compara TODAS las columnas conservadas antes/después de una edición. */
  async function expectConservadas(antes: Awaited<ReturnType<typeof fila>>, despues: Awaited<ReturnType<typeof fila>>) {
    for (const c of columnas('Pedido')) {
      if (PEDIDO_GESTIONADAS.has(c)) continue
      expect(serial((despues as Record<string, unknown>)[c]), `Pedido.${c} cambió en una edición que no lo pedía`)
        .toBe(serial((antes as Record<string, unknown>)[c]))
    }
  }

  // ── 2. Información: obs ───────────────────────────────────────────────────
  it('editar SOLO obs conserva cada columna (claves de idempotencia, GPS, overrides) y cada columna de ítem', async () => {
    const id = await crearPedidoPoblado()
    const antes = await fila(id)
    const r = await put(id, { obs: 'nueva observación' })
    expect(r.status).toBe(200)
    expect(r.body.aplicado).toEqual({ campos: ['obs'], sinCambios: false })
    const despues = await fila(id)
    expect(despues.obs).toBe('nueva observación')
    await expectConservadas(antes, despues)
    // Ítems: TODAS las columnas conservadas (incluidas las marcas de autorización).
    expect(despues.items.map((i) => ({ ...i, id: undefined }))).toEqual(antes.items.map((i) => ({ ...i, id: undefined })))
    // Pagos/factura intactos
    expect(serial(despues.factura)).toBe(serial(antes.factura))
  })

  it('obs: null y obs: "" LIMPIAN la observación (antes era imposible borrarla)', async () => {
    const id = await crearPedidoPoblado()
    await put(id, { obs: 'algo' })
    expect((await put(id, { obs: null })).status).toBe(200)
    expect((await fila(id)).obs).toBeNull()
    await put(id, { obs: 'otra' })
    expect((await put(id, { obs: '' })).status).toBe(200)
    expect((await fila(id)).obs).toBeNull()
  })

  // ── 3. Información: dirección SIN ítems ───────────────────────────────────
  it('dirección/barrio SIN ítems se persisten, se auditan y conservan el resto (antes: 200 sin efecto)', async () => {
    const id = await crearPedidoPoblado()
    const antes = await fila(id)
    const r = await put(id, { direccionEntrega: 'Carrera 9 # 8-7', barrioEntrega: 'Otro barrio' })
    expect(r.status).toBe(200)
    expect(r.body.aplicado.sinCambios).toBe(false)
    expect(r.body.aplicado.campos).toEqual(expect.arrayContaining(['direccionEntrega', 'barrioEntrega']))
    const despues = await fila(id)
    expect(despues.direccionEntrega).toBe('Carrera 9 # 8-7')
    expect(despues.barrioEntrega).toBe('Otro barrio')
    await expectConservadas(antes, despues)
    expect(despues.items.map((i) => ({ ...i, id: undefined }))).toEqual(antes.items.map((i) => ({ ...i, id: undefined })))
    expect(Number(despues.total)).toBe(Number(antes.total))
  })

  it('vaciar la dirección de un DOMICILIO sin otra fuente utilizable → 422 ENTREGA_INSUFICIENTE y NO persiste', async () => {
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: `put-sin-dir-${Date.now()}`,
      direccionEntrega: 'Calle puntual 5',
    })
    // El cliente pierde su dirección: la única fuente es el snapshot del pedido.
    await testPrisma.cliente.update({ where: { id: clienteId }, data: { direccion: '', barrio: null } })
    try {
      const antes = await fila(pedido.id)
      const r = await put(pedido.id, { direccionEntrega: '', barrioEntrega: '' })
      expect(r.status).toBe(422)
      expect(r.body.error.code).toBe('ENTREGA_INSUFICIENTE')
      expect(serial(await fila(pedido.id))).toBe(serial(antes))
    } finally {
      await testPrisma.cliente.update({ where: { id: clienteId }, data: { direccion: 'Calle 1 # 2-3', barrio: 'Centro' } })
    }
  })

  it('editar la dirección de un pedido ENTREGADO → 409 PEDIDO_CERRADO (no se reescribe historia)', async () => {
    const id = await crearPedidoPoblado()
    await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
    const antes = await fila(id)
    const r = await put(id, { direccionEntrega: 'Nueva 1' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PEDIDO_CERRADO')
    expect(serial(await fila(id))).toBe(serial(antes))
  })

  // ── 4. Campos no soportados: nunca éxito silencioso ───────────────────────
  it.each([
    ['canal', { canal: 'PUNTO' }],
    ['tipo', { tipo: 'PUNTO' }],
    ['embarqueId', { embarqueId: 'x' }],
    ['estadoPago', { estadoPago: 'PAGADO' }],
    ['promesaPagoFecha', { promesaPagoFecha: '2026-12-01' }],
    ['cPacaAguaEnt', { cPacaAguaEnt: 3 }],
    ['campo desconocido', { observaciones: 'typo' }],
  ])('rechaza %s con 422 CAMPO_NO_SOPORTADO y no cambia nada (aunque venga junto a un cambio válido)', async (_n, extra) => {
    const id = await crearPedidoPoblado()
    const antes = await fila(id)
    const r = await put(id, { obs: 'cambio válido', ...extra })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('CAMPO_NO_SOPORTADO')
    expect(Object.keys(r.body.error.fieldErrors ?? {})).toEqual(Object.keys(extra))
    expect(serial(await fila(id))).toBe(serial(antes))
    expect(await historial(id)).toHaveLength(0)
  })

  it('el rechazo de `canal` explica que el canal no se edita y cómo corregirlo', async () => {
    const id = await crearPedidoPoblado()
    const r = await put(id, { canal: 'PUNTO' })
    expect(r.status).toBe(422)
    expect(r.body.error.fieldErrors.canal[0]).toMatch(/canal/i)
    expect(r.body.error.fieldErrors.canal[0]).toMatch(/corrección|rectific/i)
  })

  it('metadatos permitidos (casoId, offlineId) no cuentan como cambio ni se rechazan', async () => {
    const id = await crearPedidoPoblado()
    const r = await put(id, { obs: 'con metadata', casoId: 'caso-1', offlineId: 'cliente-offline-1' })
    expect(r.status).toBe(200)
    expect(r.body.aplicado.campos).toEqual(['obs'])
  })

  it('estado y estadoEntrega son el mismo cambio: ambos se rechazan igual; si difieren → 422', async () => {
    const id = await crearPedidoPoblado()
    const bad = await put(id, { estado: 'EN_RUTA', estadoEntrega: 'CANCELADO' })
    expect(bad.status).toBe(422)
    for (const campo of ['estado', 'estadoEntrega']) {
      const r = await put(id, { [campo]: 'CANCELADO' })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('OPERACION_ESPECIALIZADA')
    }
    expect((await fila(id)).estadoEntrega).toBe('PENDIENTE')
  })

  // ── 5. Sin cambios ────────────────────────────────────────────────────────
  it('body sin ningún campo editable → 422 SIN_CAMBIOS_SOLICITADOS', async () => {
    const id = await crearPedidoPoblado()
    const r = await put(id, {})
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('SIN_CAMBIOS_SOLICITADOS')
  })

  it('pedir un valor idéntico al actual responde 200 con sinCambios:true y NO audita', async () => {
    const id = await crearPedidoPoblado()
    await testPrisma.pedido.update({ where: { id }, data: { obs: 'igual' } })
    const antes = await fila(id)
    const r = await put(id, { obs: 'igual' })
    expect(r.status).toBe(200)
    expect(r.body.aplicado).toEqual({ campos: [], sinCambios: true })
    expect(serial(await fila(id))).toBe(serial(antes))
    expect(await historial(id)).toHaveLength(0)
  })

  // ── 6. Económica: precios históricos ──────────────────────────────────────
  it('reenviar las MISMAS líneas no re-precifica: precio/origen/total/factura históricos intactos', async () => {
    const id = await crearPedidoPoblado()
    // Precio histórico distinto del vigente (p.ej. precio pactado con el cliente).
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: id, producto: 'PACA_AGUA' }, data: { precio: 9999, subtotal: 9999 * 4, precioOrigen: 'cliente' } })
    const items = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id }, orderBy: { producto: 'asc' } })
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0)
    await testPrisma.pedido.update({ where: { id }, data: { total, saldo: total } })
    await testPrisma.factura.update({ where: { pedidoId: id }, data: { total, saldo: total, subtotal: total } })
    const antes = await fila(id)

    const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 2 }], obs: 'solo cambio la nota' })
    expect(r.status).toBe(200)
    const despues = await fila(id)
    expect(despues.items.map((i) => ({ ...i, id: undefined }))).toEqual(antes.items.map((i) => ({ ...i, id: undefined })))
    expect(Number(despues.total)).toBe(Number(antes.total))
    expect(Number(despues.factura!.total)).toBe(Number(antes.factura!.total))
    await expectConservadas(antes, despues)
    expect(r.body.aplicado.campos).toEqual(['obs'])
  })

  it('cambiar la cantidad de UNA línea re-precifica solo esa; la otra conserva precio, origen y marcas de autorización', async () => {
    const id = await crearPedidoPoblado()
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: id, producto: 'PACA_AGUA' }, data: { precio: 9999, subtotal: 9999 * 4, precioOrigen: 'cliente' } })
    const antes = await fila(id)
    const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 5 }] })
    expect(r.status).toBe(200)
    const despues = await fila(id)
    const agua0 = antes.items.find((i) => i.producto === 'PACA_AGUA')!
    const agua1 = despues.items.find((i) => i.producto === 'PACA_AGUA')!
    expect({ ...agua1, id: undefined }).toEqual({ ...agua0, id: undefined })
    expect(agua1.autorizadoPorAdmin).toBe(true)
    expect(agua1.autorizadoPorId).toBe(adminId)
    expect(despues.items.find((i) => i.producto === 'PACA_HIELO')!.cantPedido).toBe(5)
    expect(r.body.aplicado.campos).toContain('items')
    await expectConservadas(antes, despues)
  })

  it('un precio manual NUEVO sobre una línea autorizada retira la marca de autorización (era del precio anterior)', async () => {
    const id = await crearPedidoPoblado()
    const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 4, precioManual: 1234 }, { producto: 'PACA_HIELO', cantidad: 2 }] })
    expect(r.status).toBe(200)
    const agua = (await fila(id)).items.find((i) => i.producto === 'PACA_AGUA')!
    expect(agua.precioOrigen).toBe('manual')
    expect(Number(agua.precio)).toBe(1234)
    expect(agua.autorizadoPorAdmin).toBe(false)
    expect(agua.autorizadoPorId).toBeNull()
    expect(agua.autorizadoEn).toBeNull()
  })

  it('con pago registrado, un total nuevo MENOR al pagado → 409 TOTAL_MENOR_A_PAGADO con el impacto, sin persistir', async () => {
    const id = await crearPedidoPoblado({ pago: 12000 })
    const antes = await fila(id)
    const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 1 }] })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('TOTAL_MENOR_A_PAGADO')
    expect(r.body.error.impacto).toMatchObject({ totalPagado: 12000 })
    expect(r.body.error.impacto.totalNuevo).toBeLessThan(12000)
    expect(serial(await fila(id))).toBe(serial(antes))
  })

  it('con pago registrado, un total MAYOR deja saldo coherente (estadoPago proyectado, factura alineada)', async () => {
    const id = await crearPedidoPoblado({ pago: 10000 })
    const pagado = Number((await fila(id)).totalPagado)
    const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 6 }] })
    expect(r.status).toBe(200)
    const despues = await fila(id)
    expect(Number(despues.totalPagado)).toBe(pagado)
    expect(Number(despues.saldo)).toBeCloseTo(Number(despues.total) - pagado, 2)
    expect(Number(despues.factura!.saldo)).toBeCloseTo(Number(despues.saldo), 2)
  })

  // ── 7. Estado ─────────────────────────────────────────────────────────────
  it('pedir el MISMO estado que ya tiene no es un cambio (no se rechaza ni se escribe)', async () => {
    const id = await crearPedidoPoblado()
    const r = await put(id, { estado: 'PENDIENTE', obs: 'con estado repetido' })
    expect(r.status).toBe(200)
    expect(r.body.aplicado.campos).toEqual(['obs'])
  })

  it('EN_RUTA: editar obs conserva embarqueId', async () => {
    const id = await crearPedidoPoblado()
    await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', embarqueId: embarqueOrigenId } })
    const antes = await fila(id)
    const r = await put(id, { obs: 'en ruta' })
    expect(r.status).toBe(200)
    expect((await fila(id)).embarqueId).toBe(antes.embarqueId)
  })

  // ── 8. Auditoría ──────────────────────────────────────────────────────────
  it('la auditoría de una edición registra campos, antes y después', async () => {
    const id = await crearPedidoPoblado()
    await testPrisma.pedido.update({ where: { id }, data: { obs: 'antes' } })
    await put(id, { obs: 'después', direccionEntrega: 'Calle nueva 1' })
    const rows = await historial(id)
    expect(rows).toHaveLength(1)
    const datos = JSON.parse(rows[0].datos) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(datos.campos).toEqual(expect.arrayContaining(['obs', 'direccionEntrega']))
    expect(datos.antes.obs).toBe('antes')
    expect(datos.despues.obs).toBe('después')
    expect(datos.despues.direccionEntrega).toBe('Calle nueva 1')
    // Compat con lectores existentes
    expect(datos.numero).toEqual(expect.any(Number))
    expect(datos.estado).toBe('PENDIENTE')
  })

  it('una edición económica audita las líneas y totales antes/después', async () => {
    const id = await crearPedidoPoblado()
    await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 5 }] })
    const datos = JSON.parse((await historial(id))[0].datos) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(datos.campos).toContain('items')
    expect(datos.antes.items.items).toEqual(expect.arrayContaining([expect.objectContaining({ producto: 'PACA_HIELO', cantidad: 2 })]))
    expect(datos.despues.items.items).toEqual(expect.arrayContaining([expect.objectContaining({ producto: 'PACA_HIELO', cantidad: 5 })]))
    expect(datos.antes.items.total).not.toBe(datos.despues.items.total)
  })

  // ── 9. Concurrencia ───────────────────────────────────────────────────────
  it('dos ediciones simultáneas de campos distintos NO se pisan (lock PEDIDO)', async () => {
    const id = await crearPedidoPoblado()
    const [a, b] = await Promise.all([
      put(id, { obs: 'concurrente obs' }),
      put(id, { direccionEntrega: 'Concurrente 123' }),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const despues = await fila(id)
    expect(despues.obs).toBe('concurrente obs')
    expect(despues.direccionEntrega).toBe('Concurrente 123')
  })

  it('cliente sin dirección: no se puede dejar un DOMICILIO sin información de entrega editando', async () => {
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId: clienteSinDireccionId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: `put-sd-${Date.now()}`, direccionEntrega: 'Solo en el pedido 9',
    })
    const r = await put(pedido.id, { direccionEntrega: '' })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('ENTREGA_INSUFICIENTE')
  })
})
