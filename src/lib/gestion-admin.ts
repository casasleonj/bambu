// TEMPORAL-SIN-EMBARQUE(#472): interruptor de la gestión temporal de pedidos
// por el administrador sin embarque. Mientras la sección de Embarques no
// funciona, el ADMIN registra entregas y cobros desde el pedido. Se retira
// completa cuando Embarques funcione (ver docs/pedidos/GESTION_TEMPORAL_SIN_EMBARQUE.md).
import { getConfigBool } from './config'

/** Clave de `Config` que enciende/apaga toda la gestión temporal. Apagada por defecto. */
export const CLAVE_GESTION_ADMIN_SIN_EMBARQUE = 'GESTION_ADMIN_SIN_EMBARQUE'

export async function gestionAdminSinEmbarqueActiva(): Promise<boolean> {
  return getConfigBool(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, false)
}
