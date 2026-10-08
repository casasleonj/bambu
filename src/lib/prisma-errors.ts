/**
 * Código de error de Prisma por duck-typing, no por `instanceof`.
 *
 * Bug real detectado en F4 (gate E2E contra Postgres real, 2026-10-07):
 * `error instanceof PrismaClientKnownRequestError` evaluó `false` para un
 * P2002 real — el bloqueo duro de Alias contra otro Barrio no se mostraba
 * nunca. La causa: el error que lanza el motor de Prisma y la clase
 * importada en el route handler pueden venir de copias distintas del módulo
 * `@prisma/client/runtime/library` (duplicación por bundling). El código de
 * error (`.code`, ej. 'P2002') sigue siendo correcto aunque `instanceof`
 * falle — es el mismo patrón ya documentado para P2034 en
 * `src/lib/serializable.ts`. Los tests con Prisma mockeado nunca detectan
 * esto porque construyen el error con la MISMA clase importada.
 */
export function prismaErrorCode(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code
  }
  return undefined
}
