// TEMPORAL-SIN-EMBARQUE(#472): interruptor de la gestión temporal de pedidos
// por el administrador sin embarque. Mientras la sección de Embarques no
// funciona, el ADMIN registra entregas y cobros desde el pedido. Se retira
// completa cuando Embarques funcione (ver docs/pedidos/GESTION_TEMPORAL_SIN_EMBARQUE.md).
import { prisma } from './prisma'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from './config-claves-restringidas'

/** Clave de `Config` que enciende/apaga toda la gestión temporal. Apagada por defecto. */
export { CLAVE_GESTION_ADMIN_SIN_EMBARQUE }

/**
 * Lee el interruptor SIEMPRE de la base, sin el caché de `getConfig`.
 *
 * `POST /api/config` invalida ese caché con `revalidateTag(tag, 'max')`, que en
 * Next 16 es stale-while-revalidate: la primera lectura después de cambiar el
 * valor todavía devuelve el viejo. Para un interruptor de seguridad eso significa
 * que, recién apagado, una orden más podría pasar. Una lectura indexada por
 * clave cuesta nada con 6 usuarios y solo la hacen las rutas de esta función.
 */
export async function gestionAdminSinEmbarqueActiva(): Promise<boolean> {
  const fila = await prisma.config.findUnique({
    where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
    select: { valor: true },
  })
  return fila?.valor.trim().toLowerCase() === 'true'
}
