/**
 * ITrabajadorEmbarqueRepository Interface.
 *
 * Port for Trabajador operations needed by embarque use cases.
 */

export interface TrabajadorEmbarqueData {
  id: string
  nombre: string
  telefono?: string
  usaMoto: boolean
  rutaDefaultId?: string
  capacidadKg: number
  capacidadMotoKg?: number
  tipoMoto?: string
}

export interface ITrabajadorEmbarqueRepository {
  findById(id: string, tx?: unknown): Promise<TrabajadorEmbarqueData | null>
  findRepartidoresDisponibles(fecha: Date, tx?: unknown): Promise<TrabajadorEmbarqueData[]>
}
