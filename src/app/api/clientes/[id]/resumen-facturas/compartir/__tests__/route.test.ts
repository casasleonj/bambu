// @tests POST /api/clientes/[id]/resumen-facturas/compartir — registro de envío preparado (#845)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindUnique = vi.fn()
const logAudit = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({ prisma: { cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) } } }))
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }))

const post = async (body: unknown) => {
  const { POST } = await import('../route')
  return POST(
    new NextRequest('http://localhost/api/clientes/c1/resumen-facturas/compartir', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: 'c1' }) },
  )
}

describe('POST /api/clientes/[id]/resumen-facturas/compartir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ASISTENTE' } })
    clienteFindUnique.mockResolvedValue({ id: 'c1' })
    logAudit.mockResolvedValue(undefined)
  })

  it('solo ADMIN y ASISTENTE', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    expect((await post({ canal: 'whatsapp' })).status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'ASISTENTE'])
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('anota que se preparó el envío, sin afirmar entrega ni lectura', async () => {
    const res = await post({ canal: 'whatsapp', estado: 'PARCIAL', desde: '2026-11-01', hasta: '2026-11-17', facturas: 3 })
    expect(res.status).toBe(200)
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'COMPARTIR',
      usuarioId: 'u1',
      datos: { tipo: 'RESUMEN_FACTURAS', canal: 'whatsapp', resultado: 'PREPARADO', estado: 'PARCIAL', facturas: 3 },
    })
  })

  it('rechaza canales y cuerpos inválidos, y clientes inexistentes', async () => {
    expect((await post({ canal: 'sms' })).status).toBe(400)
    expect((await post('no-json')).status).toBe(400)
    expect((await post({ canal: 'whatsapp', estado: 'ANULADA' })).status).toBe(400)
    clienteFindUnique.mockResolvedValue(null)
    expect((await post({ canal: 'whatsapp' })).status).toBe(404)
    expect(logAudit).not.toHaveBeenCalled()
  })
})
