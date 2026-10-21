/**
 * Permiso "autorizar excepciones de crédito" (P0-3, #357).
 *
 * Es un permiso por usuario (`User.puedeAutorizarExcepcionCredito`), no por rol:
 * solo lo cambia un ADMIN y solo puede tenerlo quien ve la pantalla de pedidos
 * (ADMIN o ASISTENTE). Estas reglas viven en el servidor; la UI solo las refleja.
 */

export const ROLES_PUEDEN_AUTORIZAR = ['ADMIN', 'ASISTENTE'] as const

export function rolPuedeAutorizar(rol: string): boolean {
  return (ROLES_PUEDEN_AUTORIZAR as readonly string[]).includes(rol)
}

export interface EstadoAutorizador {
  rol: string
  activo: boolean
  puedeAutorizarExcepcionCredito: boolean
}

export type CambioAutorizador = Partial<EstadoAutorizador>

export type ErrorAutorizador =
  | 'ROL_NO_PUEDE_AUTORIZAR'
  | 'ULTIMO_AUTORIZADOR'

export interface ResultadoAutorizador {
  /** estado final que debe persistirse (puede forzar el permiso a false al cambiar a un rol sin derecho). */
  siguiente: EstadoAutorizador
  error: ErrorAutorizador | null
}

/**
 * Calcula el estado resultante de un cambio y valida las dos reglas:
 *  1. Dar el permiso a un rol que no puede usarlo → ROL_NO_PUEDE_AUTORIZAR.
 *  2. Dejar al sistema sin ninguna persona autorizadora activa → ULTIMO_AUTORIZADOR
 *     (`otrosAutorizadoresActivos` = cuántas otras personas activas con permiso y rol válido hay).
 * Cambiar a un rol sin derecho quita el permiso (no es un error: la UI lo avisa).
 */
export function resolverCambioAutorizador(
  actual: EstadoAutorizador,
  cambio: CambioAutorizador,
  otrosAutorizadoresActivos: number,
): ResultadoAutorizador {
  const rol = cambio.rol ?? actual.rol
  const activo = cambio.activo ?? actual.activo
  let puede = cambio.puedeAutorizarExcepcionCredito ?? actual.puedeAutorizarExcepcionCredito

  if (cambio.puedeAutorizarExcepcionCredito === true && !rolPuedeAutorizar(rol)) {
    return { siguiente: { rol, activo, puedeAutorizarExcepcionCredito: false }, error: 'ROL_NO_PUEDE_AUTORIZAR' }
  }
  if (!rolPuedeAutorizar(rol)) puede = false

  const siguiente = { rol, activo, puedeAutorizarExcepcionCredito: puede }

  const eraAutorizadorEfectivo =
    actual.activo && actual.puedeAutorizarExcepcionCredito && rolPuedeAutorizar(actual.rol)
  const seguiraSiendo = activo && puede && rolPuedeAutorizar(rol)
  if (eraAutorizadorEfectivo && !seguiraSiendo && otrosAutorizadoresActivos === 0) {
    return { siguiente, error: 'ULTIMO_AUTORIZADOR' }
  }
  return { siguiente, error: null }
}

export const MENSAJES_AUTORIZADOR: Record<ErrorAutorizador, string> = {
  ROL_NO_PUEDE_AUTORIZAR: 'Solo un Admin o un Asistente puede recibir el permiso de autorizar excepciones de crédito.',
  ULTIMO_AUTORIZADOR:
    'Es la única persona que puede autorizar excepciones de crédito. Da el permiso a otra persona antes de quitárselo o de desactivarla.',
}
