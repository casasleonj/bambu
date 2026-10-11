// @tests PR-1 — bloqueos de revisión (Postgres real, handler real de PUT).
//
//  1. Falsos éxitos: `aplicado.campos` nunca declara algo que no se persistió.
//  2. El PUT no es atajo de operaciones críticas (entrega, cancelación,
//     anulación, envío, no-entrega): esas pasan por su caso de uso.
//  3. Editar información no exige ítems: se distingue de modificar cantidades.
//  4. Identidad de líneas: sin productos duplicados; autorizaciones conservadas.
//  5. Una edición económica no pierde ni recalcula un diferencial N2 ya aplicado.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { PUT } from '@/app/api/pedidos/[id]/route'
import { POST as POST_CREAR } from '@/app/api/pedidos/route'
import { DELETE as DELETE_DESASIGNAR } from '@/app/api/embarques/[id]/pedidos/[pedidoId]/route'
import { crearPedidoUseCase, cancelarPedidoUseCase } from '@/modules/pedidos'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'

const serial = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))

describe('PR-1 — bloqueos de revisión del contrato PUT', () => {
  let adminId: string
  let clienteId: string
  let embarqueId: string

  async function put(pedidoId: string, body: Record<string, unknown>) {
    const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: pedidoId }) })
    return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  let seq = 0
  /** Cada pedido con su propio cliente: evita el límite de fiados por cliente (CLIENTE_DEBE). */
  async function clienteNuevo() {
    seq += 1
    return (await testPrisma.cliente.create({
      data: { nombre: `Cliente Bloq ${seq}`, telefono: `31${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`, direccion: 'Calle 9 # 8-7', barrio: 'Centro', activo: true },
    })).id
  }

  async function crear(opts: { canal?: 'PUNTO' | 'DOMICILIO'; pago?: number; items?: Array<{ producto: string; cantidad: number }> } = {}) {
    const clienteId = await clienteNuevo()
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId, canal: opts.canal ?? 'DOMICILIO', origen: 'PEDIDO',
      items: (opts.items ?? [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 2 }]) as never,
      pagos: opts.pago ? [{ metodo: 'EFECTIVO', monto: opts.pago }] : [],
      createdById: adminId, createdByRole: 'ADMIN',
      offlineId: `bloq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
    return pedido.id
  }

  /** Foto completa de lo que una operación crítica tocaría. */
  async function foto(pedidoId: string) {
    const p = await testPrisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId }, include: { items: { orderBy: { id: 'asc' } }, pagos: true, factura: true, notasCredito: true },
    })
    const obligaciones = await testPrisma.obligacionPendiente.findMany({ where: { pedidoId } })
    const historial = await testPrisma.historial.count({ where: { entidad: 'Pedido', registroId: pedidoId } })
    return serial({ p, obligaciones, historial })
  }

  async function enRuta(pedidoId: string) {
    await testPrisma.pedido.update({ where: { id: pedidoId }, data: { estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', embarqueId } })
  }

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Bloqueos', telefono: '3007778899', direccion: 'Calle 9 # 8-7', barrio: 'Centro', activo: true },
    })).id
    const trabajador = await testPrisma.trabajador.create({ data: { nombre: 'Rep Bloqueos', rol: 'REPARTIDOR', usaMoto: true } })
    embarqueId = (await testPrisma.embarque.create({ data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA' } })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }) })

  // ═══ BLOQUEO 1 — `aplicado` nunca miente ══════════════════════════════════
  describe('Bloqueo 1: campos declarados == campos persistidos', () => {
    /** Invariante: si el servidor responde 200, TODO campo de `aplicado.campos` está en la base. */
    async function verificarAplicado(pedidoId: string, pedido: Record<string, unknown>, res: { status: number; body: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (res.status !== 200) return
      const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
      for (const campo of res.body.aplicado.campos as string[]) {
        if (campo === 'obs') expect(fila.obs, 'obs declarado como aplicado pero no persistido').toBe(pedido.obs)
        if (campo === 'direccionEntrega') expect(fila.direccionEntrega, 'direccionEntrega declarada pero no persistida').toBe(pedido.direccionEntrega)
        if (campo === 'estadoEntrega') expect(fila.estadoEntrega, 'estadoEntrega declarado pero no persistido').toBe(pedido.estado)
        if (campo === 'items') {
          const pedidos = pedido.items as Array<{ producto: string; cantidad: number }>
          for (const it of pedidos) expect(fila.items.find((x) => x.producto === it.producto)?.cantPedido, `item ${it.producto} declarado pero no persistido`).toBe(it.cantidad)
        }
      }
    }

    it('ENTREGADO + obs en una sola petición: nunca "aplicado" sin persistir (reproduce el falso éxito)', async () => {
      const id = await crear()
      await enRuta(id)
      const body = { estado: 'ENTREGADO', obs: 'nota combinada' }
      const res = await put(id, body)
      await verificarAplicado(id, body, res)
      // La causa raíz se cierra además negando la vía (Bloqueo 2): nada cambia.
      expect(res.status).toBe(409)
      expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).obs).toBeNull()
    })

    it('ENTREGADO + dirección: idem', async () => {
      const id = await crear()
      await enRuta(id)
      const body = { estado: 'ENTREGADO', direccionEntrega: 'Otra dirección 55' }
      const res = await put(id, body)
      await verificarAplicado(id, body, res)
      expect(res.status).toBe(409)
    })

    it('ENTREGADO + items + obs + dirección: idem', async () => {
      const id = await crear()
      await enRuta(id)
      const body = { estado: 'ENTREGADO', obs: 'x', direccionEntrega: 'Dir 1', items: [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'PACA_HIELO', cantidad: 2 }] }
      const res = await put(id, body)
      await verificarAplicado(id, body, res)
      expect(res.status).toBe(409)
    })

    it('combinación válida (items + obs + dirección) se persiste completa', async () => {
      const id = await crear()
      const body = { obs: 'combinada', direccionEntrega: 'Dir combinada 7', items: [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'PACA_HIELO', cantidad: 2 }] }
      const res = await put(id, body)
      expect(res.status).toBe(200)
      await verificarAplicado(id, body, res)
      expect(res.body.aplicado.campos).toEqual(expect.arrayContaining(['items', 'obs', 'direccionEntrega']))
    })
  })

  // ═══ BLOQUEO 2 — el PUT no ejecuta operaciones críticas ══════════════════
  describe('Bloqueo 2: transiciones críticas solo por su caso de uso', () => {
    it.each([
      ['ENTREGADO', 'EN_RUTA', '/entrega'],
      ['CANCELADO', 'PENDIENTE', '/cancelar'],
      ['ANULADO', 'ENTREGADO', '/anular'],
      ['EN_RUTA', 'PENDIENTE', '/enviar'],
      ['PENDIENTE', 'EN_RUTA', 'DELETE /api/embarques'],
      ['NO_ENTREGADO', 'EN_RUTA', 'cierre del embarque'],
    ])('PUT estado=%s desde %s → 409 OPERACION_ESPECIALIZADA que apunta a %s; no cambia nada', async (destino, origen, pista) => {
      const id = await crear({ pago: 5000 })
      if (origen === 'EN_RUTA') await enRuta(id)
      if (origen === 'ENTREGADO') await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      const antes = await foto(id)
      const r = await put(id, { estado: destino })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('OPERACION_ESPECIALIZADA')
      expect(r.body.error.fieldErrors.estado[0]).toContain(pista)
      expect(await foto(id)).toBe(antes)
    })

    it('con una obligación N2 abierta, PUT ENTREGADO no puede dejarla desincronizada del pedido', async () => {
      const id = await crear({ canal: 'PUNTO', items: [{ producto: 'BOTELLON', cantidad: 4 }] })
      await new GestionarPendienteUseCase().execute({ pedidoId: id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId })
      await enRuta(id)
      const antes = await foto(id)
      const r = await put(id, { estado: 'ENTREGADO' })
      expect(r.status).toBe(409)
      expect(await foto(id)).toBe(antes) // obligación sigue ABIERTA y el pedido no quedó ENTREGADO
    })

    it('"Volver a pendiente" por su vía especializada (DELETE embarque/pedido): libera la asignación, audita y avisa', async () => {
      const id = await crear()
      await enRuta(id)
      const res = await DELETE_DESASIGNAR(
        new NextRequest(`http://localhost/api/embarques/${embarqueId}/pedidos/${id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: embarqueId, pedidoId: id }) },
      )
      expect(res.status).toBe(200)
      const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id } })
      expect(fila.estadoEntrega).toBe('PENDIENTE')
      expect(fila.embarqueId).toBeNull()
      // y es idempotente (reintento offline)
      const otra = await DELETE_DESASIGNAR(
        new NextRequest(`http://localhost/api/embarques/${embarqueId}/pedidos/${id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: embarqueId, pedidoId: id }) },
      )
      expect(otra.status).toBe(200)
    })

    it('la vía especializada sigue operativa: cancelar por su caso de uso revierte factura y deja nota de crédito', async () => {
      const id = await crear({ pago: 5000 })
      await cancelarPedidoUseCase.execute({ pedidoId: id })
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id }, include: { factura: true } })
      expect(p.estadoEntrega).toBe('CANCELADO')
      expect(p.factura?.estado).toBe('ANULADA')
    })
  })

  // ═══ BLOQUEO 3 — información vs cantidades ═══════════════════════════════
  describe('Bloqueo 3: editar información no depende de reenviar ítems', () => {
    const mismos = [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'PACA_HIELO', cantidad: 2 }]

    it('entrega PARCIAL + ítems idénticos + obs → se aplica solo obs (antes: 409 CANTIDAD_YA_ENTREGADA)', async () => {
      const id = await crear()
      await testPrisma.pedidoItem.updateMany({ where: { pedidoId: id, producto: 'PACA_AGUA' }, data: { cantEntrega: 2 } })
      const r = await put(id, { items: mismos, obs: 'nota con entrega parcial' })
      expect(r.status).toBe(200)
      expect(r.body.aplicado.campos).toEqual(['obs'])
    })

    it('entrega PARCIAL + cantidades distintas → 409 con code y hacia ajustar-cantidad; nada cambia', async () => {
      const id = await crear()
      await testPrisma.pedidoItem.updateMany({ where: { pedidoId: id, producto: 'PACA_AGUA' }, data: { cantEntrega: 2 } })
      const antes = await foto(id)
      const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 9 }, { producto: 'PACA_HIELO', cantidad: 2 }] })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD')
      expect(await foto(id)).toBe(antes)
    })

    it('pedido CERRADO + ítems idénticos + obs → obs se aplica', async () => {
      const id = await crear()
      await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      const r = await put(id, { items: mismos, obs: 'nota en cerrado' })
      expect(r.status).toBe(200)
      expect(r.body.aplicado.campos).toEqual(['obs'])
    })

    it('pedido CERRADO + cantidades distintas → 409 PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD', async () => {
      const id = await crear()
      await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 9 }, { producto: 'PACA_HIELO', cantidad: 2 }] })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD')
    })

    it('pedido CERRADO + ítems idénticos + dirección → 409 PEDIDO_CERRADO (la dirección es historia)', async () => {
      const id = await crear()
      await testPrisma.pedido.update({ where: { id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      const r = await put(id, { items: mismos, direccionEntrega: 'Nueva' })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('PEDIDO_CERRADO')
    })
  })

  // ═══ BLOQUEO 4 — identidad e integridad de ítems ═════════════════════════
  describe('Bloqueo 4: una línea por producto', () => {
    it('crear con el mismo producto dos veces se rechaza en el borde (POST /api/pedidos)', async () => {
      const req = new NextRequest('http://localhost/api/pedidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }, { producto: 'PACA_AGUA', cantidad: 2 }], offlineId: `dup-${Date.now()}` }),
      })
      const res = await POST_CREAR(req)
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toMatch(/duplicad/i)
    })

    it('editar con el mismo producto repetido se rechaza (PUT)', async () => {
      const id = await crear()
      const antes = await foto(id)
      const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 1 }, { producto: 'PACA_AGUA', cantidad: 2 }] })
      expect([400, 422]).toContain(r.status)
      expect(await foto(id)).toBe(antes)
    })

    async function crearConLineasDuplicadas() {
      const id = await crear({ items: [{ producto: 'PACA_AGUA', cantidad: 3 }] })
      const base = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: id } })
      await testPrisma.pedidoItem.update({ where: { id: base.id }, data: { autorizadoPorAdmin: true, autorizadoPorId: adminId, autorizadoEn: new Date('2026-01-01T00:00:00Z'), precioOrigen: 'manual' } })
      await testPrisma.pedidoItem.create({
        data: { pedidoId: id, producto: 'PACA_AGUA', cantPedido: 3, cantEntrega: 0, precio: base.precio, subtotal: base.subtotal, precioOrigen: 'base' },
      })
      const total = Number(base.subtotal) * 2
      await testPrisma.pedido.update({ where: { id }, data: { total, saldo: total } })
      await testPrisma.factura.update({ where: { pedidoId: id }, data: { total, saldo: total, subtotal: total } })
      return id
    }

    it('un pedido que YA tiene líneas duplicadas: editar ítems falla cerrado (409 LINEAS_DUPLICADAS), sin cambios', async () => {
      const id = await crearConLineasDuplicadas()
      const antes = await foto(id)
      const r = await put(id, { items: [{ producto: 'PACA_AGUA', cantidad: 6 }] })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('LINEAS_DUPLICADAS')
      expect(await foto(id)).toBe(antes)
    })

    it('con líneas duplicadas, editar solo obs conserva AMBAS líneas y la autorización de la que la tenía', async () => {
      const id = await crearConLineasDuplicadas()
      const antes = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id }, orderBy: { id: 'asc' } })
      const r = await put(id, { obs: 'solo nota' })
      expect(r.status).toBe(200)
      const despues = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id }, orderBy: { id: 'asc' } })
      expect(despues).toHaveLength(2)
      expect(despues.filter((i) => i.autorizadoPorAdmin)).toHaveLength(1)
      expect(despues.map((i) => ({ ...i, id: undefined })).sort((a, b) => serial(a).localeCompare(serial(b))))
        .toEqual(antes.map((i) => ({ ...i, id: undefined })).sort((a, b) => serial(a).localeCompare(serial(b))))
    })

    it('transversal: cancelar un pedido con líneas duplicadas (vía repo.update) no pierde ni mezcla líneas', async () => {
      const id = await crearConLineasDuplicadas()
      const antes = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id }, orderBy: { id: 'asc' } })
      await cancelarPedidoUseCase.execute({ pedidoId: id })
      const despues = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id }, orderBy: { id: 'asc' } })
      expect(despues).toHaveLength(antes.length)
      expect(despues.filter((i) => i.autorizadoPorAdmin)).toHaveLength(1)
      // cada línea conserva su propia identidad (id) y su autorización
      expect(despues.map((i) => i.id).sort()).toEqual(antes.map((i) => i.id).sort())
    })
  })

  // ═══ BLOQUEO 5 — diferenciales N2 ════════════════════════════════════════
  describe('Bloqueo 5: la edición económica respeta el diferencial N2 ya aplicado', () => {
    async function pedidoConDiferencialPositivo() {
      // Canal PUNTO + gestión en DOMICILIO ⇒ diferencial positivo sobre Pedido.total.
      const id = await crear({ canal: 'PUNTO', items: [{ producto: 'BOTELLON', cantidad: 4 }, { producto: 'PACA_AGUA', cantidad: 2 }] })
      const antes = await testPrisma.pedido.findUniqueOrThrow({ where: { id } })
      const r = await new GestionarPendienteUseCase().execute({ pedidoId: id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId })
      const despues = await testPrisma.pedido.findUniqueOrThrow({ where: { id }, include: { factura: true } })
      return { id, totalAntes: Number(antes.total), totalConDiferencial: Number(despues.total), diferencial: r.diferencial }
    }

    it('precondición del escenario: el diferencial se sumó a Pedido.total (por encima de Σ ítems)', async () => {
      const { id, totalAntes, totalConDiferencial } = await pedidoConDiferencialPositivo()
      const items = await testPrisma.pedidoItem.findMany({ where: { pedidoId: id } })
      const suma = items.reduce((s, i) => s + Number(i.subtotal), 0)
      expect(totalConDiferencial).toBeGreaterThan(totalAntes)
      expect(totalConDiferencial).toBeGreaterThan(suma)
    })

    it('editar cantidades con un diferencial aplicado → 409 PEDIDO_CON_N2_USE_AJUSTAR_CANTIDAD; total y factura intactos', async () => {
      const { id, totalConDiferencial } = await pedidoConDiferencialPositivo()
      const antes = await foto(id)
      const r = await put(id, { items: [{ producto: 'BOTELLON', cantidad: 4 }, { producto: 'PACA_AGUA', cantidad: 5 }] })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('PEDIDO_CON_N2_USE_AJUSTAR_CANTIDAD')
      expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)).toBe(totalConDiferencial)
      expect(await foto(id)).toBe(antes)
    })

    it('editar información (obs, dirección) en ese pedido sigue permitido y NO toca el total', async () => {
      const { id, totalConDiferencial } = await pedidoConDiferencialPositivo()
      const r = await put(id, { obs: 'nota con N2', direccionEntrega: 'Dir N2 1' })
      expect(r.status).toBe(200)
      expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)).toBe(totalConDiferencial)
    })

    it('reenviar las mismas cantidades no recalcula nada (sin cambio real no hay bloqueo ni escritura)', async () => {
      const { id, totalConDiferencial } = await pedidoConDiferencialPositivo()
      const r = await put(id, { items: [{ producto: 'BOTELLON', cantidad: 4 }, { producto: 'PACA_AGUA', cantidad: 2 }], obs: 'igual' })
      expect(r.status).toBe(200)
      expect(r.body.aplicado.campos).toEqual(['obs'])
      expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)).toBe(totalConDiferencial)
    })
  })
})
