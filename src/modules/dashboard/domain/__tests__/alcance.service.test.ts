import { describe, expect, it } from 'vitest'
import { calcularAlcance } from '../alcance.service'

/**
 * #922 — El tablero tiene tres clases de cifra y no se pueden confundir:
 * las que responden al rango, las que sólo existen como estado de hoy, y las
 * que no tienen evidencia para el rango. Estas pruebas fijan esa distinción,
 * porque es lo que impide leer la cartera de hoy como un corte histórico.
 */
describe('#922 — alcance de las métricas frente al rango', () => {
  it('en el período actual todo responde al período', () => {
    const a = calcularAlcance({ esPeriodoActual: true, tieneCierreDelRango: false })
    expect(a).toEqual({
      esPeriodoActual: true,
      stock: 'PERIODO',
      saldos: 'PERIODO',
      alertas: 'PERIODO',
      embarques: 'PERIODO',
      motivo: null,
    })
  })

  it('en un rango histórico, cartera y alertas son estado actual', () => {
    const a = calcularAlcance({ esPeriodoActual: false, tieneCierreDelRango: true })
    expect(a.saldos).toBe('ACTUAL')
    expect(a.alertas).toBe('ACTUAL')
    expect(a.embarques).toBe('ACTUAL')
    expect(a.esPeriodoActual).toBe(false)
    expect(a.motivo).toContain('estado actual')
  })

  it('sin cierre validado del rango, el stock no se presenta como histórico', () => {
    const a = calcularAlcance({ esPeriodoActual: false, tieneCierreDelRango: false })
    expect(a.stock).toBe('NO_DISPONIBLE')
    // El motivo tiene que decir por qué, no sólo que falta.
    expect(a.motivo).toContain('por conciliar')
  })

  it('con cierre validado del rango, el stock sí es del período', () => {
    const a = calcularAlcance({ esPeriodoActual: false, tieneCierreDelRango: true })
    expect(a.stock).toBe('PERIODO')
    expect(a.motivo).not.toContain('por conciliar')
  })

  it('nunca marca stock histórico como PERIODO cuando falta el cierre', () => {
    // Guarda explícita contra la regresión más cara: mostrar el stock de hoy
    // bajo un encabezado de fecha pasada.
    for (const tieneCierre of [true, false]) {
      const a = calcularAlcance({ esPeriodoActual: false, tieneCierreDelRango: tieneCierre })
      expect(a.stock === 'PERIODO').toBe(tieneCierre)
    }
  })
})
