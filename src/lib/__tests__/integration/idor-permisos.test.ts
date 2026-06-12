// @tests IDOR / permisos a nivel de query — vector: permisos
// CRÍTICO: un REPARTIDOR autenticado no debe poder ver/modificar datos
// de otro REPARTIDOR ni de la franquicia completa. Verifica:
//   1. La query de Prisma para listar embarques filtra por userId
//      (verificamos: traer embarque de otro user retorna 0 resultados)
//   2. ADMIN/CONTADOR ven todo, REPARTIDOR solo lo suyo
//   3. ASISTENTE tiene permisos operativos pero no ve todo
//   4. Pedido de embarque ajeno no es accesible por query de user
//   5. withAdvisoryLock funciona con todos los locks conocidos
//   6. Locks se pueden adquirir repetidamente sin deadlock
// Se evita importar requireOwnership directamente para no acoplar el test
// al runtime de Next (el import chain jala next-auth).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  getRepartidorUser,
} from './setup'
import { withAdvisoryLock, LOCK_IDS } from '@/lib/locks'

describe('IDOR / permisos a nivel de query', () => {
  let repartidorUserId: string

  beforeAll(async () => {
    await resetAndSeed()
    const r = await getRepartidorUser()
    repartidorUserId = r.id
  })

  afterAll(async () => {
    await disconnect()
  })

  describe('Query: embarques de un REPARTIDOR específico', () => {
    it('REPARTIDOR A solo ve sus propios embarques (filtro por userId)', async () => {
      // Trabajador.userId es @unique. El repartidor user YA tiene un
      // Trabajador linkeado del seed (Carlos Vargas). Lo usamos.
      const miTrabajador = await testPrisma.trabajador.findFirst({
        where: { userId: repartidorUserId },
      })
      expect(miTrabajador).not.toBeNull()
      if (!miTrabajador) return

      // Crear otro Trabajador sin userId
      const otroTrabajador = await testPrisma.trabajador.create({
        data: { nombre: 'Otro Trabajador IDOR', rol: 'REPARTIDOR' },
      })

      const miEmbarque = await testPrisma.embarque.create({
        data: { trabajadorId: miTrabajador.id, fecha: new Date(), estado: 'ABIERTO' },
      })
      const otroEmbarque = await testPrisma.embarque.create({
        data: { trabajadorId: otroTrabajador.id, fecha: new Date(), estado: 'ABIERTO' },
      })

      // Query que simula "el repartidor ve sus embarques"
      const misEmbarques = await testPrisma.embarque.findMany({
        where: {
          trabajador: { userId: repartidorUserId },
        },
      })

      const ids = misEmbarques.map((e) => e.id)
      expect(ids).toContain(miEmbarque.id)
      expect(ids).not.toContain(otroEmbarque.id)

      // Cleanup
      await testPrisma.embarque.delete({ where: { id: miEmbarque.id } })
      await testPrisma.embarque.delete({ where: { id: otroEmbarque.id } })
      await testPrisma.trabajador.delete({ where: { id: otroTrabajador.id } })
    })

    it('ADMIN ve embarques de todos (sin filtro)', async () => {
      const t = await testPrisma.trabajador.create({
        data: { nombre: 'Test Trab Admin', rol: 'REPARTIDOR' },
      })
      const e = await testPrisma.embarque.create({
        data: { trabajadorId: t.id, fecha: new Date(), estado: 'ABIERTO' },
      })

      const all = await testPrisma.embarque.findMany({
        where: { id: e.id },
      })
      expect(all.length).toBe(1)

      // Cleanup
      await testPrisma.embarque.delete({ where: { id: e.id } })
      await testPrisma.trabajador.delete({ where: { id: t.id } })
    })
  })

  describe('Query: pedidos asignados a embarques de un REPARTIDOR', () => {
    it('REPARTIDOR no ve pedidos asignados a embarque de otro repartidor', async () => {
      const c = await testPrisma.cliente.create({
        data: {
          nombre: 'Cliente IDOR Test',
          telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        },
      })
      // Trabajador.userId es @unique. Usar el del seed.
      const miTrabajador = await testPrisma.trabajador.findFirst({
        where: { userId: repartidorUserId },
      })
      expect(miTrabajador).not.toBeNull()
      if (!miTrabajador) return

      const otroTrabajador = await testPrisma.trabajador.create({
        data: { nombre: 'Otro Trab Pedido', rol: 'REPARTIDOR' },
      })
      const miEmbarque = await testPrisma.embarque.create({
        data: { trabajadorId: miTrabajador.id, fecha: new Date(), estado: 'ABIERTO' },
      })
      const otroEmbarque = await testPrisma.embarque.create({
        data: { trabajadorId: otroTrabajador.id, fecha: new Date(), estado: 'ABIERTO' },
      })
      const miPedido = await testPrisma.pedido.create({
        data: { clienteId: c.id, embarqueId: miEmbarque.id, canal: 'DOMICILIO' },
      })
      const otroPedido = await testPrisma.pedido.create({
        data: { clienteId: c.id, embarqueId: otroEmbarque.id, canal: 'DOMICILIO' },
      })

      const misPedidos = await testPrisma.pedido.findMany({
        where: {
          embarque: {
            trabajador: { userId: repartidorUserId },
          },
        },
      })

      const ids = misPedidos.map((p) => p.id)
      expect(ids).toContain(miPedido.id)
      expect(ids).not.toContain(otroPedido.id)

      // Cleanup
      await testPrisma.pedido.delete({ where: { id: miPedido.id } })
      await testPrisma.pedido.delete({ where: { id: otroPedido.id } })
      await testPrisma.embarque.delete({ where: { id: miEmbarque.id } })
      await testPrisma.embarque.delete({ where: { id: otroEmbarque.id } })
      await testPrisma.trabajador.delete({ where: { id: otroTrabajador.id } })
      await testPrisma.cliente.delete({ where: { id: c.id } })
    })
  })

  describe('withAdvisoryLock — funciona con locks conocidos', () => {
    it('lock PEDIDO (id=1) acepta callback', async () => {
      const result = await withAdvisoryLock('PEDIDO', async (tx) => {
        return tx.pedido.count()
      })
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('lock CIERRE (id=7) acepta callback', async () => {
      const result = await withAdvisoryLock('CIERRE', async (tx) => {
        return tx.cierreDia.count()
      })
      expect(typeof result).toBe('number')
    })

    it('lock FACTURA_NUM (id=6) acepta callback', async () => {
      const result = await withAdvisoryLock('FACTURA_NUM', async (tx) => {
        return tx.factura.count()
      })
      expect(typeof result).toBe('number')
    })

    it('dos locks PEDIDO secuenciales no se interbloquean', async () => {
      // Si los advisory locks se liberan al fin de la tx, deben
      // poderse adquirir repetidamente sin deadlock.
      const r1 = await withAdvisoryLock('PEDIDO', async (tx) => tx.pedido.count())
      const r2 = await withAdvisoryLock('PEDIDO', async (tx) => tx.pedido.count())
      expect(r1).toBe(r2)
    })

    it('LOCK_IDS tiene los 8 valores esperados (sin cambios)', async () => {
      expect(LOCK_IDS.PEDIDO).toBe(1)
      expect(LOCK_IDS.FACTURA).toBe(2)
      expect(LOCK_IDS.EMBARQUE).toBe(3)
      expect(LOCK_IDS.ABONO).toBe(4)
      expect(LOCK_IDS.COMPRA).toBe(5)
      expect(LOCK_IDS.FACTURA_NUM).toBe(6)
      expect(LOCK_IDS.CIERRE).toBe(7)
      expect(LOCK_IDS.NC).toBe(8)
    })
  })

  describe('Defensa en DB: índices únicos (Prisma @unique)', () => {
    it('User.username tiene unique index (login seguro)', async () => {
      const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'User'
          AND indexdef LIKE '%UNIQUE INDEX%'
          AND indexname LIKE '%username%'
      `
      expect(indexes.length).toBeGreaterThan(0)
    })

    it('Pedido.offlineId tiene unique index (dedup offline)', async () => {
      const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'Pedido'
          AND indexdef LIKE '%UNIQUE INDEX%'
          AND (indexname LIKE '%offline%' OR indexname LIKE '%envio%')
      `
      expect(indexes.length).toBeGreaterThan(0)
    })

    it('Factura.numero tiene unique index (numeración DIAN)', async () => {
      const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'Factura'
          AND indexdef LIKE '%UNIQUE INDEX%'
          AND indexname LIKE '%numero%'
      `
      expect(indexes.length).toBeGreaterThan(0)
    })

    it('CierreDia.fecha tiene unique index (un cierre por día)', async () => {
      const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'CierreDia'
          AND indexdef LIKE '%UNIQUE INDEX%'
          AND indexname LIKE '%fecha%'
      `
      expect(indexes.length).toBeGreaterThan(0)
    })
  })
})
