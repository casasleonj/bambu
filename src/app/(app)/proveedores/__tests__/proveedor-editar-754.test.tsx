// @tests #754 — editar un proveedor muestra SIEMPRE los datos del registro
// elegido, no el borrador del anterior. Ciclo Editar A → Editar B → Editar A.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProveedoresClient from '../proveedores-client'
import type { Proveedor } from '../proveedores-client/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/components/confirm-modal', () => ({
  useConfirm: () => ({ confirm: vi.fn(async () => true), modal: null }),
}))

const A: Proveedor = {
  id: 'prov-a', nombre: 'Distribuidora La A', telefono: '3001111111',
  email: 'a@ejemplo.com', direccion: 'Calle A 1', tipoProducto: 'Agua',
  observaciones: 'nota A', activo: true,
}
const B: Proveedor = {
  id: 'prov-b', nombre: 'Hielos La B', telefono: '3002222222',
  email: 'b@ejemplo.com', direccion: 'Calle B 2', tipoProducto: 'Hielo',
  observaciones: 'nota B', activo: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

/** Abre el menú «⋯» de la fila del proveedor y pulsa Editar. */
function abrirEditar(nombre: string) {
  const filaNombre = screen.getByText(nombre)
  // Sube hasta el contenedor de la fila, que es quien tiene el menú.
  let nodo: HTMLElement | null = filaNombre as HTMLElement
  let menu: HTMLElement | null = null
  for (let i = 0; i < 8 && nodo; i++) {
    const b = nodo.querySelector('button[class*="rounded-md"]')
    if (b) { menu = b as HTMLElement; break }
    nodo = nodo.parentElement
  }
  if (!menu) throw new Error('no encontré el menú de la fila')
  fireEvent.click(menu)
  fireEvent.click(screen.getByText('Editar'))
}

const valorNombre = () => (screen.getByLabelText(/^Nombre/) as HTMLInputElement).value

describe('ProveedoresClient — el formulario sigue al proveedor elegido (#754)', () => {
  it('Editar A trae los datos de A', async () => {
    render(<ProveedoresClient initialProveedores={[A, B]} />)
    abrirEditar('Distribuidora La A')
    await waitFor(() => expect(valorNombre()).toBe('Distribuidora La A'))
  })

  it('tras editar A, editar B trae los datos de B y NO los de A', async () => {
    render(<ProveedoresClient initialProveedores={[A, B]} />)

    abrirEditar('Distribuidora La A')
    await waitFor(() => expect(valorNombre()).toBe('Distribuidora La A'))

    // Cerrar A
    fireEvent.click(screen.getByText('Cancelar'))
    await waitFor(() => expect(screen.queryByLabelText(/^Nombre/)).toBeNull())

    // Abrir B: este es el caso que rompía el issue
    abrirEditar('Hielos La B')
    await waitFor(() => expect(valorNombre()).toBe('Hielos La B'))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('b@ejemplo.com')
  })

  it('volver a A después de B muestra otra vez A (sin fugas)', async () => {
    render(<ProveedoresClient initialProveedores={[A, B]} />)

    abrirEditar('Hielos La B')
    await waitFor(() => expect(valorNombre()).toBe('Hielos La B'))
    fireEvent.click(screen.getByText('Cancelar'))
    await waitFor(() => expect(screen.queryByLabelText(/^Nombre/)).toBeNull())

    abrirEditar('Distribuidora La A')
    await waitFor(() => expect(valorNombre()).toBe('Distribuidora La A'))
  })

  it('un borrador sin guardar no se filtra al siguiente proveedor', async () => {
    render(<ProveedoresClient initialProveedores={[A, B]} />)

    abrirEditar('Distribuidora La A')
    await waitFor(() => expect(valorNombre()).toBe('Distribuidora La A'))
    // Escribir sin guardar
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'BORRADOR SUCIO' } })
    expect(valorNombre()).toBe('BORRADOR SUCIO')

    fireEvent.click(screen.getByText('Cancelar'))
    await waitFor(() => expect(screen.queryByLabelText(/^Nombre/)).toBeNull())

    abrirEditar('Hielos La B')
    await waitFor(() => expect(valorNombre()).toBe('Hielos La B'))
  })
})
