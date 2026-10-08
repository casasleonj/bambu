// @tests BarrioReferenciasChips — F4 Barrio: insertar referencia territorial
// en Dirección (equipo, revisión 2026-10-07). Decisión confirmada con
// evidencia de código: inserta en `direccion`, NUNCA en `referencia` (campo
// distinto, invisible para el repartidor, sin UI en Negocio).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BarrioReferenciasChips } from '../barrio-referencias-chips'

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const LA_ANTILLANA_DETALLE = {
  id: 'b1',
  aliases: [{ id: 'a1', texto: 'Antillana' }],
  referencias: [
    { id: 'r1', texto: 'Antillana 1' },
    { id: 'r2', texto: 'Antillana 2' },
  ],
}

describe('BarrioReferenciasChips', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, barrio: LA_ANTILLANA_DETALLE }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sin barrioId no renderiza nada (y no llama a fetch)', () => {
    const { container } = render(
      <BarrioReferenciasChips barrioId={null} direccion="" onInsertarEnDireccion={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con barrioId, busca el detalle y muestra "También se conoce como" y "Referencias comunes"', async () => {
    render(<BarrioReferenciasChips barrioId="b1" direccion="" onInsertarEnDireccion={vi.fn()} />)

    expect(await screen.findByText('También se conoce como')).toBeInTheDocument()
    expect(screen.getByText('Antillana')).toBeInTheDocument()
    expect(screen.getByText('Referencias comunes — toca una para agregarla a Dirección')).toBeInTheDocument()
    expect(screen.getByText('Antillana 1')).toBeInTheDocument()
    expect(screen.getByText('Antillana 2')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/barrios/b1')
  })

  it('un Barrio sin alias ni referencias no renderiza nada', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, barrio: { id: 'b2', aliases: [], referencias: [] } }))
    const { container } = render(
      <BarrioReferenciasChips barrioId="b2" direccion="" onInsertarEnDireccion={vi.fn()} />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('pulsar una referencia con Dirección vacía la llena con el texto exacto', async () => {
    const onInsertar = vi.fn()
    render(<BarrioReferenciasChips barrioId="b1" direccion="" onInsertarEnDireccion={onInsertar} />)

    const chip = await screen.findByText('Antillana 2')
    chip.click()

    expect(onInsertar).toHaveBeenCalledWith('Antillana 2')
  })

  it('pulsar una referencia con Dirección existente antepone el texto, preservando el contenido ("Antillana 2, Casa azul frente al parque")', async () => {
    const onInsertar = vi.fn()
    render(
      <BarrioReferenciasChips
        barrioId="b1"
        direccion="Casa azul frente al parque"
        onInsertarEnDireccion={onInsertar}
      />,
    )

    const chip = await screen.findByText('Antillana 2')
    chip.click()

    expect(onInsertar).toHaveBeenCalledWith('Antillana 2, Casa azul frente al parque')
  })

  it('protección anti-duplicado: si Dirección ya contiene la referencia (normalizado), el chip queda deshabilitado y no vuelve a insertar', async () => {
    const onInsertar = vi.fn()
    render(
      <BarrioReferenciasChips
        barrioId="b1"
        direccion="Antillana 2, Cra 15 # 8-20"
        onInsertarEnDireccion={onInsertar}
      />,
    )

    const chip = await screen.findByText('Antillana 2')
    expect(chip).toBeDisabled()
    chip.click()

    expect(onInsertar).not.toHaveBeenCalled()
  })

  it('la detección de duplicado es insensible a acentos/mayúsculas (normalizada, no un parseo estructurado)', async () => {
    const onInsertar = vi.fn()
    render(
      <BarrioReferenciasChips
        barrioId="b1"
        direccion="ya puse ANTILLANA 2 acá"
        onInsertarEnDireccion={onInsertar}
      />,
    )

    const chip = await screen.findByText('Antillana 2')
    expect(chip).toBeDisabled()
  })

  it('no pulsar ninguna referencia es perfectamente válido — no se llama onInsertarEnDireccion', async () => {
    const onInsertar = vi.fn()
    render(<BarrioReferenciasChips barrioId="b1" direccion="Cra 15 # 8-20" onInsertarEnDireccion={onInsertar} />)

    await screen.findByText('Antillana 2')
    expect(onInsertar).not.toHaveBeenCalled()
  })

  it('cambiar de barrioId no modifica Dirección — solo refresca qué chips se muestran', async () => {
    const onInsertar = vi.fn()
    const { rerender } = render(
      <BarrioReferenciasChips barrioId="b1" direccion="Cra 15 # 8-20" onInsertarEnDireccion={onInsertar} />,
    )
    await screen.findByText('Antillana 2')

    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, barrio: { id: 'b2', aliases: [], referencias: [{ id: 'r9', texto: 'Cafetal 1' }] } }),
    )
    rerender(<BarrioReferenciasChips barrioId="b2" direccion="Cra 15 # 8-20" onInsertarEnDireccion={onInsertar} />)

    await waitFor(() => expect(screen.getByText('Cafetal 1')).toBeInTheDocument())
    expect(screen.queryByText('Antillana 2')).not.toBeInTheDocument()
    // Nada de esto llama onInsertarEnDireccion — cambiar de barrio nunca toca Dirección automáticamente.
    expect(onInsertar).not.toHaveBeenCalled()
  })
})
