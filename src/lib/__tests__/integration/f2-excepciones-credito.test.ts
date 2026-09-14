// @tests F2 (Excepciones de Crédito) contra Postgres real. Cubre los 3
// criterios de cierre explícitos del equipo (docs/AGUA_BAMBU_F2_MAPA_Y_DISENO_EXCEPCIONES_CREDITO_v1.0.md):
// (a) anti-reuse: autorizar → consumir en Pedido A → reutilizar → rechazado.
// (b) concurrencia: dos autorizadores simultáneos → exactamente una transición.
// (c) revalidación: resolver usa el estado ACTUAL del cliente, nunca el
//     snapshot tomado al solicitar — y el snapshot persistido no se altera.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// GetFiadoStatusUseCase → getConfigInt → getConfig envuelve en unstable_cache,
// que exige un incrementalCache de un request real de Next. Mismo mock que
// preview-pedido-integridad.test.ts.
import { vi } from 'vitest'
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, getRepartidorUser } from './setup'
import { SolicitarExcepcionCreditoUseCase, ExcepcionNoNecesariaError } from '@/modules/pedidos/application/use-cases/SolicitarExcepcionCreditoUseCase'
import { ResolverExcepcionCreditoUseCase } from '@/modules/pedidos/application/use-cases/ResolverExcepcionCreditoUseCase'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'

function makeFiadoAuthority() {
  return new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository())
}

function makeCrearUseCase(fiadoAuthority: GetFiadoStatusUseCase) {
  return new CrearPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaPagoRepository(),
    new PrismaClienteRepository(),
    new PrismaPricingAdapter(),
    new PrismaTransactionManager(),
    resolverCoordsDeLink,
    fiadoAuthority,
  )
}

async function createClienteConLimite(suffix: string, limite: number) {
  return testPrisma.cliente.create({
    data: {
      nombre: `Test Cliente F2 ${suffix}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: 'Calle Test', barrio: 'Test', activo: true,
      limitePedidosFiados: limite,
    },
  })
}

/** Crea un fiado real (venta rápida entregada, sin pago) que ocupa el cupo. */
async function ocuparCupoFiado(clienteId: string, adminId: string, fiadoAuthority: GetFiadoStatusUseCase) {
  const crear = makeCrearUseCase(fiadoAuthority)
  const { pedido } = await crear.execute({
    clienteId, canal: 'PUNTO', origen: 'VENTA_RAPIDA',
    items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    pagos: [],
    createdById: adminId, createdByRole: 'ADMIN',
    offlineId: `f2-cupo-${clienteId}-${Date.now()}`,
  })
  return pedido
}

async function limpiarCliente(clienteId: string) {
  const pedidos = await testPrisma.pedido.findMany({ where: { clienteId }, select: { id: true } })
  for (const p of pedidos) {
    await testPrisma.pedidoItem.deleteMany({ where: { pedidoId: p.id } })
    await testPrisma.pago.deleteMany({ where: { pedidoId: p.id } })
    await testPrisma.factura.deleteMany({ where: { pedidoId: p.id } })
  }
  await testPrisma.pedidoExcepcionCredito.deleteMany({ where: { clienteId } })
  await testPrisma.pedido.deleteMany({ where: { clienteId } })
  await testPrisma.cliente.delete({ where: { id: clienteId } })
}

describe('F2 — Excepciones de Crédito (integración, Postgres real)', () => {
  let adminId: string
  let repartidorId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    repartidorId = (await getRepartidorUser()).id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('SolicitarExcepcionCreditoUseCase rechaza si el cliente NO está sobre el límite', async () => {
    const cliente = await createClienteConLimite('sin-necesidad', 5)
    try {
      const fiadoAuthority = makeFiadoAuthority()
      const solicitar = new SolicitarExcepcionCreditoUseCase(fiadoAuthority)
      await expect(solicitar.execute({
        clienteId: cliente.id,
        motivoSolicitud: 'Cliente de confianza',
        solicitadoPorId: adminId,
        operacion: { total: 10000, totalPagado: 0 },
      })).rejects.toThrow(ExcepcionNoNecesariaError)
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(a) anti-reuse: autorizar → consumir en Pedido A → reutilizar en Pedido B → rechazado', async () => {
    const cliente = await createClienteConLimite('anti-reuse', 1)
    try {
      const fiadoAuthority = makeFiadoAuthority()
      await ocuparCupoFiado(cliente.id, adminId, fiadoAuthority)

      const solicitar = new SolicitarExcepcionCreditoUseCase(fiadoAuthority)
      const resolver = new ResolverExcepcionCreditoUseCase(fiadoAuthority)
      const crear = makeCrearUseCase(fiadoAuthority)

      const { id: excepcionId } = await solicitar.execute({
        clienteId: cliente.id,
        motivoSolicitud: 'Cliente frecuente, pagará mañana',
        solicitadoPorId: adminId,
        operacion: { total: 5000, totalPagado: 0 },
      })

      const resuelta = await resolver.execute({ excepcionId, resolucion: 'AUTORIZAR', actorId: adminId })
      expect(resuelta.estado).toBe('AUTORIZADA')
      expect(resuelta.deduped).toBe(false)

      // Pedido A: consume la excepción — debe crearse pese al límite.
      const pedidoA = await crear.execute({
        clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [], createdById: adminId, createdByRole: 'ADMIN',
        offlineId: `f2-anti-reuse-A-${Date.now()}`,
        excepcionId,
      })
      expect(pedidoA.excepcionCreditoConsumida).toBe(excepcionId)

      const excepcionEnDb = await testPrisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: excepcionId } })
      expect(excepcionEnDb.pedidoId).toBe(pedidoA.pedido.id)

      // Pedido B: intenta reutilizar LA MISMA excepción → rechazado. La
      // validación de solo-lectura de GetFiadoStatusUseCase ya no la
      // encuentra válida (pedidoId ya no es null), así que vuelve a
      // aparecer errorDeuda — el bypass no se reactiva.
      await expect(crear.execute({
        clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [], createdById: adminId, createdByRole: 'ADMIN',
        offlineId: `f2-anti-reuse-B-${Date.now()}`,
        excepcionId,
      })).rejects.toThrow(/CLIENTE_DEBE/)

      // La excepción sigue apuntando exclusivamente al Pedido A.
      const excepcionFinal = await testPrisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: excepcionId } })
      expect(excepcionFinal.pedidoId).toBe(pedidoA.pedido.id)
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(a2) anti-reuse a nivel DB: el WHERE-guard rechaza un segundo consumo directo aunque la lectura ya haya pasado', async () => {
    // Simula la ventana de carrera: dos llamadas ya "vieron" pedidoId=null
    // (ambas pasaron la validación de lectura) pero solo UNA puede ganar el
    // UPDATE atómico — la garantía real vive acá, no en la lectura previa.
    const cliente = await createClienteConLimite('where-guard', 1)
    try {
      const fiadoAuthority = makeFiadoAuthority()
      await ocuparCupoFiado(cliente.id, adminId, fiadoAuthority)
      const solicitar = new SolicitarExcepcionCreditoUseCase(fiadoAuthority)
      const resolver = new ResolverExcepcionCreditoUseCase(fiadoAuthority)

      const { id: excepcionId } = await solicitar.execute({
        clienteId: cliente.id, motivoSolicitud: 'test where-guard', solicitadoPorId: adminId,
        operacion: { total: 5000, totalPagado: 0 },
      })
      await resolver.execute({ excepcionId, resolucion: 'AUTORIZAR', actorId: adminId })

      const pedidoFalso = await testPrisma.pedido.create({
        data: {
          clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
          estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'PENDIENTE',
          total: 100, totalPagado: 0, saldo: 100,
        },
      })

      const primero = await testPrisma.pedidoExcepcionCredito.updateMany({
        where: { id: excepcionId, pedidoId: null },
        data: { pedidoId: pedidoFalso.id },
      })
      expect(primero.count).toBe(1)

      const otroPedidoFalso = await testPrisma.pedido.create({
        data: {
          clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
          estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'PENDIENTE',
          total: 100, totalPagado: 0, saldo: 100,
        },
      })
      const segundo = await testPrisma.pedidoExcepcionCredito.updateMany({
        where: { id: excepcionId, pedidoId: null },
        data: { pedidoId: otroPedidoFalso.id },
      })
      expect(segundo.count).toBe(0) // ya no matchea el WHERE — 0 filas afectadas
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(b) concurrencia: dos autorizadores simultáneos → exactamente una transición válida gana', async () => {
    const cliente = await createClienteConLimite('concurrencia', 1)
    try {
      const fiadoAuthority = makeFiadoAuthority()
      await ocuparCupoFiado(cliente.id, adminId, fiadoAuthority)
      const solicitar = new SolicitarExcepcionCreditoUseCase(fiadoAuthority)

      const { id: excepcionId } = await solicitar.execute({
        clienteId: cliente.id, motivoSolicitud: 'test concurrencia', solicitadoPorId: adminId,
        operacion: { total: 5000, totalPagado: 0 },
      })

      // Dos "autorizadores" resolviendo la MISMA solicitud al mismo tiempo,
      // con resoluciones distintas — el advisory lock serializa: solo el
      // primero en entrar aplica su resolución, el segundo recibe deduped.
      const resolverA = new ResolverExcepcionCreditoUseCase(fiadoAuthority)
      const resolverB = new ResolverExcepcionCreditoUseCase(fiadoAuthority)
      const [resA, resB] = await Promise.all([
        resolverA.execute({ excepcionId, resolucion: 'AUTORIZAR', actorId: adminId }),
        resolverB.execute({ excepcionId, resolucion: 'RECHAZAR', actorId: repartidorId }),
      ])

      const dedupedCount = [resA, resB].filter(r => r.deduped).length
      const noDedupedCount = [resA, resB].filter(r => !r.deduped).length
      expect(dedupedCount).toBe(1)
      expect(noDedupedCount).toBe(1)
      // Ambas respuestas coinciden en el estado final (el que ganó).
      expect(resA.estado).toBe(resB.estado)

      const excepcionFinal = await testPrisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: excepcionId } })
      expect(excepcionFinal.estado).toBe(resA.estado)
      // Solo el ganador dejó su huella de autorización/rechazo — nunca ambas.
      if (excepcionFinal.estado === 'AUTORIZADA') {
        expect(excepcionFinal.autorizadoPorId).not.toBeNull()
        expect(excepcionFinal.rechazadoPorId).toBeNull()
      } else {
        expect(excepcionFinal.rechazadoPorId).not.toBeNull()
        expect(excepcionFinal.autorizadoPorId).toBeNull()
      }
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(c) revalidación: resolver usa el estado ACTUAL del cliente, el snapshot persistido no se altera, y el commit sigue funcionando', async () => {
    const cliente = await createClienteConLimite('revalidacion', 1)
    try {
      const fiadoAuthority = makeFiadoAuthority()
      const cupoInicial = await ocuparCupoFiado(cliente.id, adminId, fiadoAuthority)
      const solicitar = new SolicitarExcepcionCreditoUseCase(fiadoAuthority)
      const resolver = new ResolverExcepcionCreditoUseCase(fiadoAuthority)
      const crear = makeCrearUseCase(fiadoAuthority)

      const { id: excepcionId } = await solicitar.execute({
        clienteId: cliente.id, motivoSolicitud: 'test revalidacion', solicitadoPorId: adminId,
        operacion: { total: 5000, totalPagado: 0 },
      })

      const snapshotAlSolicitar = await testPrisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: excepcionId } })
      const saldoOriginal = Number(snapshotAlSolicitar.saldoFiadoSnapshot)
      expect(snapshotAlSolicitar.limiteSnapshot).toBe(1)
      expect(snapshotAlSolicitar.fiadosAbiertosSnapshot).toBe(1)

      // Cambia el estado de crédito DESPUÉS de solicitar (más restrictivo:
      // el fiado ya abierto crece) — simula que la deuda empeoró entre la
      // solicitud y la resolución (ej. otro cargo se sumó mientras tanto).
      const saldoNuevo = saldoOriginal + 50000
      await testPrisma.pedido.update({
        where: { id: cupoInicial.id },
        data: { total: saldoNuevo, saldo: saldoNuevo },
      })

      const resuelta = await resolver.execute({ excepcionId, resolucion: 'AUTORIZAR', actorId: adminId })
      expect(resuelta.deduped).toBe(false)
      // El estado revalidado (AHORA) refleja la deuda nueva, NO el snapshot
      // original — la autoridad de F1 se re-ejecuta, no se lee un valor
      // cacheado.
      expect(resuelta.estadoActual?.outstandingAmount).toBe(saldoNuevo)
      expect(resuelta.estadoActual?.outstandingAmount).not.toBe(saldoOriginal)

      // El snapshot persistido en la entidad NUNCA se sobreescribe con la
      // revalidación — sigue siendo el de la solicitud original.
      const excepcionTrasResolver = await testPrisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: excepcionId } })
      expect(Number(excepcionTrasResolver.saldoFiadoSnapshot)).toBe(saldoOriginal)
      expect(excepcionTrasResolver.limiteSnapshot).toBe(1)
      expect(excepcionTrasResolver.fiadosAbiertosSnapshot).toBe(1)
      expect(excepcionTrasResolver.estado).toBe('AUTORIZADA')

      // El commit real, aunque la situación actual es AÚN peor que cuando
      // se autorizó, sigue honrando la autorización ya dada (no se
      // re-litiga la decisión humana en base a los números de hoy).
      const pedido = await crear.execute({
        clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [], createdById: adminId, createdByRole: 'ADMIN',
        offlineId: `f2-revalidacion-${Date.now()}`,
        excepcionId,
      })
      expect(pedido.excepcionCreditoConsumida).toBe(excepcionId)
    } finally {
      await limpiarCliente(cliente.id)
    }
  })
})
