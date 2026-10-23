// @tests PR-1A — integridad del procesamiento de pedidos en el cierre de embarque
// (AB-ALS-EMB-2026-10-13 + Adenda v1.2): B-08, B-11, B-12, B-13.
//
// Origen: pruebas rojas del borrador PR-0 (#296), incorporadas aquí donde el
// fix las hace pasar. B-01 y B-09 NO están en este archivo: dependen de PR-1B/1C
// (evento físico vivo + conciliación por misión) y permanecen en PR-0.
// Datos 100% sintéticos; los montos del caso #331 (2 BOTELLON, $15.000) se
// reproducen anonimizados.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

// Contrato HTTP del cierre: se invoca el handler REAL de la ruta con sesión ADMIN simulada.
const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
  requireOwnership: vi.fn(async () => true),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

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

/** Embarque EN_RUTA con la carga legacy (`EmbarqueProducto.cargadas`) indicada. */
async function crearEmbarque(carga: Partial<Record<Producto, number>>) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `PR0 ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
  for (const [producto, cargadas] of Object.entries(carga)) {
    await testPrisma.embarqueProducto.create({ data: { embarqueId: embarque.id, producto, cargadas } })
  }
  return embarque
}

/**
 * Pedido prepago (totalPagado = total) EN_RUTA en `embarqueId`, con `entAcum`
 * unidades ya entregadas en misiones anteriores (cumplimiento comercial
 * acumulado). Productos: PACA_AGUA a $1.000 o BOTELLON (fab) a $7.500.
 */
async function crearPedidoPrepago(opts: {
  embarqueId: string
  producto: Producto
  cantPedido: number
  entAcum?: number
  /** Solo BOTELLON: columna legacy Fab (PUNTO) o Dom (DOMICILIO). */
  botellonCanal?: 'FAB' | 'DOM'
}) {
  const { embarqueId, producto, cantPedido, entAcum = 0, botellonCanal = 'FAB' } = opts
  const precio = producto === 'PACA_AGUA' ? 1_000 : 7_500
  const total = precio * cantPedido
  const legacy =
    producto === 'PACA_AGUA'
      ? { cPacaAguaPed: cantPedido, cPacaAguaEnt: entAcum, precioPacaAgua: precio }
      : botellonCanal === 'FAB'
        ? { cBotellonFabPed: cantPedido, cBotellonFabEnt: entAcum, precioBotellonFab: precio }
        : { cBotellonDomPed: cantPedido, cBotellonDomEnt: entAcum, precioBotellonDom: precio }
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      // Revisión de PR-1A: el canal debe ser coherente con la columna legacy del
      // botellón (`Pedido.toLegacyFields`: PUNTO -> Fab, DOMICILIO -> Dom).
      canal: producto === 'BOTELLON' && botellonCanal === 'FAB' ? 'PUNTO' : 'DOMICILIO',
      origen: 'PEDIDO',
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'ANTICIPADO',
      embarqueId,
      ...legacy,
      items: { create: [{ producto, cantPedido, cantEntrega: entAcum, precio, subtotal: total }] },
    },
  })
  await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: total, confirmacion: 'CONFIRMADO' } })
  const factura = await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA',
    },
  })
  return { pedido, factura }
}

function entregaDe(producto: Producto, n: number) {
  return producto === 'PACA_AGUA'
    ? { ...SIN_ENTREGA, cPacaAguaEnt: n }
    : { ...SIN_ENTREGA, cBotellonFabEnt: n }
}


describe('PR-1A — integridad del procesamiento de pedidos en el cierre', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    authUser.id = adminId
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'PR0 Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1', activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  // ── B-08 (P0): NO_ENTREGADO borra cumplimiento histórico ────────────────
  describe('B-08 — NO_ENTREGADO no borra lo ya entregado', () => {
    it('prueba 4: pedido de 10 con 3 acumuladas, NO_ENTREGADO en E2 → el acumulado sigue en 3 (pedido e ítem)', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cPacaAguaEnt).toBe(3)
      expect(p.items[0].cantEntrega).toBe(3)
      // 0 < acumulado < pedido → pendiente replanificable (adenda §4, B-08).
      expect(p.estadoEntrega).toBe('PENDIENTE')
    })
  })

  // ── B-12 (P0): COMPLETO sin completitud ─────────────────────────────────
  describe('B-12 — COMPLETO exige cantidad acumulada completa', () => {
    it.each([0, 2])(
      'prueba 5: pedido de 10 con 3 acumuladas, COMPLETO con delta %i → se rechaza y nada cambia (estado, factura, ledger)',
      async (delta) => {
        const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
        const { pedido, factura } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

        const ejecutar = buildUseCase().execute({
          id: emb2.id,
          pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', delta), pagos: [] }],
          gastos: [],
          dineroEntregado: 0,
        })
        await expect(ejecutar).rejects.toThrow()

        const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
        expect(p.estadoEntrega).not.toBe('ENTREGADO')
        expect(p.cPacaAguaEnt).toBe(3)
        const f = await testPrisma.factura.findUniqueOrThrow({ where: { id: factura.id } })
        expect(f.fecha.getTime()).toBe(factura.fecha.getTime())
        expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb2.id } })).estado).toBe('EN_RUTA')
        expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb2.id } })).toBe(0)
      },
    )
  })

  // ── B-11 (P1): auditoría de precio falsa ────────────────────────────────
  describe('B-11 — PRECIO_CIERRE solo si cambió el precio unitario', () => {
    it('prueba 7: precio congelado igual; COMPLETO del remanente (7 de 10) → 0 Historial.PRECIO_CIERRE', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 7), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const h = await testPrisma.historial.count({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'PRECIO_CIERRE' } })
      expect(h).toBe(0)
    })
  })

  // ── B-13 (hallazgo nuevo de PR-0): ítems BOTELLON no se actualizan ──────
  describe('B-13 — la rama COMPLETO actualiza PedidoItem de BOTELLON', () => {
    it('pedido de 2 BOTELLON entregado COMPLETO → PedidoItem.cantEntrega = 2 (el ítem se llama BOTELLON)', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('BOTELLON', 2), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cBotellonFabEnt).toBe(2)
      expect(p.items.find((i) => i.producto === 'BOTELLON')?.cantEntrega).toBe(2)
    })
  })

  // ── Casos adicionales del diseño de PR-1A ───────────────────────────────
  describe('B-08 — bordes', () => {
    it('sin nada entregado antes, NO_ENTREGADO sigue siendo NO_ENTREGADO y desasigna (comportamiento previo)', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }], gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.estadoEntrega).toBe('NO_ENTREGADO')
      expect(p.embarqueId).toBeNull()
      expect(p.cPacaAguaEnt).toBe(0)
    })

    it('pedido ya totalmente entregado (10/10): declarar NO_ENTREGADO no lo degrada ni borra su cumplimiento', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 0 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 10 })
      await testPrisma.pedido.update({
        where: { id: pedido.id },
        data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' },
      })

      await buildUseCase().execute({
        id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }], gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(p.cPacaAguaEnt).toBe(10)
      expect(p.items[0].cantEntrega).toBe(10)
    })

    it('con acumulado 3 y reasignación a otro embarque: se conserva el acumulado y solo se mueve la referencia de planificación', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 7 })
      const destino = await crearEmbarque({})
      await testPrisma.embarque.update({ where: { id: destino.id }, data: { estado: 'ABIERTO' } })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await buildUseCase().execute({
        id: emb2.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', nuevoEmbarqueId: destino.id, pagos: [] }],
        gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.embarqueId).toBe(destino.id)
      expect(p.cPacaAguaEnt).toBe(3)
      expect(p.items[0].cantEntrega).toBe(3)
      expect(Number(p.totalPagado)).toBe(10_000) // dinero intacto
    })
  })

  describe('B-12 — bordes', () => {
    it('sobreentrega: 3 acumuladas + 8 en el cierre (11 > 10) → se rechaza y nada cambia', async () => {
      const emb2 = await crearEmbarque({ PACA_AGUA: 8 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb2.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 3 })

      await expect(
        buildUseCase().execute({
          id: emb2.id,
          pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 8), pagos: [] }],
          gastos: [], dineroEntregado: 0,
        }),
      ).rejects.toThrow(/ENTREGA_EXCEDE_PEDIDO/)

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.cPacaAguaEnt).toBe(3)
      expect(p.estadoEntrega).not.toBe('ENTREGADO')
    })

    it('COMPLETO sin productosEntregados sobre un pedido fresco → se rechaza (antes quedaba ENTREGADO con 0 entregadas)', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await expect(
        buildUseCase().execute({
          id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', pagos: [] }], gastos: [], dineroEntregado: 0,
        }),
      ).rejects.toThrow(/ENTREGA_INCOMPLETA/)

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.estadoEntrega).not.toBe('ENTREGADO')
    })

    it('pedido ya completo (10/10) + COMPLETO con delta 0 → se acepta y NO se degrada ni se reescribe el cumplimiento', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 0 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10, entAcum: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 0), pagos: [] }],
        gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(p.cPacaAguaEnt).toBe(10)
      expect(p.items[0].cantEntrega).toBe(10)
    })
  })

  describe('B-11 — prueba 8: cambio autorizado del precio unitario', () => {
    // #326 (decisión del PO 2026-10-23, ADR-MONETARIO-001 addendum): esta prueba fijaba que la
    // obligación NO se tocaba al corregir un precio; ahora la corrección con motivo la recalcula.
    // La auditoría PRECIO_CIERRE (antes/después, valor entregado aparte) se conserva.
    it('ADMIN cambia el precio de PACA_AGUA de $1.000 a $1.200 → 1 PRECIO_CIERRE con antes/después y motivo; el valor entregado va aparte y la obligación se recalcula', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido, factura } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{
          pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 10),
          preciosReales: { pacaAgua: 1_200 }, motivoPrecio: 'Acuerdo con el cliente en la puerta', pagos: [],
        }],
        gastos: [], dineroEntregado: 0,
      })

      const filas = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'PRECIO_CIERRE' } })
      expect(filas).toHaveLength(1)
      const datos = JSON.parse(String(filas[0].datos))
      expect(datos.cambios).toEqual([{ producto: 'PACA_AGUA', antes: 1_000, despues: 1_200 }])
      expect(datos.valorEntregadoEnCierre).toBe(12_000)
      expect(datos).toMatchObject({ motivo: 'Acuerdo con el cliente en la puerta', totalAntes: 10_000, totalDespues: 12_000, saldoDespues: 2_000 })
      // el valor entregado NO se presenta como "precio del pedido"
      expect(datos).not.toHaveProperty('precioCierre')

      // Ya pagó $10.000: el total sube a $12.000 y quedan $2.000 por cobrar (pedido y factura).
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect([Number(p.total), Number(p.totalPagado), Number(p.saldo), p.estadoPago]).toEqual([12_000, 10_000, 2_000, 'PARCIAL'])
      const f = await testPrisma.factura.findUniqueOrThrow({ where: { id: factura.id } })
      expect([Number(f.total), Number(f.saldo)]).toEqual([12_000, 2_000])
    })
  })

  describe('B-13 — bordes', () => {
    it('pedido de 10 PACA_AGUA COMPLETO → PedidoItem.cantEntrega = 10 y precio conservado', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 10), pagos: [] }],
        gastos: [], dineroEntregado: 0,
      })

      const it0 = (await testPrisma.pedidoItem.findMany({ where: { pedidoId: pedido.id } }))[0]
      expect(it0.cantEntrega).toBe(10)
      expect(Number(it0.precio)).toBe(1_000)
    })

    it('botellón del canal DOMICILIO (columna Dom): el ítem BOTELLON recibe cantidad y precio de la columna Dom', async () => {
      const emb = await crearEmbarque({ BOTELLON: 2 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'BOTELLON', cantPedido: 2, botellonCanal: 'DOM' })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{
          pedidoId: pedido.id, entregado: 'COMPLETO', pagos: [],
          productosEntregados: { ...SIN_ENTREGA, cBotellonDomEnt: 2 },
        }],
        gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.cBotellonDomEnt).toBe(2)
      const item = p.items.find((i) => i.producto === 'BOTELLON')
      expect(item?.cantEntrega).toBe(2)
      expect(Number(item?.precio)).toBe(7_500)
    })
  })


  // ── Revisión de PR-1A: B-08 por producto, no por suma ───────────────────
  describe('B-08 — completitud por PRODUCTO (no por la suma total)', () => {
    async function pedidoDosProductos(embarqueId: string, ent: { paca: number; bolsa: number }) {
      const total = 10 * 1_000 + 5 * 500
      const pedido = await testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', total, totalPagado: total, saldo: 0,
          estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', estadoPago: 'ANTICIPADO', embarqueId,
          cPacaAguaPed: 10, cPacaAguaEnt: ent.paca, precioPacaAgua: 1_000,
          cBolsaAguaPed: 5, cBolsaAguaEnt: ent.bolsa, precioBolsaAgua: 500,
          items: { create: [
            { producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: ent.paca, precio: 1_000, subtotal: 10_000 },
            { producto: 'BOLSA_AGUA', cantPedido: 5, cantEntrega: ent.bolsa, precio: 500, subtotal: 2_500 },
          ] },
        },
      })
      await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: total, confirmacion: 'CONFIRMADO' } })
      return pedido
    }

    it('suma igual (15 = 10 + 5) pero líneas inconsistentes (15 paca / 0 bolsa): NO se da por completo; se rechaza con ENTREGA_INCONSISTENTE y nada cambia', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const pedido = await pedidoDosProductos(emb.id, { paca: 15, bolsa: 0 })

      await expect(
        buildUseCase().execute({
          id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }], gastos: [], dineroEntregado: 0,
        }),
      ).rejects.toThrow(/ENTREGA_INCONSISTENTE/)

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.cPacaAguaEnt).toBe(15)
      expect(p.cBolsaAguaEnt).toBe(0)
      expect(p.estadoEntrega).toBe('EN_RUTA')
    })

    it('un producto completo (10/10) y otro sin entregar (0/5): PENDIENTE y se conserva cada acumulado', async () => {
      const emb = await crearEmbarque({ BOLSA_AGUA: 5 } as never)
      const pedido = await pedidoDosProductos(emb.id, { paca: 10, bolsa: 0 })

      await buildUseCase().execute({
        id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }], gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
      expect(p.estadoEntrega).toBe('PENDIENTE')
      expect(p.cPacaAguaEnt).toBe(10)
      expect(p.cBolsaAguaEnt).toBe(0)
      expect(p.items.find((i) => i.producto === 'PACA_AGUA')?.cantEntrega).toBe(10)
      expect(p.items.find((i) => i.producto === 'BOLSA_AGUA')?.cantEntrega).toBe(0)
    })

    it('ambos productos completos (10/10 y 5/5): no se degrada', async () => {
      const emb = await crearEmbarque({})
      const pedido = await pedidoDosProductos(emb.id, { paca: 10, bolsa: 5 })
      await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' } })

      await buildUseCase().execute({
        id: emb.id, pedidos: [{ pedidoId: pedido.id, entregado: 'NO_ENTREGADO', pagos: [] }], gastos: [], dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(p.cPacaAguaEnt).toBe(10)
      expect(p.cBolsaAguaEnt).toBe(5)
    })
  })

  // ── Revisión de PR-1A: auditoría de precio también en PARCIAL ───────────
  describe('B-11 — auditoría de precio unitario en entrega PARCIAL', () => {
    // #326 (decisión del PO 2026-10-23): la corrección de precio con motivo recalcula la obligación
    // de TODO el pedido también en PARCIAL (antes: «la obligación NO se toca»); sin ella, la entrega
    // parcial por sí sola sigue sin tocar la obligación (ver «PARCIAL sin cambio de precio»).
    it('ADMIN cambia $1.000 -> $1.200 en una entrega PARCIAL (4 de 10): 1 PRECIO_CIERRE antes/después y motivo; el total, saldo y factura se recalculan sobre todo el pedido', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 4 })
      const { pedido, factura } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{
          pedidoId: pedido.id, entregado: 'PARCIAL', productosEntregados: entregaDe('PACA_AGUA', 4),
          preciosReales: { pacaAgua: 1_200 }, motivoPrecio: 'Acuerdo con el cliente en la puerta', pagos: [],
        }],
        gastos: [], dineroEntregado: 0,
      })

      const filas = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'PRECIO_CIERRE' } })
      expect(filas).toHaveLength(1)
      const datos = JSON.parse(String(filas[0].datos))
      expect(datos.cambios).toEqual([{ producto: 'PACA_AGUA', antes: 1_000, despues: 1_200 }])
      // Valor entregado AHORA con el precio vigente (el corregido), igual que en COMPLETO.
      expect(datos.valorEntregadoEnCierre).toBe(4 * 1_200)

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect([Number(p.total), Number(p.totalPagado), Number(p.saldo)]).toEqual([12_000, 10_000, 2_000])
      const f = await testPrisma.factura.findUniqueOrThrow({ where: { id: factura.id } })
      expect([Number(f.total), Number(f.saldo)]).toEqual([12_000, 2_000])
    })

    it('PARCIAL sin cambio de precio: 0 PRECIO_CIERRE', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 4 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'PARCIAL', productosEntregados: entregaDe('PACA_AGUA', 4), pagos: [] }],
        gastos: [], dineroEntregado: 0,
      })

      expect(await testPrisma.historial.count({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'PRECIO_CIERRE' } })).toBe(0)
    })
  })

  // ── Contrato HTTP: mismos payloads de los 2 E2E que cambian de COMPLETO a PARCIAL ──
  describe('Contrato HTTP de POST /api/embarques/[id]/cerrar (payloads de e2e/embarques.spec.ts)', () => {
    async function pedidoSinPago(embarqueId: string, cantidad: number, precio: number) {
      const total = cantidad * precio
      return testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', total, totalPagado: 0, saldo: total,
          estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', estadoPago: 'PENDIENTE', embarqueId,
          cPacaAguaPed: cantidad, precioPacaAgua: precio,
          items: { create: [{ producto: 'PACA_AGUA', cantPedido: cantidad, cantEntrega: 0, precio, subtotal: total }] },
        },
      })
    }
    const cuerpo = (pedidoId: string, entregado: 'COMPLETO' | 'PARCIAL', entregadas: number, pago: number) => ({
      pedidos: [{
        pedidoId, entregado,
        productosEntregados: { cPacaAguaEnt: entregadas, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        preciosReales: { pacaAgua: 2600, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
        pagado: 'COMPLETO', pagos: [{ metodo: 'EFECTIVO', monto: pago }],
      }],
      ventasLibres: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
    })
    async function llamarCierre(embarqueId: string, body: unknown) {
      const { POST } = await import('@/app/api/embarques/[id]/cerrar/route')
      const req = { json: async () => body } as unknown as import('next/server').NextRequest
      const res = await POST(req, { params: Promise.resolve({ id: embarqueId }) })
      return { status: res.status, json: (await res.json()) as Record<string, unknown> }
    }

    it('COMPLETO con faltante (3 de 5) -> 400 accionable; el pedido, el pago y el embarque quedan intactos', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await pedidoSinPago(emb.id, 5, 2_600)

      const r = await llamarCierre(emb.id, cuerpo(pedido.id, 'COMPLETO', 3, 7_800))

      expect(r.status).toBe(400)
      expect(r.json.success).not.toBe(true)
      expect(JSON.stringify(r.json)).toMatch(/no está completo/)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(p.estadoEntrega).not.toBe('ENTREGADO')
      expect(p.cPacaAguaEnt).toBe(0)
      expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(0)
      expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('EN_RUTA')
    })

    it('el mismo cierre como PARCIAL (3 de 5) -> 200, pedido PENDIENTE con 3 entregadas, pago de misión registrado y embarque CERRADO', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 5 })
      const pedido = await pedidoSinPago(emb.id, 5, 2_600)

      const r = await llamarCierre(emb.id, cuerpo(pedido.id, 'PARCIAL', 3, 7_800))

      expect(r.status).toBe(200)
      expect(r.json.success).toBe(true)
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { pagos: true } })
      expect(p.estadoEntrega).toBe('PENDIENTE')
      expect(p.cPacaAguaEnt).toBe(3)
      expect(p.pagos).toHaveLength(1)
      expect(p.pagos[0].embarqueId).toBe(emb.id)
      expect(Number(p.totalPagado)).toBe(7_800)
      expect((await testPrisma.embarque.findUniqueOrThrow({ where: { id: emb.id } })).estado).toBe('CERRADO')
    })
  })


  // ── Guardas: pasan hoy y deben seguir pasando tras el fix ───────────────
  describe('Guardas (verdes hoy)', () => {
    it('[GUARDA] prueba 6: cobro previo 100% y entrega física ahora → sin Pago nuevo, saldo 0, sin fiado', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })

      await buildUseCase().execute({
        id: emb.id,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO', productosEntregados: entregaDe('PACA_AGUA', 10), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      })

      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(Number(p.total)).toBe(10_000)
      expect(Number(p.totalPagado)).toBe(10_000)
      expect(Number(p.saldo)).toBe(0)
      expect(p.estadoEntrega).toBe('ENTREGADO')
      expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(1)
      expect(await testPrisma.pago.count({ where: { embarqueId: emb.id } })).toBe(0)
    })

    it('[GUARDA] prueba 10 (replay): el mismo cierre con el mismo offlineId no duplica pedidos, pagos ni movimientos', async () => {
      const emb = await crearEmbarque({ PACA_AGUA: 10 })
      const { pedido } = await crearPedidoPrepago({ embarqueId: emb.id, producto: 'PACA_AGUA', cantPedido: 10 })
      const input = {
        id: emb.id,
        offlineId: `pr0-replay-${emb.id}`,
        pedidos: [{ pedidoId: pedido.id, entregado: 'COMPLETO' as const, productosEntregados: entregaDe('PACA_AGUA', 10), pagos: [] }],
        gastos: [],
        dineroEntregado: 0,
      }

      await buildUseCase().execute(input)
      const movs1 = await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb.id } })
      const pagos1 = await testPrisma.pago.count({ where: { pedidoId: pedido.id } })
      await buildUseCase().execute(input)

      expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: emb.id } })).toBe(movs1)
      expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(pagos1)
    })
  })
})
