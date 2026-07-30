/**
 * PedidoAdapter.
 *
 * Maps domain/application output to the legacy API response shape
 * expected by the existing frontend.
 */

import type { PedidoResumenDTO } from '../application/dto'

export interface LegacyPedidoResponse {
  pedido: PedidoResumenDTO & {
    nombreCli?: string
    apellidoCli?: string | null
    telefonoCli?: string
    zonaCli?: string
    barrioCli?: string
    rutaNombre?: string | null
  }
}

export class PedidoAdapter {
  static toLegacyResponse(dto: PedidoResumenDTO, clienteInfo?: {
    nombre?: string
    apellido?: string
    telefono?: string
    direccion?: string
    barrio?: string
    rutaNombre?: string
  }): LegacyPedidoResponse['pedido'] {
    return {
      ...dto,
      nombreCli: clienteInfo?.nombre || 'Desconocido',
      apellidoCli: clienteInfo?.apellido || null,
      telefonoCli: clienteInfo?.telefono || '',
      zonaCli: clienteInfo?.direccion || '',
      barrioCli: clienteInfo?.barrio || '',
      rutaNombre: clienteInfo?.rutaNombre || null,
    }
  }
}
