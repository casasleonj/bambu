// @tests Fase 2 — suficiencia de domicilio con ubicación PROPIA del pedido.
// Regla: dirección escrita O ubicación utilizable; el barrio solo nunca basta;
// CONSUMIDOR_FINAL ya no está exento si la operación deja mercancía pendiente.
// Verifica contra Postgres real:
//   1. Matriz [cliente real | CF] × [texto | coords propias | solo barrio | nada]
//      × [entrega ahora | posterior] con paridad Preview ↔ Crear.
//   2. `entregaLat/entregaLng` se persisten y NO son `gpsLat/gpsLng`.
//   3. Actualizar: solo revalida si cambia el destino efectivo; observaciones y
//      pedidos cerrados no se bloquean por insuficiencias históricas.
//   4. Recurrentes: plantilla sin destino se salta con motivo, sin pedido,
//      crédito ni factura, y sin afectar a las demás.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'
import { PreviewPedidoUseCase } from '@/modules/pedidos/application/use-cases/PreviewPedidoUseCase'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { ActualizarPedidoUseCase } from '@/modules/pedidos/application/use-cases/ActualizarPedidoUseCase'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { getPrecioMinimos } from '@/lib/pricing'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'
import { generarPedidosRecurrentes } from '@/lib/recurrentes'

const pedidoRepo = new PrismaPedidoRepository()
const clienteRepo = new PrismaClienteRepository()

const preview = () => new PreviewPedidoUseCase({
  pricingPort: new PrismaPricingAdapter(), clienteRepo, pedidoRepo,
  getFiadoStatusUseCase: new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
  getPrecioMinimos, resolverCoordsDeLink,
})
const crear = () => new CrearPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), new PrismaPagoRepository(),
  clienteRepo, new PrismaPricingAdapter(), new PrismaTransactionManager(),
  resolverCoordsDeLink, new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
)
const actualizar = () => new ActualizarPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), clienteRepo,
  new PrismaPricingAdapter(), new PrismaTransactionManager(), resolverCoordsDeLink,
)

const ITEMS = [{ producto: 'PACA_AGUA' as const, cantidad: 2 }]
const PAGO_COMPLETO = (monto: number) => [{ metodo: 'EFECTIVO' as const, monto }]

describe('Fase 2 — suficiencia de domicilio (Postgres real)', () => {
  let adminId: string
  let clienteSinDestinoId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteSinDestinoId = (await testPrisma.cliente.create({
      data: { nombre: 'Sin destino', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
    })).id
  })
  afterAll(async () => { await disconnect() })

  type Destino = { direccionEntrega?: string; barrioEntrega?: string; entregaLat?: number; entregaLng?: number }
  const DESTINOS: Array<[string, Destino, boolean]> = [
    ['texto', { direccionEntrega: 'Cra 9 # 80-10' }, true],
    ['coords propias', { entregaLat: 4.711, entregaLng: -74.0721 }, true],
    ['solo barrio', { barrioEntrega: 'Chapinero' }, false],
    ['nada', {}, false],
  ]

  async function totalDe(clienteId: string, destino: Destino, origen: 'PEDIDO' | 'VENTA_RAPIDA') {
    const p = await preview().execute({ clienteId, canal: 'DOMICILIO', origen, items: ITEMS, actorId: adminId, ...destino, ...(origen === 'VENTA_RAPIDA' ? { entregado: false } : {}) })
    return p.calculation.total
  }

  describe.each([
    ['cliente real', 'real'],
    ['CONSUMIDOR_FINAL', 'cf'],
  ] as const)('%s con entrega POSTERIOR', (_nombre, tipo) => {
    it.each(DESTINOS)('destino %s → Preview y Crear deciden igual', async (_d, destino, suficiente) => {
      const clienteId = tipo === 'cf' ? 'CONSUMIDOR_FINAL' : clienteSinDestinoId
      const origen = tipo === 'cf' ? 'VENTA_RAPIDA' : 'PEDIDO'
      const total = await totalDe(clienteId, destino, origen)
      const p = await preview().execute({
        clienteId, canal: 'DOMICILIO', origen, items: ITEMS, actorId: adminId, ...destino,
        ...(tipo === 'cf' ? { entregado: false, pagos: PAGO_COMPLETO(total) } : {}),
      })
      expect(p.permissions.canCreate, 'preview').toBe(suficiente)

      const offlineId = uniqueId('f2-matriz')
      const intento = crear().execute({
        clienteId, canal: 'DOMICILIO', origen, items: ITEMS,
        pagos: tipo === 'cf' ? PAGO_COMPLETO(total) : [],
        ...(tipo === 'cf' ? { entregado: false } : {}),
        ...destino, createdById: adminId, createdByRole: 'ADMIN', offlineId,
      })
      if (suficiente) {
        const { pedido } = await intento
        const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
        expect(row.estadoEntrega).toBe('PENDIENTE')
        // la ubicación propia se persiste en su columna y nunca en el GPS de comprobación
        expect(row.gpsLat).toBeNull()
        expect(row.gpsLng).toBeNull()
        if (destino.entregaLat !== undefined) {
          expect(Number(row.entregaLat)).toBeCloseTo(destino.entregaLat, 5)
          expect(Number(row.entregaLng)).toBeCloseTo(destino.entregaLng!, 5)
        }
      } else {
        await expect(intento).rejects.toThrow('ENTREGA_INSUFICIENTE')
        expect(await testPrisma.pedido.findFirst({ where: { offlineId } })).toBeNull()
        expect(await testPrisma.pago.findFirst({ where: { offlineId } })).toBeNull()
      }
    })
  })

  // ── Regla de negocio: la dirección/barrio SOLO se piden cuando el canal es
  // DOMICILIO. Una venta en PUNTO (anónima o con cliente) nunca las exige,
  // ni aunque sea "entregar después". Mismos resultados que `main`.
  describe('PUNTO nunca exige dirección ni barrio (no es regresión)', () => {
    const casos: Array<[string, { cliente: 'cf' | 'real'; origen: 'PEDIDO' | 'VENTA_RAPIDA'; canal: 'PUNTO' | 'DOMICILIO'; entregado?: boolean }, boolean]> = [
      ['anónimo, venta rápida, PUNTO', { cliente: 'cf', origen: 'VENTA_RAPIDA', canal: 'PUNTO' }, true],
      ['anónimo, venta rápida, PUNTO, entregar después', { cliente: 'cf', origen: 'VENTA_RAPIDA', canal: 'PUNTO', entregado: false }, true],
      ['anónimo, venta rápida del Hub (canal DOMICILIO por defecto, entregado)', { cliente: 'cf', origen: 'VENTA_RAPIDA', canal: 'DOMICILIO', entregado: true }, true],
      ['cliente real sin dirección, PUNTO', { cliente: 'real', origen: 'PEDIDO', canal: 'PUNTO' }, true],
      ['cliente real sin dirección, PUNTO, entregar después', { cliente: 'real', origen: 'PEDIDO', canal: 'PUNTO', entregado: false }, true],
      ['cliente real sin dirección, DOMICILIO (la regla sí aplica)', { cliente: 'real', origen: 'PEDIDO', canal: 'DOMICILIO' }, false],
      ['anónimo, DOMICILIO con entrega posterior (la regla sí aplica)', { cliente: 'cf', origen: 'VENTA_RAPIDA', canal: 'DOMICILIO', entregado: false }, false],
    ]
    it.each(casos)('%s', async (_n, c, debeCrear) => {
      const clienteId = c.cliente === 'cf' ? 'CONSUMIDOR_FINAL' : clienteSinDestinoId
      const base = { clienteId, canal: c.canal, origen: c.origen, items: ITEMS, ...(c.entregado === undefined ? {} : { entregado: c.entregado }) }
      const p = await preview().execute({ ...base, actorId: adminId })
      const total = p.calculation.total
      const pagos = c.cliente === 'cf' ? PAGO_COMPLETO(total) : []
      const pPago = await preview().execute({ ...base, pagos, actorId: adminId })
      expect(pPago.permissions.canCreate, 'preview').toBe(debeCrear)
      const intento = crear().execute({ ...base, pagos, createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('f2-punto-matriz') })
      if (debeCrear) await expect(intento).resolves.toBeDefined()
      else await expect(intento).rejects.toThrow('ENTREGA_INSUFICIENTE')
    })
  })

  it('CF con entrega AHORA (mostrador): NO exige destino futuro y no persiste ubicación', async () => {
    const total = await totalDe('CONSUMIDOR_FINAL', {}, 'VENTA_RAPIDA')
    const { pedido } = await crear().execute({
      clienteId: 'CONSUMIDOR_FINAL', canal: 'DOMICILIO', origen: 'VENTA_RAPIDA', items: ITEMS,
      pagos: PAGO_COMPLETO(total || 1), entregado: true,
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('f2-ahora'),
    })
    const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(row.estadoEntrega).toBe('ENTREGADO')
    expect(row.entregaLat).toBeNull()
  })

  it('ubicación inválida ((0,0) o a medias) se rechaza y no persiste', async () => {
    for (const ubic of [{ entregaLat: 0, entregaLng: 0 }, { entregaLat: 4.7 }]) {
      const offlineId = uniqueId('f2-inval')
      await expect(crear().execute({
        clienteId: clienteSinDestinoId, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
        ...ubic, createdById: adminId, createdByRole: 'ADMIN', offlineId,
      })).rejects.toThrow('UBICACION_ENTREGA_INVALIDA')
      expect(await testPrisma.pedido.findFirst({ where: { offlineId } })).toBeNull()
    }
  })

  it('ubicación en canal PUNTO → UBICACION_SOLO_DOMICILIO', async () => {
    await expect(crear().execute({
      clienteId: clienteSinDestinoId, canal: 'PUNTO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      entregaLat: 4.7, entregaLng: -74.05, createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('f2-punto'),
    })).rejects.toThrow('UBICACION_SOLO_DOMICILIO')
  })

  it('idempotencia: reenviar el mismo borrador corregido tras un 422 no duplica pedido', async () => {
    const offlineId = uniqueId('f2-corregir')
    const base = {
      clienteId: clienteSinDestinoId, canal: 'DOMICILIO' as const, origen: 'PEDIDO' as const, items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN' as const, offlineId,
    }
    await expect(crear().execute(base)).rejects.toThrow('ENTREGA_INSUFICIENTE')
    const corregido = { ...base, direccionEntrega: 'Cra 15 # 30-20' }
    const a = await crear().execute(corregido)
    const b = await crear().execute(corregido)
    expect(b.pedido.id).toBe(a.pedido.id)
    expect(await testPrisma.pedido.count({ where: { offlineId } })).toBe(1)
  })

  describe('Actualizar (D2)', () => {
    async function pendienteConDestino() {
      const c = await testPrisma.cliente.create({
        data: { nombre: 'Edit F2', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
      })
      const { pedido } = await crear().execute({
        clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
        entregaLat: 4.7, entregaLng: -74.05, createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('f2-upd'),
      })
      return { pedidoId: pedido.id, clienteId: c.id }
    }

    it('quitar la única ubicación de un pendiente → ENTREGA_INSUFICIENTE y no persiste', async () => {
      const { pedidoId } = await pendienteConDestino()
      await expect(actualizar().execute({ pedidoId, items: ITEMS, entregaLat: null, entregaLng: null, usuarioId: adminId }))
        .rejects.toThrow('ENTREGA_INSUFICIENTE')
      const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
      expect(Number(row.entregaLat)).toBeCloseTo(4.7, 5)
    })

    it('editar SOLO observaciones de un pedido con insuficiencia histórica NO se bloquea', async () => {
      const c = await testPrisma.cliente.create({
        data: { nombre: 'Hist', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
      })
      // pedido legado sin destino (insertado directo: historia previa a la regla)
      const { pedido: creado } = await crear().execute({
        clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
        entregaLat: 4.7, entregaLng: -74.05, createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('f2-legado'),
      })
      const legado = await testPrisma.pedido.update({ where: { id: creado.id }, data: { entregaLat: null, entregaLng: null } })
      await expect(actualizar().execute({ pedidoId: legado.id, obs: 'llamar antes', usuarioId: adminId })).resolves.toBeDefined()
      const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: legado.id } })
      expect(row.obs).toBe('llamar antes')
    })

    it('un pedido ENTREGADO no admite cambiar su ubicación (historia cerrada)', async () => {
      const { pedidoId } = await pendienteConDestino()
      await testPrisma.pedido.update({ where: { id: pedidoId }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      await expect(actualizar().execute({ pedidoId, entregaLat: 4.8, entregaLng: -74.1, usuarioId: adminId }))
        .rejects.toThrow('PEDIDO_CERRADO')
      const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
      expect(Number(row.entregaLat)).toBeCloseTo(4.7, 5)
    })
  })

  describe('Recurrentes (D4)', () => {
    it('plantilla sin destino utilizable se salta con motivo: sin pedido, sin crédito ni factura; las demás se generan', async () => {
      const hoy = new Date()
      const mkCliente = (nombre: string, direccion: string | null) => testPrisma.cliente.create({
        data: { nombre, telefono: uniqueId('t'), direccion, barrio: null, activo: true },
      })
      const sin = await mkCliente('Rec sin destino', null)
      const con = await mkCliente('Rec con destino', 'Cra 7 # 10-20')
      const mkPlantilla = (clienteId: string) => testPrisma.plantillaRecurrente.create({
        data: {
          clienteId, activo: true, cadaNDias: 1, tipo: 'ENVIO', canal: 'DOMICILIO', proxGeneracion: hoy,
          productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] },
        },
      })
      const pSin = await mkPlantilla(sin.id)
      const pCon = await mkPlantilla(con.id)
      const saldoAntes = (await testPrisma.cliente.findUniqueOrThrow({ where: { id: sin.id } })).saldoFavor

      const r = await generarPedidosRecurrentes(
        [{ recurrenteId: pSin.id, decision: 'NORMAL' }, { recurrenteId: pCon.id, decision: 'NORMAL' }],
        hoy,
      )

      expect(await testPrisma.pedido.count({ where: { clienteId: sin.id } })).toBe(0)
      expect(await testPrisma.factura.count({ where: { clienteId: sin.id } })).toBe(0)
      expect((await testPrisma.cliente.findUniqueOrThrow({ where: { id: sin.id } })).saldoFavor).toEqual(saldoAntes)
      expect(r.omitidos.some((o) => o.recurrenteId === pSin.id)).toBe(true)
      expect(r.generados).toHaveLength(1)
      expect(await testPrisma.pedido.count({ where: { clienteId: con.id } })).toBe(1)
      expect(pCon.id).toBeTruthy()
    })
  })
})
