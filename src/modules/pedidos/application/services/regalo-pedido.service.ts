import type { RegaloPedidoItem } from '../../domain/entities/PedidoItem'
import { cantidadesRegaloValidas } from '@/shared/domain/cantidades-regalo'

/** Datos comerciales solicitados; la evidencia de autorización nunca viene del body. */
export interface RegaloPedidoSolicitado {
  cantidad: number
  cantidadRegalo?: number
  motivoRegalo?: string
}

export class RegaloPedidoError extends Error {
  constructor(public readonly code: 'REGALO_CANTIDAD_INVALIDA' | 'REGALO_REQUIERE_LINEA_CON_PRECIO' | 'REGALO_REQUIERE_ADMIN' | 'REGALO_MOTIVO_REQUERIDO' | 'REGALO_YA_ENTREGADO' | 'REGALO_DESGLOSE_REQUERIDO' | 'REGALO_CLAVE_REQUERIDA') {
    super(code)
    this.name = 'RegaloPedidoError'
  }
}

/**
 * ADR-AUTORIZACION-REGALOS-001. El actor lo inyecta el adaptador autenticado.
 * Una edición que omite el campo conserva la concesión previa, nunca la recrea
 * con el usuario actual. Cero explícito permite retirar solo un regalo no entregado.
 */
export function resolverRegaloPedido(
  linea: RegaloPedidoSolicitado,
  actor: { id?: string; rol?: string },
  previo?: RegaloPedidoItem,
  ahora: Date = new Date(),
): RegaloPedidoItem | undefined {
  const cantidad = linea.cantidadRegalo ?? previo?.cantidad ?? 0
  if (cantidad > 0 && (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0)) {
    throw new RegaloPedidoError('REGALO_REQUIERE_LINEA_CON_PRECIO')
  }
  if (!cantidadesRegaloValidas(linea.cantidad, cantidad)) throw new RegaloPedidoError('REGALO_CANTIDAD_INVALIDA')
  // La UI aprobada añade solo la cantidad. La autorización del administrador
  // acredita la concesión, no permite adivinar su razón. Si no la declara,
  // dejar esa ausencia explícita; nunca reutilizar una razón anterior para
  // otra cantidad ni exigir un formulario nuevo que el PO no aprobó.
  const motivo = linea.motivoRegalo === undefined
    ? (cantidad === previo?.cantidad ? previo.motivo :
      `${previo ? 'Modificación de regalo' : 'Regalo en pedido'} autorizado; sin motivo adicional declarado`)
    : linea.motivoRegalo.trim()
  const sinCambio = cantidad === (previo?.cantidad ?? 0) &&
    (cantidad === 0 || motivo === previo?.motivo)
  if (sinCambio) return previo ? { ...previo, autorizadoEn: new Date(previo.autorizadoEn) } : undefined
  if (previo && (previo.entregada ?? 0) > 0) throw new RegaloPedidoError('REGALO_YA_ENTREGADO')
  if (actor.rol !== 'ADMIN' || !actor.id?.trim()) throw new RegaloPedidoError('REGALO_REQUIERE_ADMIN')
  if (cantidad === 0) return undefined
  if (!motivo || motivo.length > 500) throw new RegaloPedidoError('REGALO_MOTIVO_REQUERIDO')
  return { cantidad, entregada: previo?.entregada ?? 0, autorizadoPorId: actor.id, autorizadoEn: new Date(ahora), motivo }
}
