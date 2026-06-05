/**
 * Genera un UUID v4 con fallback para entornos donde `crypto.randomUUID()` no está disponible.
 *
 * ¿Por qué el fallback?
 * - `crypto.randomUUID()` (Web Crypto API Level 2) requiere **secure context**:
 *   HTTPS o `localhost`. Verificado contra MDN:
 *   https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 * - En HTTP plano sobre una IP LAN (no secure context), algunos navegadores
 *   no exponen la API → `TypeError: crypto.randomUUID is not a function`.
 * - El fallback usa `Math.random()` (no es CSPRNG) pero produce UUIDs v4 válidos.
 *   Suficiente para `offlineId` (dedup), NO para tokens de seguridad.
 *
 * Funciona en:
 * - Browser (HTTPS, localhost, o HTTP con fallback)
 * - Node.js 19+ (crypto.randomUUID nativo)
 * - Web Workers
 * - JSDOM (tests)
 */
export function generateUUID(): string {
  // Happy path: API estándar disponible
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: RFC 4122 v4 via Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
