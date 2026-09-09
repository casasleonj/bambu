/**
 * Clasificación **centralizada** de un HTTP 409 en los flujos N2 y G11 del
 * Pedido Hub (Fase 9 F9-iii, precisión #5 del equipo).
 *
 * Un 409 NO significa automáticamente "conflicto". Se separan dos clases:
 *
 * - **B — regla de negocio / guard**: el backend ya explica la condición y,
 *   en G11, ofrece alternativas que el usuario elige explícitamente. Se
 *   muestra el mensaje contextual, sin recovery, sin tocar `conflictoEnCurso`.
 * - **A — conflicto de estado**: *el estado del servidor ya no coincide con
 *   el estado sobre el que el usuario estaba operando*. (No se afirma que
 *   "otro usuario lo modificó" — el backend no lo demuestra.) Recovery
 *   contextual: refrescar el contexto (peek) y que el usuario decida. Nunca
 *   auto-retry, nunca "aplicado".
 *
 * Default seguro: un 409 con un código **no reconocido** se trata como A.
 *
 * Esta función es la ÚNICA fuente de verdad de la clasificación — la usan
 * `use-gestion-pendiente` (N2) y `use-ajuste-cantidad` (G11) por igual.
 */

/** Códigos 409 que son regla de negocio / guard (clase B). */
export const CODIGOS_409_REGLA_NEGOCIO = [
  // N2 — gestionar-pendiente / cambiar-modo
  'CANTIDAD_EXCEDE_PENDIENTE',
  'ACTIVIDAD_SIN_MODO',
  // G11 — ajustar-cantidad (guards con alternativas que el usuario elige)
  'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA',
  'CORRECCION_PEDIDO_CERRADO',
  'CORRECCION_GENERARIA_SOBREPAGO',
] as const

/**
 * Códigos 409 conocidos que son conflicto de estado (clase A). Documental:
 * el default de `es409DeConflictoDeEstado` ya los cubre; se listan para el
 * lector y los tests de la matriz.
 */
export const CODIGOS_409_CONFLICTO_ESTADO = [
  'OBLIGACION_YA_ACTIVA',
  'ACTIVIDAD_NO_MODIFICABLE',
] as const

/**
 * `true` si el error es un 409 de **conflicto de estado** (clase A → recovery).
 * `false` para reglas de negocio (clase B) y para cualquier status ≠ 409.
 */
export function es409DeConflictoDeEstado(
  statusCode: number,
  errorMsg: string | undefined | null,
): boolean {
  if (statusCode !== 409) return false
  const msg = errorMsg ?? ''
  return !CODIGOS_409_REGLA_NEGOCIO.some((c) => msg.includes(c))
}

/** `true` si el 409 es una regla de negocio ya explicada (clase B). */
export function es409DeReglaDeNegocio(
  statusCode: number,
  errorMsg: string | undefined | null,
): boolean {
  if (statusCode !== 409) return false
  const msg = errorMsg ?? ''
  return CODIGOS_409_REGLA_NEGOCIO.some((c) => msg.includes(c))
}
