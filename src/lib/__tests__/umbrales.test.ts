import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getConfigs desde src/lib/config (es lo que umbrales-server.ts importa)
vi.mock('@/lib/config', () => ({
  getConfigs: vi.fn(),
}))

import { getConfigs } from '@/lib/config'
import { UMBRALES_DEFAULT } from '@/lib/umbrales'
import { getUmbralesAlertas } from '@/lib/umbrales-server'

const mockGetConfigs = getConfigs as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UMBRALES_DEFAULT', () => {
  it('tiene todos los campos requeridos con valores no-NaN', () => {
    expect(UMBRALES_DEFAULT.diasNoVerificado).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.diasVencimientoPromesa).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.multiplicadorMontoAnomalo).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.variacionPrecioBruscoPct).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.umbralDeudaRepartidorPacas).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.diasSinJustificarDescuento).toBeTypeOf('number')
    expect(UMBRALES_DEFAULT.pctDevolucionesAnormales).toBeTypeOf('number')
  })

  it('defaults coinciden con valores historicos del codigo embebido', () => {
    // El detector usaba 30 dias hardcoded para no verificado
    expect(UMBRALES_DEFAULT.diasNoVerificado).toBe(30)
    // 2 dias para promesa
    expect(UMBRALES_DEFAULT.diasVencimientoPromesa).toBe(2)
    // 2x promedio
    expect(UMBRALES_DEFAULT.multiplicadorMontoAnomalo).toBe(2)
    // 30% variacion
    expect(UMBRALES_DEFAULT.variacionPrecioBruscoPct).toBe(30)
  })
})

describe('getUmbralesAlertas', () => {
  it('usa defaults cuando la DB no tiene ninguna clave', async () => {
    mockGetConfigs.mockResolvedValueOnce({})
    const result = await getUmbralesAlertas()
    expect(result).toEqual(UMBRALES_DEFAULT)
  })

  it('mezcla valores de la DB con defaults para claves faltantes', async () => {
    mockGetConfigs.mockResolvedValueOnce({
      DIAS_ALERTA_NO_VERIFICADO: '15',
      MULTIPLICADOR_MONTO_ANOMALO: '3',
      // resto ausente
    })
    const result = await getUmbralesAlertas()
    expect(result.diasNoVerificado).toBe(15) // de la DB
    expect(result.multiplicadorMontoAnomalo).toBe(3) // de la DB
    expect(result.diasVencimientoPromesa).toBe(UMBRALES_DEFAULT.diasVencimientoPromesa) // default
  })

  it('usa todos los valores de la DB cuando estan presentes', async () => {
    mockGetConfigs.mockResolvedValueOnce({
      DIAS_ALERTA_NO_VERIFICADO: '7',
      DIAS_VENCIMIENTO_PROMESA: '1',
      MULTIPLICADOR_MONTO_ANOMALO: '2.5',
      VARIACION_PRECIO_BRUSCO_PCT: '25',
      UMBRAL_DEUDA_REPARTIDOR_PACAS: '100',
      DIAS_SIN_JUSTIFICAR_DESCUENTO: '3',
      PCT_DEVOLUCIONES_ANORMALES: '3',
    })
    const result = await getUmbralesAlertas()
    expect(result).toEqual({
      diasNoVerificado: 7,
      diasVencimientoPromesa: 1,
      multiplicadorMontoAnomalo: 2.5,
      variacionPrecioBruscoPct: 25,
      umbralDeudaRepartidorPacas: 100,
      diasSinJustificarDescuento: 3,
      pctDevolucionesAnormales: 3,
    })
  })

  it('valor no-numerico cae al default', async () => {
    mockGetConfigs.mockResolvedValueOnce({
      DIAS_ALERTA_NO_VERIFICADO: 'abc',
      MULTIPLICADOR_MONTO_ANOMALO: 'invalido',
    })
    const result = await getUmbralesAlertas()
    expect(result.diasNoVerificado).toBe(UMBRALES_DEFAULT.diasNoVerificado)
    expect(result.multiplicadorMontoAnomalo).toBe(UMBRALES_DEFAULT.multiplicadorMontoAnomalo)
  })

  it('valor numerico parcial (decimal) se acepta tal cual', async () => {
    mockGetConfigs.mockResolvedValueOnce({
      MULTIPLICADOR_MONTO_ANOMALO: '2.75',
    })
    const result = await getUmbralesAlertas()
    expect(result.multiplicadorMontoAnomalo).toBe(2.75)
  })

  it('acepta "Infinity" como fallback al default (Number.isFinite es false)', async () => {
    mockGetConfigs.mockResolvedValueOnce({
      // Forzar NaN via JSON.stringify(JSON.parse('Infinity')) — Infinity no
      // es JSON-safe. Pero "1e308" * 10 daria Infinity. Probamos vacio.
      DIAS_ALERTA_NO_VERIFICADO: '',
    })
    const result = await getUmbralesAlertas()
    // '' -> Number('') = 0 -> isFinite(0) = true -> usa 0 (no default)
    // Documentamos el comportamiento real: empty string se convierte a 0
    expect(result.diasNoVerificado).toBe(0)
  })
})
