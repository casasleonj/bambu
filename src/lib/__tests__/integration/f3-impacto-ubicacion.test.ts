// @tests F3 (Impacto en Demanda) contra Postgres real. Cubre los criterios
// mínimos exigidos por el equipo (docs/AGUA_BAMBU_F3_DISENO_TECNICO_IMPACTO_UBICACION_v1.0.md §8):
// (1) Pedido pendiente sin snapshot propio → aparece señal.
// (2) Pedido entregado → sin acción, snapshot intacto.
// (3) Cliente actualizado → refleja la ubicación nueva (para el próximo Pedido).
// (5) Pedido con snapshot propio (dirección puntual) → NO depende del dato
//     maestro, no genera señal aunque esté pendiente.
// (6) Checkbox "actualizar cliente": barrioId se desvincula cuando el texto
//     de barrio cambia sin una resolución canónica explícita — sin inventar
//     matching.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'

async function createCliente(suffix: string, opts: { direccion: string; barrio: string; barrioId?: string }) {
  return testPrisma.cliente.create({
    data: {
      nombre: `Test Cliente F3 ${suffix}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: opts.direccion,
      barrio: opts.barrio,
      barrioId: opts.barrioId ?? null,
      activo: true,
    },
  })
}

async function createPedidoParaCliente(
  clienteId: string,
  opts: { estadoEntrega: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO'; direccionEntrega?: string | null; barrioEntrega?: string | null },
) {
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: opts.estadoEntrega,
      estado: opts.estadoEntrega,
      estadoPago: 'PENDIENTE',
      total: 10000,
      totalPagado: 0,
      saldo: 10000,
      direccionEntrega: opts.direccionEntrega ?? null,
      barrioEntrega: opts.barrioEntrega ?? null,
    },
  })
}

async function limpiarCliente(clienteId: string) {
  const pedidos = await testPrisma.pedido.findMany({ where: { clienteId }, select: { id: true } })
  for (const p of pedidos) {
    await testPrisma.pedidoImpactoUbicacion.deleteMany({ where: { pedidoId: p.id } })
  }
  await testPrisma.pedido.deleteMany({ where: { clienteId } })
  await testPrisma.cliente.delete({ where: { id: clienteId } })
}

describe('F3 — Impacto en Demanda por cambio de ubicación (integración, Postgres real)', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('(1) Pedido pendiente SIN snapshot propio → cambio de dirección del cliente genera una señal de impacto', async () => {
    const cliente = await createCliente('pendiente-sin-snapshot', { direccion: 'Calle 1', barrio: 'La Esperanza' })
    try {
      const pedido = await createPedidoParaCliente(cliente.id, { estadoEntrega: 'PENDIENTE' })

      const repo = new PrismaClienteRepository()
      await repo.updateDireccion(cliente.id, 'Calle 2', 'El Progreso', undefined, { usuarioId: adminId, pedidoId: pedido.id })

      const impactos = await testPrisma.pedidoImpactoUbicacion.findMany({ where: { pedidoId: pedido.id } })
      expect(impactos).toHaveLength(1)
      expect(impactos[0].direccionAnterior).toBe('Calle 1')
      expect(impactos[0].barrioAnterior).toBe('La Esperanza')
      expect(impactos[0].direccionNueva).toBe('Calle 2')
      expect(impactos[0].barrioNueva).toBe('El Progreso')
      expect(impactos[0].revisadoAt).toBeNull()

      // El Pedido en sí NUNCA se toca — ni su estado, ni un snapshot que no tenía.
      const pedidoTrasElCambio = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(pedidoTrasElCambio.estadoEntrega).toBe('PENDIENTE')
      expect(pedidoTrasElCambio.direccionEntrega).toBeNull()
      expect(pedidoTrasElCambio.barrioEntrega).toBeNull()
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(2) Pedido ENTREGADO → cambio de dirección del cliente NO genera señal ni toca el snapshot histórico', async () => {
    const cliente = await createCliente('entregado', { direccion: 'Calle 1', barrio: 'La Esperanza' })
    try {
      const pedido = await createPedidoParaCliente(cliente.id, { estadoEntrega: 'ENTREGADO' })

      const repo = new PrismaClienteRepository()
      await repo.updateDireccion(cliente.id, 'Calle 2', 'El Progreso', undefined, { usuarioId: adminId })

      const impactos = await testPrisma.pedidoImpactoUbicacion.findMany({ where: { pedidoId: pedido.id } })
      expect(impactos).toHaveLength(0)

      const pedidoTrasElCambio = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(pedidoTrasElCambio.direccionEntrega).toBeNull()
      expect(pedidoTrasElCambio.barrioEntrega).toBeNull()
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(3) el dato maestro del Cliente queda actualizado — el próximo Pedido lo usaría directamente', async () => {
    const cliente = await createCliente('nuevo-pedido', { direccion: 'Calle 1', barrio: 'La Esperanza' })
    try {
      const repo = new PrismaClienteRepository()
      await repo.updateDireccion(cliente.id, 'Calle Nueva', 'Barrio Nuevo', undefined, { usuarioId: adminId })

      const clienteActualizado = await testPrisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
      expect(clienteActualizado.direccion).toBe('Calle Nueva')
      expect(clienteActualizado.barrio).toBe('Barrio Nuevo')
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(5) Pedido pendiente CON snapshot propio (dirección puntual) → NO depende del dato maestro, no genera señal', async () => {
    const cliente = await createCliente('con-snapshot-propio', { direccion: 'Calle 1', barrio: 'La Esperanza' })
    try {
      const pedido = await createPedidoParaCliente(cliente.id, {
        estadoEntrega: 'PENDIENTE',
        direccionEntrega: 'Dirección puntual de este pedido',
        barrioEntrega: 'Barrio puntual',
      })

      const repo = new PrismaClienteRepository()
      await repo.updateDireccion(cliente.id, 'Calle 2', 'El Progreso', undefined, { usuarioId: adminId })

      const impactos = await testPrisma.pedidoImpactoUbicacion.findMany({ where: { pedidoId: pedido.id } })
      expect(impactos).toHaveLength(0)

      // El cambio temporal del Pedido (su propio snapshot) tampoco se toca.
      const pedidoTrasElCambio = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
      expect(pedidoTrasElCambio.direccionEntrega).toBe('Dirección puntual de este pedido')
      expect(pedidoTrasElCambio.barrioEntrega).toBe('Barrio puntual')
    } finally {
      await limpiarCliente(cliente.id)
    }
  })

  it('(6) checkbox "actualizar cliente": barrioId se desvincula cuando el texto de barrio cambia sin resolución canónica', async () => {
    const barrioCanonico = await testPrisma.barrio.create({
      data: { nombre: 'Barrio Canónico Test F3', nombreNormalizado: `barrio canonico test f3 ${Date.now()}` },
    })
    const cliente = await createCliente('barrioid-desvinculo', {
      direccion: 'Calle 1',
      barrio: barrioCanonico.nombre,
      barrioId: barrioCanonico.id,
    })
    try {
      const repo = new PrismaClienteRepository()
      // Este flujo NUNCA recibe un barrioId — solo texto libre. Si el texto
      // cambia, el vínculo anterior ya no es confiable y debe desvincularse
      // (no inventar un nuevo match).
      await repo.updateDireccion(cliente.id, 'Calle 1', 'Un barrio distinto escrito a mano', undefined, { usuarioId: adminId })

      const clienteTrasElCambio = await testPrisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
      expect(clienteTrasElCambio.barrio).toBe('Un barrio distinto escrito a mano')
      expect(clienteTrasElCambio.barrioId).toBeNull()
    } finally {
      await limpiarCliente(cliente.id)
      await testPrisma.barrio.delete({ where: { id: barrioCanonico.id } })
    }
  })

  it('(6b) checkbox "actualizar cliente": si el texto de barrio NO cambia, el barrioId vinculado se conserva', async () => {
    const barrioCanonico = await testPrisma.barrio.create({
      data: { nombre: 'Barrio Canónico Test F3b', nombreNormalizado: `barrio canonico test f3b ${Date.now()}` },
    })
    const cliente = await createCliente('barrioid-conserva', {
      direccion: 'Calle 1',
      barrio: barrioCanonico.nombre,
      barrioId: barrioCanonico.id,
    })
    try {
      const repo = new PrismaClienteRepository()
      // Cambia SOLO la dirección — el barrio (texto) queda idéntico.
      await repo.updateDireccion(cliente.id, 'Calle 2', barrioCanonico.nombre, undefined, { usuarioId: adminId })

      const clienteTrasElCambio = await testPrisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
      expect(clienteTrasElCambio.barrio).toBe(barrioCanonico.nombre)
      expect(clienteTrasElCambio.barrioId).toBe(barrioCanonico.id)
    } finally {
      await limpiarCliente(cliente.id)
      await testPrisma.barrio.delete({ where: { id: barrioCanonico.id } })
    }
  })
})
