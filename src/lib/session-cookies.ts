/** Ordinary application responses must not race login/logout by rotating auth cookies. */
export function withoutSessionCookies<T extends Response>(response: T): T {
  const cookies = response.headers.getSetCookie()
  if (!cookies.length) return response
  response.headers.delete('set-cookie')
  for (const cookie of cookies) {
    if (!/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookie)) {
      response.headers.append('set-cookie', cookie)
    }
  }
  return response
}
