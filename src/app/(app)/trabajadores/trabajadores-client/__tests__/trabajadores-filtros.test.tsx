// #863: catálogo administrativo, filtros, errores y carreras de refetch.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TrabajadoresClient from '../index'
import type { Trabajador } from '../types'

const polling = vi.hoisted(() => ({ tick: undefined as (() => void) | undefined }))
vi.mock('@/hooks/use-polling-refetch', () => ({
  usePollingRefetch: (callback: () => void) => { polling.tick = callback },
}))
vi.mock('@/components/confirm-modal', () => ({
  useConfirm: () => ({ confirm: async () => true, modal: null }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../trabajador-form-modal', () => ({ TrabajadorFormModal: () => null }))
vi.mock('@/components/deudas-trabajador/deuda-detalle-dialog', () => ({ DeudaDetalleDialog: () => null }))

const activo: Trabajador = {
  id: 't-activo', nombre: 'Ana Lucía', rol: 'REPARTIDOR', tipoPago: 'COMISION', usaMoto: true,
  capacidadKg: 500, comPacaAgua: 0, comPacaHielo: 0, comBotellon: 0,
  comRepartAgua: 0, comRepartHielo: 0, comRepartBotellon: 0, salarioFijo: 0,
  deudaReposAgua: 0, deudaReposHielo: 0, activo: true, createdAt: '2026-01-01T00:00:00Z',
}
const inactivo: Trabajador = { ...activo, id: 't-inactivo', nombre: 'Pedro León', activo: false }
function respuesta(trabajadores: Trabajador[], incluyeDesactivados = true) {
  return new Response(JSON.stringify({ trabajadores, incluyeDesactivados }), { status: 200 })
}
function diferida() {
  let resolver: (r: Response) => void = () => { throw new Error('Promesa sin inicializar') }
  const promesa = new Promise<Response>(resolve => { resolver = resolve })
  return { promesa, resolver }
}
const buscar = () => screen.getByPlaceholderText('Buscar por nombre, rol, telefono...')

afterEach(() => {
  cleanup()
  polling.tick = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Trabajadores (#863)', () => {
  it('empieza en activos y combina estado con la búsqueda fuzzy sin confundir homónimos', () => {
    render(<TrabajadoresClient initialTrabajadores={[activo, inactivo, { ...inactivo, id: 'otro', nombre: activo.nombre }]} />)
    expect(screen.getByRole('button', { name: 'Activos' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('link', { name: activo.nombre })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: inactivo.nombre })).toBeNull()
    fireEvent.change(buscar(), { target: { value: 'Pedro Leon' } })
    expect(screen.queryByRole('link', { name: inactivo.nombre })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }))
    expect(screen.getByRole('link', { name: inactivo.nombre })).toBeTruthy()
    fireEvent.change(buscar(), { target: { value: 'Ana Lucia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getAllByRole('link', { name: activo.nombre }).map(a => a.getAttribute('href')).sort())
      .toEqual(['/trabajadores/otro', '/trabajadores/t-activo'])
  })

  it('ignora respuestas antiguas y conserva el filtro durante actualizaciones simultáneas', async () => {
    const vieja = diferida(), nueva = diferida()
    const fetchMock = vi.fn().mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa)
    vi.stubGlobal('fetch', fetchMock)
    render(<TrabajadoresClient initialTrabajadores={[activo, inactivo]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }))
    act(() => { polling.tick?.(); polling.tick?.() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { nueva.resolver(respuesta([{ ...activo, activo: false }, inactivo])); await nueva.promesa })
    await waitFor(() => expect(screen.getByRole('link', { name: activo.nombre })).toBeTruthy())
    await act(async () => { vieja.resolver(respuesta([activo, inactivo])); await vieja.promesa })
    expect(screen.getByRole('link', { name: activo.nombre })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desactivados' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('no sustituye el catálogo por una respuesta de un build antiguo; ofrece reintento', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respuesta([inactivo], false))
      .mockResolvedValueOnce(respuesta([activo, inactivo]))
    vi.stubGlobal('fetch', fetchMock)
    render(<TrabajadoresClient initialTrabajadores={[activo, inactivo]} />)
    act(() => polling.tick?.())
    await waitFor(() => expect(screen.getByText(/No se pudieron actualizar los trabajadores/)).toBeTruthy())
    expect(screen.getByRole('link', { name: activo.nombre })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByText(/No se pudieron actualizar los trabajadores/)).toBeNull())
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trabajadores?activo=all', { cache: 'no-store' })
  })

  it('un error de red con filtro vacío no se confunde con ausencia confirmada de trabajadores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<TrabajadoresClient initialTrabajadores={[activo]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }))
    expect(screen.getByText('No hay trabajadores desactivados')).toBeTruthy()
    act(() => polling.tick?.())
    await waitFor(() => expect(screen.getByText('No se puede confirmar que no haya resultados.')).toBeTruthy())
    expect(screen.queryByText('No hay trabajadores desactivados')).toBeNull()
  })

  it('solo lectura no ofrece crear un trabajador ni con el catálogo vacío', () => {
    render(<TrabajadoresClient initialTrabajadores={[]} soloLectura />)
    expect(screen.getByText('No hay trabajadores')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Crear Trabajador' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Nuevo Trabajador' })).toBeNull()
  })

  it('una desactivación confirmada conserva el cambio aunque el refetch falle y llegue una lista vieja', async () => {
    const vieja = diferida()
    const fetchMock = vi.fn().mockReturnValueOnce(vieja.promesa)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    render(<TrabajadoresClient initialTrabajadores={[activo, inactivo]} />)
    act(() => polling.tick?.())
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(screen.getByText(/No se pudieron actualizar los trabajadores/)).toBeTruthy())
    await act(async () => { vieja.resolver(respuesta([activo, inactivo])); await vieja.promesa })
    expect(screen.queryByRole('link', { name: activo.nombre })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }))
    expect(screen.getByRole('link', { name: activo.nombre })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
