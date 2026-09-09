import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))

import { fetchResilient } from '@/lib/fetch-resilient'
import { EstoSeRepite } from '../esto-se-repite'

const frMock = vi.mocked(fetchResilient)

const items = [{ producto: 'PACA_AGUA', cantidad: 20 }, { producto: 'BOTELLON', cantidad: 5 }]

beforeEach(() => {
  push.mockReset()
  frMock.mockReset()
})

describe('EstoSeRepite — "esto se repite" post-commit (F8-ii)', () => {
  it('propuesta con el nombre del contexto; nunca la palabra "plantilla"', () => {
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1', nombre: 'Tienda La Esquina' }} canal="DOMICILIO" items={items} onClose={vi.fn()} />)
    expect(screen.getByTestId('esto-se-repite')).toHaveTextContent('¿Guardar como pedido habitual de Tienda La Esquina?')
    expect(screen.getByTestId('esto-se-repite')).not.toHaveTextContent(/plantilla/i)
  })

  it('negocio sin nombre → "este negocio"; el body lleva negocioId, no clienteId', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true } })
    render(<EstoSeRepite contexto={{ tipo: 'negocio', id: 'n1' }} canal="PUNTO" items={items} onClose={vi.fn()} />)
    expect(screen.getByTestId('esto-se-repite')).toHaveTextContent('este negocio')
    fireEvent.click(screen.getByTestId('esto-se-repite-guardar'))
    await waitFor(() => expect(frMock).toHaveBeenCalled())
    const body = frMock.mock.calls[0][1]?.body as Record<string, unknown>
    expect(body.negocioId).toBe('n1')
    expect(body.clienteId).toBeUndefined()
    expect(body.productos).toEqual({ pacaAgua: 20, botellon: 5 })
    expect(body.cadaNDias).toBe(7)
  })

  it('guardar OK → estado "Guardado como pedido habitual"', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true } })
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1', nombre: 'X' }} canal="DOMICILIO" items={items} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('esto-se-repite-guardar'))
    await waitFor(() => expect(screen.getByTestId('esto-se-repite-ok')).toBeInTheDocument())
  })

  it('offline (encolado) → se trata como OK', async () => {
    frMock.mockResolvedValue({ status: 'offline', localId: 'x', reason: 'network' })
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1' }} canal="DOMICILIO" items={items} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('esto-se-repite-guardar'))
    await waitFor(() => expect(screen.getByTestId('esto-se-repite-ok')).toBeInTheDocument())
  })

  it('409 → "ya tiene un pedido habitual", NO auto-PUT; "Revisar" navega (usuario decide)', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'Este cliente o negocio ya tiene un pedido habitual' })
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1', nombre: 'X' }} canal="DOMICILIO" items={items} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('esto-se-repite-guardar'))
    await waitFor(() => expect(screen.getByTestId('esto-se-repite-ya-existe')).toBeInTheDocument())
    // exactamente 1 llamada — no reintenta como PUT
    expect(frMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('esto-se-repite-revisar'))
    expect(push).toHaveBeenCalledWith('/recurrentes')
  })

  it('error (no 409) → "No se pudo guardar" + el pedido no se vio afectado + Reintentar', async () => {
    frMock.mockResolvedValueOnce({ status: 'error', statusCode: 500, error: 'boom' })
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1', nombre: 'X' }} canal="DOMICILIO" items={items} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('esto-se-repite-guardar'))
    await waitFor(() => expect(screen.getByTestId('esto-se-repite-error')).toBeInTheDocument())
    expect(screen.getByTestId('esto-se-repite-error')).toHaveTextContent(/no se vio afectado/i)
    frMock.mockResolvedValueOnce({ status: 'ok', statusCode: 201, data: { success: true } })
    fireEvent.click(screen.getByTestId('esto-se-repite-reintentar'))
    await waitFor(() => expect(screen.getByTestId('esto-se-repite-ok')).toBeInTheDocument())
  })

  it('"Ahora no" → onClose sin llamar al backend', () => {
    const onClose = vi.fn()
    render(<EstoSeRepite contexto={{ tipo: 'cliente', id: 'c1' }} canal="DOMICILIO" items={items} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('esto-se-repite-ahora-no'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(frMock).not.toHaveBeenCalled()
  })
})

describe('EstoSeRepite — wiring en pedidos-client (source-check)', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/(app)/pedidos/pedidos-client/index.tsx'), 'utf-8')

  it('la propuesta se dispara DESPUÉS de crearPedido (post-commit), no en el mismo submit', () => {
    const createBranch = src.slice(src.indexOf('const result = await crearPedido'), src.indexOf('const result = await crearPedido') + 900)
    expect(createBranch).toMatch(/if \(!result\) return/)
    expect(createBranch).toMatch(/setProponerHabitual\(/)
  })

  it('solo Hub + contexto real + >=3 productos + ADMIN/ASISTENTE', () => {
    const branch = src.slice(src.indexOf('F8-ii: "esto se repite"'), src.indexOf('F8-ii: "esto se repite"') + 700)
    expect(branch).toMatch(/hubMode/)
    expect(branch).toMatch(/CONSUMIDOR_FINAL/)
    expect(branch).toMatch(/totalItems >= 3/)
    expect(branch).toMatch(/ADMIN.*ASISTENTE/)
  })

  it('contexto Q4: negocioId → negocio, si no cliente', () => {
    const branch = src.slice(src.indexOf('F8-ii: "esto se repite"'), src.indexOf('F8-ii: "esto se repite"') + 700)
    expect(branch).toMatch(/data\.negocioId\s*\n?\s*\?\s*\{\s*tipo:\s*'negocio'/)
  })
})
