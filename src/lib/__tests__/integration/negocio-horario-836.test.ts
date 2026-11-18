// #836 F2 — API de negocios con horario semanal (Postgres real; auth simulada). A09 (turno partido), A11, A12.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

let adminId = ''
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: adminId } })),
  requireRole: vi.fn(async () => ({ user: { id: adminId } })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

import { POST, PUT, GET } from '@/app/api/negocios/route'

const partido = (d: number) => [{ diaSemana: d, desde: '06:00', hasta: '12:00' }, { diaSemana: d, desde: '14:00', hasta: '20:00' }]
const req = (method: string, body: unknown, qs = '') =>
  new NextRequest(`http://x/api/negocios${qs}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const cuenta = (negocioId: string) => testPrisma.negocioHorario.count({ where: { negocioId } })

describe('#836 F2 — horario semanal por negocio (API + Postgres real)', () => {
  let clienteId = ''
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({ data: { nombre: 'Cliente Horario', telefono: 'h-836' } })).id
  })
  afterAll(async () => { await disconnect() })

  it('crea un negocio con turno partido y lo devuelve ordenado; sin cambiar horaApertura', async () => {
    const res = await POST(req('POST', { clienteId, nombre: 'Tienda La Esquina', horaApertura: 'Abre a las 7', horarios: [...partido(1), ...partido(2), { diaSemana: 6, desde: '06:00', hasta: '13:00' }] }))
    expect(res.status).toBe(200)
    const j = await res.json()
    const n = j.negocio ?? j.data?.negocio
    expect(n.horarios).toHaveLength(5)
    expect(n.horaApertura).toBe('Abre a las 7')
    expect(await cuenta(n.id)).toBe(5)
  })

  it('un horario inválido se rechaza con 400 y NO crea el negocio (A: tramo 14:00–12:00)', async () => {
    const antes = await testPrisma.negocio.count()
    const res = await POST(req('POST', { clienteId, nombre: 'Negocio Roto', horarios: [{ diaSemana: 1, desde: '14:00', hasta: '12:00' }] }))
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toMatch(/termina antes de empezar/)
    expect(await testPrisma.negocio.count()).toBe(antes)
  })

  it('PUT reemplaza el horario completo; omitirlo no lo toca; [] lo borra', async () => {
    const n = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Negocio PUT', horarios: { create: partido(1) } } })
    expect(await cuenta(n.id)).toBe(2)

    // reemplazo
    let res = await PUT(req('PUT', { horarios: [{ diaSemana: 3, desde: '08:00', hasta: '18:00' }] }, `?id=${n.id}`))
    expect(res.status).toBe(200)
    const filas = await testPrisma.negocioHorario.findMany({ where: { negocioId: n.id } })
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ diaSemana: 3, desde: '08:00', hasta: '18:00' })

    // omitir `horarios`: no se toca
    res = await PUT(req('PUT', { tipoNegocio: 'Tienda' }, `?id=${n.id}`))
    expect(res.status).toBe(200)
    expect(await cuenta(n.id)).toBe(1)

    // [] borra → «sin horario configurado»
    res = await PUT(req('PUT', { horarios: [] }, `?id=${n.id}`))
    expect(res.status).toBe(200)
    expect(await cuenta(n.id)).toBe(0)
  })

  it('un PUT con horario inválido es atómico: el horario anterior queda intacto', async () => {
    const n = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Negocio Atómico', horarios: { create: partido(2) } } })
    const res = await PUT(req('PUT', { tipoNegocio: 'Cambio', horarios: [{ diaSemana: 2, desde: '06:00', hasta: '12:00' }, { diaSemana: 2, desde: '11:00', hasta: '15:00' }] }, `?id=${n.id}`))
    expect(res.status).toBe(400)
    expect(await cuenta(n.id)).toBe(2)
    expect((await testPrisma.negocio.findUniqueOrThrow({ where: { id: n.id } })).tipoNegocio).toBeNull()
  })

  it('A12: dos negocios del mismo cliente tienen horarios independientes', async () => {
    const a = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Negocio A', horarios: { create: partido(1) } } })
    const b = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Negocio B', horarios: { create: [{ diaSemana: 0, desde: '08:00', hasta: '14:00' }] } } })
    await PUT(req('PUT', { horarios: [] }, `?id=${a.id}`))
    expect(await cuenta(a.id)).toBe(0)
    expect(await cuenta(b.id)).toBe(1)
  })

  it('GET /api/negocios?clienteId devuelve los horarios de cada negocio', async () => {
    const res = await GET(new NextRequest(`http://x/api/negocios?clienteId=${clienteId}`))
    const j = await res.json()
    const lista = j.data ?? j.negocios ?? j
    const esquina = lista.find((x: { nombre: string }) => x.nombre === 'Tienda La Esquina')
    expect(esquina.horarios.length).toBe(5)
  })

  it('borrar el negocio borra sus tramos (cascada)', async () => {
    const n = await testPrisma.negocio.create({ data: { clienteId, nombre: 'Negocio Efímero', horarios: { create: partido(4) } } })
    await testPrisma.negocio.delete({ where: { id: n.id } })
    expect(await cuenta(n.id)).toBe(0)
  })
})
