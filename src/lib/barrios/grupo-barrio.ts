/**
 * #836 F3 — Grupo de barrio de un pedido para agrupar la consulta.
 *
 * REUSO, no regla nueva: la FUENTE del barrio efectivo es la misma de siempre
 * (`pickDireccionTexto`: override del pedido > negocio > cliente) y la normalización es la
 * determinista de `normalizeBarrioNombre` (sin tildes, sin mayúsculas, espacios colapsados).
 *
 * Identidad del grupo:
 *  - barrio canónico de la fuente elegida (`barrioId`)      → `b:<id>`
 *  - texto que coincide con un nombre o alias del catálogo   → `b:<id>` (A13/A14: el alias cuenta)
 *  - texto libre sin coincidencia                            → `t:<texto normalizado>` (no se mezcla)
 *  - sin nada                                                → `sin-barrio` (nunca se pierde un pedido)
 * Nunca se agrupa por coincidencia aproximada: dos nombres distintos son dos grupos.
 */
import type { PedidoDireccionInput } from '@/lib/geo/pedido-direccion'
import { normalizeBarrioNombre } from './normalizer'

export const CLAVE_SIN_BARRIO = 'sin-barrio'
export const ETIQUETA_SIN_BARRIO = 'Sin barrio'

export interface BarrioCatalogoItem {
  id: string
  nombre: string
  nombreNormalizado: string
  aliases: Array<{ textoNormalizado: string }>
}

export interface CatalogoBarrios {
  porNombre: Map<string, { id: string; nombre: string }>
  porAlias: Map<string, { id: string; nombre: string }>
}

export interface FuenteBarrioCanonico {
  direccion?: string | null
  barrio?: string | null
  barrioCanonico?: { id: string; nombre: string } | null
}

export interface FuenteGrupoBarrio extends Omit<PedidoDireccionInput, 'cliente' | 'negocio'> {
  cliente?: FuenteBarrioCanonico | null
  negocio?: FuenteBarrioCanonico | null
}

export interface GrupoBarrio {
  clave: string
  etiqueta: string
}

export function construirCatalogoBarrios(barrios: BarrioCatalogoItem[]): CatalogoBarrios {
  const porNombre = new Map<string, { id: string; nombre: string }>()
  const porAlias = new Map<string, { id: string; nombre: string }>()
  for (const b of barrios) {
    porNombre.set(b.nombreNormalizado, { id: b.id, nombre: b.nombre })
    for (const a of b.aliases) porAlias.set(a.textoNormalizado, { id: b.id, nombre: b.nombre })
  }
  return { porNombre, porAlias }
}

const conTexto = (...v: Array<string | null | undefined>) => v.some((x) => Boolean(x && x.trim()))
const tieneFuente = (f?: FuenteBarrioCanonico | null) =>
  Boolean(f && (conTexto(f.direccion, f.barrio) || f.barrioCanonico))

/**
 * Mismo ORDEN que `pickDireccionTexto` (pedido > negocio > cliente), con una diferencia deliberada:
 * una fuente cuenta como «con barrio» también si solo tiene barrio CANÓNICO (texto antiguo vacío),
 * para no mandar a «Sin barrio» un pedido cuyo destino sí tiene barrio.
 */
export function resolverGrupoBarrio(p: FuenteGrupoBarrio, catalogo: CatalogoBarrios): GrupoBarrio {
  let texto = ''
  if (conTexto(p.overrideDireccion, p.overrideBarrio)) {
    texto = (p.overrideBarrio ?? '').trim()
  } else {
    const fuente = tieneFuente(p.negocio) ? p.negocio : tieneFuente(p.cliente) ? p.cliente : null
    if (fuente?.barrioCanonico) return { clave: `b:${fuente.barrioCanonico.id}`, etiqueta: fuente.barrioCanonico.nombre }
    texto = (fuente?.barrio ?? '').trim()
  }
  if (!texto) return { clave: CLAVE_SIN_BARRIO, etiqueta: ETIQUETA_SIN_BARRIO }

  const normalizado = normalizeBarrioNombre(texto)
  const hit = catalogo.porNombre.get(normalizado) ?? catalogo.porAlias.get(normalizado)
  if (hit) return { clave: `b:${hit.id}`, etiqueta: hit.nombre }
  return { clave: `t:${normalizado}`, etiqueta: texto }
}

export interface GrupoConTotal extends GrupoBarrio {
  total: number
}

/** Más pedidos primero; «Sin barrio» siempre al final; desempate estable por etiqueta. */
export function ordenarGrupos(grupos: GrupoConTotal[]): GrupoConTotal[] {
  return [...grupos].sort((a, b) => {
    if (a.clave === CLAVE_SIN_BARRIO) return 1
    if (b.clave === CLAVE_SIN_BARRIO) return -1
    return b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, 'es') || a.clave.localeCompare(b.clave)
  })
}
