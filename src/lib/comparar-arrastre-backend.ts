import { diagnosticarArrastre, PRODUCTOS_ARRASTRE, type ProductoArrastre } from './stock-arrastre-diagnostico'
import type { StockInicial } from './stock-inicial'

type Diagnostico = ReturnType<typeof diagnosticarArrastre>
export interface MovimientoObservado {
  id: string
  producto: string
  tipo: string
  cantidad: number
  origen: string | null
  destino: string | null
  sustitucion: boolean
}
const INTERNO = new Set(['ALMACEN', 'VEHICULO', 'PRODUCCION', 'INSPECCION'])
const LEGACY: Record<ProductoArrastre, keyof StockInicial> = {
  PACA_AGUA: 'stockIniAgua', PACA_HIELO: 'stockIniHielo', BOTELLON: 'stockIniBotellon',
}

/**
 * F2-B, comparación en sombra. Los movimientos no se suman a las entregas
 * sin demostrar identidad, perímetro y corte. createdAt no demuestra fecha
 * efectiva. Ni siquiera ausencia de movimientos prueba cobertura completa.
 */
export function compararArrastreBackend(
  diagnostico: Diagnostico,
  actual: StockInicial,
  cierrePendienteValidacion: boolean | null,
  movimientos: MovimientoObservado[],
) {
  const ids = new Set<string>()
  for (const m of movimientos) {
    if (ids.has(m.id)) throw new Error('MOVIMIENTO_DUPLICADO_EN_LECTURA')
    ids.add(m.id)
    if (!Number.isSafeInteger(m.cantidad) || m.cantidad <= 0) throw new Error('CANTIDAD_MOVIMIENTO_INVALIDA')
  }
  const productos = PRODUCTOS_ARRASTRE.map(producto => {
    const d = diagnostico.productos.find(p => p.producto === producto)!
    const evidencia = movimientos.filter(m => m.producto === producto).map(m => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      clasificacion: !m.sustitucion && ['CARGA', 'RECARGA', 'CUSTODY_TRANSFER'].includes(m.tipo)
        && m.origen !== null && m.destino !== null && INTERNO.has(m.origen) && INTERNO.has(m.destino)
        ? 'TRANSFERENCIA_INTERNA_GLOBAL' as const
        : 'REQUIERE_CONCILIACION' as const,
    }))
    const motivos: string[] = []
    if (d.base === null) motivos.push('SIN_ANCLA_POR_PRODUCTO')
    if (cierrePendienteValidacion === true) motivos.push('CIERRE_PENDIENTE_VALIDACION')
    if (cierrePendienteValidacion === null) motivos.push('CIERRE_NO_VERIFICADO')
    if (diagnostico.diasIntermedios !== 0) motivos.push('COBERTURA_DE_MOVIMIENTOS_NO_CERTIFICADA')
    if (diagnostico.entregasAproximadas > 0) motivos.push('ENTREGAS_APROXIMADAS')
    if (evidencia.some(m => m.clasificacion === 'REQUIERE_CONCILIACION')) motivos.push('MOVIMIENTOS_POR_CONCILIAR')
    const anterior = actual[LEGACY[producto]]
    return {
      producto, anterior, esperadoParcial: d.saldoParcial,
      diferenciaConActual: d.saldoParcial === null ? null : d.saldoParcial - anterior,
      evidencia, motivos,
      // Un cierre inmediato válido puede reutilizarse sin reconstruir intervalo.
      // Aun así este módulo no autoriza cambiar consumidores ni guardas.
      calidad: motivos.length === 0 ? 'CIERRE_PREVIO_VALIDADO' as const : 'NO_CERTIFICADO' as const,
    }
  })
  return { diaObjetivo: diagnostico.diaObjetivo, fechaAncla: diagnostico.fechaAncla,
    diasIntermedios: diagnostico.diasIntermedios, productos, modo: 'SOLO_COMPARACION' as const }
}
