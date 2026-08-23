// @tests Red de contención — pedidos atrasados sin asignar (whereAtrasadosSinAsignar)
// Verifica contra Postgres real, con el corte exacto de medianoche Bogotá:
//   1. Un pendiente sin embarque de AYER cuenta como atrasado.
//   2. Un pendiente sin embarque de HOY NO cuenta (esa es la brecha real:
//      todavía es visible en las vistas normales de "hoy").
//   3. Un pendiente de ayer YA asignado a un embarque no cuenta.
//   4. El filtro embarqueId:null vía ListarPedidosUseCase/PrismaPedidoRepository
//      (el mismo camino que usa GET /api/pedidos?atrasados=true) devuelve
//      exactamente esos pedidos.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// findPedidosHoyEnRiesgoIds ahora lee Config (horario/umbral) vía getConfigs/
// getConfigNumber, que envuelven la query en unstable_cache — eso requiere un
// contexto de request de Next.js real y explota fuera de él (confirmado:
// "Invariant: incrementalCache missing"). Mismo mock que ya usa
// src/lib/__tests__/config.test.ts para poder llamar esas funciones en tests.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { startOfDayBogota } from '@/lib/dates'
import {
  countPedidosAtrasadosSinAsignar,
  findPedidosHoyEnRiesgoIds,
  UMBRAL_EMBARQUES_RIESGO,
} from '@/lib/pedidos-sin-asignar'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'

describe('Pedidos atrasados sin asignar — corte exacto a medianoche Bogotá', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Atrasados',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => {
    await disconnect()
  })

  function ayerBogota(): Date {
    return new Date(startOfDayBogota().getTime() - 60_000)
  }

  async function crearPedido(overrides: { fecha: Date; embarqueId?: string | null }) {
    return testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        offlineId: uniqueId('atrasado'),
        fecha: overrides.fecha,
        embarqueId: overrides.embarqueId ?? null,
      },
    })
  }

  it('un pendiente sin embarque de AYER cuenta como atrasado', async () => {
    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: ayerBogota() })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before + 1)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })

  it('FIX: un NO_ENTREGADO sin embarque de AYER cuenta como atrasado (pedido "atrapado" sin reasignar)', async () => {
    const before = await countPedidosAtrasadosSinAsignar()
    const p = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        offlineId: uniqueId('no-entregado-atrasado'),
        fecha: ayerBogota(),
        embarqueId: null,
        estadoEntrega: 'NO_ENTREGADO',
      },
    })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before + 1)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })

  it('un pendiente sin embarque de HOY NO cuenta (todavía visible en las vistas de "hoy")', async () => {
    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: new Date() })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })

  it('un pendiente de ayer YA asignado a un embarque NO cuenta', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Test Repartidor Atrasados', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id },
    })

    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: ayerBogota(), embarqueId: embarque.id })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
  })

  it('PrismaPedidoRepository.findMany con embarqueId:null devuelve el pedido atrasado (mismo camino que la API)', async () => {
    const p = await crearPedido({ fecha: ayerBogota() })
    const repo = new PrismaPedidoRepository()

    const pedidos = await repo.findMany(
      { estadoEntrega: ['PENDIENTE'], embarqueId: null, hasta: startOfDayBogota() },
      { take: 1000 },
    )

    expect(pedidos.some((f) => f.id.get() === p.id)).toBe(true)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })
})

describe('Pedidos de hoy en riesgo (3+ embarques CERRADO de su ruta, nunca asignados)', () => {
  async function crearTrabajador(nombre: string) {
    return testPrisma.trabajador.create({
      data: { nombre, rol: 'REPARTIDOR', usaMoto: true },
    })
  }

  async function crearEmbarqueCerrado(trabajadorId: string, rutaId?: string) {
    return testPrisma.embarque.create({
      data: { trabajadorId, rutaId: rutaId ?? null, estado: 'CERRADO' },
    })
  }

  async function crearPedidoHoy(clienteId: string) {
    return testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        offlineId: uniqueId('en-riesgo'),
        fecha: new Date(),
        embarqueId: null,
        estadoEntrega: 'PENDIENTE',
      },
    })
  }

  it(`pedido con ruta resoluble entra en riesgo cuando su ruta tiene ${UMBRAL_EMBARQUES_RIESGO}+ embarques CERRADO hoy`, async () => {
    const ruta = await testPrisma.ruta.create({ data: { nombre: uniqueId('ruta-riesgo') } })
    const cliente = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Riesgo Ruta',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
        rutaId: ruta.id,
      },
    })
    const trabajadores = await Promise.all(
      [1, 2, 3].map((n) => crearTrabajador(`Test Repartidor Riesgo ${n} ${ruta.id}`)),
    )
    const embarques = await Promise.all(trabajadores.map((t) => crearEmbarqueCerrado(t.id, ruta.id)))
    const pedido = await crearPedidoHoy(cliente.id)

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).toContain(pedido.id)

    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.deleteMany({ where: { id: { in: embarques.map((e) => e.id) } } })
    await testPrisma.trabajador.deleteMany({ where: { id: { in: trabajadores.map((t) => t.id) } } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
    await testPrisma.ruta.delete({ where: { id: ruta.id } })
  })

  it(`pedido con ruta resoluble NO entra en riesgo con menos de ${UMBRAL_EMBARQUES_RIESGO} embarques CERRADO`, async () => {
    const ruta = await testPrisma.ruta.create({ data: { nombre: uniqueId('ruta-sin-riesgo') } })
    const cliente = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Sin Riesgo Ruta',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
        rutaId: ruta.id,
      },
    })
    const trabajadores = await Promise.all(
      [1, 2].map((n) => crearTrabajador(`Test Repartidor Sin Riesgo ${n} ${ruta.id}`)),
    )
    const embarques = await Promise.all(trabajadores.map((t) => crearEmbarqueCerrado(t.id, ruta.id)))
    const pedido = await crearPedidoHoy(cliente.id)

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).not.toContain(pedido.id)

    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.deleteMany({ where: { id: { in: embarques.map((e) => e.id) } } })
    await testPrisma.trabajador.deleteMany({ where: { id: { in: trabajadores.map((t) => t.id) } } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
    await testPrisma.ruta.delete({ where: { id: ruta.id } })
  })

  it('pedido SIN ruta resoluble usa el fallback global (cualquier ruta con 3+ cerrados)', async () => {
    const cliente = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Sin Ruta',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
      },
    })
    const pedido = await crearPedidoHoy(cliente.id)

    const before = await findPedidosHoyEnRiesgoIds()
    expect(before).not.toContain(pedido.id)

    const trabajadores = await Promise.all(
      [1, 2, 3].map((n) => crearTrabajador(`Test Repartidor Global ${n} ${cliente.id}`)),
    )
    const embarques = await Promise.all(trabajadores.map((t) => crearEmbarqueCerrado(t.id)))

    const after = await findPedidosHoyEnRiesgoIds()
    expect(after).toContain(pedido.id)

    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.deleteMany({ where: { id: { in: embarques.map((e) => e.id) } } })
    await testPrisma.trabajador.deleteMany({ where: { id: { in: trabajadores.map((t) => t.id) } } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })
})

describe('Pedidos de hoy en riesgo — sub-regla de horas hábiles transcurridas', () => {
  const CONFIG_KEYS = ['HORARIO_MANANA_INICIO', 'HORARIO_MANANA_FIN', 'UMBRAL_HORAS_HABILES_RIESGO']

  beforeAll(async () => {
    // Turno de 00:00-23:59 (todo el día) + umbral de 3min (0.05h) para que el
    // test no dependa de la hora real en que corre el CI. No se usa el turno
    // de tarde: al no configurarse, getTurnosYUmbralRiesgo solo arma un turno.
    await testPrisma.config.deleteMany({ where: { clave: { in: CONFIG_KEYS } } })
    await testPrisma.config.createMany({
      data: [
        { clave: 'HORARIO_MANANA_INICIO', valor: '00:00' },
        { clave: 'HORARIO_MANANA_FIN', valor: '23:59' },
        { clave: 'UMBRAL_HORAS_HABILES_RIESGO', valor: '0.05' },
      ],
    })
  })

  afterAll(async () => {
    await testPrisma.config.deleteMany({ where: { clave: { in: CONFIG_KEYS } } })
  })

  async function crearClienteTest(nombre: string) {
    return testPrisma.cliente.create({
      data: {
        nombre,
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
      },
    })
  }

  it('PENDIENTE sin asignar creado hace 10min (> umbral de 3min) entra en riesgo por tiempo', async () => {
    const cliente = await crearClienteTest('Test Cliente Riesgo Tiempo')
    const hace10min = new Date(Date.now() - 10 * 60_000)
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        offlineId: uniqueId('riesgo-tiempo'),
        fecha: hace10min,
        embarqueId: null,
        estadoEntrega: 'PENDIENTE',
      },
    })

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).toContain(p.id)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('PENDIENTE recién creado (< umbral) NO entra en riesgo', async () => {
    const cliente = await crearClienteTest('Test Cliente Sin Riesgo Tiempo')
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        offlineId: uniqueId('sin-riesgo-tiempo'),
        fecha: new Date(),
        embarqueId: null,
        estadoEntrega: 'PENDIENTE',
      },
    })

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).not.toContain(p.id)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('EN_RUTA atascado hace 10min entra en riesgo (no solo PENDIENTE sin asignar)', async () => {
    const cliente = await crearClienteTest('Test Cliente Riesgo EnRuta')
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Test Repartidor Riesgo EnRuta', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, estado: 'EN_RUTA' },
    })
    const hace10min = new Date(Date.now() - 10 * 60_000)
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        offlineId: uniqueId('riesgo-en-ruta'),
        fecha: hace10min,
        embarqueId: embarque.id,
        estadoEntrega: 'EN_RUTA',
      },
    })

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).toContain(p.id)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: trabajador.id } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('EN_RUTA atascado de hace VARIOS DÍAS también entra en riesgo (no acotado a hoy)', async () => {
    // Confirmado en producción (sesión 2026-08-15): pedidos EN_RUTA de hasta
    // ~2 meses de antigüedad, invisibles para whereAtrasadosSinAsignar
    // (exige embarqueId=null) y para la versión anterior de esta regla
    // (acotada a fecha=hoy). Este test fija ese caso.
    const cliente = await crearClienteTest('Test Cliente Riesgo EnRuta Viejo')
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Test Repartidor Riesgo EnRuta Viejo', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, estado: 'EN_RUTA' },
    })
    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60_000)
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        offlineId: uniqueId('riesgo-en-ruta-viejo'),
        fecha: hace5dias,
        embarqueId: embarque.id,
        estadoEntrega: 'EN_RUTA',
      },
    })

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).toContain(p.id)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: trabajador.id } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('ENTREGADO hace 10min NO entra en riesgo (ya se resolvió)', async () => {
    const cliente = await crearClienteTest('Test Cliente Entregado No Riesgo')
    const hace10min = new Date(Date.now() - 10 * 60_000)
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        offlineId: uniqueId('entregado-no-riesgo'),
        fecha: hace10min,
        embarqueId: null,
        estadoEntrega: 'ENTREGADO',
      },
    })

    const ids = await findPedidosHoyEnRiesgoIds()
    expect(ids).not.toContain(p.id)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.cliente.delete({ where: { id: cliente.id } })
  })
})
