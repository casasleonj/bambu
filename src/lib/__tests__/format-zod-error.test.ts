// @tests formatZodError (src/lib/utils.ts) — commit I2 plan e2e
// Zod 4 cambio: error.flatten() IGNORA los custom messages del
// schema. formatZodError ahora itera error.issues y preserva los
// mensajes custom. Tambien deduplica issues del mismo path.

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { formatZodError } from '@/lib/utils'

describe('formatZodError (Zod 4)', () => {
  it('preserva el custom message de z.string({ message: X }) cuando el campo es undefined', () => {
    // Caso real: CasoCreateSchema.alertaTipo
    // Zod 4 quirk: .min(1, 'X') solo se usa para too_small, no para invalid_type.
    // Para missing hay que usar z.string({ message: 'X' })
    const schema = z.object({
      foo: z.string({ message: 'foo requerido' }),
    })
    const r = schema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      expect(msg).toContain('foo')
      expect(msg).toContain('foo requerido')
      // No debe contener el default generico de Zod
      expect(msg).not.toContain('Invalid input')
    }
  })

  it('preserva el .min(1, X) custom message cuando el campo es string vacio', () => {
    const schema = z.object({
      foo: z.string({ message: 'foo requerido' }).min(1, 'foo no puede ser vacio'),
    })
    const r = schema.safeParse({ foo: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      // Para empty string se dispara too_small, no invalid_type
      expect(msg).toContain('foo no puede ser vacio')
    }
  })

  it('preserva el custom message de z.enum cuando el valor es invalido', () => {
    // Caso real: CasoCreateSchema.severidad
    const schema = z.object({
      sev: z.enum(['ALTA', 'MEDIA', 'BAJA'], { message: 'severidad debe ser ALTA, MEDIA o BAJA' }),
    })
    const r = schema.safeParse({ sev: 'INVALID' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      expect(msg).toContain('severidad debe ser ALTA, MEDIA o BAJA')
    }
  })

  it('une multiples errores con ", " y preserva el path', () => {
    // Caso real: POST solo con alertaTipo (faltan severidad y titulo)
    const schema = z.object({
      a: z.string({ message: 'a requerido' }),
      b: z.string({ message: 'b requerido' }),
    })
    const r = schema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      expect(msg).toContain('a: a requerido')
      expect(msg).toContain('b: b requerido')
      expect(msg).toContain(', ')
    }
  })

  it('deduplica issues del mismo path+mensaje', () => {
    // Si un campo tiene multiples validators que disparan el mismo mensaje,
    // solo se reporta una vez
    const schema = z.object({
      foo: z.string({ message: 'foo requerido' }).min(5, 'foo requerido'),
    })
    const r = schema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      // Solo una ocurrencia de "foo: foo requerido"
      const occurrences = (msg.match(/foo: foo requerido/g) || []).length
      expect(occurrences).toBe(1)
    }
  })

  it('usa "body" como path para errores a nivel root', () => {
    // Si un schema es directamente un string y falla, el path es []
    const schema = z.string({ message: 'root error' })
    const r = schema.safeParse(123)
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = formatZodError(r.error)
      expect(msg).toContain('body:')
    }
  })

  it('retorna "Error de validacion" para errors sin issues (edge case)', () => {
    // Si por algun motivo error.issues esta vacio, devolvemos un
    // mensaje generico en vez de string vacio
    const fakeError = { issues: [] } as unknown as z.ZodError
    expect(formatZodError(fakeError)).toBe('Error de validación')
  })
})
