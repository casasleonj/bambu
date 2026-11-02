/**
 * Usuario técnico de los procesos automáticos (crons de alertas y de recurrentes).
 * Es solo un actor para auditar lo que hace el sistema: nunca inicia sesión (#410).
 */
export const USUARIO_SISTEMA = 'system@bambu.local'

/** true si el usuario es el técnico del sistema (comparación sin mayúsculas ni espacios). */
export function esUsuarioSistema(username: string | null | undefined): boolean {
  return (username ?? '').trim().toLowerCase() === USUARIO_SISTEMA
}
