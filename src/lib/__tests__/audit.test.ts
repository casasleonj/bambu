import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    historial: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { logAudit, logBulkAudit } from '@/lib/audit'

const mockCreate = prisma.historial.create as ReturnType<typeof vi.fn>
const mockCreateMany = prisma.historial.createMany as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logAudit — casoId metadata (commit 0e)', () => {
  it('embebe casoId en datos._casoId cuando se pasa', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: { verificado: true },
      casoId: 'caso-123',
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0][0]
    const datos = JSON.parse(call.data.datos)
    expect(datos._casoId).toBe('caso-123')
    expect(datos.verificado).toBe(true) // datos originales preservados
  })

  it('NO embebe _casoId si casoId es undefined', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: { verificado: true },
    })

    const call = mockCreate.mock.calls[0][0]
    const datos = JSON.parse(call.data.datos)
    expect(datos._casoId).toBeUndefined()
  })

  it('NO embebe _casoId si casoId es null', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: { verificado: true },
      casoId: null,
    })

    const call = mockCreate.mock.calls[0][0]
    const datos = JSON.parse(call.data.datos)
    expect(datos._casoId).toBeUndefined()
  })

  it('NO embebe _casoId si casoId es string vacio (falsy)', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: { verificado: true },
      casoId: '',
    })

    const call = mockCreate.mock.calls[0][0]
    const datos = JSON.parse(call.data.datos)
    expect(datos._casoId).toBeUndefined()
  })

  it('preserva _ip y _userAgent ademas de _casoId', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: { verificado: true },
      casoId: 'caso-123',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    })

    const call = mockCreate.mock.calls[0][0]
    const datos = JSON.parse(call.data.datos)
    expect(datos._casoId).toBe('caso-123')
    expect(datos._ip).toBe('127.0.0.1')
    expect(datos._userAgent).toBe('test-agent')
  })

  it('NO contamina los datos originales con meta-campos', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'h1' })

    const datosOriginales = { verificado: true, bloqueado: false }
    await logAudit({
      entidad: 'Cliente',
      registroId: 'c1',
      accion: 'UPDATE',
      datos: datosOriginales,
      casoId: 'caso-123',
    })

    // datosOriginales NO fue mutado
    expect(datosOriginales).toEqual({ verificado: true, bloqueado: false })
    expect((datosOriginales as Record<string, unknown>)._casoId).toBeUndefined()
  })

  it('no throwea si prisma falla (fire-and-forget contract)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'))

    await expect(
      logAudit({
        entidad: 'Cliente',
        registroId: 'c1',
        accion: 'UPDATE',
        datos: { verificado: true },
        casoId: 'caso-123',
      }),
    ).resolves.toBeUndefined()
  })
})

describe('logBulkAudit — casoId metadata (commit 0e)', () => {
  it('embebe casoId en cada entry que lo tenga', async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 })

    await logBulkAudit([
      {
        entidad: 'Cliente',
        registroId: 'c1',
        accion: 'UPDATE',
        datos: { verificado: true },
        casoId: 'caso-A',
      },
      {
        entidad: 'Pedido',
        registroId: 'p1',
        accion: 'UPDATE',
        datos: { estado: 'ANULADO' },
        casoId: 'caso-B',
      },
      {
        entidad: 'Cliente',
        registroId: 'c2',
        accion: 'UPDATE',
        datos: { verificado: false },
        // sin casoId
      },
    ])

    expect(mockCreateMany).toHaveBeenCalledTimes(1)
    const data = mockCreateMany.mock.calls[0][0].data
    const datos0 = JSON.parse(data[0].datos)
    const datos1 = JSON.parse(data[1].datos)
    const datos2 = JSON.parse(data[2].datos)

    expect(datos0._casoId).toBe('caso-A')
    expect(datos1._casoId).toBe('caso-B')
    expect(datos2._casoId).toBeUndefined()
  })
})
