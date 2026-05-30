export interface ClienteSearchable {
  nombre: string
  apellido?: string | null
  telefono?: string
  nombreNegocio?: string | null
  tipoNegocio?: string | null
  direccion?: string | null
  barrio?: string | null
  notas?: string | null
  fuente?: string | null
  contactos?: Array<{ nombre: string; telefono: string; relacion?: string }>
  negocios?: Array<{
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
  }>
}

/**
 * Busqueda semantica unificada con pg_trgm-like scoring.
 *
 * MINIMO 2 CARACTERES: queries de 1 letra retornan sin resultados
 * para evitar matches irrelevantes (ej: "H" → "Jose Antonio Perez").
 *
 * Logica: cada palabra del query debe matchear en ALGUN campo (AND entre palabras, OR entre campos).
 * Retorna score de relevancia basado en cuantas palabras matchearon y en que campos prioritarios.
 *
 * Campos prioritarios (mayor peso): nombre, apellido
 * Campos secundarios: nombreNegocio, tipoNegocio, barrio, direccion
 * Campos terciarios: telefono, notas, fuente, contactos, negocios
 *
 * Ejemplos:
 *   "H"              → sin resultados (1 caracter) → ❌
 *   "jo"             → "Jose" (match en nombre, score alto) → ✅
 *   "juan perez"     → "juan" en nombre Y "perez" en apellido → ✅
 *   "perez juan"     → mismo resultado (orden no importa) → ✅
 *   "panaderia juan" → "panaderia" en tipoNegocio/negocio.nombre, "juan" en nombre → ✅
 *   "123456"         → busca en teléfono cliente y contactos → ✅
 *   "esposa maria"   → "esposa" en contacto.relacion, "maria" en contacto.nombre → ✅
 *   "frente iglesia" → "frente" y "iglesia" en negocio.referencia → ✅
 *   "camilo torres"  → "camilo" y "torres" en barrio o direccion → ✅
 */

/** Minimum characters required for search to activate */
export const MIN_SEARCH_CHARS = 2

/**
 * Normalize string for comparison: lowercase + remove accents
 * This allows "jose" to match "José", "perez" to match "Pérez", etc.
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Check if query meets minimum length requirement
 */
export function meetsMinSearchLength(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_CHARS
}

/**
 * Calculate relevance score for a cliente match.
 * Higher score = more relevant match.
 */
export function scoreCliente(cliente: ClienteSearchable, query: string): number {
  const trimmed = query.trim()
  if (!meetsMinSearchLength(trimmed)) return 0

  const palabras = normalize(trimmed).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return 0

  // Campos prioritarios (peso 3x)
  const camposPrioritarios = [
    normalize(cliente.nombre),
    normalize(cliente.apellido || ''),
  ]

  // Campos secundarios (peso 2x)
  const camposSecundarios = [
    normalize(cliente.nombreNegocio || ''),
    normalize(cliente.tipoNegocio || ''),
    normalize(cliente.barrio || ''),
    normalize(cliente.direccion || ''),
  ]

  // Campos terciarios (peso 1x)
  const camposTerciarios = [
    normalize(cliente.telefono || ''),
    normalize(cliente.notas || ''),
    normalize(cliente.fuente || ''),
  ]

  // Contactos (peso 1x)
  if (cliente.contactos) {
    for (const ct of cliente.contactos) {
      camposTerciarios.push(normalize(ct.nombre))
      camposTerciarios.push(normalize(ct.telefono))
      camposTerciarios.push(normalize(ct.relacion || ''))
    }
  }

  // Negocios formales (peso 2x)
  if (cliente.negocios) {
    for (const neg of cliente.negocios) {
      camposSecundarios.push(normalize(neg.nombre))
      camposSecundarios.push(normalize(neg.tipoNegocio || ''))
      camposSecundarios.push(normalize(neg.direccion || ''))
      camposSecundarios.push(normalize(neg.barrio || ''))
      camposSecundarios.push(normalize(neg.referencia || ''))
    }
  }

  let score = 0
  let matchedWords = 0

  for (const palabra of palabras) {
    let wordMatched = false

    // Check prioritarios (3x)
    if (camposPrioritarios.some(campo => campo.includes(palabra))) {
      score += 3
      wordMatched = true
    }
    // Check secundarios (2x)
    else if (camposSecundarios.some(campo => campo.includes(palabra))) {
      score += 2
      wordMatched = true
    }
    // Check terciarios (1x)
    else if (camposTerciarios.some(campo => campo.includes(palabra))) {
      score += 1
      wordMatched = true
    }

    if (wordMatched) matchedWords++
  }

  // Bonus: todas las palabras matchearon
  if (matchedWords === palabras.length) {
    score += palabras.length // bonus proporcional
  }

  // Si alguna palabra no matcheo, score = 0
  if (matchedWords < palabras.length) return 0

  return score
}

/**
 * Check if a cliente matches the query (boolean version, backward compatible).
 * Requires minimum 2 characters.
 */
export function matchCliente(
  cliente: ClienteSearchable,
  query: string
): boolean {
  return scoreCliente(cliente, query) > 0
}
