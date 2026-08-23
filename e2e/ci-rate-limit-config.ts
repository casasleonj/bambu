// Fuente única del límite relajado de /api/* en E2E (Known Issue #25 backlog,
// PR #127). checkRateLimit(ip, 'api') (src/proxy.ts) usa la IP del request
// como key -- en CI/local E2E todo tráfico de browser sin x-forwarded-for
// propio comparte una única IP (127.0.0.1), así que el balde de 300 req/60s
// pensado para una IP real de producción se agota con el volumen agregado
// de cientos de tests seriales, devolviendo 429 a tests completamente no
// relacionados (confirmado en CI: roles-permisos.spec.ts esperaba 403 y
// recibió 429).
//
// playwright.config.ts pasa este valor como API_RATE_LIMIT_POINTS al
// proceso del webServer (src/lib/rate-limit.ts lo lee). Ese env var NO llega
// al proceso de Playwright en sí (webServer.env solo se aplica al proceso
// hijo del server) -- por eso e2e/qa/05-rate-limit/zzz-api-stress.spec.ts,
// que corre en el proceso de Playwright y necesita saber cuántas requests
// hacen falta para disparar el 429 real, importa esta misma constante en
// vez de hardcodear 300 (el default de producción, sin relajar).
export const CI_API_RATE_LIMIT_POINTS = 2000
