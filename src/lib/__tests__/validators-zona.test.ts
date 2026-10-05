// @tests Zod schemas de Zona territorial (F3). Foco: ZonaBarrioAddSchema
// NO expone `source`/`createdBy` como input aceptado — instrucción
// explícita (el cliente no puede hacerse pasar por SYSTEM/MIGRATION ni por
// otro usuario). El servidor los fija desde el servicio/sesión.
import { describe, it, expect } from 'vitest'
import { ZonaCreateSchema, ZonaUpdateSchema, ZonaBarrioAddSchema } from '@/lib/validators'

describe('ZonaCreateSchema', () => {
  it('acepta un nombre válido, con trim', () => {
    const result = ZonaCreateSchema.parse({ nombre: '  Norte  ' })
    expect(result.nombre).toBe('Norte')
  })

  it('rechaza nombre vacío', () => {
    expect(() => ZonaCreateSchema.parse({ nombre: '' })).toThrow()
  })
})

describe('ZonaUpdateSchema', () => {
  it('requiere al menos un campo', () => {
    expect(() => ZonaUpdateSchema.parse({})).toThrow()
  })

  it('acepta solo activo', () => {
    const result = ZonaUpdateSchema.parse({ activo: false })
    expect(result).toEqual({ activo: false })
  })
})

describe('ZonaBarrioAddSchema', () => {
  it('acepta barrioId y confirmOverlap', () => {
    const result = ZonaBarrioAddSchema.parse({ barrioId: 'b1', confirmOverlap: true })
    expect(result).toEqual({ barrioId: 'b1', confirmOverlap: true })
  })

  it('no define source ni createdBy — un valor enviado por el cliente no sobrevive al parse como campo utilizable', () => {
    const result = ZonaBarrioAddSchema.parse({
      barrioId: 'b1',
      source: 'SYSTEM',
      createdBy: 'otro-usuario',
    }) as Record<string, unknown>
    // Zod (modo no-strict) descarta las keys no declaradas del tipo inferido;
    // el objeto resultante no debe traer `source`/`createdBy` utilizables
    // por el caller aguas abajo (la ruta nunca los lee de `data`, ver
    // route.test.ts, pero esto confirma que el propio schema no los valida
    // ni los re-expone con un shape que invite a leerlos).
    expect(result).not.toHaveProperty('source')
    expect(result).not.toHaveProperty('createdBy')
  })

  it('rechaza sin barrioId', () => {
    expect(() => ZonaBarrioAddSchema.parse({})).toThrow()
  })
})
