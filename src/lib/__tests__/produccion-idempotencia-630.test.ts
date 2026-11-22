// @tests #630 F0 — huella estable, colisiones semánticas y compatibilidad histórica.
import { describe, expect, it } from 'vitest'
import { ProduccionCreateSchema } from '@/lib/validators'
import { coincideProduccionPersistida, huellaCreacionProduccion } from '@/lib/produccion-idempotencia'

const fecha = new Date('2026-11-16T05:00:00.000Z')
const base = {
  fecha: '2026-11-16',
  turno: 'MANANA' as const,
  trabajadorId: 'sellador-sintetico',
  botellonesLlenados: 3,
  obs: 'Turno normal',
  items: [
    { producto: 'PACA_AGUA' as const, conteoA: 400, conteoB: 400, stockFinFisico: 200 },
    { producto: 'PACA_HIELO' as const, conteoA: 20, conteoB: 20, stockFinFisico: 10 },
  ],
}
const parse = (v: unknown) => ProduccionCreateSchema.parse(v)

describe('#630 huella semántica original de Producción', () => {
  it('acepta el mismo contenido aunque cambien orden de items y espacios externos', () => {
    const original = parse(base)
    const invertido = parse({ ...base, obs: '  Turno normal  ', items: [...base.items].reverse() })
    expect(huellaCreacionProduccion(original, fecha)).toBe(huellaCreacionProduccion(invertido, fecha))
  })

  it('distingue cantidades, faltantes, filtradas, observación, trabajador y fecha', () => {
    const original = huellaCreacionProduccion(parse(base), fecha)
    const variantes: unknown[] = [
      { ...base, items: [{ ...base.items[0], conteoA: 401 }, base.items[1]] },
      { ...base, items: [{ ...base.items[0], stockFinFisico: 199 }, base.items[1]] },
      { ...base, items: [{ ...base.items[0], filtradas: 1 }, base.items[1]] },
      { ...base, obs: 'Turno corregido' },
      { ...base, trabajadorId: 'otro-sellador' },
      { ...base, stockFinBotellones: 4 },
      { ...base, botellonesLlenados: 2 },
    ]
    for (const v of variantes) expect(huellaCreacionProduccion(parse(v), fecha)).not.toBe(original)
    expect(huellaCreacionProduccion(parse(base), new Date('2026-11-17T05:00:00.000Z'))).not.toBe(original)
  })

  it('en registros legados compara los campos persistidos y no afirma éxito con diferencias', () => {
    const entrada = parse(base)
    const original = {
      fecha,
      trabajadorId: base.trabajadorId,
      turno: base.turno,
      obs: base.obs,
      items: [
        { producto: 'PACA_AGUA', conteoA: 400, conteoB: 400, stockFinFisico: 200, filtradas: 0, rotas: 0, consumoInterno: 0, producido: 400 },
        { producto: 'PACA_HIELO', conteoA: 20, conteoB: 20, stockFinFisico: 10, filtradas: 0, rotas: 0, consumoInterno: 0, producido: 20 },
        { producto: 'BOTELLON', conteoA: 3, conteoB: 3, stockFinFisico: 3, filtradas: 0, rotas: 0, consumoInterno: 0, producido: 3 },
      ],
    }
    expect(coincideProduccionPersistida(original, entrada, fecha)).toBe(true)
    expect(coincideProduccionPersistida(original, parse({ ...base, obs: 'Cambiada' }), fecha)).toBe(false)
    expect(coincideProduccionPersistida(original, parse({ ...base, items: [
      { ...base.items[0], rotas: 1 }, base.items[1],
    ] }), fecha)).toBe(false)
  })
})
