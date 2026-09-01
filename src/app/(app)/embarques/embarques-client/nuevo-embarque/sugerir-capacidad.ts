import { calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import type { Carga } from './derivar-carga'
import { totalUnidadesCarga } from './derivar-carga'

/**
 * Capacidad excedida → **advertir + sugerir**, nunca bloquear (decisión del PO).
 *
 * El backend valida el límite duro real y devuelve 400 si de verdad no entra;
 * eso sí es tope. Esta función solo produce el aviso de UX y la mejor
 * sugerencia concreta.
 */

export interface TrabajadorCapacidad {
  id: string
  nombre: string
  capacidadKg?: number
}

export type CapacidadNivelUI = 'ok' | 'pesado' | 'excede'

export interface SugerenciaCapacidad {
  nivel: CapacidadNivelUI
  /** Peso y unidades calculados, para mostrar el detalle. */
  pesoKg: number
  unidades: number
  capacidadKg: number
  maxUnidades: number
  /** Mensaje principal (vacío si nivel === 'ok'). */
  mensaje: string
  /** Sugerencia accionable (vacío si no aplica). */
  sugerencia: string
}

const CAP_DEFAULT_KG = 500

export function sugerirCapacidad(
  carga: Carga,
  repartidorSeleccionado: TrabajadorCapacidad | undefined,
  todos: TrabajadorCapacidad[],
  maxUnidades: number,
): SugerenciaCapacidad {
  const snapshot: CargaSnapshot = {
    PACA_AGUA: carga.PACA_AGUA || 0,
    PACA_HIELO: carga.PACA_HIELO || 0,
    BOTELLON: carga.BOTELLON || 0,
    BOLSA_AGUA: carga.BOLSA_AGUA || 0,
    BOLSA_HIELO: carga.BOLSA_HIELO || 0,
  }
  const pesoKg = calcularPesoDesdeCarga(snapshot)
  const unidades = totalUnidadesCarga(carga)
  const capacidadKg = repartidorSeleccionado?.capacidadKg || CAP_DEFAULT_KG

  const excedeUnidades = unidades > maxUnidades
  const info = getCapacidadInfo(unidades, pesoKg, capacidadKg)
  const excedePeso = info.nivel === 'excedido'

  const base = { pesoKg, unidades, capacidadKg, maxUnidades }

  if (!excedeUnidades && !excedePeso) {
    const nivel: CapacidadNivelUI = info.nivel === 'pesado' || info.nivel === 'maximo' ? 'pesado' : 'ok'
    return {
      ...base,
      nivel,
      mensaje: nivel === 'pesado' ? `Carga alta: ${Math.round(pesoKg)} kg de ${capacidadKg} kg.` : '',
      sugerencia: '',
    }
  }

  // Excede — construir la mejor sugerencia.
  const nombreRep = repartidorSeleccionado?.nombre ?? 'este repartidor'
  const mensaje = excedeUnidades
    ? `La carga son ${unidades} unidades; el máximo por embarque es ${maxUnidades}.`
    : `La carga (${Math.round(pesoKg)} kg) excede la capacidad de ${nombreRep} (${capacidadKg} kg).`

  // 1) ¿otro repartidor con capacidad?
  const otro = todos
    .filter((t) => t.id !== repartidorSeleccionado?.id && (t.capacidadKg || CAP_DEFAULT_KG) >= pesoKg)
    .sort((a, b) => (a.capacidadKg || CAP_DEFAULT_KG) - (b.capacidadKg || CAP_DEFAULT_KG))[0]

  let sugerencia: string
  if (otro && !excedeUnidades) {
    sugerencia = `${otro.nombre} tiene capacidad para ${Math.round(pesoKg)} kg.`
  } else if (excedeUnidades) {
    sugerencia = `Quitá ~${unidades - maxUnidades} unidad(es) o dividí en dos embarques con pedidos distintos.`
  } else {
    sugerencia = `Quitá carga para bajar de ${capacidadKg} kg, o dividí en dos embarques.`
  }

  return { ...base, nivel: 'excede', mensaje, sugerencia }
}
