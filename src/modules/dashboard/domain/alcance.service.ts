import type { AlcanceDashboard, AlcanceMetrica } from './types'

/**
 * #922 — Decide qué familias del tablero responden al rango seleccionado.
 *
 * Tres reglas, y ninguna es cosmética:
 *
 * 1. `saldos` (cartera/fiados) y `alertas` (riesgo, casos, stock de insumos)
 *    consultan el estado de HOY en sus repositorios: no reciben el rango. Si se
 *    mostraran sin rótulo bajo un encabezado histórico, el usuario leería el
 *    saldo de hoy como el del día consultado. Se marcan `ACTUAL`.
 * 2. `stock` sí puede ser histórico, pero sólo si existe un cierre registrado y
 *    validado que cubra el final del rango. Sin ese cierre no hay corte: es
 *    `NO_DISPONIBLE`, nunca el stock de hoy disfrazado.
 * 3. `embarques` es una lista de trabajo en curso: sólo tiene sentido para hoy.
 */
export function calcularAlcance(input: {
  esPeriodoActual: boolean
  tieneCierreDelRango: boolean
}): AlcanceDashboard {
  const { esPeriodoActual, tieneCierreDelRango } = input

  if (esPeriodoActual) {
    return {
      esPeriodoActual: true,
      stock: 'PERIODO',
      saldos: 'PERIODO',
      alertas: 'PERIODO',
      embarques: 'PERIODO',
      motivo: null,
    }
  }

  const stock: AlcanceMetrica = tieneCierreDelRango ? 'PERIODO' : 'NO_DISPONIBLE'
  const motivo = tieneCierreDelRango
    ? 'Las cifras del período responden al rango elegido. Cartera, alertas, casos y embarques muestran el estado actual, no el del rango.'
    : 'Las cifras del período responden al rango elegido. Cartera, alertas, casos y embarques muestran el estado actual. El stock no tiene cierre validado al final del rango: queda por conciliar.'

  return {
    esPeriodoActual: false,
    stock,
    saldos: 'ACTUAL',
    alertas: 'ACTUAL',
    embarques: 'ACTUAL',
    motivo,
  }
}
