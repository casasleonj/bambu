// @tests src/lib/trabajadores-deuda.ts — #566 (deuda pendiente en la tarjeta del trabajador)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const groupBy = vi.fn()
vi.mock('../prisma', () => ({ prisma: { deudaTrabajador: { groupBy: (...a: unknown[]) => groupBy(...a) } } }))
vi.mock('../logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { deudaPendientePorTrabajador, conDeudaPendiente } from '../trabajadores-deuda'

// Decimal de Prisma: lo único que usamos es que Number() lo convierta.
const dec = (n: number) => ({ valueOf: () => n, toString: () => String(n) })

describe('deudaPendientePorTrabajador', () => {
  beforeEach(() => { groupBy.mockReset() })

  it('sin trabajadores no consulta la base', async () => {
    const r = await deudaPendientePorTrabajador([])
    expect(r.size).toBe(0)
    expect(groupBy).not.toHaveBeenCalled()
  })

  it('suma el saldo pendiente y deja 0 a quien no tiene deuda', async () => {
    groupBy.mockResolvedValue([{ trabajadorId: 'a', _sum: { montoPendiente: dec(60000) } }])
    const r = await deudaPendientePorTrabajador(['a', 'b'])
    expect(r.get('a')).toBe(60000)
    expect(r.get('b')).toBe(0)
  })

  it('solo cuenta deudas con saldo > 0 y solo de los trabajadores pedidos, en una consulta', async () => {
    groupBy.mockResolvedValue([])
    await deudaPendientePorTrabajador(['a', 'b'])
    expect(groupBy).toHaveBeenCalledTimes(1)
    const arg = groupBy.mock.calls[0][0]
    expect(arg.where).toEqual({ trabajadorId: { in: ['a', 'b'] }, montoPendiente: { gt: 0 } })
    expect(arg.by).toEqual(['trabajadorId'])
  })

  it('suma nula (null) se trata como 0', async () => {
    groupBy.mockResolvedValue([{ trabajadorId: 'a', _sum: { montoPendiente: null } }])
    expect((await deudaPendientePorTrabajador(['a'])).get('a')).toBe(0)
  })

  it('si la consulta falla devuelve null (no 0) para cada trabajador y no lanza', async () => {
    groupBy.mockRejectedValue(new Error('db caída'))
    const r = await deudaPendientePorTrabajador(['a', 'b'])
    expect(r.get('a')).toBeNull()
    expect(r.get('b')).toBeNull()
  })
})

describe('conDeudaPendiente', () => {
  beforeEach(() => { groupBy.mockReset() })

  it('agrega deudaPendiente sin mutar el original y conserva el resto de campos', async () => {
    groupBy.mockResolvedValue([{ trabajadorId: 'a', _sum: { montoPendiente: dec(1245500.5) } }])
    const original = [{ id: 'a', nombre: 'Andrés' }, { id: 'b', nombre: 'Marta' }]
    const r = await conDeudaPendiente(original)
    expect(r).toEqual([
      { id: 'a', nombre: 'Andrés', deudaPendiente: 1245500.5 },
      { id: 'b', nombre: 'Marta', deudaPendiente: 0 },
    ])
    expect(original[0]).toEqual({ id: 'a', nombre: 'Andrés' })
  })

  it('falla de la consulta: la lista sigue completa con deudaPendiente null', async () => {
    groupBy.mockRejectedValue(new Error('x'))
    const r = await conDeudaPendiente([{ id: 'a' }])
    expect(r).toEqual([{ id: 'a', deudaPendiente: null }])
  })
})
