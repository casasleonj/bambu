/**
 * Server-side validation for Config key-value pairs.
 *
 * The Config model stores everything as { clave: string, valor: string }.
 * This function validates the semantic meaning of each known key.
 *
 * Returns null if valid, or an error message string if invalid.
 * Unknown keys are accepted without validation (forward-compatible).
 */

type Validator = (valor: string) => string | null

const VALIDATORS: Record<string, Validator> = {
  // Company info — required strings
  empresa_nombre: (v) => (v.trim().length === 0 ? 'El nombre de la empresa es obligatorio' : null),
  empresa_nit: (v) => (v.trim().length === 0 ? 'El NIT es obligatorio' : null),

  // Email — must be valid format if non-empty
  empresa_email: (v) => {
    if (v.trim() === '') return null // empty is allowed
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Email inválido'
    return null
  },

  // Monetary — must be non-negative integer
  BASE_DIA: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 0 || !Number.isInteger(n)) return 'Debe ser un número entero positivo'
    return null
  },

  // Day thresholds — must be positive integer >= 1
  DIAS_ALERTA_NO_VERIFICADO: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Debe ser un número entero mayor a 0'
    return null
  },
  DIAS_VENCIMIENTO_PROMESA: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Debe ser un número entero mayor a 0'
    return null
  },
  MAX_PEDIDOS_DIA_ALERTA: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Debe ser un número entero mayor a 0'
    return null
  },
  LIMITE_PEDIDOS_FIADOS_DEFAULT: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Debe ser un número entero mayor a 0'
    return null
  },
}

/**
 * Validate a config value for a given key.
 * @returns null if valid, error message string if invalid
 */
export function validateConfigValue(clave: string, valor: string): string | null {
  const validator = VALIDATORS[clave]
  if (!validator) return null // Unknown key — accept without validation
  return validator(valor)
}

/**
 * Validate multiple config entries at once.
 * @returns Map of clave → error (only entries with errors)
 */
export function validateConfigBatch(
  entries: Array<{ clave: string; valor: string }>
): Map<string, string> {
  const errors = new Map<string, string>()
  for (const { clave, valor } of entries) {
    const error = validateConfigValue(clave, valor)
    if (error) errors.set(clave, error)
  }
  return errors
}
