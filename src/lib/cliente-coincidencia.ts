/**
 * Por qué un cliente coincidió con la búsqueda (#385).
 *
 * El buscador encuentra por nombre, celular, negocio, contacto (nombre, celular
 * y relación), barrio, etc. Pero la fila solo mostraba el titular: si la
 * coincidencia fue el negocio "Panadería La Esperanza" o la esposa "Ángela", el
 * cajero no entendía por qué salía ese cliente ni a quién pertenecía el negocio.
 *
 * Misma noción de coincidencia que `scoreCliente` (palabras, sin acentos, celular
 * por dígitos). Funciones puras, sin React.
 */

import { extraerDigitos, normalizarTelefono, formatearDigitosLocales } from './telefono'
import { esPalabraTelefono, normalizarTexto, type ClienteSearchable } from './cliente-search'

export type MotivoCoincidencia =
  | { tipo: 'celular'; telefono: string }
  | { tipo: 'negocio'; nombre: string; tipoNegocio: string | null; direccion: string | null; barrio: string | null }
  | { tipo: 'contacto'; nombre: string; relacion: string | null; telefono: string }
  | { tipo: 'notas'; texto: string }

const MAX_MOTIVOS = 2

function palabrasDe(query: string): string[] {
  return normalizarTexto(query.trim()).split(/\s+/).filter(Boolean)
}

const contiene = (campo: string | null | undefined, palabra: string) =>
  normalizarTexto(campo ?? '').includes(palabra)

function coincideTelefono(telefono: string | null | undefined, palabra: string): boolean {
  if (!esPalabraTelefono(palabra)) return false
  return normalizarTelefono(telefono ?? '').includes(extraerDigitos(palabra))
}

/**
 * Motivos (máximo 2) por los que el cliente coincidió, SIN contar el nombre del
 * titular: si todas las palabras coinciden con su nombre o apellido, no hace falta
 * explicar nada y devuelve `[]`.
 */
export function explicarCoincidencia(cliente: ClienteSearchable, query: string): MotivoCoincidencia[] {
  const motivos: MotivoCoincidencia[] = []
  const claves = new Set<string>()
  const agregar = (clave: string, motivo: MotivoCoincidencia) => {
    if (claves.has(clave)) return
    claves.add(clave)
    motivos.push(motivo)
  }

  for (const palabra of palabrasDe(query)) {
    // Explicada por el titular: nada que aclarar.
    if (contiene(cliente.nombre, palabra) || contiene(cliente.apellido, palabra)) continue

    // Celular del titular.
    if (coincideTelefono(cliente.telefono, palabra)) {
      agregar('celular', { tipo: 'celular', telefono: cliente.telefono ?? '' })
      continue
    }

    // Negocio (nombre, tipo, dirección, barrio, referencia).
    const negocio = cliente.negocios?.find((n) =>
      [n.nombre, n.tipoNegocio, n.direccion, n.barrio, n.referencia].some((campo) => contiene(campo, palabra)))
    if (negocio) {
      agregar(`negocio:${negocio.nombre}`, {
        tipo: 'negocio',
        nombre: negocio.nombre,
        tipoNegocio: negocio.tipoNegocio ?? null,
        direccion: negocio.direccion ?? null,
        barrio: negocio.barrio ?? null,
      })
      continue
    }

    // Contacto (nombre, relación o celular).
    const contacto = cliente.contactos?.find((c) =>
      contiene(c.nombre, palabra) || contiene(c.relacion, palabra) || coincideTelefono(c.telefono, palabra))
    if (contacto) {
      agregar(`contacto:${contacto.telefono}`, {
        tipo: 'contacto',
        nombre: contacto.nombre,
        relacion: contacto.relacion ?? null,
        telefono: contacto.telefono,
      })
      continue
    }

    // Notas o fuente.
    if (contiene(cliente.notas, palabra)) {
      agregar('notas', { tipo: 'notas', texto: cliente.notas ?? '' })
    } else if (contiene(cliente.fuente, palabra)) {
      agregar('notas', { tipo: 'notas', texto: cliente.fuente ?? '' })
    }
    // Barrio/dirección del titular: se resaltan en su propia línea, sin motivo aparte.
  }

  return motivos.slice(0, MAX_MOTIVOS)
}

export interface Segmento {
  texto: string
  coincide: boolean
}

/** Cada carácter a su base sin acento, conservando la longitud (para mapear posiciones). */
function baseSinAcento(texto: string): string {
  let salida = ''
  for (const ch of texto) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    salida += (base[0] ?? ch).toLowerCase().padEnd(ch.length, ' ')
  }
  return salida
}

/** Parte `texto` en trozos marcando los que coinciden con alguna palabra de la búsqueda (sin acentos ni mayúsculas). */
export function segmentarCoincidencias(texto: string, query: string): Segmento[] {
  if (!texto) return []
  const base = baseSinAcento(texto)
  const marcado = new Array<boolean>(texto.length).fill(false)

  for (const palabra of palabrasDe(query)) {
    if (palabra.length < 2) continue
    let desde = 0
    for (;;) {
      const i = base.indexOf(palabra, desde)
      if (i === -1) break
      for (let k = i; k < i + palabra.length; k++) marcado[k] = true
      desde = i + palabra.length
    }
  }

  const segmentos: Segmento[] = []
  for (let i = 0; i < texto.length; i++) {
    const ultimo = segmentos[segmentos.length - 1]
    if (ultimo && ultimo.coincide === marcado[i]) ultimo.texto += texto[i]
    else segmentos.push({ texto: texto[i], coincide: marcado[i] })
  }
  return segmentos
}

/** Celular legible: "300 123 4567". */
export function celularLegible(telefono: string | null | undefined): string {
  return formatearDigitosLocales(telefono ?? '') || (telefono ?? '')
}
