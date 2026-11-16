import { formatCurrency } from '@/lib/utils'

/**
 * Ayuda de caja de solo lectura (#828). El formulario de la venta la entrega
 * junto a los datos, pero NUNCA viaja al servidor ni se guarda: el efectivo
 * recibido y el cambio no se persisten (HUB_REVISION_INTEGRAL: total ≠ recibido
 * ≠ cambio ≠ aplicado). Solo sirve para el aviso que ve la persona al cobrar.
 */
export interface AyudaCaja {
  /** Lo que el operador anotó en «Recibido en efectivo»; 0 si no lo anotó. */
  recibidoEfectivo: number
}
export interface PagoAplicado {
  metodo: string
  monto: number
}
export interface ResumenCobro {
  /** Valor de la venta (el del pedido guardado). */
  importe: number
  /** Dinero que entró: lo aplicado, o con el efectivo realmente recibido si se anotó. */
  recibido: number
  /** Efectivo que debe devolverse. */
  cambio: number
  /** Lo que queda por cobrar (0 si se pagó completo). */
  pendiente: number
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100)

/**
 * `importe` = total del pedido; `pagos` = dinero aplicado a la venta;
 * `recibidoEfectivo` = efectivo anotado por el operador.
 * Sin efectivo anotado (o insuficiente para lo aplicado en efectivo) no se
 * inventa un cambio: se muestra lo aplicado como recibido y cambio 0.
 */
export function resumenCobro(
  importe: number,
  pagos: readonly PagoAplicado[],
  ayuda?: AyudaCaja,
): ResumenCobro {
  const aplicado = pagos.reduce((s, p) => s + centavos(p.monto), 0)
  const efectivoAplicado = pagos.filter((p) => p.metodo === 'EFECTIVO').reduce((s, p) => s + centavos(p.monto), 0)
  const anotado = Math.max(0, centavos(ayuda?.recibidoEfectivo ?? 0))
  const hayEfectivoAnotado = efectivoAplicado > 0 && anotado >= efectivoAplicado
  const cambio = hayEfectivoAnotado ? anotado - efectivoAplicado : 0
  const recibido = hayEfectivoAnotado ? aplicado - efectivoAplicado + anotado : aplicado
  const pendiente = Math.max(0, centavos(importe) - aplicado)
  return { importe, recibido: recibido / 100, cambio: cambio / 100, pendiente: pendiente / 100 }
}

/** Texto del aviso «Venta cobrada»: número, importe, recibido y cambio (y lo pendiente si lo hay). */
export function textoAvisoCobro(numero: number | null, r: ResumenCobro): { titulo: string; detalle: string } {
  const partes = [
    `Importe ${formatCurrency(r.importe)}`,
    `Recibido ${formatCurrency(r.recibido)}`,
    `Cambio ${formatCurrency(r.cambio)}`,
  ]
  if (r.pendiente > 0) partes.push(`Pendiente ${formatCurrency(r.pendiente)}`)
  return { titulo: numero != null ? `Venta cobrada · #${numero}` : 'Venta cobrada', detalle: partes.join(' · ') }
}
