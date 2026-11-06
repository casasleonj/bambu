/**
 * #668: una corrección conserva la tarifa de la producción original.
 * Cambiar observaciones, stock o pérdidas no revaloriza las unidades.
 * Los pagos registrados se concilian aparte y nunca se modifican aquí.
 */
export function comisionProduccionCorregida(
  unidadesAnteriores: number,
  comisionAnterior: number,
  unidadesNuevas: number,
  tarifaActual: number,
): number {
  if (unidadesNuevas === unidadesAnteriores) return comisionAnterior
  const tarifa = unidadesAnteriores > 0 ? comisionAnterior / unidadesAnteriores : tarifaActual
  return Math.round((unidadesNuevas * tarifa + Number.EPSILON) * 100) / 100
}
