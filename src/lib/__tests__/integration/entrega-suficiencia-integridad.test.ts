// @tests F-ENTREGA-0 (docs/pedidos/entrega-suficiencia-plan.md): la suficiencia
// de la información de entrega la decide UNA autoridad de dominio
// (`resolverEntrega`), consumida por Preview (proyecta) y Commit (re-valida).
// Un pedido DOMICILIO sin dirección ni ubicación NO se puede crear.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// getFiadoStatusUseCase → getConfigInt → getConfig envuelve la query en
// unstable_cache, que exige un incrementalCache de request Next. Mismo mock
// que preview-pedido-integridad.test.ts.
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

const pedidoRepo = new PrismaPedidoRepository()
const clienteRepo = new PrismaClienteRepository()

function preview() {
  return new PreviewPedidoUseCase({
    pricingPort: new PrismaPricingAdapter(), clienteRepo, pedidoRepo,
    getFiadoStatusUseCase: new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
    getPrecioMinimos, resolverCoordsDeLink,
  })
}
function crear() {
  return new CrearPedidoUseCase(
    pedidoRepo, new PrismaFacturaRepository(), new PrismaPagoRepository(),
    clienteRepo, new PrismaPricingAdapter(), new PrismaTransactionManager(),
    resolverCoordsDeLink,
  )
}
function actualizar() {
  return new ActualizarPedidoUseCase(
    pedidoRepo, new PrismaFacturaRepository(), clienteRepo,
    new PrismaPricingAdapter(), new PrismaTransactionManager(),
    resolverCoordsDeLink,
  )
}

const ITEMS = [{ producto: 'PACA_AGUA' as const, cantidad: 3 }]

describe('F-ENTREGA-0 — suficiencia de entrega (Preview ↔ Commit, misma autoridad)', () => {
  let adminId: string
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })

  it('DOMICILIO sin dirección ni ubicación → preview INSUFICIENTE (bloquea) y commit rechaza', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Sin nada', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('INSUFICIENTE')
    expect(p.permissions.canCreate).toBe(false)
    expect(p.allowedActions).not.toContain('crear')

    await expect(
      crear().execute({
        clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
        createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('e0-block'),
      }),
    ).rejects.toThrow('ENTREGA_INSUFICIENTE')
  })

  it('DOMICILIO con solo barrio → INSUFICIENTE (barrio solo nunca basta)', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Solo barrio', telefono: uniqueId('t'), direccion: null, barrio: 'Kennedy', activo: true },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('INSUFICIENTE')
  })

  it('DOMICILIO con ubicación válida sin dirección → COMPLEMENTARIA, preview y commit OK', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Solo coords', telefono: uniqueId('t'), direccion: null, barrio: null, lat: 4.65, lng: -74.05, geocodeOrigen: 'MANUAL', activo: true },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(p.entrega?.via).toBe('GEO')
    expect(p.permissions.canCreate).toBe(true)

    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('e0-geo'),
    })
    expect(pedido.id).toBeTruthy()
  })

  it('DOMICILIO con dirección sin barrio → SUFICIENTE por texto (complementaria: barrio), commit OK', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Solo direccion', telefono: uniqueId('t'), direccion: 'Cra 15 # 30-20', barrio: null, activo: true },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.via).toBe('TEXTO')
    expect(p.entrega?.faltaComplementario).toEqual(['barrio'])
    expect(p.permissions.canCreate).toBe(true)

    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('e0-txt'),
    })
    expect(pedido.id).toBeTruthy()
  })

  it('PUNTO → siempre SUFICIENTE, no bloquea aunque no haya dirección', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Punto', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'PUNTO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('SUFICIENTE')
    expect(p.permissions.canCreate).toBe(true)
  })

  it('el snapshot de dirección del pedido (override) satisface por vía TEXTO', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Override', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
    })
    const p = await preview().execute({
      clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId,
      direccionEntrega: 'Obra: Cra 9 con Calle 80, portería norte',
    })
    expect(p.entrega?.via).toBe('TEXTO')
    expect(p.permissions.canCreate).toBe(true)
  })

  it('edición: modificar el snapshot de entrega persiste en el Pedido y NO muta el Cliente', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Edit snapshot', telefono: uniqueId('t'), direccion: 'Cra 1 # 1-1', barrio: 'Uno', activo: true },
    })
    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('e-edit-1'),
    })
    await actualizar().execute({
      pedidoId: pedido.id, items: ITEMS,
      direccionEntrega: 'Entrega hoy: bodega Cra 50', barrioEntrega: 'Industrial', usuarioId: adminId,
    })
    const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(row.direccionEntrega).toBe('Entrega hoy: bodega Cra 50')
    const cli = await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })
    expect(cli.direccion).toBe('Cra 1 # 1-1') // Cliente intacto
    expect(cli.barrio).toBe('Uno')
  })

  it('edición: vaciar el snapshot cuando el Cliente tampoco tiene dirección ni coords → rechaza (INSUFICIENTE)', async () => {
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Edit a insuficiente', telefono: uniqueId('t'), direccion: null, barrio: null, activo: true },
    })
    // crear con override para poder crearlo, luego intentar vaciarlo
    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      direccionEntrega: 'Cra 9 # 80-10', barrioEntrega: 'Norte',
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('e-edit-2'),
    })
    await expect(
      actualizar().execute({ pedidoId: pedido.id, items: ITEMS, direccionEntrega: '', barrioEntrega: '', usuarioId: adminId }),
    ).rejects.toThrow('ENTREGA_INSUFICIENTE')
  })

  // ── BUG DE PRODUCCIÓN + BRECHA PLAN↔CÓDIGO: el commit no resolvía
  // `linkUbicacion → coords` en vivo, así que un cliente con solo un link
  // (sin coords backfilleadas) pasaba el preview pero era rechazado en
  // POST/PUT. `resolverCoordsDeLink` corre ahora fuera del lock (Crear y
  // Actualizar), igual que en Preview. `resolverEntrega` sigue siendo la
  // autoridad única — no hay regla nueva. Links directos (`/@lat,lng`) se
  // parsean sin HTTP → tests deterministas.
  const LINK_RESOLUBLE = 'https://www.google.com/maps/@4.6510,-74.0540,17z'
  const LINK_ROTO = 'https://www.google.com/maps/place/Tienda-sin-coordenadas'

  it('link resoluble + sin dirección/barrio/coords → preview y commit COINCIDEN (SUFICIENTE, crea)', async () => {
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Solo link', telefono: uniqueId('t'),
        direccion: null, barrio: null, lat: null, lng: null,
        linkUbicacion: LINK_RESOLUBLE, activo: true,
      },
    })

    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(p.entrega?.via).toBe('GEO')
    expect(p.permissions.canCreate).toBe(true)

    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('link-ok'),
    })
    expect(pedido.id).toBeTruthy()

    // resolver el link NO debe tocar los datos maestros del Cliente.
    const cliDespues = await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })
    expect(cliDespues.lat).toBeNull()
    expect(cliDespues.lng).toBeNull()
    expect(cliDespues.direccion).toBeNull()
    expect(cliDespues.barrio).toBeNull()
  })

  it('link roto + sin dirección/barrio/coords → preview INSUFICIENTE y commit rechaza (422)', async () => {
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Link roto', telefono: uniqueId('t'),
        direccion: null, barrio: null, linkUbicacion: LINK_ROTO, activo: true,
      },
    })

    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('INSUFICIENTE')
    expect(p.permissions.canCreate).toBe(false)

    await expect(
      crear().execute({
        clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
        createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('link-roto'),
      }),
    ).rejects.toThrow('ENTREGA_INSUFICIENTE')
  })

  it('dirección + barrio + link → crea (Vía B basta; el link no cambia el resultado)', async () => {
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Todo', telefono: uniqueId('t'),
        direccion: 'Cra 15 # 30-20', barrio: 'Centro', linkUbicacion: LINK_RESOLUBLE, activo: true,
      },
    })
    const p = await preview().execute({ clienteId: c.id, canal: 'DOMICILIO', items: ITEMS, actorId: adminId })
    expect(p.entrega?.estado).toBe('SUFICIENTE')
    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('todo'),
    })
    expect(pedido.id).toBeTruthy()
  })

  it('Update mantiene la MISMA autoridad: pedido con cliente link-resoluble, vaciar el snapshot NO lo rechaza', async () => {
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Update link', telefono: uniqueId('t'),
        direccion: null, barrio: null, linkUbicacion: LINK_RESOLUBLE, activo: true,
      },
    })
    // crear con override textual para tener un pedido de partida
    const { pedido } = await crear().execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS, pagos: [],
      direccionEntrega: 'Obra temporal Cra 1', barrioEntrega: 'X',
      createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('upd-link'),
    })
    // vaciar el snapshot: la Vía A (link del cliente) debe sostener la suficiencia
    const res = await actualizar().execute({
      pedidoId: pedido.id, items: ITEMS, direccionEntrega: '', barrioEntrega: '', usuarioId: adminId,
    })
    expect(res.pedido.id).toBe(pedido.id)
    // sin mutar los datos maestros
    const cli = await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })
    expect(cli.lat).toBeNull()
    expect(cli.linkUbicacion).toBe(LINK_RESOLUBLE)
  })
})
