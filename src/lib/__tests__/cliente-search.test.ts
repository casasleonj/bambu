// @tests #384 — búsqueda local: celular escrito como lo dicta el cliente.
import { describe, it, expect } from 'vitest'
import { matchCliente, scoreCliente, esPalabraTelefono } from '@/lib/cliente-search'

const cliente = {
  nombre: 'Juan',
  apellido: 'Pérez',
  telefono: '3001234567',
  contactos: [{ nombre: 'Ángela Quiñones', telefono: '311 987 6543', relacion: 'esposa' }],
  negocios: [{ nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería' }],
}

describe('esPalabraTelefono', () => {
  it('reconoce dígitos con +, paréntesis, puntos y guiones', () => {
    for (const p of ['3001234567', '+57', '(300)', '123-456', '300.123']) expect(esPalabraTelefono(p), p).toBe(true)
  })
  it('no confunde palabras con letras', () => {
    for (const p of ['calle12', 'juan', '+', '--']) expect(esPalabraTelefono(p), p).toBe(false)
  })
})

describe('celular en la búsqueda local', () => {
  it.each([
    '3001234567', '300 123 4567', '+57 300 123 4567', '300-123-4567', '(300) 123 4567', '57 3001234567',
  ])('encuentra al titular con "%s"', (q) => {
    expect(matchCliente(cliente, q)).toBe(true)
  })

  it('encuentra el celular del contacto, con o sin formato', () => {
    expect(matchCliente(cliente, '3119876543')).toBe(true)
    expect(matchCliente(cliente, '311 987 6543')).toBe(true)
  })

  it('no inventa coincidencias con otro número ni con letras pegadas a dígitos', () => {
    expect(matchCliente(cliente, '300 123 9999')).toBe(false)
    expect(matchCliente(cliente, 'calle12')).toBe(false)
  })
})

describe('otros campos (sin cambios)', () => {
  it('relación del contacto, tipo de negocio y acentos', () => {
    expect(matchCliente(cliente, 'esposa')).toBe(true)
    expect(matchCliente(cliente, 'panaderia')).toBe(true)
    expect(matchCliente(cliente, 'quinones')).toBe(true)
  })
  it('el nombre pesa más que un campo secundario', () => {
    const enNombre = scoreCliente({ nombre: 'Zulma' }, 'zulma')
    const enNotas = scoreCliente({ nombre: 'Otro', notas: 'amigo de zulma' }, 'zulma')
    expect(enNombre).toBeGreaterThan(enNotas)
  })
})
