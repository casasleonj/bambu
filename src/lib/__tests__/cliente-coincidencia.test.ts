// @tests #385 — por qué coincidió un cliente y qué fragmentos resaltar.
import { describe, it, expect } from 'vitest'
import { explicarCoincidencia, segmentarCoincidencias, celularLegible, negocioAPreseleccionar } from '@/lib/cliente-coincidencia'

const juan = {
  nombre: 'Juan',
  apellido: 'Pérez',
  telefono: '3001234567',
  barrio: 'Norte',
  direccion: 'Cra 5 # 6-7',
  notas: 'paga los viernes',
  contactos: [{ nombre: 'Ángela Quiñones', telefono: '3119876543', relacion: 'esposa' }],
  negocios: [
    { nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería', direccion: 'Cll 9 # 1-2', barrio: 'Sur', referencia: 'frente a la iglesia' },
    { nombre: 'Tienda El Sol', tipoNegocio: 'Tienda', direccion: null, barrio: null, referencia: null },
  ],
}

describe('explicarCoincidencia', () => {
  it('por el nombre o apellido del titular no hay nada que explicar', () => {
    expect(explicarCoincidencia(juan, 'juan')).toEqual([])
    expect(explicarCoincidencia(juan, 'perez')).toEqual([])
    expect(explicarCoincidencia(juan, 'juan perez')).toEqual([])
  })

  it('por el negocio: dice cuál y a quién pertenece (el titular va en su propia línea)', () => {
    expect(explicarCoincidencia(juan, 'esperanza')).toEqual([
      { tipo: 'negocio', nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería', direccion: 'Cll 9 # 1-2', barrio: 'Sur' },
    ])
  })

  it('por el tipo de negocio sin acento y por la referencia del negocio', () => {
    expect(explicarCoincidencia(juan, 'panaderia')[0]).toMatchObject({ tipo: 'negocio', nombre: 'Panadería La Esperanza' })
    expect(explicarCoincidencia(juan, 'iglesia')[0]).toMatchObject({ tipo: 'negocio', nombre: 'Panadería La Esperanza' })
  })

  it('negocio + dueño: solo se explica el negocio, el dueño ya lo explica su nombre', () => {
    const m = explicarCoincidencia(juan, 'panaderia juan')
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ tipo: 'negocio' })
  })

  it('por el contacto: nombre, relación y celular', () => {
    const esperado = { tipo: 'contacto', nombre: 'Ángela Quiñones', relacion: 'esposa', telefono: '3119876543' }
    expect(explicarCoincidencia(juan, 'angela')).toEqual([esperado])
    expect(explicarCoincidencia(juan, 'esposa')).toEqual([esperado])
    expect(explicarCoincidencia(juan, '311 987 6543')).toEqual([esperado])
  })

  it('por el celular del titular (con o sin formato)', () => {
    expect(explicarCoincidencia(juan, '300 123 4567')).toEqual([{ tipo: 'celular', telefono: '3001234567' }])
    expect(explicarCoincidencia(juan, '+57 3001234567')).toEqual([{ tipo: 'celular', telefono: '3001234567' }])
  })

  it('por notas', () => {
    expect(explicarCoincidencia(juan, 'viernes')).toEqual([{ tipo: 'notas', texto: 'paga los viernes' }])
  })

  it('por barrio o dirección del titular no hay motivo aparte (se resalta en su línea)', () => {
    expect(explicarCoincidencia(juan, 'norte')).toEqual([])
  })

  it('máximo 2 motivos y sin repetir la misma fuente', () => {
    const m = explicarCoincidencia(juan, 'esperanza panaderia esposa viernes')
    expect(m.length).toBeLessThanOrEqual(2)
    expect(new Set(m.map((x) => x.tipo + ('nombre' in x ? x.nombre : ''))).size).toBe(m.length)
  })

  it('un cliente sin contactos ni negocios no rompe', () => {
    expect(explicarCoincidencia({ nombre: 'Solo' }, 'solo')).toEqual([])
    expect(explicarCoincidencia({ nombre: 'Solo' }, 'otra')).toEqual([])
  })
})

describe('segmentarCoincidencias', () => {
  it('marca el fragmento sin importar acentos ni mayúsculas', () => {
    expect(segmentarCoincidencias('Panadería La Esperanza', 'panaderia')).toEqual([
      { texto: 'Panadería', coincide: true },
      { texto: ' La Esperanza', coincide: false },
    ])
  })

  it('varias palabras y varias apariciones, unidas sin solaparse', () => {
    const s = segmentarCoincidencias('Juan Pérez Pérez', 'perez juan')
    expect(s.map((x) => x.texto).join('')).toBe('Juan Pérez Pérez')
    expect(s.filter((x) => x.coincide).map((x) => x.texto)).toEqual(['Juan', 'Pérez', 'Pérez'])
  })

  it('sin coincidencia devuelve un solo trozo sin marcar; texto vacío, nada', () => {
    expect(segmentarCoincidencias('Carmen', 'zzz')).toEqual([{ texto: 'Carmen', coincide: false }])
    expect(segmentarCoincidencias('', 'zzz')).toEqual([])
  })

  it('palabras de un carácter no se resaltan (el buscador exige 2)', () => {
    expect(segmentarCoincidencias('Carmen', 'c')).toEqual([{ texto: 'Carmen', coincide: false }])
  })

  it('la ñ y la ü cuentan como n y u', () => {
    expect(segmentarCoincidencias('Quiñones', 'quinones')).toEqual([{ texto: 'Quiñones', coincide: true }])
  })
})

describe('celularLegible', () => {
  it('formatea "300 123 4567" y quita el indicativo', () => {
    expect(celularLegible('3001234567')).toBe('300 123 4567')
    expect(celularLegible('+573001234567')).toBe('300 123 4567')
    expect(celularLegible(null)).toBe('')
  })
})

describe('negocioAPreseleccionar (#392)', () => {
  const base = {
    nombre: 'Luis',
    apellido: 'Pérez',
    telefono: '3001234567',
    negocios: [
      { id: 'n1', nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería', direccion: 'Calle 1', barrio: 'Centro' },
      { id: 'n2', nombre: 'Tienda El Sol', tipoNegocio: 'Tienda', direccion: null, barrio: null },
    ],
  }

  it('devuelve el negocio cuando la búsqueda apunta a uno solo', () => {
    expect(negocioAPreseleccionar(base, 'esperanza')).toEqual({ id: 'n1', direccion: 'Calle 1', barrio: 'Centro' })
  })

  it('ignora las palabras que explica el titular', () => {
    expect(negocioAPreseleccionar(base, 'luis sol')).toEqual({ id: 'n2', direccion: null, barrio: null })
  })

  it('no preselecciona si coinciden negocios distintos', () => {
    expect(negocioAPreseleccionar(base, 'esperanza sol')).toBeNull()
  })

  it('no preselecciona si la coincidencia es del titular o del celular', () => {
    expect(negocioAPreseleccionar(base, 'luis')).toBeNull()
    expect(negocioAPreseleccionar(base, '300 123')).toBeNull()
  })

  it('no preselecciona negocios sin id', () => {
    expect(negocioAPreseleccionar({ ...base, negocios: [{ nombre: 'Panadería La Esperanza' }] }, 'esperanza')).toBeNull()
  })
})
