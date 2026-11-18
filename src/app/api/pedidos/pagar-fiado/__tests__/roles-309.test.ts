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
import { POST as corregirPago } from '@/app/api/pagos/[id]/corregir/route'

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

// #796 / ADR-CORRECCION-MONETARIA-002: corregir un PAGO sin abono conserva exactamente la misma separación de funciones.
describe('#796 roles de corregir un pago sin abono (misma regla que corregir un abono)', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.CORRECCION_PAGO_SIN_ABONO = 'true' })
  const corregir = () => corregirPago(peticion('/api/pagos/g1/corregir'), { params: Promise.resolve({ id: 'g1' }) })

  it('el ASISTENTE (quien cobra) no puede corregir un pago, aunque la bandera esté encendida', async () => {
    como('ASISTENTE')
    expect((await corregir()).status).toBe(403)
  })

  it('el REPARTIDOR no puede corregir un pago', async () => {
    como('REPARTIDOR')
    expect((await corregir()).status).toBe(403)
  })

  it('el CONTADOR sí pasa el control de rol (no recibe 403 de permiso)', async () => {
    como('CONTADOR')
    const res = await corregir()
    // Con la bandera encendida llega a validar el cuerpo vacío: 400, nunca el 403 de permiso.
    expect(res.status).toBe(400)
  })

  it('con la bandera apagada, incluso un ADMIN recibe 403 FUNCION_DESACTIVADA y no se toca nada', async () => {
    delete process.env.CORRECCION_PAGO_SIN_ABONO
    como('ADMIN')
    const res = await corregir()
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).toContain('FUNCION_DESACTIVADA')
  })
})
