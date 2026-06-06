/**
 * CrearDescuentoDiscrepanciaService.
 *
 * FIX F4.10-c: extrae la lógica de creación de descuento por
 * discrepancia (~35 líneas) del CerrarEmbarqueUseCase.
 * Responsabilidad única: cuando hay discrepancia positiva
 * (cargado - entregado - devuelto - cambios) y el admin no
 * justificó, crear un DescuentoRepartidor que se le cobrará
 * al trabajdor en la próxima nómina.
 *
 * Patrón alineado con ProcesarPedidoService (F4.10-a) y
 * CrearVentasLibresService (F4.10-b): service dedicado,
 * sin dependencias de Prisma (recibe client como param),
 * backward compat con default = new instance.
 */

import { resolverPrecio } from '@/lib/pricing'
import type { ProductCode } from '../../domain/value-objects/Carga'

type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

export class CrearDescuentoDiscrepanciaService {
  /**
   * Crea un descuento al trabajdor para cada producto con
   * discrepancia positiva. Retorna { id, monto } del descuento
   * creado, o undefined si no había discrepancias.
   */
  async execute(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    discrepancias: Array<{ producto: string; discrepancia: number }>,
  ): Promise<{ id: string; monto: number } | undefined> {
    const tx = client as unknown as {
      descuentoRepartidor: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; monto: unknown }> }
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

    const descuento = await tx.descuentoRepartidor.create({
      data: {
        embarqueId,
        trabajadorId,
        monto: montoTotal,
        motivo: `Discrepancia conciliacion: ${motivos.join(', ')}`,
        justificado: false,
      },
    })

    return { id: descuento.id, monto: Number(descuento.monto) }
  }
}
