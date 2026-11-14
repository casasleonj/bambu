// @tests #789 - contrato reutilizable de búsqueda difusa (datos sintéticos)
import { describe, it, expect } from 'vitest'
import { evaluarBusqueda, buscarDifuso } from '@/lib/busqueda-fuzzy'

describe('busqueda-fuzzy: coincidencias textuales', () => {
  const r = (nombre: string, apellido = '') => ({ textos: [nombre, apellido], pesosTexto: [3, 3] })

  it('ignora tildes, mayúsculas y orden de palabras separadas por campo', () => {
    expect(evaluarBusqueda(r('José', 'Pérez'), 'jose')?.tipo).toBe('exacta')
    expect(evaluarBusqueda(r('Juan', 'Pérez'), 'PEREZ JUAN')).not.toBeNull()
    expect(evaluarBusqueda(r('Más por Menos'), 'mas por menos')?.tipo).toBe('exacta')
  })

  it('prefijos cortos, parciales y erratas suficientemente largas', () => {
    expect(evaluarBusqueda(r('Punti Frío'), 'pun')?.tipo).toBe('prefijo')
    expect(evaluarBusqueda(r('Punti Frío'), 'punto frio')?.tipo).toBe('aproximada')
    expect(evaluarBusqueda(r('Ángela'), 'angel')?.tipo).toBe('prefijo')
    expect(evaluarBusqueda(r('Ángela'), 'angela')?.tipo).toBe('exacta')
    expect(evaluarBusqueda(r('Panadería'), 'pnaaderia')?.tipo).toBe('aproximada')
    expect(evaluarBusqueda(r('Panadería'), 'xyz') ).toBeNull()
  })

  it('prioriza la frase exacta sobre las mismas palabras dispersas', () => {
    const candidatos = [
      { id: 'disperso', textos: ['Punto', 'Frío'] },
      { id: 'exacto', textos: ['Punto Frío'] },
    ]
    const resultado = buscarDifuso(candidatos, 'punto frio',
      (c) => ({ textos: c.textos }), (c) => c.id)
    expect(resultado.map((c) => c.id)).toEqual(['exacto', 'disperso'])
  })

  it('exige que todas las palabras coincidan, aunque en distintos campos', () => {
    expect(evaluarBusqueda(r('Juan', 'Pérez'), 'juan rodriguez')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Juan', 'Panadería'] }, 'panaderia juan')).not.toBeNull()
  })

  it('ordena exactas por encima de aproximadas y desempata por identidad estable', () => {
    const datos = [
      { id: '2', nombre: 'Punti Frío' },
      { id: '1', nombre: 'Punto Frío' },
      { id: '3', nombre: 'Puntxo Frío' },
    ]
    const encontrados = buscarDifuso(datos, 'punto frio',
      (x) => ({ textos: [x.nombre] }), (x) => x.id)
    expect(encontrados[0].id).toBe('1')
    expect(encontrados.map((x) => x.id)).toContain('2')
  })
})

describe('busqueda-fuzzy: identificadores seguros', () => {
  it('busca pedido y factura por identificador sin confundir otros números', () => {
    const pedido = { textos: ['Cliente'], identificadores: ['1042'] }
    expect(evaluarBusqueda(pedido, '#1042')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(pedido, '#1043')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Pedro'], identificadores: ['FAC-00120'] }, 'FAC-00128')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Pedro'], identificadores: ['FAC-00120'] }, 'FAC-0012')?.tipo)
      .toBe('identificador')
  })

  it('compara teléfono por dígitos sin corregir erratas numéricas', () => {
    const contacto = { textos: ['Camilo'], telefonos: ['300 123 4567'] }
    expect(evaluarBusqueda(contacto, '+57 300 123 4567')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(contacto, '3001234568')).toBeNull()
    expect(evaluarBusqueda(contacto, '300-123')).not.toBeNull()
  })

  it('no admite fuzzy de tokens con números ni consulta vacía', () => {
    expect(evaluarBusqueda({ textos: ['A1B234'] }, 'A1B235')).toBeNull()
    expect(evaluarBusqueda({ textos: ['20 de Marzo'] }, '20')?.tipo).toBe('exacta')
    expect(evaluarBusqueda({ textos: ['Nombre'], identificadores: ['superadmin'] }, 'admin')?.tipo).toBe('identificador')
    expect(evaluarBusqueda({ textos: ['Nombre'], identificadores: ['10420'] }, '#1042')).toBeNull()
    expect(evaluarBusqueda({ textos: ['José'] }, ' ')).toBeNull()
  })
})
