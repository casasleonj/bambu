import { NotificationEventType } from '@prisma/client'

export { NotificationEventType }

export interface NotificationEventMeta {
  label: string
  description: string
  group: 'Clientes' | 'Pedidos' | 'Cierre' | 'Gastos/Compras' | 'Antifraude'
  /** Solo true para el caso genuinamente urgente (antifraude ALTA). */
  persistent: boolean
}

export const NOTIFICATION_EVENT_META: Record<NotificationEventType, NotificationEventMeta> = {
  CLIENTE_CREADO: {
    group: 'Clientes',
    persistent: false,
    label: 'Cliente nuevo',
    description: 'Se agregó un cliente nuevo.',
  },
  PEDIDO_CREADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Pedido nuevo',
    description: 'Se creó un pedido nuevo.',
  },
  EMBARQUE_CERRADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Embarque cerrado',
    description: 'Un embarque fue cerrado y necesita revisión de caja.',
  },
  PEDIDO_ENTREGADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Pedido entregado',
    description: 'Un repartidor confirmó la entrega de un pedido.',
  },
  PEDIDO_CULMINADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Pedido culminado',
    description: 'Un pedido quedó entregado y pagado en su totalidad.',
  },
  FIADO_GENERADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Fiado generado',
    description: 'Un pedido nuevo quedó con saldo pendiente (fiado).',
  },
  ABONO_APLICADO: {
    group: 'Pedidos',
    persistent: false,
    label: 'Abono aplicado',
    description: 'Se aplicó un abono/pago a uno o más pedidos fiados.',
  },
  CIERRE_DIA_COMPLETADO: {
    group: 'Cierre',
    persistent: false,
    label: 'Cierre del día',
    description: 'Se completó el cierre financiero del día.',
  },
  GASTO_CREADO: {
    group: 'Gastos/Compras',
    persistent: false,
    label: 'Gasto registrado',
    description: 'Se registró un gasto nuevo.',
  },
  COMPRA_CREADA: {
    group: 'Gastos/Compras',
    persistent: false,
    label: 'Compra registrada',
    description: 'Se registró una compra a proveedor.',
  },
  CASO_ALTA: {
    group: 'Antifraude',
    persistent: true,
    label: 'Alerta antifraude (ALTA)',
    description: 'El sistema detectó un caso de severidad ALTA que requiere atención inmediata.',
  },
}
