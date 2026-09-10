// @tests Barrio canónico (F1) — integración DB real
// Cubre invariantes que solo la base de datos puede garantizar: unicidad
// de nombreNormalizado (incluyendo archivados), FK Cliente/Negocio→Barrio
// con ON DELETE SET NULL, y sincronización atómica del rename.
//
// NOTA: no ejecutado en el sandbox de esta sesión (sin Postgres/Docker
// disponible) — requiere `docker compose up -d` local o el runner de CI.
//
// FIX (visto en CI): `instanceof PrismaClientKnownRequestError` no es
// confiable bajo este entorno vitest+jsdom (mismo motivo documentado en
// setup.ts sobre "@/lib/prisma crea un ciclo en jsdom" — dos resoluciones
// de módulo del runtime de Prisma no son el mismo constructor). Todos los
// demás tests de integración de este repo ya evitan `instanceof` para este
// caso y matchean el mensaje/código como string (ver abono-idempotencia.test.ts,
// cierre-idempotencia.test.ts) — seguimos esa misma convención probada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId, createTestCliente } from './setup'
import {
  crearBarrio,
  renombrarBarrio,
  archivarBarrio,
  reactivarBarrio,
} from '@/lib/barrios/barrio-service'

describe('Barrio canónico — integración DB real', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('unicidad: dos barrios con el mismo nombre normalizado chocan (P2002)', async () => {
    const nombre = `La Esperanza ${uniqueId()}`
    await crearBarrio(nombre)

    await expect(crearBarrio(`  ${nombre.toUpperCase()}  `)).rejects.toThrow(
      /Unique constraint failed|P2002/,
    )
  })

  it('un barrio archivado no puede "liberar" su nombre para un duplicado — hay que reactivarlo', async () => {
    const nombre = `Archivado ${uniqueId()}`
    const barrio = await crearBarrio(nombre)
    await archivarBarrio(barrio.id)

    await expect(crearBarrio(nombre)).rejects.toThrow(/Unique constraint failed|P2002/)

    const reactivado = await reactivarBarrio(barrio.id)
    expect(reactivado.id).toBe(barrio.id)
    expect(reactivado.activo).toBe(true)
  })

  it('FK Cliente→Barrio: vincular un cliente real persiste barrioId', async () => {
    const barrio = await crearBarrio(`Vinculo Cliente ${uniqueId()}`)
    const cliente = await createTestCliente(uniqueId('cli'))

    await testPrisma.cliente.update({ where: { id: cliente.id }, data: { barrioId: barrio.id } })

    const actualizado = await testPrisma.cliente.findUnique({ where: { id: cliente.id } })
    expect(actualizado?.barrioId).toBe(barrio.id)
  })

  it('ON DELETE SET NULL: si el Barrio se elimina, Cliente.barrioId cae a null (no rompe FK)', async () => {
    const barrio = await crearBarrio(`Para Borrar ${uniqueId()}`)
    const cliente = await createTestCliente(uniqueId('cli'))
    await testPrisma.cliente.update({ where: { id: cliente.id }, data: { barrioId: barrio.id } })

    // La app nunca hace hard-delete de Barrio (R10 del ALS) — este delete
    // directo solo prueba que la FK constraint está bien configurada.
    await testPrisma.barrio.delete({ where: { id: barrio.id } })

    const actualizado = await testPrisma.cliente.findUnique({ where: { id: cliente.id } })
    expect(actualizado?.barrioId).toBeNull()
  })

  it('rename sincroniza atómicamente Cliente.barrio y Negocio.barrio vinculados', async () => {
    const barrio = await crearBarrio(`Nombre Viejo ${uniqueId()}`)
    const cliente1 = await createTestCliente(uniqueId('cli1'))
    const cliente2 = await createTestCliente(uniqueId('cli2'))
    await testPrisma.cliente.update({ where: { id: cliente1.id }, data: { barrioId: barrio.id, barrio: barrio.nombre } })
    await testPrisma.cliente.update({ where: { id: cliente2.id }, data: { barrioId: barrio.id, barrio: barrio.nombre } })

    const negocio = await testPrisma.negocio.create({
      data: {
        clienteId: cliente1.id,
        nombre: `Negocio ${uniqueId()}`,
        barrioId: barrio.id,
        barrio: barrio.nombre,
      },
    })

    const nuevoNombre = `Nombre Nuevo ${uniqueId()}`
    const resultado = await renombrarBarrio(barrio.id, nuevoNombre)

    expect(resultado.barrio.id).toBe(barrio.id)
    expect(resultado.barrio.nombre).toBe(nuevoNombre)
    expect(resultado.clientesSincronizados).toBe(2)
    expect(resultado.negociosSincronizados).toBe(1)

    const c1 = await testPrisma.cliente.findUnique({ where: { id: cliente1.id } })
    const c2 = await testPrisma.cliente.findUnique({ where: { id: cliente2.id } })
    const n1 = await testPrisma.negocio.findUnique({ where: { id: negocio.id } })
    expect(c1?.barrio).toBe(nuevoNombre)
    expect(c2?.barrio).toBe(nuevoNombre)
    expect(n1?.barrio).toBe(nuevoNombre)
  })

  it('rename no afecta clientes de OTRO barrio', async () => {
    const barrioA = await crearBarrio(`Barrio A ${uniqueId()}`)
    const barrioB = await crearBarrio(`Barrio B ${uniqueId()}`)
    const clienteB = await createTestCliente(uniqueId('cliB'))
    await testPrisma.cliente.update({
      where: { id: clienteB.id },
      data: { barrioId: barrioB.id, barrio: barrioB.nombre },
    })

    await renombrarBarrio(barrioA.id, `Barrio A Renombrado ${uniqueId()}`)

    const actualizado = await testPrisma.cliente.findUnique({ where: { id: clienteB.id } })
    expect(actualizado?.barrio).toBe(barrioB.nombre)
  })
})
