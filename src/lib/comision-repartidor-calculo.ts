/** Regla pura compartida: unidades de reparto × tarifa; nunca precio de venta o sellado. */
export interface TarifasRepartidor { agua: number; hielo: number; botellon: number }
export interface UnidadesReparto { agua: number; hielo: number; botellon: number }
export interface FuenteComision {
  id: string
  numero?: number
  href: string
  origen: 'EMBARQUE_VIVO' | 'EMBARQUE_LEGADO' | 'SIN_EMBARQUE'
  unidades: UnidadesReparto
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
