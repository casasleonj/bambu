/**
 * Contrato de búsqueda transversal (#789).
 *
 * Compara textos por palabras sin importar acentos, orden ni mayúsculas;
 * tolera erratas pequeñas en palabras largas. Nunca aplica similitud a
 * identificadores, teléfonos o cadenas que contengan dígitos.
 *
 * Este módulo es puro: no consulta datos ni concede permisos. El llamador
 * debe filtrar por rol, estado, fecha y demás reglas ANTES de puntuar.
 */
import { normalizarTexto } from './cliente-search'
import { extraerDigitos } from './telefono'

export type TipoCoincidencia = 'identificador' | 'exacta' | 'prefijo' | 'parcial' | 'aproximada'

export interface RegistroBuscable {
  textos: readonly (string | null | undefined)[]
  /** Orden correspondiente a textos: nombre > contexto > notas. */
  pesosTexto?: readonly number[]
  identificadores?: readonly (string | null | undefined)[]
  telefonos?: readonly (string | null | undefined)[]
}

export interface CoincidenciaBusqueda {
  puntuacion: number
  tipo: TipoCoincidencia
}

const PRIORIDAD: Record<TipoCoincidencia, number> = {
  identificador: 5,
  exacta: 4,
  prefijo: 3,
  parcial: 2,
  aproximada: 1,
}

function normalizar(s: string): string {
  return normalizarTexto(s).trim().replace(/\s+/g, ' ')
}

/** Levenshtein con salida temprana y rescate de transposición adyacente. */
function distanciaAcotada(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const dp: number[][] = Array.from(
    { length: a.length + 1 },
    () => Array<number>(b.length + 1).fill(0),
  )
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let menorFila = max + 1
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      let menor = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo,
      )
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      ) menor = Math.min(menor, dp[i - 2][j - 2] + 1)
      dp[i][j] = menor
      menorFila = Math.min(menorFila, menor)
    }
    if (menorFila > max) return max + 1
  }
  return dp[a.length][b.length]
}

function coincidenciaToken(
  palabra: string,
  campo: string,
): { tipo: TipoCoincidencia; valor: number } | null {
  const palabrasCampo = campo.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (palabrasCampo.includes(palabra)) return { tipo: 'exacta', valor: 100 }
  if (palabrasCampo.some((p) => p.startsWith(palabra)))
    return { tipo: 'prefijo', valor: 80 }
  if (palabrasCampo.some((p) => p.includes(palabra)))
    return { tipo: 'parcial', valor: 60 }

  // No adivinar números, códigos ni términos muy cortos.
  if (palabra.length < 4 || /\d/.test(palabra)) return null
  const max = palabra.length >= 7 ? 2 : 1
  const distancias = palabrasCampo
    .filter((p) => p.length >= 4 && !/\d/.test(p) && Math.abs(p.length - palabra.length) <= max)
    .map((p) => distanciaAcotada(palabra, p, max))
  const mejor = distancias.length ? Math.min(...distancias) : max + 1
  return mejor <= max ? { tipo: 'aproximada', valor: 40 - 5 * mejor } : null
}

export function evaluarBusqueda(
  registro: RegistroBuscable,
  consulta: string,
): CoincidenciaBusqueda | null {
  const q = normalizar(consulta)
  if (!q) return null

  const qIdent = q.replace(/^#/, '')
  const identificadores = registro.identificadores ?? []
  // Un ID completo/prefijo prima sobre los parecidos de texto: sin autocorrección.
  for (const id of identificadores) {
    if (!id) continue
    const valor = normalizar(id).replace(/^#/, '')
    if (valor === qIdent) return { puntuacion: 60000, tipo: 'identificador' }
    if (qIdent.length >= 2 && valor.startsWith(qIdent))
      return { puntuacion: 55000, tipo: 'identificador' }
  }

  // El teléfono se compara únicamente por sus dígitos, incluyendo variantes +57.
  if (/^[+()\d\s.-]+$/.test(q) && /\d/.test(q)) {
    const digitos = extraerDigitos(q)
    if (digitos.length >= 2) {
      for (const telefono of registro.telefonos ?? []) {
        const real = extraerDigitos(telefono)
        if (!real) continue
        if (real === digitos || ('57' + real) === digitos)
          return { puntuacion: 53000, tipo: 'identificador' }
        if (real.includes(digitos) || ('57' + real).includes(digitos))
          return { puntuacion: 50000, tipo: 'identificador' }
      }
    }
    return null
  }

  const campos = registro.textos.map(normalizar)
  const exacta = campos.findIndex((c) => c.length > 0 && c === q)
  if (exacta >= 0) {
    const peso = registro.pesosTexto?.[exacta] ?? 1
    return { puntuacion: 40000 + Math.min(peso, 10), tipo: 'exacta' }
  }

  const tokens = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!tokens.length) return null
  let peorTipo: TipoCoincidencia = 'exacta'
  let puntos = 0

  for (const token of tokens) {
    let mejor: { tipo: TipoCoincidencia; valor: number } | null = null
    for (const [i, campo] of campos.entries()) {
      if (!campo) continue
      const hallazgo = coincidenciaToken(token, campo)
      if (!hallazgo) continue
      const peso = Math.max(1, Math.min(registro.pesosTexto?.[i] ?? 1, 10))
      const valor = hallazgo.valor * 10 + peso
      if (!mejor || PRIORIDAD[hallazgo.tipo] > PRIORIDAD[mejor.tipo] ||
          (PRIORIDAD[hallazgo.tipo] === PRIORIDAD[mejor.tipo] && valor > mejor.valor)) {
        mejor = { tipo: hallazgo.tipo, valor }
      }
    }
    // AND entre palabras, OR entre campos.
    if (!mejor) return null
    puntos += mejor.valor
    if (PRIORIDAD[mejor.tipo] < PRIORIDAD[peorTipo]) peorTipo = mejor.tipo
  }

  return { puntuacion: PRIORIDAD[peorTipo] * 10000 + puntos, tipo: peorTipo }
}

export function buscarDifuso<T>(
  registros: readonly T[],
  consulta: string,
  campos: (registro: T) => RegistroBuscable,
  identidad: (registro: T) => string,
): T[] {
  if (!consulta.trim()) return [...registros]
  return registros
    .map((registro) => ({ registro, coincidencia: evaluarBusqueda(campos(registro), consulta) }))
    .filter((fila): fila is { registro: T; coincidencia: CoincidenciaBusqueda } =>
      fila.coincidencia !== null)
    .sort((a, b) =>
      b.coincidencia.puntuacion - a.coincidencia.puntuacion ||
      identidad(a.registro).localeCompare(identidad(b.registro), 'es'))
    .map(({ registro }) => registro)
}
