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
})
