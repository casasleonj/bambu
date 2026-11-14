/**
 * Naturaleza monetaria por medio (#745 / ADR-SALDO-FAVOR-EXCEDENTE-001).
 * BONO consume un crédito que ya entró a la empresa antes; no es efectivo,
 * transferencia ni dinero recién recibido. Conservar el Pago para trazabilidad.
 */
export function esCreditoAplicado(metodo: string): boolean {
  return metodo === 'BONO'
}
