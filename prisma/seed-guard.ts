/**
 * Guarda de los seeds: crean usuarios con contraseñas CONOCIDAS (están escritas en el repositorio, que es público).
 * En una base remota (Supabase u otra) eso deja una cuenta de administrador que cualquiera puede abrir.
 * Por eso los seeds se niegan a correr salvo contra una base local (o con una confirmación explícita).
 */

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** `true` solo si la URL es de una base de este mismo equipo. Una URL ausente o ilegible NO es local. */
export function baseEsLocal(url: string | undefined): boolean {
  if (!url) return false
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Variable que confirma, a propósito, que se quiere sembrar una base remota (p. ej. una base de demostración desechable). */
export const CONFIRMAR_SEED_REMOTO = 'SEED_PERMITIR_BASE_REMOTA'

export function exigirBaseLocal(
  url: string | undefined = process.env.DATABASE_URL,
  confirmacion: string | undefined = process.env[CONFIRMAR_SEED_REMOTO],
): void {
  if (baseEsLocal(url) || confirmacion === '1') return
  throw new Error(
    'El seed se niega a correr: la base no es local. Crea usuarios con contraseñas conocidas (están en el repositorio público) '
    + `y en una base real quedarían como una puerta abierta. Si es una base desechable de demostración, confirma con ${CONFIRMAR_SEED_REMOTO}=1.`,
  )
}
