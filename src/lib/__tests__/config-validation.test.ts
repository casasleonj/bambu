import { describe, it, expect } from 'vitest'
import { validateConfigValue, validateConfigBatch } from '@/lib/config-validation'

describe('validateConfigValue — claves existentes (regresión)', () => {
  it('acepta BASE_DIA positivo', () => {
    expect(validateConfigValue('BASE_DIA', '50000')).toBeNull()
  })

  it('rechaza BASE_DIA negativo', () => {
    expect(validateConfigValue('BASE_DIA', '-1')).not.toBeNull()
  })

  it('rechaza BASE_DIA no entero', () => {
    expect(validateConfigValue('BASE_DIA', '50000.5')).not.toBeNull()
  })

  it('acepta DIAS_ALERTA_NO_VERIFICADO positivo', () => {
    expect(validateConfigValue('DIAS_ALERTA_NO_VERIFICADO', '15')).toBeNull()
  })

  it('rechaza DIAS_ALERTA_NO_VERIFICADO = 0', () => {
    expect(validateConfigValue('DIAS_ALERTA_NO_VERIFICADO', '0')).not.toBeNull()
  })
})

describe('validateConfigValue — 5 claves nuevas (alertas antifraude)', () => {
  describe('MULTIPLICADOR_MONTO_ANOMALO', () => {
    it('acepta valor por defecto 2', () => {
      expect(validateConfigValue('MULTIPLICADOR_MONTO_ANOMALO', '2')).toBeNull()
    })
    it('acepta 1.5 (decimal)', () => {
      expect(validateConfigValue('MULTIPLICADOR_MONTO_ANOMALO', '1.5')).toBeNull()
    })
    it('rechaza 0', () => {
      expect(validateConfigValue('MULTIPLICADOR_MONTO_ANOMALO', '0')).not.toBeNull()
    })
    it('rechaza negativo', () => {
      expect(validateConfigValue('MULTIPLICADOR_MONTO_ANOMALO', '-1')).not.toBeNull()
    })
    it('rechaza no-numérico', () => {
      expect(validateConfigValue('MULTIPLICADOR_MONTO_ANOMALO', 'abc')).not.toBeNull()
    })
  })

  describe('VARIACION_PRECIO_BRUSCO_PCT', () => {
    it('acepta 30 (default)', () => {
      expect(validateConfigValue('VARIACION_PRECIO_BRUSCO_PCT', '30')).toBeNull()
    })
    it('acepta 1 (mínimo)', () => {
      expect(validateConfigValue('VARIACION_PRECIO_BRUSCO_PCT', '1')).toBeNull()
    })
    it('acepta 100 (máximo)', () => {
      expect(validateConfigValue('VARIACION_PRECIO_BRUSCO_PCT', '100')).toBeNull()
    })
    it('rechaza 0', () => {
      expect(validateConfigValue('VARIACION_PRECIO_BRUSCO_PCT', '0')).not.toBeNull()
    })
    it('rechaza 101', () => {
      expect(validateConfigValue('VARIACION_PRECIO_BRUSCO_PCT', '101')).not.toBeNull()
    })
  })

  describe('UMBRAL_DEUDA_REPARTIDOR_PACAS', () => {
    it('acepta 50 (default)', () => {
      expect(validateConfigValue('UMBRAL_DEUDA_REPARTIDOR_PACAS', '50')).toBeNull()
    })
    it('acepta 0 (sin umbral)', () => {
      expect(validateConfigValue('UMBRAL_DEUDA_REPARTIDOR_PACAS', '0')).toBeNull()
    })
    it('rechaza negativo', () => {
      expect(validateConfigValue('UMBRAL_DEUDA_REPARTIDOR_PACAS', '-1')).not.toBeNull()
    })
    it('rechaza decimal', () => {
      expect(validateConfigValue('UMBRAL_DEUDA_REPARTIDOR_PACAS', '50.5')).not.toBeNull()
    })
  })

  describe('DIAS_SIN_JUSTIFICAR_DESCUENTO', () => {
    it('acepta 2 (default)', () => {
      expect(validateConfigValue('DIAS_SIN_JUSTIFICAR_DESCUENTO', '2')).toBeNull()
    })
    it('acepta 0 (alertas inmediatas)', () => {
      expect(validateConfigValue('DIAS_SIN_JUSTIFICAR_DESCUENTO', '0')).toBeNull()
    })
    it('rechaza negativo', () => {
      expect(validateConfigValue('DIAS_SIN_JUSTIFICAR_DESCUENTO', '-1')).not.toBeNull()
    })
  })

  describe('PCT_DEVOLUCIONES_ANORMALES', () => {
    it('acepta 2 (default)', () => {
      expect(validateConfigValue('PCT_DEVOLUCIONES_ANORMALES', '2')).toBeNull()
    })
    it('acepta 1 (umbral mínimo)', () => {
      expect(validateConfigValue('PCT_DEVOLUCIONES_ANORMALES', '1')).toBeNull()
    })
    it('rechaza 0.5', () => {
      expect(validateConfigValue('PCT_DEVOLUCIONES_ANORMALES', '0.5')).not.toBeNull()
    })
    it('rechaza 0', () => {
      expect(validateConfigValue('PCT_DEVOLUCIONES_ANORMALES', '0')).not.toBeNull()
    })
  })
})

describe('validateConfigValue — clave desconocida (forward-compat)', () => {
  it('acepta cualquier valor para clave desconocida', () => {
    expect(validateConfigValue('CLAVE_FUTURA', 'lo-que-sea')).toBeNull()
  })
})

describe('validateConfigBatch', () => {
  it('retorna Map vacío si todas las claves son válidas', () => {
    const errors = validateConfigBatch([
      { clave: 'BASE_DIA', valor: '50000' },
      { clave: 'MULTIPLICADOR_MONTO_ANOMALO', valor: '2' },
      { clave: 'VARIACION_PRECIO_BRUSCO_PCT', valor: '30' },
    ])
    expect(errors.size).toBe(0)
  })

  it('retorna solo las claves con error', () => {
    const errors = validateConfigBatch([
      { clave: 'BASE_DIA', valor: '50000' }, // OK
      { clave: 'MULTIPLICADOR_MONTO_ANOMALO', valor: '0' }, // error
      { clave: 'VARIACION_PRECIO_BRUSCO_PCT', valor: '150' }, // error
    ])
    expect(errors.size).toBe(2)
    expect(errors.has('MULTIPLICADOR_MONTO_ANOMALO')).toBe(true)
    expect(errors.has('VARIACION_PRECIO_BRUSCO_PCT')).toBe(true)
  })
})
