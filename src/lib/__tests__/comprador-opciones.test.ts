import { describe, it, expect } from 'vitest'
import { opcionesComprador, nombreCompleto, type ClienteComprador } from '../comprador-opciones'

const marcos: ClienteComprador = {
  id: 'c1', nombre: 'Marcos', apellido: 'Ruiz', telefono: '3001234567', barrio: 'Centro', direccion: 'Calle 1',
  negocios: [
    { id: 'n1', nombre: 'Tienda La Esperanza', tipoNegocio: 'Tienda', barrio: 'Centro', direccion: 'Cra 7 # 10-20' },
    { id: 'n2', nombre: 'Sucursal Norte', tipoNegocio: 'Tienda', barrio: 'Norte', direccion: 'Cll 80' },
  ],
}
const ana: ClienteComprador = { id: 'c2', nombre: 'Ana', apellido: 'Torres', telefono: '3109998888' }
const lucia: ClienteComprador = {
  id: 'c3', nombre: 'Lucía', apellido: 'Pardo', telefono: '3205556666',
  negocios: [{ id: 'n3', nombre: 'Miscelánea Esperanza', tipoNegocio: 'Miscelánea', barrio: 'Norte' }],
}

describe('opcionesComprador', () => {
  it('cliente sin negocios: una fila de persona', () => {
    expect(opcionesComprador([ana], 'ana')).toEqual([{ tipo: 'persona', clave: 'p:c2', cliente: ana, avisos: true }])
  })

  it('busca una tienda: solo salen las tiendas que coinciden, no los dueños', () => {
    const r = opcionesComprador([marcos, lucia], 'esperanza')
    expect(r.map((o) => o.clave)).toEqual(['n:n1', 'n:n3'])
    expect(r.every((o) => o.tipo === 'negocio' && o.anidada === false)).toBe(true)
  })

  it('busca a la persona: la persona y TODAS sus tiendas (nada preseleccionado), anidadas', () => {
    const r = opcionesComprador([marcos], 'marcos')
    expect(r.map((o) => o.clave)).toEqual(['p:c1', 'n:n1', 'n:n2'])
    expect(r.slice(1).every((o) => o.tipo === 'negocio' && o.anidada)).toBe(true)
  })

  it('por celular de la persona: persona + tiendas', () => {
    expect(opcionesComprador([marcos], '300 123').map((o) => o.clave)).toEqual(['p:c1', 'n:n1', 'n:n2'])
  })

  it('persona y tienda a la vez en la búsqueda: persona + tiendas', () => {
    expect(opcionesComprador([marcos], 'marcos esperanza').map((o) => o.clave)).toEqual(['p:c1', 'n:n1', 'n:n2'])
  })

  it('solo por barrio del titular (sin tienda que coincida): persona + tiendas', () => {
    const r = opcionesComprador([{ ...marcos, negocios: [{ id: 'n9', nombre: 'Bodega', barrio: 'Sur' }] }], 'centro')
    expect(r.map((o) => o.clave)).toEqual(['p:c1', 'n:n9'])
  })

  it('por contacto del titular: persona + tiendas', () => {
    const c = { ...marcos, contactos: [{ nombre: 'Ángela', telefono: '3001112222', relacion: 'esposa' }] }
    expect(opcionesComprador([c], 'angela')[0].tipo).toBe('persona')
  })

  it('los avisos (deuda/bloqueo) se muestran una sola vez por cliente', () => {
    const r = opcionesComprador([marcos], 'marcos')
    expect(r.map((o) => o.avisos)).toEqual([true, false, false])
    const t = opcionesComprador([{ ...marcos, negocios: [...marcos.negocios!, { id: 'n4', nombre: 'Tienda Esperanza Sur' }] }], 'esperanza')
    expect(t.map((o) => o.avisos)).toEqual([true, false])
  })

  it('sin clientes no hay opciones', () => {
    expect(opcionesComprador([], 'x')).toEqual([])
  })
})

describe('nombreCompleto', () => {
  it('une nombre y apellido', () => {
    expect(nombreCompleto({ nombre: 'Ana', apellido: 'Torres' })).toBe('Ana Torres')
    expect(nombreCompleto({ nombre: 'Ana' })).toBe('Ana')
  })
})
