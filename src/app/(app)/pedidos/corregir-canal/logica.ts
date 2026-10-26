// TEMPORAL-SIN-EMBARQUE(#472): lógica pura de la pantalla «Corregir canal».
// Sin React ni red. El SERVIDOR es la autoridad de las reglas
// (`CorregirCanalPedidoUseCase`); aquí solo se arman los textos sencillos.
import { pesos } from '../registrar-entrega/logica'

export type CanalPedido = 'PUNTO' | 'DOMICILIO'
export type ModoPrecios = 'CONSERVAR' | 'RECALCULAR'

/** Impacto que devuelve la vista previa del servidor. */
export interface CambioCanal {
  canalAntes: CanalPedido
  canalDespues: CanalPedido
  precios: ModoPrecios
  totalAntes: number
  totalDespues: number
  totalPagado: number
  saldoDespues: number
  estadoPagoDespues: string
}

export const nombreCanal = (c: CanalPedido): string => (c === 'DOMICILIO' ? 'Domicilio' : 'Punto de venta')

export const canalOpuesto = (c: CanalPedido): CanalPedido => (c === 'DOMICILIO' ? 'PUNTO' : 'DOMICILIO')

export type ErroresCorreccion = Partial<Record<'motivo', string>>

export function validarCorreccion(d: { motivo: string }): ErroresCorreccion {
  const e: ErroresCorreccion = {}
  if (d.motivo.trim().length < 3) e.motivo = 'Escribe el motivo de la corrección (por ejemplo: «se registró como domicilio por error»).'
  return e
}

/** Frases del paso «Revisa antes de guardar». */
export function resumenCambio(c: CambioCanal): string[] {
  const frases = [`El pedido pasa de ${nombreCanal(c.canalAntes)} a ${nombreCanal(c.canalDespues)}.`]
  const dif = c.totalDespues - c.totalAntes
  if (c.precios === 'CONSERVAR') {
    frases.push(`Los precios no cambian. El total sigue en ${pesos(c.totalAntes)}.`)
  } else if (dif === 0) {
    frases.push(`Los precios recalculados quedan igual. El total sigue en ${pesos(c.totalAntes)}.`)
  } else {
    frases.push(
      `Los precios se recalculan: el total pasa de ${pesos(c.totalAntes)} a ${pesos(c.totalDespues)} (${dif > 0 ? 'sube' : 'baja'} ${pesos(Math.abs(dif))}).`,
    )
  }
  if (c.totalPagado > 0) frases.push(`Ya se pagó ${pesos(c.totalPagado)}. Queda por pagar ${pesos(c.saldoDespues)}.`)
  else frases.push(`Todavía no se ha pagado nada. Queda por pagar ${pesos(c.saldoDespues)}.`)
  frases.push(
    c.canalDespues === 'DOMICILIO'
      ? 'Queda como pedido a domicilio: puede ir en una ruta y suma comisión al repartidor que lo entregue.'
      : 'Deja de ser un pedido a domicilio: no suma comisión de reparto ni va en una ruta.',
  )
  return frases
}
