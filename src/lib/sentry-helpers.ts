/**
 * Sentry helpers — wrappers ergonómicos para capturar errores con contexto.
 *
 * Centraliza el patrón `Sentry.withScope` + tags/context que de otro modo
 * se repetiría en cada handler. Todos los handlers de /api/* deberían usar
 * `captureApiError` o `withSentryScope` para que Sentry tenga tags
 * consistentes (endpoint, rol, userId) y un breadcrumb contextual.
 *
 * Beneficios:
 * 1. Tags consistentes → filtros eficientes en el dashboard de Sentry.
 * 2. Context.reduce() no se acumula en global (cada error es scope-local).
 * 3. La función de Sentry ya está en el bundle de Next.js (zero deps).
 *
 * Uso:
 *   import { captureApiError } from '@/lib/sentry-helpers'
 *
 *   try { ... } catch (e) {
 *     captureApiError(e, { endpoint: 'produccion.POST', rol: 'ADMIN', userId, extra: { turno } })
 *     return apiError('...', 500)
 *   }
 */

import * as Sentry from '@sentry/nextjs'

export interface SentryContext {
  /** Endpoint label, e.g. 'produccion.POST', 'produccion.[id].PUT' */
  endpoint: string
  /** Role of the requesting user, if known */
  rol?: string
  /** User ID, if authenticated */
  userId?: string
  /** Additional structured data to attach to the event */
  extra?: Record<string, unknown>
  /** Severity level (default: 'error') */
  level?: Sentry.SeverityLevel
}

/**
 * Capture an error with consistent context. Use in catch blocks.
 *
 * Side effect: logs to Sentry. Does NOT throw.
 */
export function captureApiError(error: unknown, ctx: SentryContext): void {
  Sentry.withScope((scope) => {
    scope.setTag('endpoint', ctx.endpoint)
    if (ctx.rol) scope.setTag('rol', ctx.rol)
    if (ctx.endpoint) {
      // Derive feature from endpoint, e.g. 'produccion.POST' → 'produccion'
      const feature = ctx.endpoint.split('.')[0]?.split('/').pop() ?? 'unknown'
      scope.setTag('feature', feature)
    }
    if (ctx.userId) {
      scope.setUser({ id: ctx.userId })
    }
    if (ctx.extra) {
      Object.entries(ctx.extra).forEach(([k, v]) => scope.setExtra(k, v))
    }
    scope.setLevel(ctx.level ?? 'error')
    const err = error instanceof Error ? error : new Error(String(error))
    Sentry.captureException(err)
  })
}

/**
 * Add a breadcrumb (debug trail) without capturing. Use before risky
 * operations to make captured errors more actionable.
 */
export function addApiBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  })
}

/**
 * Wrap an async operation. If it throws, capture with context and
 * re-throw so the caller can decide on the response shape.
 */
export async function withSentryScope<T>(ctx: SentryContext, fn: () => Promise<T>): Promise<T> {
  return Sentry.withScope(async (scope) => {
    scope.setTag('endpoint', ctx.endpoint)
    if (ctx.rol) scope.setTag('rol', ctx.rol)
    if (ctx.userId) scope.setUser({ id: ctx.userId })
    if (ctx.extra) {
      Object.entries(ctx.extra).forEach(([k, v]) => scope.setExtra(k, v))
    }
    try {
      return await fn()
    } catch (e) {
      captureApiError(e, ctx)
      throw e
    }
  })
}
