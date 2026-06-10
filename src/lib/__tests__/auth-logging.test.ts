// @tests auth S-3 logging
// FIX S-3: auth.ts NO loggeaba intentos fallidos de login ni
// logins exitosos. Esto es importante para detectar brute
// force y comprometer cuentas.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const authPath = join(process.cwd(), 'src/lib/auth.ts')
const source = readFileSync(authPath, 'utf-8')

describe('S-3: auth.ts loggea eventos de login (éxito y fallo)', () => {
  // Solo el authorize() callback
  const authorizeMatch = source.match(/async authorize\(credentials\) \{[\s\S]+?\n\s{6}\},/)

  it('FIX: el código loggea login exitoso con userId, username, role', () => {
    expect(authorizeMatch).not.toBeNull()
    // Login exitoso: logger.info con userId, username, role
    expect(authorizeMatch![0]).toMatch(/logger\.info\(\s*\{[^}]*userId:[^}]*username:[^}]*role:[^}]*\}/s)
    expect(authorizeMatch![0]).toMatch(/['"]Auth: login exitoso['"]/)
  })

  it('FIX: el código loggea login fallido con username (sin password)', () => {
    expect(authorizeMatch).not.toBeNull()
    // Login fallido: logger.warn con username
    expect(authorizeMatch![0]).toMatch(/logger\.warn\(\s*\{[^}]*username:[^}]*\}/s)
    expect(authorizeMatch![0]).toMatch(/['"]Auth: login fallido['"]/)
  })

  it('FIX: el log de login fallido incluye userExists y userActive', () => {
    expect(authorizeMatch).not.toBeNull()
    expect(authorizeMatch![0]).toMatch(/userExists:\s*dbUser !== null/)
    expect(authorizeMatch![0]).toMatch(/userActive:\s*dbUser\?\.activo\s*\?\?\s*false/)
  })

  it('FIX: el log NO incluye password (security: avoid hash leaks)', () => {
    // El log debe NO incluir 'password' (ni en claro ni hash)
    // Solo loggeamos username
    expect(authorizeMatch![0]).not.toMatch(/logger\.\w+\([^)]*password:/s)
  })

  it('FIX: hay comentarios S-3 explicando el fix', () => {
    expect(authorizeMatch![0]).toMatch(/S-3 fix:/)
  })
})
