// Claves de `Config` que solo puede cambiar un ADMIN, aunque las rutas de
// configuración dejen escribir otras claves a un CONTADOR. Módulo sin
// dependencias (ni Prisma) para poder importarlo desde la validación y desde
// las rutas.

/**
 * TEMPORAL-SIN-EMBARQUE(#472): enciende/apaga la gestión temporal de pedidos
 * por el ADMIN sin embarque. Apagada por defecto.
 */
export const CLAVE_GESTION_ADMIN_SIN_EMBARQUE = 'GESTION_ADMIN_SIN_EMBARQUE'

/** Claves que mueven dinero o permisos: cambiarlas exige rol ADMIN en TODA ruta que escriba `Config`. */
export const CLAVES_SOLO_ADMIN: ReadonlySet<string> = new Set([CLAVE_GESTION_ADMIN_SIN_EMBARQUE])
