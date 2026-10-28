// #515: consultas independientes de las fechas y facetas de Pedidos.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { GET } from '@/app/api/pedidos/route'

describe('#515 — Fiados/Alertas no heredan Ayer de Pedidos', () => {
  let clienteId: string
  const ids: string[] = []
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: 'ADMIN' }, expires: '2099-01-01' })
    clienteId = (await testPrisma.cliente.create({ data: { nombre: 'Scope sintético', telefono: randomUUID() } })).id
    for (const dias of [0, 8]) {
      ids.push((await testPrisma.pedido.create({ data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
        estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
        fecha: new Date(Date.now() - dias * 86400000),
      } })).id)
    }
  })
  afterAll(disconnect)
  it.each(['fiados', 'alertas'])('%s ignora fecha, canal, estado, recurrencia y vistas atrasados heredadas', async scope => {
    const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const query = new URLSearchParams({ scope, clienteId, desde: ayer, hasta: ayer,
      canal: 'PUNTO', estadoEntrega: 'ANULADO', estadoPago: 'PAGADO', origen: 'RECURRENTE',
      conRecurrencia: 'true', atrasados: 'true', enRiesgo: 'true' })
    const res = await GET(new NextRequest('http://localhost/api/pedidos?' + query))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.total).toBe(2)
    expect((data.pedidos ?? data.data).map((p: { id: string }) => p.id).sort()).toEqual([...ids].sort())
  })
  it('pagina el scope completo sin repetir la primera página de all=true', async () => {
    const pages = []
    for (const page of [1, 2]) {
      const res = await GET(new NextRequest(`http://localhost/api/pedidos?scope=fiados&all=true&pageSize=1&page=${page}&clienteId=${clienteId}`))
      const data = await res.json()
      expect(data.total).toBe(2)
      expect(data.pedidos).toHaveLength(1)
      pages.push(data.pedidos[0].id)
    }
    expect(new Set(pages)).toEqual(new Set(ids))
  })
})
