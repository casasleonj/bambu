/** Regla pura compartida: unidades de reparto × tarifa; nunca precio de venta o sellado. */
export interface TarifasRepartidor { agua: number; hielo: number; botellon: number }
export interface UnidadesReparto { agua: number; hielo: number; botellon: number }
/** #622: un día con entregas de un pedido (día del HECHO, no de creación). `propia` = la entrega de esta comisión. */
export interface DiaEntregaComision { dia: string; unidades: UnidadesReparto; propia: boolean }
/** #622: detalle por pedido. Solo presentación: las unidades de dinero siguen siendo las de la fuente. */
export interface PedidoComision {
  id: string
  numero: number
  href: string
  /** Negocio primero; si no hay, el cliente («Cliente final» para una venta sin cliente real). */
  nombre: string
  /** Cliente como dato secundario cuando el pedido es de un negocio y el nombre difiere. */
  cliente?: string
  /** Día en que se CREÓ el pedido (informativo; no es fecha de entrega). */
  creadoDia: string
  /** Lo que cuenta en esta comisión (la parte de la fuente que corresponde a este pedido). */
  unidades: UnidadesReparto
  /** Lo que pedía el pedido y lo que lleva entregado en total hoy. */
  pedido: UnidadesReparto
  entregadoActual: UnidadesReparto
  /** POR_DIA = entregas por día verificadas; SIN_DETALLE = no se reparte el acumulado; HISTORICO = entrega completa anterior sin detalle. */
  detalle: 'POR_DIA' | 'SIN_DETALLE' | 'HISTORICO'
  /** Fecha de la entrega completa registrada (solo HISTORICO). */
  entregadoDia?: string
  dias?: DiaEntregaComision[]
  /** Acumulado al terminar el último día de esta comisión, y lo pendiente a ese día (POR_DIA). */
  alDia?: UnidadesReparto
  pendiente?: UnidadesReparto
  /** Esta comisión fue la que completó el pedido. */
  completoAqui: boolean
  /** Si no estaba completo a ese día y se completó después: el día. */
  completadoDespues?: string
}
export interface FuenteComision {
  id: string
  numero?: number
  href: string
  origen: 'EMBARQUE_VIVO' | 'EMBARQUE_LEGADO' | 'SIN_EMBARQUE'
  unidades: UnidadesReparto
  /** #622: detalle por pedido (solo cierre y cierre de embarque; ausente en cierres anteriores y en nómina). */
  pedidos?: PedidoComision[]
  /** #622: unidades vendidas en ruta o cargadas por el cierre que no pertenecen a un pedido. */
  sinPedido?: UnidadesReparto
}
export interface RevisionComision { embarqueId: string; motivo: string }
export interface ComisionRepartidor {
  entregasAgua: number
  entregasHielo: number
  entregasBotellon: number
  comAgua: number
  comHielo: number
  comBotellon: number
  total: number
  tarifas: TarifasRepartidor
  porOrigen: { embarque: number; sinEmbarque: number }
  fuentes: FuenteComision[]
  revisiones: RevisionComision[]
}

type Tarifa = number | string | { toString(): string } | null
export function tarifasRepartidor(t: {
  comRepartAgua: Tarifa; comRepartHielo: Tarifa; comRepartBotellon: Tarifa
}, comRepartidorConfig?: number): TarifasRepartidor {
  const positiva = (v: Tarifa | undefined) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined
  const base = positiva(comRepartidorConfig) ?? 200
  return {
    agua: positiva(t.comRepartAgua) ?? base,
    hielo: positiva(t.comRepartHielo) ?? base,
    botellon: positiva(t.comRepartBotellon) ?? 200,
  }
}

// Las tarifas monetarias tienen dos decimales en la base. Operar en centavos
// evita que, por ejemplo, 3 × 0.10 deje un saldo artificial al pagar.
const importe = (u: UnidadesReparto, t: TarifasRepartidor) =>
  (u.agua * Math.round(t.agua * 100) + u.hielo * Math.round(t.hielo * 100) + u.botellon * Math.round(t.botellon * 100)) / 100

export function calcularPorFuentes(
  fuentes: FuenteComision[], tarifas: TarifasRepartidor, revisiones: RevisionComision[] = [],
): ComisionRepartidor {
  const unidades = fuentes.reduce((s, f) => ({
    agua: s.agua + f.unidades.agua, hielo: s.hielo + f.unidades.hielo, botellon: s.botellon + f.unidades.botellon,
  }), { agua: 0, hielo: 0, botellon: 0 })
  const sin = fuentes.filter(f => f.origen === 'SIN_EMBARQUE').reduce((s, f) => s + Math.round(importe(f.unidades, tarifas) * 100), 0) / 100
  const total = importe(unidades, tarifas)
  return {
    entregasAgua: unidades.agua, entregasHielo: unidades.hielo, entregasBotellon: unidades.botellon,
    comAgua: importe({ agua: unidades.agua, hielo: 0, botellon: 0 }, tarifas),
    comHielo: importe({ agua: 0, hielo: unidades.hielo, botellon: 0 }, tarifas),
    comBotellon: importe({ agua: 0, hielo: 0, botellon: unidades.botellon }, tarifas),
    total, tarifas, fuentes, revisiones,
    porOrigen: { embarque: Math.round((total - sin) * 100) / 100, sinEmbarque: sin },
  }
}
