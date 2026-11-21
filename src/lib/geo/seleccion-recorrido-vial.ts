/**
 * #930 — elegibilidad física/financiera de una PARADA, sin mutaciones.
 * El filtro de la pantalla NO determina por sí mismo que haya algo que hacer.
 */
import { remanentesPorProducto, type LineaRemanente } from '../barrios/remanentes-barrio'
import type { TipoGestionVial } from './google-route-optimization'

export interface PedidoParaGestionVial {
  estadoEntrega: string
  canal: string
  items: readonly LineaRemanente[]
  legacyPendientes?: ReadonlyArray<{ pedidas: number; entregadas: number }>
  exigible: number
}

export interface GestionVial {
  tipo: TipoGestionVial
  unidadesPendientes: number
  fiadoExigible: number
}

/**
 * Excluir cerrados, cancelados y anonimos se hace además de esta función en
 * la consulta del servidor por identidad y fecha. Cantidades no verificables
 * NO deben crear nuevas entregas.
 */
export function clasificarGestionVial(p: PedidoParaGestionVial): GestionVial | null {
  if (['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)) return null
  const restante = p.items.length
    ? Object.values(remanentesPorProducto(p.items)).reduce((sum, n) => sum + n, 0)
    : (p.legacyPendientes ?? []).reduce((sum, linea) => {
        if (!Number.isSafeInteger(linea.pedidas) || !Number.isSafeInteger(linea.entregadas) ||
            linea.pedidas < 0 || linea.entregadas < 0)
          throw new Error('Cantidades físicas inválidas')
        return sum + Math.max(0, linea.pedidas - linea.entregadas)
      }, 0)
  // Si un pedido dice entregado pero las cantidades discrepan, exigir revisión,
  // NO volver a repartirlo desde una previsualización.
  if (p.estadoEntrega === 'ENTREGADO' && restante > 0)
    throw new Error('ENTREGA_POR_CONCILIAR')
  const tieneEntrega = restante > 0 && p.canal === 'DOMICILIO' &&
    p.estadoEntrega !== 'ENTREGADO'
  const tieneCobro = Number.isFinite(p.exigible) && p.exigible > 0
  if (!tieneEntrega && !tieneCobro) return null
  return {
    tipo: tieneEntrega && tieneCobro ? 'ENTREGA_Y_COBRO' : tieneEntrega ? 'ENTREGA' : 'COBRO',
    unidadesPendientes: tieneEntrega ? restante : 0,
    fiadoExigible: tieneCobro ? p.exigible : 0,
  }
}

/** #959: el clasificador genérico conserva la gestión de COBRO, pero la
 * lista de Cercanía del reparto solo acepta paradas con carga pendiente. */
export function esParadaDeEntregaCercania(gestion: GestionVial | null): gestion is GestionVial {
  return gestion !== null && gestion.unidadesPendientes > 0;
}

/** Un embarque histórico no impide cobrar, pero sí protege una carga en otra salida. */
export function bloqueadaPorEmbarque(embarqueId: string | null | undefined, gestion: GestionVial): boolean {
  return !!embarqueId && gestion.tipo !== 'COBRO'
}
