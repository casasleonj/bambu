import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PedidoReprogramar } from '../pedido-reprogramar'
import { CompromisoChip, etiquetaCompromiso } from '../compromiso-chip'

const HOY = '2026-11-17'
const base = { id: 'p1', numero: 1031, estadoEntrega: 'PENDIENTE', fechaEntrega: '2026-11-16T17:00:00.000Z' as string | null }
const fetchMock = vi.fn()

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { vi.unstubAllGlobals() })

function abrir(p = base, onMutado = vi.fn()) {
  render(<PedidoReprogramar pedido={p} hoyBogota={HOY} onMutado={onMutado} />)
  fireEvent.click(screen.getByTestId('reprogramar-abrir'))
  return onMutado
}
const ok = (status = 201) => ({ ok: true, status, json: async () => ({ success: true }) })

describe('PedidoReprogramar (#836 F1)', () => {
  it('entregado/cancelado/anulado: no ofrece cambiar la fecha', () => {
    for (const e of ['ENTREGADO', 'CANCELADO', 'ANULADO']) {
      const { container, unmount } = render(<PedidoReprogramar pedido={{ ...base, estadoEntrega: e }} hoyBogota={HOY} onMutado={vi.fn()} />)
      expect(container).toBeEmptyDOMElement(); unmount()
    }
  })

  it('vencido: avisa que el incumplimiento queda en el historial, sin bloquear', () => {
    abrir()
    expect(screen.getByTestId('reprogramar-vencido')).toHaveTextContent(/incumplimiento queda en el historial/i)
    expect(screen.getByTestId('reprogramar-confirmar')).not.toBeDisabled()
  })

  it('previsto a futuro: no muestra aviso de vencido', () => {
    abrir({ ...base, fechaEntrega: '2026-11-20T17:00:00.000Z' })
    expect(screen.queryByTestId('reprogramar-vencido')).toBeNull()
  })

  it('sin fecha elegida: pide la fecha y no llama al servidor', () => {
    abrir()
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    expect(screen.getByTestId('reprogramar-error')).toHaveTextContent(/elige la nueva fecha/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirmar: envía mediodía de Bogotá, la fecha vigente esperada y un offlineId; refresca al terminar', async () => {
    fetchMock.mockResolvedValue(ok())
    const onMutado = abrir()
    fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: '2026-11-19' } })
    fireEvent.change(screen.getByTestId('reprogramar-motivo'), { target: { value: 'El cliente pidió esperar' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await waitFor(() => expect(onMutado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/pedidos/p1/reprogramar')
    const body = JSON.parse(init.body)
    expect(body.fechaNueva).toBe('2026-11-19T17:00:00.000Z')
    expect(body.fechaAnteriorEsperada).toBe(base.fechaEntrega)
    expect(body.motivo).toBe('El cliente pidió esperar')
    expect(typeof body.offlineId).toBe('string')
  })

  it('carga: el botón dice «Guardando…» y se bloquea mientras espera', async () => {
    let resolver: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r }))
    abrir()
    fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: '2026-11-19' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    expect(await screen.findByText('Guardando…')).toBeDisabled()
    await act(async () => { resolver(ok()) })
  })

  it('409 (otra persona cambió la fecha): muestra el mensaje y «Ver fecha actual» refresca', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false, error: { message: 'Otra persona cambió la fecha de este pedido.' } }) })
    const onMutado = abrir()
    fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: '2026-11-19' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    expect(await screen.findByTestId('reprogramar-error')).toHaveTextContent(/otra persona/i)
    fireEvent.click(screen.getByTestId('reprogramar-ver-actual'))
    expect(onMutado).toHaveBeenCalled()
  })

  it('sin conexión: permite reintentar con el MISMO offlineId (no duplica)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok())
    const onMutado = abrir()
    fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: '2026-11-19' } })
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    expect(await screen.findByTestId('reprogramar-error')).toHaveTextContent(/no se duplicará/i)
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await waitFor(() => expect(onMutado).toHaveBeenCalled())
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).offlineId)
    expect(ids[0]).toBe(ids[1])
  })
})

describe('CompromisoChip (#836 F1)', () => {
  const chip = (fechaEntrega: string | null, estadoEntrega = 'PENDIENTE') => etiquetaCompromiso({ fechaEntrega, estadoEntrega }, HOY)
  it('hoy / arrastrado / programado; nada si no hay compromiso abierto', () => {
    expect(chip('2026-11-17T20:00:00.000Z')).toMatchObject({ clase: 'hoy', texto: 'Para hoy' })
    expect(chip('2026-11-16T15:00:00.000Z')?.texto).toMatch(/^Arrastrado · previsto/)
    expect(chip('2026-11-19T15:00:00.000Z')?.texto).toMatch(/^Programado ·/)
    expect(chip(null)).toBeNull()
    expect(chip('2026-11-16T15:00:00.000Z', 'ENTREGADO')).toBeNull()
  })
  it('renderiza con data-testid por pedido', () => {
    render(<CompromisoChip id="p9" pedido={{ fechaEntrega: '2026-11-17T20:00:00.000Z', estadoEntrega: 'PENDIENTE' }} hoyBogota={HOY} />)
    expect(screen.getByTestId('operacion-compromiso-p9')).toHaveTextContent('Para hoy')
  })
})
