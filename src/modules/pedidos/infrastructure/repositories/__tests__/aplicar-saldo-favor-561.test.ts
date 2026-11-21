// @tests #561 — `aplicarSaldoFavor` no puede dejar `Cliente.saldoFavor` negativo.
//
// El defecto original leía el saldo y después hacía `decrement` sin condición.
// Dos pedidos del mismo cliente creados a la vez, en transacciones distintas,
// leían el mismo saldo y lo descontaban dos veces. El lock de crear pedido es
// por SECUENCIA, no por cliente, así que no serializaba estas dos operaciones.
//
// Batería adversarial contra Postgres real (DATABASE_URL de .env, puerto 5433).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente } from '@/lib/__tests__/integration/setup'
import { PrismaClienteRepository } from '../PrismaClienteRepository'

let repo: PrismaClienteRepository

beforeAll(async () => {
  await resetAndSeed()
  repo = new PrismaClienteRepository()
}, 120_000)

afterAll(async () => {
  await disconnect()
})

async function saldo(id: string): Promise<number> {
  const c = await testPrisma.cliente.findUnique({ where: { id }, select: { saldoFavor: true } })
  return Number(c?.saldoFavor ?? 0)
}

async function fijarSaldo(id: string, monto: number) {
  await testPrisma.cliente.update({ where: { id }, data: { saldoFavor: monto } })
}

describe('aplicarSaldoFavor — el saldo nunca queda negativo (#561)', () => {
  it('aplica lo disponible y no más', async () => {
    const c = await createTestCliente('sf01')
    await fijarSaldo(c.id, 5000)
    const aplicado = await repo.aplicarSaldoFavor(c.id, 3000)
    expect(aplicado).toBe(3000)
    expect(await saldo(c.id)).toBe(2000)
  })

  it('pedir más de lo disponible aplica solo el saldo y deja cero', async () => {
    const c = await createTestCliente('sf02')
    await fijarSaldo(c.id, 2500)
    const aplicado = await repo.aplicarSaldoFavor(c.id, 10000)
    expect(aplicado).toBe(2500)
    expect(await saldo(c.id)).toBe(0)
  })

  it('saldo en cero no aplica nada ni falla', async () => {
    const c = await createTestCliente('sf03')
    expect(await repo.aplicarSaldoFavor(c.id, 1000)).toBe(0)
    expect(await saldo(c.id)).toBe(0)
  })

  it('DOS aplicaciones concurrentes no dejan el saldo negativo ni aplican de más', async () => {
    const c = await createTestCliente('sf04')
    await fijarSaldo(c.id, 5000)

    // Ambas piden 5000 sobre un saldo de 5000: una sola puede ganar.
    // Con el código viejo (leer + decrement sin condición) las dos restaban
    // 5000 y el saldo quedaba en -5000.
    const [a, b] = await Promise.all([
      repo.aplicarSaldoFavor(c.id, 5000),
      repo.aplicarSaldoFavor(c.id, 5000),
    ])

    const final = await saldo(c.id)
    expect(final).toBeGreaterThanOrEqual(0)
    expect(final).toBe(0)
    // El total aplicado no puede superar lo que había.
    expect(a + b).toBe(5000)
  })

  it('cuatro concurrentes sobre un saldo que alcanza para dos: se aplica exactamente lo disponible', async () => {
    const c = await createTestCliente('sf05')
    await fijarSaldo(c.id, 4000)

    const resultados = await Promise.all(
      Array.from({ length: 4 }, () => repo.aplicarSaldoFavor(c.id, 2000)),
    )

    const totalAplicado = resultados.reduce((s, r) => s + r, 0)
    const final = await saldo(c.id)
    expect(final).toBeGreaterThanOrEqual(0)
    expect(totalAplicado).toBeLessThanOrEqual(4000)
    // Dinero conservado: lo aplicado + lo que queda = lo que había.
    expect(totalAplicado + final).toBe(4000)
  })
})
