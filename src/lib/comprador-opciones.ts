/**
 * Opciones de comprador a partir de los clientes que devuelve el buscador (P1-3, #394).
 *
 * Un comprador es UNA cosa: una tienda (negocio) o una persona (cliente). El
 * buscador no lista "clientes" para elegir después persona o negocio: lista
 * directamente lo que se buscó, y un toque elige.
 *
 * - Coincide la persona (nombre, apellido, celular, contacto, notas): fila de la
 *   persona y, debajo, cada una de sus tiendas. Nada viene preseleccionado.
 * - Coincide solo una tienda: solo esa(s) tienda(s), con el dueño como dato
 *   secundario. La persona no aparece (no se la buscó).
 * - Coincide solo por barrio/dirección del titular: la persona y sus tiendas.
 *
 * Funciones puras, sin React.
 */

import { extraerDigitos, normalizarTelefono } from './telefono'
import { esPalabraTelefono, normalizarTexto } from './cliente-search'

export interface NegocioComprador {
  id: string
  nombre: string
  tipoNegocio?: string | null
  direccion?: string | null
  barrio?: string | null
  referencia?: string | null
  linkUbicacion?: string | null
}

export interface ClienteComprador {
  id: string
  nombre: string
  apellido?: string | null
  telefono?: string
  direccion?: string | null
  barrio?: string | null
  notas?: string | null
  fuente?: string | null
  contactos?: Array<{ nombre: string; telefono: string; relacion?: string | null }>
  negocios?: NegocioComprador[]
}

export type OpcionComprador<C extends ClienteComprador = ClienteComprador> =
  | { tipo: 'persona'; clave: string; cliente: C; avisos: boolean }
  | { tipo: 'negocio'; clave: string; cliente: C; negocio: NegocioComprador; anidada: boolean; avisos: boolean }

const palabrasDe = (query: string): string[] =>
  normalizarTexto(query.trim()).split(/\s+/).filter(Boolean)

const contiene = (campo: string | null | undefined, palabra: string): boolean =>
  normalizarTexto(campo ?? '').includes(palabra)

const coincideTelefono = (telefono: string | null | undefined, palabra: string): boolean =>
  esPalabraTelefono(palabra) && normalizarTelefono(telefono ?? '').includes(extraerDigitos(palabra))

/** ¿La palabra identifica a la PERSONA (no a una de sus tiendas)? Barrio y dirección no cuentan. */
function identificaPersona(c: ClienteComprador, palabra: string): boolean {
  return (
    contiene(c.nombre, palabra) ||
    contiene(c.apellido, palabra) ||
    coincideTelefono(c.telefono, palabra) ||
    Boolean(c.contactos?.some((k) => contiene(k.nombre, palabra) || contiene(k.relacion, palabra) || coincideTelefono(k.telefono, palabra))) ||
    contiene(c.notas, palabra) ||
    contiene(c.fuente, palabra)
  )
}

function negocioCoincide(n: NegocioComprador, palabras: string[]): boolean {
  return palabras.some((p) => [n.nombre, n.tipoNegocio, n.direccion, n.barrio, n.referencia].some((campo) => contiene(campo, p)))
}

export function opcionesComprador<C extends ClienteComprador>(clientes: C[], query: string): OpcionComprador<C>[] {
  const palabras = palabrasDe(query)
  const salida: OpcionComprador<C>[] = []

  for (const cliente of clientes) {
    const negocios = cliente.negocios ?? []
    if (negocios.length === 0) {
      salida.push({ tipo: 'persona', clave: `p:${cliente.id}`, cliente, avisos: true })
      continue
    }

    const personaCoincide = palabras.some((p) => identificaPersona(cliente, p))
    const coincidentes = negocios.filter((n) => negocioCoincide(n, palabras))

    if (!personaCoincide && coincidentes.length > 0) {
      coincidentes.forEach((negocio, i) => {
        salida.push({ tipo: 'negocio', clave: `n:${negocio.id}`, cliente, negocio, anidada: false, avisos: i === 0 })
      })
      continue
    }

    salida.push({ tipo: 'persona', clave: `p:${cliente.id}`, cliente, avisos: true })
    for (const negocio of negocios) {
      salida.push({ tipo: 'negocio', clave: `n:${negocio.id}`, cliente, negocio, anidada: true, avisos: false })
    }
  }
  return salida
}

/** "Ana Torres". */
export function nombreCompleto(c: Pick<ClienteComprador, 'nombre' | 'apellido'>): string {
  return `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`
}
