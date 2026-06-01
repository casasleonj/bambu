/**
 * IVentaLibreRepository Interface.
 *
 * Port for VentaLibre persistence operations during embarque closing.
 */

import { VentaLibre } from '../entities/VentaLibre'

export interface IVentaLibreRepository {
  createMany(ventas: Array<{
    embarqueId: string
    clienteNombre?: string
    clienteTelefono?: string
    direccion?: string
    barrio?: string
    producto: string
    cantidad: number
    precio: number
    metodoPago: string
    obs?: string
  }>, tx?: unknown): Promise<VentaLibre[]>
}
