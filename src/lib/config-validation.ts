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
    if (isNaN(n) || n < 0 || !Number.isInteger(n)) return 'Debe ser un número entero mayor o igual a 0'
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
  MAX_UNIDADES_EMBARQUE: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Debe ser un número entero mayor a 0'
    return null
  },

  // Alertas antifraude (Bloque: Sistema de Alertas) — números no-negativos
  // o con tope superior según corresponda.
  MULTIPLICADOR_MONTO_ANOMALO: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1) return 'Debe ser un número mayor o igual a 1'
    return null
  },
  VARIACION_PRECIO_BRUSCO_PCT: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1 || n > 100) return 'Debe ser un número entre 1 y 100 (porcentaje)'
    return null
  },
  UMBRAL_DEUDA_REPARTIDOR_PACAS: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 0 || !Number.isInteger(n)) return 'Debe ser un número entero mayor o igual a 0'
    return null
  },
  DIAS_SIN_JUSTIFICAR_DESCUENTO: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 0 || !Number.isInteger(n)) return 'Debe ser un número entero mayor o igual a 0'
    return null
  },
  PCT_DEVOLUCIONES_ANORMALES: (v) => {
    const n = Number(v)
    if (isNaN(n) || n < 1) return 'Debe ser un número mayor o igual a 1'
    return null
  },

  // Horario de trabajo (turnos) — usado por findPedidosHoyEnRiesgoIds
  // (src/lib/pedidos-sin-asignar.ts) para calcular horas hábiles transcurridas.
  HORARIO_MANANA_INICIO: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM'),
  HORARIO_MANANA_FIN: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM'),
  HORARIO_TARDE_INICIO: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM'),
  HORARIO_TARDE_FIN: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'Formato HH:MM'),
  UMBRAL_HORAS_HABILES_RIESGO: (v) => {
    const n = Number(v)
    if (isNaN(n) || n <= 0) return 'Debe ser un número mayor a 0'
    return null
  },

  // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: CSV de MetodoPago cuyo Pago nace
  // REPORTADO. Cada entrada debe ser un método válido; un typo dejaría ese
  // método clasificado como CONFIRMADO en silencio.
  METODOS_REQUIEREN_CONFIRMACION: (v) => {
    if (v.trim() === '') return null // vacío → default del ADR
    const validos = new Set(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'])
    const items = v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (items.length === 0) return null
    const invalidos = items.filter((m) => !validos.has(m))
    if (invalidos.length > 0) {
      return `Métodos de pago inválidos: ${invalidos.join(', ')}. Válidos: EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA, BONO`
    }
    return null
  },

  // ADR-PAGO-REPORTADO-CONFIRMADO-001 §3: userId del usuario designado para
  // confirmar pagos. Vacío = nadie ve la cola (válido).
  USUARIO_CONFIRMA_PAGOS: (v) => (v.trim().length > 200 ? 'ID de usuario inválido' : null),
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
