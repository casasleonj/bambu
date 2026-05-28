export interface ClienteSearchable {
  nombre: string
  apellido?: string | null
  telefono?: string
  nombreNegocio?: string | null
  direccion?: string | null
  barrio?: string | null
}

/**
 * Busca un cliente comparando cada palabra del query contra todos los campos.
 *
 * Ejemplos:
 *   "juan perez"   → busca "juan" Y "perez" en cualquier campo → ✅ match
 *   "perez juan"   → mismo resultado (orden no importa) → ✅ match
 *   "panaderia juan" → "panaderia" en nombreNegocio, "juan" en nombre → ✅ match
 *   "123456"       → busca en teléfono → ✅ match
 */
export function matchCliente(
  cliente: ClienteSearchable,
  query: string
): boolean {
  const palabras = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return false

  const campos = [
    cliente.nombre,
    cliente.apellido || '',
    cliente.nombreNegocio || '',
    cliente.telefono || '',
    cliente.direccion || '',
    cliente.barrio || '',
  ].map(c => c.toLowerCase())

  return palabras.every(palabra => campos.some(campo => campo.includes(palabra)))
}
