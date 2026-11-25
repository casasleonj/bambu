import { dateRangeForDay, dayInBogota } from './date-helpers'
import { netoPrevioDelDia, type ProduccionPrevia } from './produccion-previas'

/** F2-A (#630, #756, #740): diagnóstico en sombra, NO autoridad de inventario. */
export const PRODUCTOS_ARRASTRE = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON'] as const
export type ProductoArrastre = typeof PRODUCTOS_ARRASTRE[number]
type PorProducto<T> = Record<ProductoArrastre, T>

export interface AnclaCierre {
  fecha: Date
  stock: PorProducto<number | null>
}

export interface ObservacionProduccion extends ProduccionPrevia {
  id: string
  fecha: Date
  registradaEn: Date
  items: (ProduccionPrevia['items'][number] & { stockFinFisico: number })[]
}

export interface DatosArrastre {
  diaObjetivo: string
  cierre: AnclaCierre | null
  producciones: ObservacionProduccion[]
  /** Entregas del intervalo completo, no snapshots de cada turno. */
  entregas: PorProducto<number>
  entregasAproximadas: number
}

export function rangoArrastre(diaObjetivo: string, cierre: AnclaCierre | null) {
  const hasta = dateRangeForDay(diaObjetivo).gte
  if (!Number.isFinite(+hasta) || dayInBogota(hasta) !== diaObjetivo) {
    throw new Error('DIA_OBJETIVO_INVALIDO')
  }
  if (!cierre) return { desde: null, hasta, diasIntermedios: null }
  const fechaCierre = dateRangeForDay(dayInBogota(cierre.fecha)).gte
  if (+fechaCierre >= +hasta) throw new Error('ANCLA_NO_ANTERIOR')
  const desde = dateRangeForDay(dayInBogota(fechaCierre)).lt
  return { desde, hasta, diasIntermedios: (+hasta - +desde) / 86_400_000 }
}

export function diagnosticarArrastre(datos: DatosArrastre) {
  const rango = rangoArrastre(datos.diaObjetivo, datos.cierre)
  // La captura de un conteo no prueba su alcance ni qué entregas contiene.
  // No promover un conteo de turno, incluido cero, a ancla de día.
  const ids = new Set<string>()
  for (const p of datos.producciones) {
    if (!rango.desde || p.fecha < rango.desde || p.fecha >= rango.hasta) {
      throw new Error('PRODUCCION_FUERA_DEL_INTERVALO')
    }
    if (ids.has(p.id)) throw new Error('PRODUCCION_DUPLICADA_EN_LECTURA')
    ids.add(p.id)
  }
  const productos = PRODUCTOS_ARRASTRE.map(producto => {
    const base = datos.cierre?.stock[producto] ?? null
    const produccionNeta = netoPrevioDelDia(datos.producciones, producto)
    const entregadas = datos.entregas[producto]
    const saldoParcial = base === null ? null : base + produccionNeta - entregadas
    const conteos = datos.producciones.flatMap(p => p.items
      .filter(i => i.producto === producto)
      .map(i => ({ produccionId: p.id, fecha: dayInBogota(p.fecha),
        registradaEn: p.registradaEn, cantidad: i.stockFinFisico,
        alcance: 'NO_VERIFICADO' as const })))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || +a.registradaEn - +b.registradaEn
        || a.produccionId.localeCompare(b.produccionId))
    return { producto, base, produccionNeta, entregadas, saldoParcial, conteos,
      calidad: base === null ? 'SIN_ANCLA' as const
        : rango.diasIntermedios === 0 ? 'CIERRE_PREVIO' as const : 'ESTIMADO_INCOMPLETO' as const }
  })
  return {
    diaObjetivo: datos.diaObjetivo,
    fechaAncla: datos.cierre ? dayInBogota(datos.cierre.fecha) : null,
    diasIntermedios: rango.diasIntermedios,
    entregasAproximadas: datos.entregasAproximadas,
    // El subtotal no incluye todos los movimientos de F1/F5; no es stock
    // físico ni disponible para cargar. Tampoco corrige snapshots históricos.
    cobertura: 'PRODUCCION_NETA_Y_ENTREGAS' as const,
    productos,
  }
}
