/**
 * CrearDescuentoDiscrepanciaService.
 *
 * FASE 6 (ADR-RESPONSABILIDAD-001, contrato §13): la detección de una
 * discrepancia de inventario es AUTOMÁTICA, pero la transferencia económica al
 * trabajador NUNCA es automática. Este servicio ya NO crea un
 * `DescuentoRepartidor` directamente; crea un `ResponsibilityCase` de tipo
 * DISCREPANCIA_INVENTARIO que queda pendiente de resolución autorizada. El
 * cargo económico (DescuentoRepartidor) solo se materializa en
 * `ResolverResponsibilityCaseUseCase` cuando la resolución es RESUELTA_CON_CARGO
 * con `autorizadoPorId` + `resueltoPorId`.
 *
 * FIX F4.10-c (histórico): extrae la lógica de cálculo del monto por
 * discrepancia (~35 líneas) del CerrarEmbarqueUseCase.
 */

import { resolverPrecio } from '@/lib/pricing'
import type { ProductCode } from '../../domain/value-objects/Carga'

type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

export class CrearDescuentoDiscrepanciaService {
  /**
   * Detecta una discrepancia de inventario y crea un ResponsibilityCase
   * pendiente de resolución. Retorna { id, monto } del caso creado (id = caseId),
   * o undefined si no había discrepancias.
   */
  async execute(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    discrepancias: Array<{ producto: string; discrepancia: number }>,
  ): Promise<{ id: string; monto: number } | undefined> {
    const tx = client as unknown as {
      responsibilityCase: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; montoEstimado: unknown }> }
    }

    const precioMap: Record<string, number> = {}
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precioResult = await resolverPrecio(disc.producto as ProductCode, 1, 'DOMICILIO', null, null, client as any)
        precioMap[disc.producto] = precioResult.precio
      }
    }

    let montoTotal = 0
    const motivos: string[] = []
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precio = precioMap[disc.producto] ?? precioMap['PACA_AGUA'] ?? 0
        montoTotal += disc.discrepancia * precio
        motivos.push(`${disc.discrepancia} ${disc.producto}`)
      }
    }

    // FASE 6 (§13): detectar y crear el caso, NO el cargo económico.
    const caso = await tx.responsibilityCase.create({
      data: {
        embarqueId,
        trabajadorId,
        tipo: 'DISCREPANCIA_INVENTARIO',
        descripcion: `Discrepancia conciliacion: ${motivos.join(', ')}`,
        montoEstimado: montoTotal,
      },
    })

    return { id: caso.id, monto: Number(caso.montoEstimado ?? montoTotal) }
  }
}
