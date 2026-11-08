/**
 * #622 — detalle por pedido de «Ver entregas y cálculo». Solo lectura y presentación:
 * NUNCA cambia unidades, tarifas ni totales de la comisión (esas salen de comision-repartidor.ts).
 *
 * Regla: la fecha de CREACIÓN del pedido no es la fecha de ENTREGA. Cada entrega cuenta en el día en que
 * ocurrió y por quien la hizo. «Antes» = entregas anteriores a los días de esta comisión; «a ese día» =
 * antes + lo de esta comisión + lo que otras personas entregaron esos mismos días. Si hubo más entregas
 * después, solo se avisa («se completó después»); nunca se suman a ese día.
 * Si no hay entregas por día confiables, no se inventa nada: SIN_DETALLE.
 */
import type { PedidoComision, UnidadesReparto, DiaEntregaComision } from './comision-repartidor-calculo'

export interface EventoDia {
  /** YYYY-MM-DD en Bogotá, del HECHO de entrega (no de la creación del pedido ni del registro). */
  dia: string
  repartidorId: string | null
  cantidades: Array<{ producto: string; cantidad: number }> | null
  incompleto?: boolean
  fuente: 'AUDITORIA' | 'MOVIMIENTO' | 'HISTORICO'
}

const vacio = (): UnidadesReparto => ({ agua: 0, hielo: 0, botellon: 0 })
const CLAVES = ['agua', 'hielo', 'botellon'] as const
const porProducto = (p: string): keyof UnidadesReparto | null =>
  p === 'PACA_AGUA' ? 'agua' : p === 'PACA_HIELO' ? 'hielo' : p === 'BOTELLON' ? 'botellon' : null
export const hayUnidades = (u: UnidadesReparto) => CLAVES.some(k => u[k] > 0)
const suma = (a: UnidadesReparto, b: UnidadesReparto): UnidadesReparto => ({ agua: a.agua + b.agua, hielo: a.hielo + b.hielo, botellon: a.botellon + b.botellon })
const igual = (a: UnidadesReparto, b: UnidadesReparto) => CLAVES.every(k => a[k] === b[k])
/** Completo = todo lo pedido (de los productos de reparto) ya entregado. Sin nada pedido no es «completo». */
const cubre = (entregado: UnidadesReparto, pedido: UnidadesReparto) =>
  hayUnidades(pedido) && CLAVES.every(k => entregado[k] >= pedido[k])
const unidadesDe = (e: EventoDia): UnidadesReparto => {
  const u = vacio()
  for (const l of e.cantidades ?? []) { const k = porProducto(l.producto); if (k) u[k] += l.cantidad }
  return u
}

export interface EntradaDetalle {
  /** Lo que pedía el pedido (productos de reparto). */
  pedido: UnidadesReparto
  /** Lo entregado en total HOY según el pedido (acumulado vigente). */
  entregadoActual: UnidadesReparto
  eventos: EventoDia[]
  trabajadorId: string
  /** Días (YYYY-MM-DD) que cubre esta comisión para este pedido. */
  esDiaPropio: (dia: string) => boolean
  /** Lo que la comisión (dinero) ya cuenta para este pedido. */
  unidadesComision: UnidadesReparto
}
type Calculo = Pick<PedidoComision, 'detalle' | 'dias' | 'alDia' | 'pendiente' | 'completoAqui' | 'completadoDespues'>

/** Eventos confiables = todos con cantidades, sin acumulado ambiguo ni registros históricos. */
function confiables(e: EntradaDetalle) {
  if (e.eventos.length === 0) return false
  if (e.eventos.some(x => x.cantidades === null || x.incompleto || x.fuente === 'HISTORICO')) return false
  const total = e.eventos.reduce((s, x) => suma(s, unidadesDe(x)), vacio())
  return igual(total, e.entregadoActual)
}

export function detallePorDia(e: EntradaDetalle): Calculo {
  if (!confiables(e)) return { detalle: 'SIN_DETALLE', completoAqui: false }
  const propias = e.eventos.filter(x => x.repartidorId === e.trabajadorId && e.esDiaPropio(x.dia))
  const propiasU = propias.reduce((s, x) => suma(s, unidadesDe(x)), vacio())
  // El dinero manda: si el detalle por día no reproduce exactamente lo que la comisión cuenta, no se muestra.
  if (!igual(propiasU, e.unidadesComision)) return { detalle: 'SIN_DETALLE', completoAqui: false }
  const diasPropios = propias.map(x => x.dia).sort()
  const primero = diasPropios[0], ultimo = diasPropios[diasPropios.length - 1]

  const porDia = new Map<string, { propia: UnidadesReparto; otra: UnidadesReparto }>()
  for (const x of e.eventos) {
    if (x.dia > ultimo) continue // lo posterior no pertenece a ese día
    const f = porDia.get(x.dia) ?? { propia: vacio(), otra: vacio() }
    const esPropia = x.repartidorId === e.trabajadorId && e.esDiaPropio(x.dia)
    if (esPropia) f.propia = suma(f.propia, unidadesDe(x)); else f.otra = suma(f.otra, unidadesDe(x))
    porDia.set(x.dia, f)
  }
  const dias: DiaEntregaComision[] = []
  for (const [dia, f] of [...porDia].sort(([a], [b]) => a.localeCompare(b))) {
    if (hayUnidades(f.propia)) dias.push({ dia, unidades: f.propia, propia: true })
    if (hayUnidades(f.otra)) dias.push({ dia, unidades: f.otra, propia: false })
  }
  const antes = e.eventos.filter(x => x.dia < primero).reduce((s, x) => suma(s, unidadesDe(x)), vacio())
  const alDia = e.eventos.filter(x => x.dia <= ultimo).reduce((s, x) => suma(s, unidadesDe(x)), vacio())
  const pendiente: UnidadesReparto = { agua: Math.max(0, e.pedido.agua - alDia.agua), hielo: Math.max(0, e.pedido.hielo - alDia.hielo), botellon: Math.max(0, e.pedido.botellon - alDia.botellon) }
  const completoAlDia = cubre(alDia, e.pedido)
  const completoAqui = completoAlDia && !cubre(antes, e.pedido)
  let completadoDespues: string | undefined
  if (!completoAlDia && cubre(e.entregadoActual, e.pedido)) {
    let acumulado = vacio()
    for (const x of [...e.eventos].sort((a, b) => a.dia.localeCompare(b.dia))) {
      acumulado = suma(acumulado, unidadesDe(x))
      if (cubre(acumulado, e.pedido)) { completadoDespues = x.dia; break }
    }
  }
  return { detalle: 'POR_DIA', dias, alDia, pendiente, completoAqui, completadoDespues }
}
