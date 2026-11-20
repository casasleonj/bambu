import { RegaloPedidoError } from '../application/services/regalo-pedido.service'

const MENSAJES: Record<RegaloPedidoError['code'], string> = {
  REGALO_CANTIDAD_INVALIDA: 'Revisa la cantidad de regalo: debe ser entera, no negativa y corresponder a un producto autorizado.',
  REGALO_REQUIERE_LINEA_CON_PRECIO: 'Añade primero la cantidad con precio del producto. Este flujo no crea pedidos exclusivamente gratuitos.',
  REGALO_REQUIERE_ADMIN: 'Solo un administrador puede autorizar o modificar las unidades de regalo.',
  REGALO_MOTIVO_REQUERIDO: 'Indica el motivo del regalo, de hasta 500 caracteres.',
  REGALO_YA_ENTREGADO: 'Este regalo ya tiene unidades entregadas. Su autorización histórica no se modifica desde la edición del pedido.',
  REGALO_DESGLOSE_REQUERIDO: 'Este pedido tiene regalos. Conserva su producto y registra por separado las unidades con precio y las de regalo.',
  REGALO_CLAVE_REQUERIDA: 'Falta la clave de reintento de esta entrega. Actualiza la aplicación antes de registrarla.',
}

export function mapRegaloPedidoError(error: unknown): { status: number; code: RegaloPedidoError['code']; message: string } | null {
  if (!(error instanceof RegaloPedidoError)) return null
  return { status: error.code === 'REGALO_REQUIERE_ADMIN' ? 403 : 422, code: error.code, message: MENSAJES[error.code] }
}
