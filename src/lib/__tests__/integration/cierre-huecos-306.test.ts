// @tests #306 — el hueco entre cierres: días sin operación se saltan solos; con operación bloquean.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente } from './setup'
import { analizarHueco, MAX_DIAS_HUECO, motivoSaltoValido } from '@/lib/cierre-huecos'
import { startOfDayInBogota } from '@/lib/date-helpers'

// Fechas lejanas: no chocan con lo sembrado ni con otros tests.
const DIA0 = '2031-03-01' // último cierre
const dia = (n: number) => new Date(startOfDayInBogota(DIA0).getTime() + n * 86_400_000)

describe('#306 analizarHueco (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })
  afterAll(async () => {
    await disconnect()
  })

  it('sin días entre medio: no hay hueco', async () => {
    const r = await testPrisma.$transaction((tx) => analizarHueco(tx, dia(0), dia(1)))
    expect(r).toEqual({ dias: [], conOperacion: [], excedeTope: false })
  })

  it('días intermedios sin operación: se listan con 0 y no bloquean', async () => {
    const r = await testPrisma.$transaction((tx) => analizarHueco(tx, dia(0), dia(3)))
    expect(r.dias.map((d) => d.fecha)).toEqual(['2031-03-02', '2031-03-03'])
    expect(r.dias.every((d) => d.operaciones === 0)).toBe(true)
    expect(r.conOperacion).toEqual([])
    expect(r.excedeTope).toBe(false)
  })

  it('un día intermedio con un gasto: ese día bloquea y el otro no', async () => {
    const admin = await getAdminUser()
    const gasto = await testPrisma.gasto.create({
      data: { fecha: new Date(dia(1).getTime() + 3_600_000), categoria: 'OTROS', monto: 5000, descripcion: 'hueco-306', createdById: admin.id },
    })
    try {
      const r = await testPrisma.$transaction((tx) => analizarHueco(tx, dia(0), dia(3)))
      expect(r.conOperacion).toEqual([{ fecha: '2031-03-02', operaciones: 1 }])
      expect(r.dias).toHaveLength(2)
    } finally {
      await testPrisma.gasto.delete({ where: { id: gasto.id } })
    }
  })

  it('un día intermedio con un pedido: bloquea', async () => {
    const cliente = await getSeededCliente()
    const pedido = await testPrisma.pedido.create({
      data: { clienteId: cliente.id, fecha: new Date(dia(2).getTime() + 7_200_000), total: 1000, saldo: 1000 },
    })
    try {
      const r = await testPrisma.$transaction((tx) => analizarHueco(tx, dia(0), dia(3)))
      expect(r.conOperacion.map((d) => d.fecha)).toEqual(['2031-03-03'])
    } finally {
      await testPrisma.pedido.delete({ where: { id: pedido.id } })
    }
  })

  it('un hueco más largo que el tope se marca como excedido (hay que cerrar primero)', async () => {
    const r = await testPrisma.$transaction((tx) => analizarHueco(tx, dia(0), dia(MAX_DIAS_HUECO + 2)))
    expect(r.excedeTope).toBe(true)
    expect(r.dias).toEqual([])
  })

  it('el motivo del salto exige texto real (mínimo 10 caracteres)', () => {
    expect(motivoSaltoValido(undefined)).toBe(false)
    expect(motivoSaltoValido('   corto  ')).toBe(false)
    expect(motivoSaltoValido('Feria sin cierre, se concilia a mano')).toBe(true)
  })
})
