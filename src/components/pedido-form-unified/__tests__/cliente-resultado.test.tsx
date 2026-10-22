// @tests #385 — la fila del buscador de cliente explica por qué coincidió.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ClienteResultado } from '../cliente-resultado'
import type { Cliente } from '../types'

const base: Cliente = {
  id: 'c1',
  nombre: 'Juan',
  apellido: 'Pérez',
  telefono: '3001234567',
  barrio: 'Norte',
  direccion: 'Cra 5 # 6-7',
  contactos: [{ nombre: 'Ángela Quiñones', telefono: '3119876543', relacion: 'esposa' }],
  negocios: [{ id: 'n1', nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería', direccion: 'Cll 9 # 1-2', barrio: 'Sur' }],
}

const renderFila = (cliente: Cliente, term: string, onSelect = vi.fn()) => {
  render(<ClienteResultado cliente={cliente} term={term} onSelect={onSelect} />)
  return onSelect
}

describe('ClienteResultado (#385)', () => {
  it('por el nombre del titular: sin línea de motivo; barrio, dirección y celular legible para distinguir homónimos', () => {
    renderFila(base, 'juan')
    expect(screen.queryByTestId('cliente-search-motivo')).toBeNull()
    const fila = screen.getByTestId('cliente-search-result')
    expect(fila).toHaveTextContent('Juan Pérez')
    expect(fila).toHaveTextContent('📱 300 123 4567')
    expect(fila).toHaveTextContent('📍 Norte · Cra 5 # 6-7')
    expect(fila).toHaveTextContent('🏪 1 negocio')
    expect(fila.querySelector('mark')?.textContent).toBe('Juan')
  })

  it('por el negocio: muestra el negocio y de quién es (el titular sigue en la primera línea)', () => {
    renderFila(base, 'esperanza')
    const motivo = screen.getByTestId('cliente-search-motivo')
    expect(motivo).toHaveTextContent('🏪 Panadería La Esperanza')
    expect(motivo).toHaveTextContent('Panadería')
    expect(motivo).toHaveTextContent('Sur · Cll 9 # 1-2')
    expect(screen.getByTestId('cliente-search-result')).toHaveTextContent('Juan Pérez')
    expect(motivo.querySelector('mark')?.textContent).toBe('Esperanza')
  })

  it.each(['esposa', 'angela', '311 987 6543'])('por el contacto ("%s"): nombre, relación y celular', (q) => {
    renderFila(base, q)
    const motivo = screen.getByTestId('cliente-search-motivo')
    expect(motivo).toHaveTextContent('👤 Ángela Quiñones')
    expect(motivo).toHaveTextContent('(esposa)')
    expect(motivo).toHaveTextContent('311 987 6543')
  })

  it('por el celular del titular', () => {
    renderFila(base, '+57 300 123 4567')
    expect(screen.getByTestId('cliente-search-motivo')).toHaveTextContent('📱 300 123 4567')
  })

  it('insignias de deuda y bloqueo', () => {
    renderFila({ ...base, saldoPendiente: 45000, bloqueado: true }, 'juan')
    expect(screen.getByTestId('cliente-search-deuda')).toHaveTextContent(/Debe .*45\.000/)
    expect(screen.getByTestId('cliente-search-bloqueado')).toHaveTextContent('Bloqueado')
  })

  it('sin deuda ni bloqueo no hay insignias', () => {
    renderFila({ ...base, saldoPendiente: 0, bloqueado: false }, 'juan')
    expect(screen.queryByTestId('cliente-search-deuda')).toBeNull()
    expect(screen.queryByTestId('cliente-search-bloqueado')).toBeNull()
  })

  it('al tocar la fila selecciona al cliente', () => {
    const onSelect = renderFila(base, 'juan')
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    expect(onSelect).toHaveBeenCalledWith(base, null)
  })

  it('(#392) si coincidió por un negocio, al tocar la fila lo entrega para preseleccionarlo', () => {
    const onSelect = renderFila(base, 'esperanza')
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    expect(onSelect).toHaveBeenCalledWith(base, { id: 'n1', direccion: 'Cll 9 # 1-2', barrio: 'Sur' })
  })

  it('un cliente mínimo (sin celular, barrio, contactos ni negocios) no rompe', () => {
    renderFila({ id: 'c2', nombre: 'Solo', telefono: '' }, 'solo')
    const fila = screen.getByTestId('cliente-search-result')
    expect(within(fila).queryByTestId('cliente-search-motivo')).toBeNull()
    expect(fila).toHaveTextContent('Solo')
  })
})
