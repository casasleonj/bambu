// @tests Fase 8 F8-0 (docs/pedidos/fase8-recurrentes-flujo-plan.md):
//   - nav: "Recurrente" deja de ser sub-sección del nav (G2)
//   - roles: ADMIN + ASISTENTE operan recurrencia desde el Hub (Q1);
//     DELETE sigue administrativo
//   - contrato cliente/negocio: regla determinista única (Q4)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { RecurrenteCreateSchema } from '@/app/api/recurrentes/route'

const navSrc = readFileSync(join(process.cwd(), 'src/app/(app)/nav-data.tsx'), 'utf-8')
const recRoute = readFileSync(join(process.cwd(), 'src/app/api/recurrentes/route.ts'), 'utf-8')
const genRoute = readFileSync(join(process.cwd(), 'src/app/api/pedidos/recurrentes/route.ts'), 'utf-8')

describe('F8-0 — nav (G2)', () => {
  it('Pedidos ya no tiene subItems "Únicos / Recurrentes"', () => {
    const pedidosItem = navSrc.slice(navSrc.indexOf("href: '/pedidos'"), navSrc.indexOf("href: '/pedidos'") + 400)
    expect(pedidosItem).not.toMatch(/subItems/)
    expect(navSrc).not.toMatch(/label: 'Únicos'/)
  })

  it('/recurrentes ya no está en el nav como destino', () => {
    expect(navSrc).not.toMatch(/href: '\/recurrentes'/)
  })
})

describe('F8-0 — roles (Q1): ADMIN + ASISTENTE operan recurrencia', () => {
  it('POST /api/recurrentes acepta ASISTENTE', () => {
    const post = recRoute.slice(recRoute.indexOf('export async function POST'), recRoute.indexOf('export async function PUT'))
    expect(post).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE/)
  })

  it('PUT /api/recurrentes acepta ASISTENTE', () => {
    const put = recRoute.slice(recRoute.indexOf('export async function PUT'), recRoute.indexOf('export async function DELETE'))
    expect(put).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE/)
  })

  it('POST /api/pedidos/recurrentes (generar) acepta ASISTENTE', () => {
    expect(genRoute).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE/)
  })

  it('DELETE /api/recurrentes sigue SIN ASISTENTE (operación administrativa distinta)', () => {
    const del = recRoute.slice(recRoute.indexOf('export async function DELETE'))
    expect(del).toMatch(/requireRole\(\[['"]ADMIN['"],\s*['"]CONTADOR['"]\]/)
    expect(del).not.toMatch(/ASISTENTE/)
  })

  it('"pausar" NO es borrado físico — DELETE es soft (activo:false), no prisma.delete', () => {
    const del = recRoute.slice(recRoute.indexOf('export async function DELETE'))
    expect(del).toMatch(/activo:\s*false|update/)
    expect(del).not.toMatch(/plantillaRecurrente\.delete\b/)
  })
})

describe('F8-0 — contrato cliente/negocio (Q4): regla determinista única', () => {
  const post = recRoute.slice(recRoute.indexOf('const RecurrenteCreateSchema'), recRoute.indexOf('export async function PUT'))

  it('el schema acepta clienteId Y negocioId opcionales, con refine XOR', () => {
    expect(post).toMatch(/clienteId:\s*z\.string\(\)\.min\(1\)\.optional\(\)/)
    expect(post).toMatch(/negocioId:\s*z\.string\(\)\.min\(1\)\.optional\(\)/)
    expect(post).toMatch(/Boolean\(data\.clienteId\)\s*!==\s*Boolean\(data\.negocioId\)/)
  })

  it('el POST resuelve el contexto: negocio si negocioId, si no cliente — sin fallback silencioso', () => {
    expect(post).toMatch(/negocioId\s*\?\s*\{[^}]*negocioId[^}]*\}\s*:\s*\{[^}]*clienteId/)
    // la unicidad se evalúa sobre el contexto resuelto
    expect(post).toMatch(/findUnique\(\{\s*where:\s*negocioId\s*\?\s*\{\s*negocioId\s*\}\s*:\s*\{\s*clienteId/)
  })

  it('el 409 de "ya existe" cubre cliente Y negocio', () => {
    expect(post).toMatch(/cliente o negocio ya tiene un pedido habitual/)
  })

  it('GET /api/recurrentes filtra por clienteId O negocioId', () => {
    const get = recRoute.slice(recRoute.indexOf('export async function GET'), recRoute.indexOf('export async function POST'))
    expect(get).toMatch(/searchParams\.get\('clienteId'\)/)
    expect(get).toMatch(/searchParams\.get\('negocioId'\)/)
    expect(get).toMatch(/negocioId\s*\)\s*where\.negocioId|where\.negocioId\s*=/)
  })
})

describe('F8-0 — RecurrenteCreateSchema behavioral (XOR cliente/negocio)', () => {
  const productos = { pacaAgua: 3 }

  it('acepta solo clienteId', () => {
    expect(RecurrenteCreateSchema.safeParse({ clienteId: 'c1', productos }).success).toBe(true)
  })
  it('acepta solo negocioId', () => {
    expect(RecurrenteCreateSchema.safeParse({ negocioId: 'n1', productos }).success).toBe(true)
  })
  it('rechaza ambos', () => {
    expect(RecurrenteCreateSchema.safeParse({ clienteId: 'c1', negocioId: 'n1', productos }).success).toBe(false)
  })
  it('rechaza ninguno', () => {
    expect(RecurrenteCreateSchema.safeParse({ productos }).success).toBe(false)
  })
  it('sigue exigiendo >=3 productos', () => {
    expect(RecurrenteCreateSchema.safeParse({ clienteId: 'c1', productos: { pacaAgua: 2 } }).success).toBe(false)
  })
})
