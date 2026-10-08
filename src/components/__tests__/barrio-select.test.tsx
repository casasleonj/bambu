// @tests BarrioSelect — F4: "Coincide con: X" cuando el match viene por
// alias/referencia, y aviso "(archivado)" cuando el Barrio ya vinculado
// está inactivo (equipo, revisión 2026-10-07, punto 9 del gate UX).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BarrioSelect } from '../barrio-select'

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('BarrioSelect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra "Coincide con: X" cuando el resultado matcheó por alias/referencia, no por el nombre canónico', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ id: 'b1', nombre: 'La Antillana', referenciasCoincidentes: ['Antillana 2'] }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<BarrioSelect value={null} onSelect={vi.fn()} onManualChange={vi.fn()} />)
    fireEvent.focus(screen.getByPlaceholderText('Buscar barrio...'))
    fireEvent.change(screen.getByPlaceholderText('Buscar barrio...'), { target: { value: 'Antillana 2' } })

    expect(await screen.findByText('La Antillana')).toBeInTheDocument()
    expect(screen.getByText('Coincide con: Antillana 2')).toBeInTheDocument()
  })

  it('un match directo por nombre canónico no muestra "Coincide con"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: [{ id: 'b1', nombre: 'La Antillana' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<BarrioSelect value={null} onSelect={vi.fn()} onManualChange={vi.fn()} />)
    fireEvent.focus(screen.getByPlaceholderText('Buscar barrio...'))
    fireEvent.change(screen.getByPlaceholderText('Buscar barrio...'), { target: { value: 'La Antillana' } })

    expect(await screen.findByText('La Antillana')).toBeInTheDocument()
    expect(screen.queryByText(/Coincide con/)).not.toBeInTheDocument()
  })

  it('un Barrio ya vinculado que está archivado muestra el aviso "(archivado)"', () => {
    render(
      <BarrioSelect
        value={{ id: 'b1', nombre: 'La Antillana', activo: false }}
        onSelect={vi.fn()}
        onManualChange={vi.fn()}
      />,
    )
    expect(screen.getByText('(archivado)')).toBeInTheDocument()
  })

  it('un Barrio vinculado activo no muestra ningún aviso', () => {
    render(
      <BarrioSelect
        value={{ id: 'b1', nombre: 'La Antillana', activo: true }}
        onSelect={vi.fn()}
        onManualChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('(archivado)')).not.toBeInTheDocument()
  })

  it('seleccionar un resultado que matcheó por referencia pasa el Barrio canónico (id/nombre), nunca el texto buscado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ id: 'b1', nombre: 'La Antillana', referenciasCoincidentes: ['Antillana 2'] }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = vi.fn()

    render(<BarrioSelect value={null} onSelect={onSelect} onManualChange={vi.fn()} />)
    fireEvent.focus(screen.getByPlaceholderText('Buscar barrio...'))
    fireEvent.change(screen.getByPlaceholderText('Buscar barrio...'), { target: { value: 'Antillana 2' } })

    const resultado = await screen.findByText('La Antillana')
    fireEvent.click(resultado)

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b1', nombre: 'La Antillana' }),
      )
    })
  })
})
