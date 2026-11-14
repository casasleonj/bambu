# Instrucciones locales · E2E, Playwright y QA

**Ámbito:** `e2e/`.

- Comparar siempre **fallos por spec, proyecto y firma**, contra CI del mismo `main` antes de atribuirlos a un PR. Separar regresiones nuevas de defectos previos y de flaky que pasan en reintento.
- Nunca volver un test `skip`, desactivarlo ni manipular fixtures para hacer verde CI sin investigación, justificación y autorización explícita. Un test omitido NO es prueba pasada.
- Verificar efectos en distintos roles, PC y móvil, offline/reintentos, concurrencia y flujos completos. Probar siguiente operación y reversas, no solo la primera pantalla.
- La prueba de API, la prueba automatizada de navegador y el QA de personas son evidencias distintas; no afirmar que una sustituye la otra.
- Si el cambio toca migraciones, datos, auth, pagos o flags, revisar seed, rollback y preparación del entorno de CI; no usar datos de producción.
- Registrar SHA de baseline/candidata, entorno, proyecto Playwright, condiciones, firma, traza y resultado reejecutado. No suponer «no hay regresión» solo porque un flag está OFF.

Ver [flujo de entrega](../docs/agentes/flujo-entrega.md) y [Known Issues históricos](../docs/agentes/historial-y-trazabilidad.md).
