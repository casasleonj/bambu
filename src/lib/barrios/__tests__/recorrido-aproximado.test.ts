import { describe, expect, it } from 'vitest'
import {
  centroCartograficoProvisional,
  ORIGEN_AGUA_BAMBU_EXPERIMENTAL,
  sugerirRecorridoBarrios,
} from '../recorrido-aproximado'

const g = (clave: string, etiqueta: string, unidadesPendientes = 1) =>
  ({ clave, etiqueta, unidadesPendientes })

describe('#859 Recorrido por barrios: propuesta cartográfica aislada', () => {
  it('utiliza la marca del PO, NO el centro geométrico anterior de San José', () => {
    expect(ORIGEN_AGUA_BAMBU_EXPERIMENTAL).toEqual({ x: 4973700, y: 2666730 })
    expect(centroCartograficoProvisional('San José')).toEqual(ORIGEN_AGUA_BAMBU_EXPERIMENTAL)
    expect(centroCartograficoProvisional('Instituto')).toEqual(
      centroCartograficoProvisional('Martínez Barbosa'),
    )
  })

  it('la sugerencia entre Instituto y Centro sale primero hacia Instituto', () => {
    const ruta = sugerirRecorridoBarrios([g('centro','Centro'),g('instituto','Instituto')])
    expect(ruta.claves[0]).toBe('instituto')
    expect(ruta.secuenciaGeometricaCompleta).toBe(true)
    expect(ruta.costoRectaCentrosMetros).toBeGreaterThan(0)
  })

  it('Llevar al primero fija la primera visita y reordena las restantes', () => {
    const barrios = [
      g('centro','Centro'),
      g('instituto','Instituto'),
      g('gaitana','La Gaitana'),
      g('buenos','Buenos Aires'),
      g('camilo','Camilo Torres'),
      g('altos','Altos del Tesoro'),
    ]
    const auto = sugerirRecorridoBarrios(barrios)
    const fijada = sugerirRecorridoBarrios(barrios,'camilo')
    expect(fijada.claves[0]).toBe('camilo')
    expect(fijada.claves).not.toEqual(['camilo',...auto.claves.filter(k => k !== 'camilo')])
    expect(new Set(fijada.claves)).toEqual(new Set(barrios.map(b => b.clave)))
    expect(barrios[0].clave).toBe('centro') // no muta entrada
  })

  it('restablecer sin primer barrio ignora el antiguo fijado', () => {
    const barrios = [g('centro','Centro'),g('instituto','Instituto'),g('gaitana','La Gaitana')]
    const fijo = sugerirRecorridoBarrios(barrios,'centro')
    const reseteado = sugerirRecorridoBarrios(barrios)
    expect(fijo.claves[0]).toBe('centro')
    expect(reseteado.claves[0]).toBe('instituto')
  })

  it('los barrios sin centro siguen visibles al final y no falsean costo vial', () => {
    const barrios = [
      g('sin-barrio','Sin barrio'),
      g('tiburon','Tiburón'),
      g('venta-anonima','Venta anónima'),
      g('inst','Instituto'),
      g('centro','Centro'),
    ]
    const ruta = sugerirRecorridoBarrios(barrios)
    expect(ruta.claves).toHaveLength(barrios.length)
    expect(ruta.claves).toContain('tiburon')
    expect(ruta.claves).toContain('sin-barrio')
    expect(ruta.claves).toContain('venta-anonima')
    expect(ruta.sinCentro).toEqual(['tiburon'])
    expect(ruta.secuenciaGeometricaCompleta).toBe(false)
  })

  it('fijar un barrio sin centro no inventa ruta desde ese punto', () => {
    const entrada = [g('inst','Instituto'),g('tiburon','Tiburón'),g('centro','Centro')]
    const ruta = sugerirRecorridoBarrios(entrada,'tiburon')
    expect(ruta.claves).toEqual(['tiburon','inst','centro'])
    expect(ruta.costoRectaCentrosMetros).toBe(0)
    expect(ruta.secuenciaGeometricaCompleta).toBe(false)
  })

  it('no elimina barrios con remanente cero ni permite que determinen visitas', () => {
    const barrios = [g('terminado','Trujillo',0),g('inst','Instituto'),g('centro','Centro')]
    const ruta = sugerirRecorridoBarrios(barrios)
    expect(ruta.claves).toEqual(['inst','centro','terminado'])
  })

  it('no fusiona dos claves canónicas diferentes con la misma ubicación', () => {
    const barrios = [g('b:id-instituto','Instituto'),g('b:id-martinez','Martínez Barbosa')]
    const ruta = sugerirRecorridoBarrios(barrios)
    expect(ruta.claves).toHaveLength(2)
    expect(new Set(ruta.claves).size).toBe(2)
  })

  it('conserva 55 grupos, incluso sin equivalencias, sin truncar a 20', () => {
    const barrios = Array.from({length:55},(_,i) => g('b:'+i,'Barrio desconocido '+i))
    const ruta = sugerirRecorridoBarrios(barrios)
    expect(ruta.claves).toHaveLength(55)
    expect(ruta.sinCentro).toHaveLength(55)
  })

  it('conjunto vacío y repetidos no producen visitas artificiales', () => {
    expect(sugerirRecorridoBarrios([]).claves).toEqual([])
    const ruta = sugerirRecorridoBarrios([g('a','Instituto'),g('a','Instituto')])
    expect(ruta.claves).toEqual(['a'])
  })
})
