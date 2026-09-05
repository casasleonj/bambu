/**
 * ModoActividad Value Object.
 *
 * N2 (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §2.1): modo operativo ACTUAL de
 * cumplimiento de una `Actividad` (PUNTO = recoge en punto, DOMICILIO = se le
 * envía). Distinto de `Pedido.canal` (histórico, inmutable — ver `CanalVO` en
 * el dominio de Pedidos). Un mismo cliente puede tener actividades en modos
 * distintos sin conflicto — el modo pertenece a la Actividad, nunca al cliente.
 *
 * Se descartó explícitamente una jerarquía de 3 estados
 * (solicitado/planificado/ejecutado) — sin evidencia de necesidad, ver
 * AGUA_BAMBU_N2_DECISION_MINIMA_v1.0.md §A. Un único campo + auditoría
 * (`logAudit` en cada `CambiarModoActividadUseCase`) es el diseño decidido.
 */

import type { ModoActividad } from '@prisma/client'

const MODOS_ACTIVIDAD: readonly ModoActividad[] = ['PUNTO', 'DOMICILIO'] as const

export class ModoActividadVO {
  private constructor(private readonly value: ModoActividad) {}

  static from(modo: string): ModoActividadVO {
    const normalized = modo as ModoActividad
    if (!MODOS_ACTIVIDAD.includes(normalized)) {
      throw new Error(`ModoActividad inválido: ${modo}`)
    }
    return new ModoActividadVO(normalized)
  }

  static create(modo: ModoActividad): ModoActividadVO {
    return new ModoActividadVO(modo)
  }

  get(): ModoActividad {
    return this.value
  }

  isDelivery(): boolean {
    return this.value === 'DOMICILIO'
  }

  isPoint(): boolean {
    return this.value === 'PUNTO'
  }

  equals(other: ModoActividadVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
