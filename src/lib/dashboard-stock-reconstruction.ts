/** Rebuild a single day's closing stock only from an adjacent, verified close. */
export type StockPair = { agua: number; hielo: number }
export type StockMovements = {
  produccionAgua: number; produccionHielo: number
  ventasAgua: number; ventasHielo: number
  perdidasAgua: number; perdidasHielo: number
  ajustesAgua: number; ajustesHielo: number
}

/**
 * All inputs must be reconciled to the same physical interval [start,end).
 * Never clamp negatives: they signal an inconsistent ledger that needs investigation.
 * Returns null instead of guessing when the anchor or any movement is missing.
 */
export function reconstruirStockDesdeMovimientos(
  cierreAnterior: StockPair | null,
  movimientos: Partial<StockMovements>,
): StockPair | null {
  if (!cierreAnterior) return null
  const valores = [cierreAnterior.agua, cierreAnterior.hielo,
    movimientos.produccionAgua, movimientos.produccionHielo,
    movimientos.ventasAgua, movimientos.ventasHielo,
    movimientos.perdidasAgua, movimientos.perdidasHielo,
    movimientos.ajustesAgua, movimientos.ajustesHielo]
  if (valores.some(v => typeof v !== 'number' || !Number.isFinite(v))) return null
  const m = movimientos as StockMovements
  const agua = cierreAnterior.agua + m.produccionAgua - m.ventasAgua - m.perdidasAgua + m.ajustesAgua
  const hielo = cierreAnterior.hielo + m.produccionHielo - m.ventasHielo - m.perdidasHielo + m.ajustesHielo
  if (agua < 0 || hielo < 0) return null
  return { agua, hielo }
}
