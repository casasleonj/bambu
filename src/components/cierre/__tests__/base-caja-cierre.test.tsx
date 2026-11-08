// @tests #688 — la base de caja en el cierre: fuente, aviso de cambio, faltante y diálogo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const abrirModal = vi.fn()
vi.mock('@/components/base-caja-loader', () => ({ openBaseCajaModal: (v?: string) => abrirModal(v) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { FuenteBaseCaja, AvisoBaseActualizada, BaseCajaFaltante, DialogoBaseCambio } from '../base-caja-cierre'
import { EVENTO_BASE_CAJA } from '@/lib/client/base-caja-evento'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { abrirModal.mockReset(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('FuenteBaseCaja', () => {
  const base = { fecha: '2026-11-05', hoy: true, actualizadaAt: '2026-11-05T12:42:00.000Z', puedeEditar: true, diaCerrado: false, valor: 50000 }
  it('dice de dónde viene (hoy, con la hora de Bogotá) y ofrece «Editar en Caja base» que abre la edición con el valor actual', () => {
    render(<FuenteBaseCaja {...base} />)
    expect(screen.getByTestId('base-caja-fuente')).toHaveTextContent(/Base de caja de hoy · actualizada 7:42/)
    fireEvent.click(screen.getByTestId('base-caja-editar'))
    expect(abrirModal).toHaveBeenCalledWith('50000')
  })
  it('sin permiso, de un día atrasado o ya cerrado no hay enlace de edición', () => {
    for (const o of [{ puedeEditar: false }, { hoy: false }, { diaCerrado: true }]) {
      cleanup()
      render(<FuenteBaseCaja {...base} {...o} />)
      expect(screen.queryByTestId('base-caja-editar')).toBeNull()
    }
  })
  it('un día atrasado dice la fecha, no «hoy»', () => {
    render(<FuenteBaseCaja {...base} fecha="2026-11-03" hoy={false} />)
    expect(screen.getByTestId('base-caja-fuente')).toHaveTextContent('Base de caja del 3 nov')
  })
})

describe('AvisoBaseActualizada', () => {
  it('muestra antes → ahora y el efecto en lo que debe haber; «Entendido» lo cierra', () => {
    const cerrar = vi.fn()
    render(<AvisoBaseActualizada antes={50000} ahora={60000} debeHaberAntes={153300} debeHaberAhora={163300} onEntendido={cerrar} />)
    const aviso = screen.getByTestId('base-caja-aviso')
    expect(aviso).toHaveTextContent(/de \$\s*50\.000 a \$\s*60\.000/)
    expect(aviso).toHaveTextContent(/de \$\s*153\.300 a \$\s*163\.300/)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(cerrar).toHaveBeenCalled()
  })
})

describe('BaseCajaFaltante', () => {
  it('hoy con permiso: botón «Ingresar base de caja» que abre el modal de base de caja (no un campo local)', () => {
    render(<BaseCajaFaltante fecha="2026-11-05" hoy puedeIngresar />)
    expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('Falta la base de caja de hoy')
    fireEvent.click(screen.getByTestId('base-caja-ingresar'))
    expect(abrirModal).toHaveBeenCalled()
    expect(screen.queryByTestId('base-caja-input')).toBeNull()
  })
  it('sin permiso: dice a quién pedirla y no ofrece ningún control', () => {
    render(<BaseCajaFaltante fecha="2026-11-05" hoy puedeIngresar={false} />)
    expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('Pídele a la administración')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('base-caja-input')).toBeNull()
  })
  it('día atrasado: guarda la base de ESA fecha en la configuración y avisa para releerla', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const alGuardar = vi.fn(); window.addEventListener(EVENTO_BASE_CAJA, alGuardar)
    render(<BaseCajaFaltante fecha="2026-11-03" hoy={false} puedeIngresar />)
    expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('Falta la base de caja del 3 nov')
    fireEvent.change(screen.getByTestId('base-caja-input'), { target: { value: '45000' } })
    fireEvent.click(screen.getByTestId('base-caja-guardar'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/config')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ clave: 'BASE_DIA_2026-11-03', valor: '45000' })
    await waitFor(() => expect(alGuardar).toHaveBeenCalled())
    window.removeEventListener(EVENTO_BASE_CAJA, alGuardar)
  })
  it('día atrasado: 0, vacío o texto no se envía; un error del servidor se dice sin perder lo escrito', async () => {
    render(<BaseCajaFaltante fecha="2026-11-03" hoy={false} puedeIngresar />)
    fireEvent.click(screen.getByTestId('base-caja-guardar')) // vacío
    expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('mayor que $ 0')
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('base-caja-input'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('base-caja-guardar'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('mayor que $ 0')
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    fireEvent.change(screen.getByTestId('base-caja-input'), { target: { value: '45000' } })
    fireEvent.click(screen.getByTestId('base-caja-guardar'))
    await waitFor(() => expect(screen.getByTestId('base-caja-faltante')).toHaveTextContent('No se pudo guardar'))
    expect(screen.getByTestId('base-caja-input')).toHaveValue('45000')
  })
})

describe('DialogoBaseCambio', () => {
  it('dice antes/ahora y el efecto, y «Revisar» lo cierra', () => {
    const revisar = vi.fn()
    render(<DialogoBaseCambio antes={50000} ahora={60000} debeHaberAntes={153300} debeHaberAhora={163300} onRevisar={revisar} />)
    const d = screen.getByRole('alertdialog')
    expect(d).toHaveTextContent('La base de caja cambió')
    expect(d).toHaveTextContent(/\$\s*50\.000/); expect(d).toHaveTextContent(/\$\s*60\.000/)
    expect(d).toHaveTextContent(/de \$\s*153\.300 a \$\s*163\.300/)
    fireEvent.click(screen.getByTestId('base-caja-revisar'))
    expect(revisar).toHaveBeenCalled()
  })
})
