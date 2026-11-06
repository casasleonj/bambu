import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/hooks/use-polling-refetch', () => ({ usePollingRefetch: vi.fn() }))
vi.mock('@/components/confirm-modal', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true), modal: null }) }))
vi.mock('@/components/produccion/pending-sync-badge', () => ({ ProduccionPendingBadge: () => null }))
vi.mock('@/components/skeleton', () => ({ SkeletonPage: () => <p>Cargando producción</p> }))
vi.mock('../edit-modal', () => ({ ProduccionEditModal: ({ open, registro }: { open: boolean; registro: { id: string } | null }) =>
  open ? <div role="dialog">Editar registro original {registro?.id}</div> : null }))
import ProduccionClient from '../index'

const registro = { id: 'original-dia-5', fecha: '2026-11-05T05:00:00Z', turno: 'JORNADA', trabajadorId: 'sellador',
  trabajador: { id: 'sellador', nombre: 'Sellador de prueba' }, obs: 'Conteo por corregir', items: [
    { producto: 'PACA_AGUA', producido: 500 }, { producto: 'PACA_HIELO', producido: 50 },
  ] }
function fetchMock(editable = true, rol = 'ADMIN') {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    let body: object
    if (url.includes('/api/auth/profile')) body = { user: { rol } }
    else if (url.includes('/api/trabajadores')) body = { trabajadores: [] }
    else if (url.includes('/api/produccion/preview')) body = {
      stockIniAgua: 638, stockIniHielo: 53, stockIniBotellon: 2,
      stockInicialDia: { stockIniAgua: 138, stockIniHielo: 3, stockIniBotellon: 0 },
      ventasAgua: 314, ventasHielo: 4, ventasBotellon: 2, repartidores: [], embarquesAbiertos: false,
    }
    else body = { produccion: [registro], editable, diaCerrado: !editable }
    return { ok: true, status: 200, json: async () => body }
  })
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('#668 — encontrar y corregir producción por fecha', () => {
  it('consulta la fecha solicitada y abre Editar sobre el registro original', async () => {
    render(<ProduccionClient initialFecha="2026-11-05" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar', exact: true }))
    expect(screen.getByRole('dialog')).toHaveTextContent('original-dia-5')
    expect(fetch).toHaveBeenCalledWith('/api/produccion?fecha=2026-11-05', expect.anything())
    expect(screen.getByLabelText('Fecha a consultar')).toHaveValue('2026-11-05')
  })

  it('muestra 138/3/0 en las tarjetas de inicial y conserva el acumulado para otro registro', async () => {
    render(<ProduccionClient initialFecha="2026-11-05" />)
    await screen.findByRole('button', { name: 'Editar', exact: true })
    expect(screen.getByText('138')).toBeInTheDocument()
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getByText(/Botellones al empezar/)).toHaveTextContent('0')
    expect(screen.getAllByText('638').length).toBeGreaterThan(0)
  })

  it('un día cerrado no ofrece editar ni crear otra producción', async () => {
    vi.stubGlobal('fetch', fetchMock(false))
    render(<ProduccionClient initialFecha="2026-11-05" />)
    await screen.findByText(/Este día está cerrado/)
    expect(screen.queryByRole('button', { name: 'Editar', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument()
  })

  it('no amplía permiso de edición a un rol distinto de ADMIN', async () => {
    vi.stubGlobal('fetch', fetchMock(true, 'ASISTENTE'))
    render(<ProduccionClient initialFecha="2026-11-05" />)
    await screen.findByText('Producciones del 2026-11-05')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Editar', exact: true })).not.toBeInTheDocument()
  })

  it('cambiar fecha consulta nuevamente y no conserva la selección de edición', async () => {
    render(<ProduccionClient initialFecha="2026-11-05" />)
    await screen.findByRole('button', { name: 'Editar', exact: true })
    fireEvent.change(screen.getByLabelText('Fecha a consultar'), { target: { value: '2026-11-04' } })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/produccion?fecha=2026-11-04', expect.anything()))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
