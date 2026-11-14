// @tests #306 — el hueco entre cierres: días sin operación se saltan solos; con operación bloquean.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { listarDiasPendientes, diasObligatoriosAntesDe } from '@/lib/cierre-huecos'
import { startOfDayInBogota } from '@/lib/date-helpers'


describe('#306 días pendientes (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })
  afterAll(async () => {
    await disconnect()
  })

  it('listarDiasPendientes: lista los días sin cierre con sus movimientos; el omitido que recibe movimiento pasa a obligatorio', async () => {
    const admin = await getAdminUser()
    const base = '2032-06-10'
    const d = (n: number) => new Date(startOfDayInBogota(base).getTime() + n * 86_400_000)
    // cierre del 10; el 11 queda omitido; el 12 también se cierra (cierre posterior ya existente); hoy = 13
    await testPrisma.cierreDia.createMany({ data: [{ fecha: d(0), cerradoPor: admin.id }, { fecha: d(2), cerradoPor: admin.id }] })
    const vacio = await testPrisma.$transaction((tx) => listarDiasPendientes(tx, '2032-06-13'))
    expect(vacio.map((x) => [x.fecha, x.operaciones, x.obligatorio])).toEqual([['2032-06-11', 0, false], ['2032-06-13', 0, false]])
    const gasto = await testPrisma.gasto.create({
      data: { fecha: new Date(d(1).getTime() + 3_600_000), categoria: 'OTROS', monto: 1000, descripcion: 'omitido-con-movimiento-306', createdById: admin.id },
    })
    try {
      const conMov = await testPrisma.$transaction((tx) => listarDiasPendientes(tx, '2032-06-13'))
      expect(conMov[0]).toEqual({ fecha: '2032-06-11', operaciones: 1, obligatorio: true })
    } finally {
      await testPrisma.gasto.delete({ where: { id: gasto.id } })
    }
  })

  it('diasObligatoriosAntesDe: solo cuenta los días CON movimiento anteriores a la fecha', async () => {
    const admin = await getAdminUser()
    const base = '2032-07-10'
    const d = (n: number) => new Date(startOfDayInBogota(base).getTime() + n * 86_400_000)
    await testPrisma.cierreDia.create({ data: { fecha: d(0), cerradoPor: admin.id } })
    const gasto = await testPrisma.gasto.create({
      data: { fecha: new Date(d(2).getTime() + 3_600_000), categoria: 'OTROS', monto: 1000, descripcion: 'obligatorio-306', createdById: admin.id },
    })
    try {
      const antesDe14 = await testPrisma.$transaction((tx) => diasObligatoriosAntesDe(tx, '2032-07-14'))
      expect(antesDe14.map((x) => x.fecha)).toEqual(['2032-07-12'])
      const antesDe12 = await testPrisma.$transaction((tx) => diasObligatoriosAntesDe(tx, '2032-07-12'))
      expect(antesDe12).toEqual([]) // el propio día no cuenta contra sí mismo
    } finally {
      await testPrisma.gasto.delete({ where: { id: gasto.id } })
    }
  })
})
