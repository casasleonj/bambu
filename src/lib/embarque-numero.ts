/**
 * Número de embarque que ve la gente: el del día (`numeroDia`), como en el resto de la app.
 * `numero` es el consecutivo global y único (#427); solo se muestra si falta el del día
 * (embarques importados o anteriores a `numeroDia`).
 */
export function numeroVisibleEmbarque(e: { numero: number; numeroDia?: number | null }): number {
  return e.numeroDia && e.numeroDia > 0 ? e.numeroDia : e.numero
}
