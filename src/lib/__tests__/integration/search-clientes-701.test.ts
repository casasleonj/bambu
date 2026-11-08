// @tests #701 — GET /api/search/clientes: la función SQL search_clientes(text, int) debe existir en la BD de pruebas
// (la crean las migraciones, no `prisma db push`) y la ruta debe llamarla con el tipo correcto (Prisma envía el
// límite como bigint). Handler y PostgreSQL reales; falla si falta la función o si se quita el `::int`.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente } from './setup'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requirePermission: vi.fn(async () => ({ user: actor })),
}))

import { GET as buscar } from '@/app/api/search/clientes/route'

const request = (q: string, limit?: number) =>
  new NextRequest(`http://localhost/api/search/clientes?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`)

describe('#701 — búsqueda semántica de clientes (search_clientes)', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  afterAll(disconnect)

  it('la función search_clientes existe con la firma (text, integer)', async () => {
    const filas = await testPrisma.$queryRaw<Array<{ args: string }>>`
      SELECT pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p WHERE p.proname = 'search_clientes'`
    expect(filas.map((f) => f.args)).toContain('query text, limit_results integer')
  })

  it('encuentra al cliente por nombre y responde 200 (no "función no existe")', async () => {
    const c = await createTestCliente('busq701')
    const res = await buscar(request(c.nombre, 50))
    expect(res.status).toBe(200)
    const json = await res.json()
    const clientes = (json.clientes ?? json.data?.clientes ?? []) as Array<{ id: string }>
    expect(clientes.some((x) => x.id === c.id)).toBe(true)
  })
})
