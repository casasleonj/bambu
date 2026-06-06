/**
 * CerrarEmbarqueSideEffectsService.
 *
 * FIX F4.10-d: agrupa los side effects finales del cierre:
 * 1. Crear gastos del embarque
 * 2. Actualizar EmbarqueProducto con el retorno
 *
 * Ambos métodos eran privados del CerrarEmbarqueUseCase. Son
 * side effects simples (no lógica de dominio compleja) pero
 * siguen el principio de responsabilidad única.
 *
 * Patrón alineado con los otros services (F4.10-a/b/c): service
 * dedicado, sin dependencias de Prisma (recibe client como param),
 * backward compat con default = new instance.
 */

import type { CerrarEmbarqueInput } from '../../application/dto'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import type { ProductCode } from '../../domain/value-objects/Carga'

export class CerrarEmbarqueSideEffectsService {
  /**
   * Crea los gastos del embarque (gasolina, peajes, etc.).
   * @returns Cantidad de gastos creados.
   */
  async crearGastos(
    tx: unknown,
    gastos: CerrarEmbarqueInput['gastos'],
    embarqueId: string,
    trabajdorId: string,
    userId: string | undefined,
    gastoRepo: IGastoEmbarqueRepository,
  ): Promise<number> {
    let count = 0
    for (const gastoData of gastos ?? []) {
      await gastoRepo.create(
        {
          embarqueId,
          categoria: gastoData.categoria,
          descripcion: gastoData.nota || gastoData.categoria,
          monto: gastoData.monto,
          responsable: trabajdorId,
          notas: gastoData.nota,
          createdById: userId,
        },
        tx,
      )
      count++
    }
    return count
  }

  /**
   * Actualiza los EmbarqueProducto con las cantidades de retorno.
   * El admin captura devueltas, cambios, rotas en ruta.
   */
  async actualizarProductosRetorno(
    tx: unknown,
    embarqueId: string,
    productosRetorno: CerrarEmbarqueInput['productosRetorno'],
    productoRepo: IEmbarqueProductoRepository,
  ): Promise<void> {
    for (const pr of productosRetorno ?? []) {
      await productoRepo.upsert(
        embarqueId,
        pr.producto as ProductCode,
        {
          cargadas: 0,
          devueltas: pr.devueltas,
          cambios: pr.cambios,
          rotas: pr.rotas,
        },
        tx,
      )
    }
  }
}
