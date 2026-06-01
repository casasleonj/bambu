/**
 * IStockEmbarqueRepository Interface.
 *
 * Port for stock validation operations needed by embarque use cases.
 */

export interface IStockEmbarqueRepository {
  getStockEstimado(fecha: Date, tx?: unknown): Promise<Record<string, number> | null>
  getStockSnapshot(embarqueId: string, tx?: unknown): Promise<Record<string, number> | null>
}
