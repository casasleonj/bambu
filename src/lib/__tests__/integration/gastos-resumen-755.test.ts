// @tests #755 — total financiero del rango independiente de la página (PostgreSQL real).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect } from './setup'

vi.mock('@/lib/auth-check', () => ({
  requireRole: vi.fn(async () => ({ user: { id: 'test-admin', role: 'ADMIN' } })),
  requireAuth: vi.fn(async () => ({ user: { id: 'test-admin', role: 'ADMIN' } })),
}))

import { GET as listarGastos } from '@/app/api/gastos/route'

const DIA = '2031-04-13'
const OTRO_DIA = '2031-04-14'

const consultar = async (query: string) => {
  const response = await listarGastos(new NextRequest(`http://localhost/api/gastos?${query}`))
  expect(response.status).toBe(200)
  return response.json()
}

describe('#755 resumen de gastos completo con páginas', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await testPrisma.gasto.createMany({
      data: [
        ...Array.from({ length: 25 }, (_, index) => ({
          fecha: new Date(`${DIA}T12:00:00-05:00`),
          categoria: 'OTRO',
          descripcion: `Gasto paginado #${index + 1}`,
          monto: '1000.25',
        })),
        // Un ajuste negativo existente no se debe tratar como pago a caja sin
        // una regla de negocio explícita; aquí solo se comprueba la suma algebraica.
        {
          fecha: new Date(`${DIA}T12:30:00-05:00`),
          categoria: 'OTRO',
          descripcion: 'Contrapartida sintética',
          monto: '-10.25',
        },
        {
          fecha: new Date(`${DIA}T12:30:00-05:00`),
          categoria: 'NOMINA',
          descripcion: 'Pago nómina de prueba',
          monto: '6000',
        },
        {
          fecha: new Date(`${DIA}T12:40:00-05:00`),
          categoria: 'OTRO',
          descripcion: 'Reversión nómina anulada - prueba',
          monto: '-6000',
        },
        {
          fecha: new Date(`${DIA}T12:50:00-05:00`),
          categoria: 'OTRO',
          descripcion: 'Registro histórico de personal',
          esPagoPersonal: true,
          monto: '5000',
        },
        {
          fecha: new Date(`${OTRO_DIA}T12:00:00-05:00`),
          categoria: 'OTRO',
          descripcion: 'Fuera del filtro',
          monto: '80.50',
        },
      ],
    })
  })

  afterAll(async () => { await disconnect() })

  it('devuelve 20 filas pero cantidad e importe de los 26 registros filtrados', async () => {
    const result = await consultar(`fecha=${DIA}`)
    expect(result.data).toHaveLength(20)
    expect(result.total).toBe(29)
    expect(result.totalPages).toBe(2)
    expect(result.hasMore).toBe(true)
    expect(result.montoTotal).toBe(29996)
  })

  it('conserva el mismo importe en la segunda página sin duplicar ni truncar', async () => {
    const result = await consultar(`fecha=${DIA}&page=2`)
    expect(result.data).toHaveLength(9)
    expect(result.total).toBe(29)
    expect(result.hasMore).toBe(false)
    expect(result.montoTotal).toBe(29996)
  })

  it('aplica el mismo filtro por rango a filas, cantidad e importe', async () => {
    const range = await consultar(`desde=${DIA}&hasta=${DIA}&pageSize=10`)
    expect(range.data).toHaveLength(10)
    expect(range.total).toBe(29)
    expect(range.montoTotal).toBe(29996)
    const nextDay = await consultar(`fecha=${OTRO_DIA}`)
    expect(nextDay.total).toBe(1)
    expect(nextDay.montoTotal).toBe(80.5)
  })


  it('separa el resumen operativo de Nómina y reversas automáticas sin afectar el resumen contable global', async () => {
    const operativos = await consultar(`fecha=${DIA}&origen=OPERATIVO`)
    expect(operativos.total).toBe(26)
    expect(operativos.montoTotal).toBe(24996)
    const global = await consultar(`fecha=${DIA}`)
    expect(global.total).toBe(29)
    expect(global.montoTotal).toBe(29996)
  })

  it('mantiene el contrato all=true: sin fecha ni paginación y con monto global', async () => {
    const result = await consultar(`all=true&fecha=${DIA}`)
    const aggregate = await testPrisma.gasto.aggregate({ _sum: { monto: true } })
    expect(result.total).toBe(await testPrisma.gasto.count())
    expect(result.gastos).toHaveLength(result.total)
    expect(result.montoTotal).toBe(Number(aggregate._sum.monto ?? 0))
  })
})
