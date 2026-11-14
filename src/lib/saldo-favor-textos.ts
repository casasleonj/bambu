// #696 — Partes puras del saldo a favor compartidas por el servidor (historial del cliente) y la pantalla.
// Viven aparte de los componentes con 'use client': el servidor no puede llamar funciones exportadas desde ahí.
import type { MovimientoSaldoFavorCliente, PedidoDeMovimiento } from '@/lib/saldo-favor-cliente'

/** Qué pasó, en palabras sencillas y desde el punto de vista del cliente. */
export function tituloMovimientoSaldoFavor(m: Pick<MovimientoSaldoFavorCliente, 'tipo' | 'origenTipo'>): string {
  switch (m.tipo) {
    case 'ENTRADA_COBRO':
      return 'Entregó de más al pagar fiados'
    case 'ACREDITACION':
      return m.origenTipo === 'REDUCCION_COMERCIAL' ? 'Reducción comercial de un pedido' : 'Corrección de precio de un pedido'
    case 'REAPLICACION':
      return 'Volvió a un pedido porque su total subió'
    case 'REVERSION_ANULACION':
      return m.origenTipo === 'CANCELACION' ? 'Se restó al cancelar un pedido' : 'Se restó al anular un pedido'
  }
}

/** Texto del recuadro de un pedido: una línea por dato. */
export function textoRecuadroPedido(p: PedidoDeMovimiento): string {
  return [`Pedido #${p.numero}`, p.factura ? `Factura ${p.factura}` : null, p.negocio ? `Negocio: ${p.negocio}` : null].filter(Boolean).join('\n')
}

/** Saldo a favor de una fila de la lista (Decimal serializado). 0 si no tiene o el dato no es un número válido. */
export function saldoFavorDeFila(fila: { saldoFavor?: number | string | null }): number {
  const n = Number(fila.saldoFavor ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
