/**
 * CrearDeudaFaltanteCajaService.
 *
 * FASE 6 (ADR-RESPONSABILIDAD-001, contrato §13): la detección de un faltante
 * de caja es AUTOMÁTICA, pero la transferencia económica al trabajador NUNCA es
 * automática. Este servicio ya NO crea una `DeudaTrabajador` directamente; crea
 * un `ResponsibilityCase` de tipo FALTANTE_CAJA que queda pendiente de
 * resolución autorizada. La deuda solo se materializa en
 * `ResolverResponsibilityCaseUseCase` cuando la resolución es RESUELTA_CON_CARGO.
 *
 * Reglas de negocio (preservadas):
 * - Solo se crea el caso si el faltante supera UMBRAL_MINIMO_FALTANTE_CAJA.
 * - Si hay justificacionFaltante, no se crea el caso (se asume explicado).
 * - El caso queda ligado al embarque para trazabilidad.
 */

import {
  UMBRAL_MINIMO_FALTANTE_CAJA,
} from '@/lib/constants'
import { validarContextoResponsibilityCase } from './responsibility.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrPrisma = any

export class CrearDeudaFaltanteCajaService {
  /**
   * Detecta un faltante de caja y crea un ResponsibilityCase pendiente.
   *
   * @param faltante Monto negativo: dineroEntregado - efectivoReal. Solo valores < 0 generan caso.
   * @returns Datos del caso creado, o undefined si no aplica.
   */
  async execute(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    faltante: number,
    justificacionFaltante: string | undefined,
    _createdById?: string,
  ): Promise<{ id: string; monto: number } | undefined> {
    // Solo faltantes (negativos), no sobrantes.
    if (faltante >= 0) return undefined

    const montoFaltante = Math.abs(faltante)

    // No crear casos por diferencias menores al umbral operativo.
    if (montoFaltante < UMBRAL_MINIMO_FALTANTE_CAJA) return undefined

    // Si el administrador documentó una razón, no se abre el caso.
    if (justificacionFaltante && justificacionFaltante.trim().length > 0) return undefined

    const embarque = await client.embarque.findUnique({
      where: { id: embarqueId },
      select: { numero: true },
    })

    // Contrato §13: exige al menos una referencia de contexto (embarqueId
    // aquí, siempre presente en este flujo).
    const errores = validarContextoResponsibilityCase({ embarqueId, trabajadorId })
    if (errores.length > 0) {
      throw new Error(errores.join('; '))
    }

    // FASE 6 (§13): detectar y crear el caso, NO la deuda económica.
    const caso = await client.responsibilityCase.create({
      data: {
        embarqueId,
        trabajadorId,
        tipo: 'FALTANTE_CAJA',
        descripcion: `Faltante de caja en cierre de embarque #${embarque?.numero ?? embarqueId}`,
        montoEstimado: montoFaltante,
      },
    })

    return { id: caso.id, monto: montoFaltante }
  }
}
