import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CierreNegocioChip } from '../compromiso-chip'
import { PedidoReprogramar } from '../pedido-reprogramar'

const lunAVie = [1, 2, 3, 4, 5].flatMap((d) => [{ diaSemana: d, desde: '06:00', hasta: '12:00' }, { diaSemana: d, desde: '14:00', hasta: '20:00' }])
const DOMINGO = '2026-11-22T17:00:00.000Z' // domingo 12:00 en Bogotá
const MARTES = '2026-11-24T17:00:00.000Z'

describe('CierreNegocioChip (#836 F2, A11/A29)', () => {
  const p = (o: Partial<Parameters<typeof CierreNegocioChip>[0]['pedido']> = {}) =>
    ({ fechaEntrega: DOMINGO, estadoEntrega: 'PENDIENTE', negocioHorarios: lunAVie, ...o })

  it('avisa cuando el día de la fecha prometida el negocio no atiende', () => {
    render(<CierreNegocioChip id="a" pedido={p()} />)
    expect(screen.getByTestId('operacion-cierre-a')).toHaveTextContent('Negocio cerrado ese día')
  })
  it('un día de atención no avisa', () => {
    const { container } = render(<CierreNegocioChip id="a" pedido={p({ fechaEntrega: MARTES })} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('sin horario configurado NO afirma que esté cerrado', () => {
    const { container } = render(<CierreNegocioChip id="a" pedido={p({ negocioHorarios: undefined })} />)
    expect(container).toBeEmptyDOMElement()
    const r2 = render(<CierreNegocioChip id="b" pedido={p({ negocioHorarios: [] })} />)
    expect(r2.container).toBeEmptyDOMElement()
  })
  it('un pedido ya entregado/cancelado/anulado no avisa; sin fecha prometida tampoco', () => {
    for (const e of ['ENTREGADO', 'CANCELADO', 'ANULADO']) {
      const { container, unmount } = render(<CierreNegocioChip id="a" pedido={p({ estadoEntrega: e })} />)
      expect(container).toBeEmptyDOMElement(); unmount()
    }
    const { container } = render(<CierreNegocioChip id="a" pedido={p({ fechaEntrega: null })} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Cambiar fecha prometida: aviso de negocio cerrado (#836 F2)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  const base = { id: 'p1', numero: 1050, estadoEntrega: 'PENDIENTE', fechaEntrega: '2026-11-20T17:00:00.000Z' as string | null }
  const abrir = (negocioHorarios?: typeof lunAVie) => {
    render(<PedidoReprogramar pedido={{ ...base, negocioHorarios }} hoyBogota="2026-11-17" onMutado={vi.fn()} />)
    fireEvent.click(screen.getByTestId('reprogramar-abrir'))
  }
  const elegir = (ymd: string) => fireEvent.change(screen.getByTestId('reprogramar-fecha'), { target: { value: ymd } })

  it('al elegir un domingo avisa, sin bloquear el botón de confirmar', () => {
    abrir(lunAVie)
    elegir('2026-11-22')
    expect(screen.getByTestId('reprogramar-negocio-cierra')).toHaveTextContent(/no atiende los domingos\. Se puede preparar/)
    expect(screen.getByTestId('reprogramar-confirmar')).not.toBeDisabled()
  })
  it('un día de atención no avisa', () => {
    abrir(lunAVie)
    elegir('2026-11-24')
    expect(screen.queryByTestId('reprogramar-negocio-cierra')).toBeNull()
  })
  it('sin horario configurado no avisa nada', () => {
    abrir(undefined)
    elegir('2026-11-22')
    expect(screen.queryByTestId('reprogramar-negocio-cierra')).toBeNull()
  })
  it('confirmar un día cerrado igual guarda (el horario avisa, no bloquea)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    abrir(lunAVie)
    elegir('2026-11-22')
    fireEvent.click(screen.getByTestId('reprogramar-confirmar'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
