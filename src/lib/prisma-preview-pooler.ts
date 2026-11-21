/**
 * Compatibilidad exclusiva del preview Vercel con Supavisor en modo
 * transaccional (:6543). Prisma 6 usa prepared statements por defecto;
 * Supavisor transaccional no conserva la sesión del statement (SQLSTATE 42P05).
 *
 * Nunca toca la URL directa, otras bases, el desarrollo local ni producción.
 * No registrar la URL en logs: contiene secretos.
 */
export function prismaPreviewDatabaseUrl(
  databaseUrl: string | undefined,
  vercelEnv: string | undefined,
): string | undefined {
  if (!databaseUrl || vercelEnv !== 'preview') return databaseUrl

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    return databaseUrl
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return databaseUrl
  if (!parsed.hostname.endsWith('.pooler.supabase.com') || parsed.port !== '6543') return databaseUrl
  if (parsed.searchParams.get('pgbouncer') === 'true') return databaseUrl

  // Se conserva intacta la URL (incluyendo sus credenciales codificadas);
  // únicamente se agrega el parámetro necesario para el cliente Prisma.
  return databaseUrl + (databaseUrl.includes('?') ? '&' : '?') + 'pgbouncer=true'
}
