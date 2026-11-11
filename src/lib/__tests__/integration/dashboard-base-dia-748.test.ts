// @tests #748 — Dashboard y Cierre leen la misma base diaria en PostgreSQL real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { PrismaConfigRepository } from '@/modules/dashboard/infrastructure/config.repository'
import { leerBaseDelDia } from '@/lib/base-caja-dia'

const fecha = '2039-01-15'
const clave = 'BASE_DIA_' + fecha
const lector = new PrismaConfigRepository(testPrisma)

describe('#748 — base única Dashboard ↔ Cierre (PostgreSQL)', () => {
  beforeAll(resetAndSeed)
  afterAll(disconnect)
  it('el valor global 50.000 no se copia a un día sin base', async () => {
    await testPrisma.config.upsert({
      where: { clave: 'BASE_DIA' },
      update: { valor: '50000' },
      create: { clave: 'BASE_DIA', valor: '50000' },
    })
    await testPrisma.config.deleteMany({ where: { clave } })
    expect(await leerBaseDelDia(testPrisma, fecha)).toBeNull()
    expect(await lector.getBaseDia(clave)).toBe(0)
  })

  it('al registrar base del día ambos lectores concuerdan, sin usar la global', async () => {
    await testPrisma.config.upsert({
      where: { clave }, update: { valor: '75000' }, create: { clave, valor: '75000' },
    })
    expect((await leerBaseDelDia(testPrisma, fecha))?.valor).toBe(75000)
    expect(await lector.getBaseDia(clave)).toBe(75000)
    await testPrisma.config.update({ where: { clave }, data: { valor: '40000' } })
    expect((await leerBaseDelDia(testPrisma, fecha))?.valor).toBe(40000)
    expect(await lector.getBaseDia(clave)).toBe(40000)
  })

  it('base diaria cero no se da por confirmada ni se reemplaza por la global', async () => {
    await testPrisma.config.update({ where: { clave }, data: { valor: '0' } })
    expect(await leerBaseDelDia(testPrisma, fecha)).toBeNull()
    expect(await lector.getBaseDia(clave)).toBe(0)
  })
})
