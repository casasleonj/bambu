# Baseline known-red

Generado por: `npx playwright test e2e/auth.spec.ts --reporter=json --project=chromium > e2e/.baseline-smoke.json`
Fecha: 2026-07-15
Pass-count total: 3 / 4 (smoke baseline)
Fallas pre-existentes: 1

Lista (por archivo .spec.ts):
- `e2e/auth.spec.ts`: test `signOut redirects to login` falla en chromium. Pre-existente, no introducido por QA.

Nota: el baseline completo de todos los specs run-by-default (~765 tests en chromium, ~1530 en ambos proyectos) no se ejecutó interactivamente porque excede 60 minutos con `workers:1`. La infraestructura para generarlo está en `playwright.config.ts` (screenshot/trace + testIgnore). El baseline completo debe generarse en CI con timeout extendido.

Acción: si baseline baja en un módulo posterior, diff contra `.baseline-smoke.json` (o baseline completo) debe reportar exactamente cuáles specs dejaron de pasar.
