// @tests #748: un Dashboard jamás hereda BASE_DIA global como base vigente.
import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { PrismaConfigRepository } from '../config.repository'

const HOY = 'BASE_DIA_2026-11-11'

function crearLector(configuraciones: Record<string, string>) {
  const findUnique = vi.fn(async ({ where }: { where: { clave: string } }) => {
    const valor = configuraciones[where.clave]
    return valor === undefined ? null : {
      clave: where.clave, valor, updatedAt: new Date('2026-11-11T14:00:00Z'),
    }
  })
  const db = { config: { findUnique }, cierreDia: {} } as unknown as Prisma.TransactionClient
  return { repo: new PrismaConfigRepository(db), findUnique }
}

describe('#748: Dashboard consulta la base registrada para ESA fecha', () => {
  it('ayer tenía base $50.000 y la global sigue en $50.000, hoy no tiene: retorna ausencia informativa como 0', async () => {
    const { repo, findUnique } = crearLector({ BASE_DIA: '50000', BASE_DIA_2026_11_10: '50000' })
    expect(await repo.getBaseDia(HOY)).toBe(0)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(findUnique).toHaveBeenCalledWith({ where: { clave: HOY } })
  })

  it('la base de hoy se usa aunque difiera de la global y de ayer', async () => {
    const { repo, findUnique } = crearLector({ BASE_DIA: '50000', [HOY]: '75000' })
    expect(await repo.getBaseDia(HOY)).toBe(75000)
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it.each(['0', '-5000', 'NaN', 'texto'])('clave diaria no válida %s se considera no registrada, no cae a BASE_DIA', async (valor) => {
    const { repo } = crearLector({ BASE_DIA: '50000', [HOY]: valor })
    expect(await repo.getBaseDia(HOY)).toBe(0)
  })
})
