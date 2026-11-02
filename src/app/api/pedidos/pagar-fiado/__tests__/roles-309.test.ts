// @tests #309 — separación de funciones: quien COBRA un fiado (ADMIN, ASISTENTE) no es quien REVIERTE
// un abono (ADMIN, CONTADOR). Decisión del PO (2026-11-02): se mantiene así; el CONTADOR no cobra y el
// ASISTENTE no corrige. El permiso se comprueba antes de leer el cuerpo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))

import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { POST as corregirAbono } from '@/app/api/cartera/abonos/[id]/corregir/route'

const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: 'u1', role }, expires: '2099-01-01T00:00:00.000Z' })
const peticion = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })

describe('#309 roles de cobrar un fiado y de corregir un abono', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el CONTADOR no puede cobrar un fiado', async () => {
    como('CONTADOR')
    expect((await pagarFiado(peticion('/api/pedidos/pagar-fiado'))).status).toBe(403)
  })

  it('el REPARTIDOR no puede cobrar un fiado', async () => {
    como('REPARTIDOR')
    expect((await pagarFiado(peticion('/api/pedidos/pagar-fiado'))).status).toBe(403)
  })

  it('el ASISTENTE no puede corregir un abono', async () => {
    como('ASISTENTE')
    const res = await corregirAbono(peticion('/api/cartera/abonos/a1/corregir'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })

  it('el REPARTIDOR no puede corregir un abono', async () => {
    como('REPARTIDOR')
    const res = await corregirAbono(peticion('/api/cartera/abonos/a1/corregir'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })

  it('el ASISTENTE sí pasa el control de rol al cobrar (no recibe 403)', async () => {
    como('ASISTENTE')
    expect((await pagarFiado(peticion('/api/pedidos/pagar-fiado'))).status).not.toBe(403)
  })

  it('el CONTADOR sí pasa el control de rol al corregir (no recibe 403)', async () => {
    como('CONTADOR')
    const res = await corregirAbono(peticion('/api/cartera/abonos/a1/corregir'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).not.toBe(403)
  })
})
