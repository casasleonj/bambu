// @tests unit/SustitucionFormModal (Fase 6b) — validación, offlineId y gating
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SustitucionFormModal, puedeRegistrarSustitucion } from '../sustitucion-form-modal'
import { SustitucionEmbarqueSchema } from '@/lib/validators'
import { fetchResilient } from '@/lib/fetch-resilient'

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))
vi.mock('@/lib/uuid', () => ({
  generateUUID: () => 'offline-id-123',
}))

const mockFetchResilient = vi.mocked(fetchResilient)

const pedidos = [{ id: 'p1', numero: 101 }]

describe('puedeRegistrarSustitucion (gating por rol/estado)', () => {
  it('permite a ADMIN y ASISTENTE en ABIERTO/EN_RUTA', () => {
    expect(puedeRegistrarSustitucion('ADMIN', 'ABIERTO')).toBe(true)
    expect(puedeRegistrarSustitucion('ADMIN', 'EN_RUTA')).toBe(true)
    expect(puedeRegistrarSustitucion('ASISTENTE', 'ABIERTO')).toBe(true)
  })

  it('bloquea roles sin permiso', () => {
    expect(puedeRegistrarSustitucion('CONTADOR', 'ABIERTO')).toBe(false)
    expect(puedeRegistrarSustitucion('REPARTIDOR', 'ABIERTO')).toBe(false)
    expect(puedeRegistrarSustitucion(null, 'ABIERTO')).toBe(false)
    expect(puedeRegistrarSustitucion(undefined, 'ABIERTO')).toBe(false)
  })

  it('bloquea estados terminales', () => {
    expect(puedeRegistrarSustitucion('ADMIN', 'CERRADO')).toBe(false)
    expect(puedeRegistrarSustitucion('ADMIN', 'CANCELADO')).toBe(false)
  })
})

describe('SustitucionEmbarqueSchema (validación cliente)', () => {
  it('acepta un payload mínimo válido', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 2 }).success).toBe(true)
  })

  it('rechaza cantidad no entera o no positiva', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 0 }).success).toBe(false)
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: -1 }).success).toBe(false)
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 2.5 }).success).toBe(false)
  })

  it('limita el motivo a 500 caracteres', () => {
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 1, motivo: 'x'.repeat(501) }).success).toBe(false)
    expect(SustitucionEmbarqueSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 1, motivo: 'x'.repeat(500) }).success).toBe(true)
  })
})

describe('SustitucionFormModal', () => {
  beforeEach(() => {
    mockFetchResilient.mockReset()
  })

  it('genera offlineId al abrir y lo envía en el body', async () => {
    mockFetchResilient.mockResolvedValue({
      status: 'ok',
      statusCode: 201,
      data: {
        sustitucion: {
          id: 's1',
          embarqueId: 'e1',
          pedidoId: null,
          createdAt: '2026-08-27T12:00:00Z',
          autorizadoPor: { id: 'u1', nombre: 'Admin' },
          movimientoRecepcion: { tipo: 'RETORNO', producto: 'PACA_AGUA', cantidad: 2, origen: 'VEHICULO', destino: 'INSPECCION', createdAt: '2026-08-27T12:00:00Z' },
          movimientoEntrega: { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 2, origen: 'VEHICULO', destino: 'CLIENTE', createdAt: '2026-08-27T12:00:00Z' },
        },
      },
    } as never)

    render(
      <SustitucionFormModal
        open
        onClose={() => {}}
        onCreated={() => {}}
        embarqueId="e1"
        pedidos={pedidos}
      />,
    )

    fireEvent.change(screen.getByTestId('sustitucion-cantidad-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('sustitucion-submit-button'))

    await waitFor(() => {
      expect(mockFetchResilient).toHaveBeenCalled()
    })

    const [url, options] = mockFetchResilient.mock.calls[0]
    expect(url).toBe('/api/embarques/e1/sustituciones')
    expect((options as { body?: Record<string, unknown> }).body).toMatchObject({
      producto: 'PACA_AGUA',
      cantidad: 2,
      offlineId: 'offline-id-123',
    })
  })

  it('deshabilita el submit con cantidad inválida', () => {
    render(
      <SustitucionFormModal
        open
        onClose={() => {}}
        onCreated={() => {}}
        embarqueId="e1"
        pedidos={pedidos}
      />,
    )

    const submit = screen.getByTestId('sustitucion-submit-button')
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByTestId('sustitucion-cantidad-input'), { target: { value: '2' } })
    expect(submit).not.toBeDisabled()
  })
})
