/**
 * #973: catálogo operativo compatible con categorías históricas.
 * El modelo Gasto.categoria es texto; las categorías nuevas nacen
 * únicamente cuando se registra/corrige un gasto autorizado.
 * No crear movimientos ficticios para incorporar opciones al selector.
 */
export const CATEGORIAS_GASTO_BASE = [
  'ARRIENDO', 'SERVICIOS', 'INSUMOS', 'MANTENIMIENTO', 'TRANSPORTE', 'OTRO',
] as const

const PERSONALES = new Set(['NOMINA', 'SALARIO', 'SALARIOS', 'SUELDO', 'SUELDOS', 'COMISION', 'COMISIONES', 'PAGO DE NOMINA'])

/** La misma clave canónica se utiliza en GET, POST, PATCH y buscador. */
export function normalizarCategoriaGasto(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase()
}

export function esCategoriaPersonal(value: string): boolean {
  return PERSONALES.has(normalizarCategoriaGasto(value))
}

export function categoriaGastoValida(value: string): boolean {
  const canonica = normalizarCategoriaGasto(value)
  return canonica.length >= 2 && canonica.length <= 45
    && /^[A-Z0-9]+(?:[ A-Z0-9/&-]*[A-Z0-9])?$/.test(canonica)
}

export function categoriasGastoDisponibles(existentes: readonly string[]): string[] {
  return [...new Set([...CATEGORIAS_GASTO_BASE, ...existentes]
    .map(normalizarCategoriaGasto)
    .filter(categoria => categoriaGastoValida(categoria) && !esCategoriaPersonal(categoria)))]
    .sort((a, b) => a.localeCompare(b, 'es'))
}

export function etiquetaCategoriaGasto(value: string): string {
  const nombre = normalizarCategoriaGasto(value)
  return nombre === 'OTRO' ? 'Otro' : nombre.toLocaleLowerCase('es-CO').replace(/(^|\s)\S/g, s => s.toLocaleUpperCase('es-CO'))
}
