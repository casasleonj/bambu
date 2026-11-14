/** #406 — Roles que pueden tener el permiso «Puede confirmar pagos». Sin dependencias de servidor (la usa la pantalla). */
export const ROLES_QUE_PUEDEN_CONFIRMAR_PAGOS = ['ADMIN', 'ASISTENTE', 'CONTADOR'] as const

export function rolPuedeConfirmarPagos(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_QUE_PUEDEN_CONFIRMAR_PAGOS as readonly string[]).includes(rol)
}
