export type SessionAuthStatus = 'valid' | 'invalid' | 'unavailable'

export const SESSION_UNAVAILABLE_DIGEST = 'SESSION_UNAVAILABLE_760'
export const SESSION_UNAVAILABLE_MESSAGE = 'No pudimos comprobar tu sesión. Reintenta en unos segundos.'

/** Thrown outside Auth.js: exceptions inside its JWT callback clear cookies. */
export class SessionUnavailableError extends Error {
  readonly digest = SESSION_UNAVAILABLE_DIGEST

  constructor() {
    super(SESSION_UNAVAILABLE_MESSAGE)
    this.name = 'SessionUnavailableError'
  }
}

export function isSessionUnavailable(error: unknown): boolean {
  return error instanceof SessionUnavailableError || (
    error instanceof Error && 'digest' in error && error.digest === SESSION_UNAVAILABLE_DIGEST
  )
}

export function sessionUnavailableResponse(): Response {
  return Response.json(
    { error: { message: SESSION_UNAVAILABLE_MESSAGE, code: 'SESSION_UNAVAILABLE' } },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } },
  )
}
