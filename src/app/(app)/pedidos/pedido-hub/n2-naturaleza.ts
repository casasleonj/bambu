/**
 * Clasifica la **naturaleza** de un pendiente N2 (plan Fase 5, P1).
 *
 * Un pendiente parcial puede ser NORMAL en el ciclo de una operación — no
 * todo `pendienteN2` es una anomalía. El color/⚠ solo aparece para
 * excepción/conflicto/inconsistencia/riesgo.
 */

import type { PeekLayer2 } from './peek-cache'

export type NaturalezaN2 = 'normal' | 'excepcion' | 'conflicto' | 'inconsistencia' | 'riesgo'

export interface N2Clasificacion {
  naturaleza: NaturalezaN2
  /** microcopy corto para el encabezado del panel. */
  titulo: string
  /** explicación de una línea (solo si no es 'normal'). */
  detalle?: string
  tono: 'neutro' | 'ambar' | 'rojo'
}

const ESTADOS_CERRADOS = ['CANCELADO', 'ANULADO']

export interface ClasificarN2Input {
  pendienteN2: NonNullable<PeekLayer2['pendienteN2']>
  estadoEntregaPedido: string
  casosAbiertos: PeekLayer2['casosAbiertos']
  /** true si una acción en curso devolvió 409 (lo pone el panel, no es dato estático). */
  conflictoEnCurso?: boolean
}

export function clasificarN2({
  pendienteN2,
  estadoEntregaPedido,
  casosAbiertos,
  conflictoEnCurso,
}: ClasificarN2Input): N2Clasificacion {
  if (conflictoEnCurso) {
    return {
      naturaleza: 'conflicto',
      titulo: 'Conflicto al gestionar el pendiente',
      detalle: 'El estado cambió mientras gestionabas. Actualizá y volvé a intentar.',
      tono: 'ambar',
    }
  }

  // El pedido ya no admite gestión pero la obligación sigue abierta.
  if (ESTADOS_CERRADOS.includes(estadoEntregaPedido) && pendienteN2.estado === 'ABIERTA') {
    return {
      naturaleza: 'inconsistencia',
      titulo: 'Pendiente sobre un pedido cerrado',
      detalle: `El pedido está ${estadoEntregaPedido.toLowerCase()} pero tiene una gestión de pendiente abierta. Revisar.`,
      tono: 'ambar',
    }
  }

  // Obligación anulada (se liberó sin completar).
  if (pendienteN2.estado === 'ANULADA') {
    return {
      naturaleza: 'excepcion',
      titulo: 'Pendiente liberado',
      detalle: 'La gestión de este pendiente se liberó sin completarse.',
      tono: 'ambar',
    }
  }

  // Hay un Caso/alerta relacionado con este pedido.
  if ((casosAbiertos?.length ?? 0) > 0) {
    return {
      naturaleza: 'riesgo',
      titulo: 'Pendiente con una señal para revisar',
      detalle: 'Hay una alerta abierta sobre este pedido. La señal no bloquea la gestión.',
      tono: 'ambar',
    }
  }

  const todasCanceladas =
    pendienteN2.actividades.length > 0 &&
    pendienteN2.actividades.every((a) => a.estado === 'CANCELADA')
  if (todasCanceladas && pendienteN2.estado === 'ABIERTA') {
    return {
      naturaleza: 'excepcion',
      titulo: 'Gestión sin actividades activas',
      detalle: 'Todas las actividades de este pendiente están canceladas.',
      tono: 'ambar',
    }
  }

  return { naturaleza: 'normal', titulo: 'Pendiente por completar', tono: 'neutro' }
}
