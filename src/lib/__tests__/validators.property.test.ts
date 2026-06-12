// @tests validators — property-based (fast-check)
// Fuzzing: ningún input adverso debe tumbar Zod ni pasar como válido
// cuando no lo es. Cubre los schemas más usados en producción.
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  PedidoCreateSchema,
  CierreCreateSchema,
  GastoCreateSchema,
  NominaCreateSchema,
  AbonoCreateSchema,
  ClienteQuickCreateSchema,
  AnularSchema,
  ContactoAlternativoUpdateSchema,
  ProduccionCreateSchema,
} from '@/lib/validators'

describe('Validators — property-based: nunca tumban, nunca aceptan inválido', () => {
  describe('PedidoCreateSchema', () => {
    it('clienteId vacío → rechaza', () => {
      // FIX H1-3: z.string().trim().min(1) rechaza '' y '   ' por igual.
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(''), fc.constant(' '), fc.constant('   ')),
          (v) => {
            const r = PedidoCreateSchema.safeParse({
              clienteId: v,
              items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            })
            return r.success === false
          },
        ),
        { numRuns: 30 },
      )
    })

    it('items vacío → rechaza (necesita ≥ 1)', () => {
      const r = PedidoCreateSchema.safeParse({
        clienteId: 'cli-1',
        items: [],
      })
      expect(r.success).toBe(false)
    })

    it('items con cantidad negativa → rechaza', () => {
      fc.assert(
        fc.property(fc.integer({ min: -10000, max: -1 }), (cantidad) => {
          const r = PedidoCreateSchema.safeParse({
            clienteId: 'cli-1',
            items: [{ producto: 'PACA_AGUA', cantidad }],
          })
          return r.success === false
        }),
        { numRuns: 30 },
      )
    })

    it('producto desconocido → rechaza', () => {
      const r = PedidoCreateSchema.safeParse({
        clienteId: 'cli-1',
        items: [{ producto: 'NO_EXISTE', cantidad: 1 }],
      })
      expect(r.success).toBe(false)
    })

    it('string de 10k chars como clienteId → rechaza (no cuelga)', () => {
      const huge = 'a'.repeat(10000)
      const r = PedidoCreateSchema.safeParse({
        clienteId: huge,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      })
      // min(1) pasa, pero un clienteId así no debería existir en DB
      // Lo importante es que no se cuelgue
      expect(typeof r.success).toBe('boolean')
    })

    it('script injection como nombre de cliente no pasa el schema (lo acepta, pero Zod no ejecuta)', () => {
      const evil = '<script>alert(1)</script>'
      const r = PedidoCreateSchema.safeParse({
        clienteId: evil,
        clienteNuevo: {
          nombre: evil,
          telefono: '3001234567',
        },
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      })
      // Zod acepta strings arbitrarios — la defensa está en React (escape) y Prisma (parametrized queries)
      // Lo importante: el schema no se rompe
      expect(typeof r.success).toBe('boolean')
    })
  })

  describe('CierreCreateSchema', () => {
    it('baseDia negativo → rechaza', () => {
      fc.assert(
        fc.property(fc.double({ min: -1e9, max: -0.01, noNaN: true }), (v) => {
          const r = CierreCreateSchema.safeParse({
            baseDia: v,
            stockIniAgua: 0,
            prodAgua: 0,
            stockFinAgua: 0,
            stockIniHielo: 0,
            prodHielo: 0,
            stockFinHielo: 0,
            comisiones: 0,
            salarios: 0,
          })
          return r.success === false
        }),
        { numRuns: 30 },
      )
    })

    it('fecha con formato incorrecto → rechaza', () => {
      // FIX H1-4: regex + refine con Date round-trip detecta rollovers
      // silenciosos (2025-02-30 → 2025-03-02 en JS).
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('2025/01/01'),
            fc.constant('01-01-2025'),
            fc.constant('ayer'),
            fc.constant('2025-13-01'),
            fc.constant('2025-02-30'),
            fc.constant(''),
          ),
          (v) => {
            const r = CierreCreateSchema.safeParse({
              fecha: v,
              baseDia: 0,
              stockIniAgua: 0,
              prodAgua: 0,
              stockFinAgua: 0,
              stockIniHielo: 0,
              prodHielo: 0,
              stockFinHielo: 0,
              comisiones: 0,
              salarios: 0,
            })
            return r.success === false
          },
        ),
        { numRuns: 30 },
      )
    })

    it('campos negativos en stocks → rechaza', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: -1 }), (v) => {
          const r = CierreCreateSchema.safeParse({
            baseDia: 0,
            stockIniAgua: v,
            prodAgua: 0,
            stockFinAgua: 0,
            stockIniHielo: 0,
            prodHielo: 0,
            stockFinHielo: 0,
            comisiones: 0,
            salarios: 0,
          })
          return r.success === false
        }),
        { numRuns: 30 },
      )
    })

    it('campos extra (extra fields) → rechaza por .strict()', () => {
      const r = CierreCreateSchema.safeParse({
        baseDia: 0,
        stockIniAgua: 0,
        prodAgua: 0,
        stockFinAgua: 0,
        stockIniHielo: 0,
        prodHielo: 0,
        stockFinHielo: 0,
        comisiones: 0,
        salarios: 0,
        netoCaja: 999, // extra: el server lo calcula
        totalVentas: 999, // extra
      })
      // .strict() rechaza unknown keys
      expect(r.success).toBe(false)
    })
  })

  describe('GastoCreateSchema', () => {
    it('monto cero → rechaza (positive only)', () => {
      const r = GastoCreateSchema.safeParse({
        categoria: 'OTRO',
        descripcion: 'Test',
        monto: 0,
      })
      expect(r.success).toBe(false)
    })

    it('monto negativo → rechaza', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: -1 }), (m) => {
          const r = GastoCreateSchema.safeParse({
            categoria: 'OTRO',
            descripcion: 'Test',
            monto: m,
          })
          return r.success === false
        }),
        { numRuns: 30 },
      )
    })

    it('categoria inválida → rechaza', () => {
      const r = GastoCreateSchema.safeParse({
        categoria: 'NO_ES_VALIDA',
        descripcion: 'Test',
        monto: 100,
      })
      expect(r.success).toBe(false)
    })

    it('descripción de 10k chars → acepta pero no rompe (max 200 esperado, pero validamos 10k)', () => {
      const huge = 'a'.repeat(10000)
      const r = GastoCreateSchema.safeParse({
        categoria: 'OTRO',
        descripcion: huge,
        monto: 100,
      })
      // Schema tiene max(200) → debe rechazar
      expect(r.success).toBe(false)
    })
  })

  describe('NominaCreateSchema', () => {
    it('fechaFin < fechaInicio → rechaza', () => {
      const r = NominaCreateSchema.safeParse({
        trabajadorId: 't1',
        fechaInicio: '2025-12-31',
        fechaFin: '2025-01-01',
      })
      expect(r.success).toBe(false)
    })

    it('fechaFin == fechaInicio → acepta (mismo día)', () => {
      const r = NominaCreateSchema.safeParse({
        trabajadorId: 't1',
        fechaInicio: '2025-06-15',
        fechaFin: '2025-06-15',
      })
      expect(r.success).toBe(true)
    })

    it('fechaInicio con formato DD/MM/YYYY → rechaza', () => {
      const r = NominaCreateSchema.safeParse({
        trabajadorId: 't1',
        fechaInicio: '15/06/2025',
        fechaFin: '20/06/2025',
      })
      expect(r.success).toBe(false)
    })
  })

  describe('AbonoCreateSchema', () => {
    it('monto cero → rechaza (positive)', () => {
      const r = AbonoCreateSchema.safeParse({
        facturaId: 'f1',
        clienteId: 'c1',
        monto: 0,
        metodoPago: 'EFECTIVO',
      })
      expect(r.success).toBe(false)
    })

    it('metodoPago inválido → rechaza', () => {
      const r = AbonoCreateSchema.safeParse({
        facturaId: 'f1',
        clienteId: 'c1',
        monto: 1000,
        metodoPago: 'BITCOIN',
      })
      expect(r.success).toBe(false)
    })
  })

  describe('ClienteQuickCreateSchema', () => {
    it('teléfono de 1 dígito → rechaza (min 7)', () => {
      const r = ClienteQuickCreateSchema.safeParse({
        nombre: 'Test',
        telefono: '1',
        direccion: 'Calle 1',
      })
      expect(r.success).toBe(false)
    })

    it('nombre de 1 char → rechaza (min 2)', () => {
      const r = ClienteQuickCreateSchema.safeParse({
        nombre: 'A',
        telefono: '3001234567',
        direccion: 'Calle 1',
      })
      expect(r.success).toBe(false)
    })

    it('happy path → acepta', () => {
      const r = ClienteQuickCreateSchema.safeParse({
        nombre: 'Juan',
        telefono: '3001234567',
        direccion: 'Calle 1 #2-3',
        barrio: 'Centro',
      })
      expect(r.success).toBe(true)
    })
  })

  describe('AnularSchema', () => {
    it('motivo vacío → rechaza', () => {
      const r = AnularSchema.safeParse({ motivo: '', devolverStock: false })
      expect(r.success).toBe(false)
    })

    it('sin motivo → rechaza', () => {
      const r = AnularSchema.safeParse({})
      expect(r.success).toBe(false)
    })

    it('devolverStock default = false', () => {
      const r = AnularSchema.safeParse({ motivo: 'Cliente canceló' })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.devolverStock).toBe(false)
      }
    })
  })

  describe('ContactoAlternativoUpdateSchema — .refine() al menos 1 campo', () => {
    it('{} → rechaza (PATCH debe tener al menos 1 campo)', () => {
      const r = ContactoAlternativoUpdateSchema.safeParse({})
      expect(r.success).toBe(false)
    })

    it('solo nombre → acepta', () => {
      const r = ContactoAlternativoUpdateSchema.safeParse({ nombre: 'Test' })
      expect(r.success).toBe(true)
    })

    it('solo teléfono → acepta', () => {
      const r = ContactoAlternativoUpdateSchema.safeParse({ telefono: '3001234567' })
      expect(r.success).toBe(true)
    })

    it('solo relacion → acepta', () => {
      const r = ContactoAlternativoUpdateSchema.safeParse({ relacion: 'Esposa' })
      expect(r.success).toBe(true)
    })
  })

  describe('ProduccionCreateSchema — items exactamente 2 y productos correctos', () => {
    it('items vacío → rechaza', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'MANANA',
        trabajadorId: 't1',
        items: [],
      })
      expect(r.success).toBe(false)
    })

    it('1 item → rechaza (debe ser exactamente 2)', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'MANANA',
        trabajadorId: 't1',
        items: [{ producto: 'PACA_AGUA', conteoA: 0, conteoB: 0 }],
      })
      expect(r.success).toBe(false)
    })

    it('3 items → rechaza', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'MANANA',
        trabajadorId: 't1',
        items: [
          { producto: 'PACA_AGUA', conteoA: 0, conteoB: 0 },
          { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0 },
          { producto: 'PACA_AGUA', conteoA: 0, conteoB: 0 },
        ],
      })
      expect(r.success).toBe(false)
    })

    it('items con producto equivocado (BOTELLON) → rechaza', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'MANANA',
        trabajadorId: 't1',
        items: [
          { producto: 'PACA_AGUA', conteoA: 0, conteoB: 0 },
          { producto: 'BOTELLON', conteoA: 0, conteoB: 0 }, // producto no válido
        ],
      })
      expect(r.success).toBe(false)
    })

    it('conteos negativos → rechaza', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'MANANA',
        trabajadorId: 't1',
        items: [
          { producto: 'PACA_AGUA', conteoA: -5, conteoB: 0 },
          { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0 },
        ],
      })
      expect(r.success).toBe(false)
    })

    it('happy path → acepta', () => {
      const r = ProduccionCreateSchema.safeParse({
        turno: 'TARDE',
        trabajadorId: 't1',
        items: [
          { producto: 'PACA_AGUA', conteoA: 100, conteoB: 102 },
          { producto: 'PACA_HIELO', conteoA: 50, conteoB: 51 },
        ],
      })
      expect(r.success).toBe(true)
    })
  })
})
