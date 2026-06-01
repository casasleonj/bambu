/**
 * IPedidoEmbarqueRepository Interface.
 *
 * Port for Pedido operations related to embarques.
 * This is a focused interface — not the full IPedidoRepository from pedidos module.
 */

export interface PedidoEmbarqueData {
  id: string
  numero: number
  clienteId: string
  clienteNombre: string
  embarqueId: string | null
  estadoEntrega: string
  estado: string
  items: Array<{
    producto: string
    cantidad: number
    cantEntrega: number
    precio: number
  }>
  total: number
  pagos: Array<{
    metodo: string
    monto: number
  }>
  factura?: {
    id: string
    numero: number
  }
}

export interface IPedidoEmbarqueRepository {
  findByEmbarqueId(embarqueId: string, tx?: unknown): Promise<PedidoEmbarqueData[]>
  reassignToEmbarque(pedidoId: string, nuevoEmbarqueId: string | null, tx?: unknown): Promise<void>
  removeFromEmbarque(pedidoId: string, tx?: unknown): Promise<void>
  updateEstadoEntrega(
    pedidoId: string,
    estadoEntrega: string,
    estado: string,
    entregas: Record<string, number>,
    tx?: unknown,
  ): Promise<void>
  createHijo(data: {
    padreId: string
    clienteId: string
    embarqueId: string
    items: Array<{
      producto: string
      cantidad: number
      precio: number
    }>
    total: number
    obs?: string
  }, tx?: unknown): Promise<{ id: string; numero: number }>
}
