# Flujo de Entrega

**Objetivo:** evitar acumular deuda de integración, reducir conflictos de rebase, mantener `main` estable, y minimizar el contexto innecesario que un agente debe procesar.

**Regla de oro: una fase = una rama = un PR. Cada fase entra a `main` ANTES de empezar la siguiente. NUNCA apilar ramas silenciosamente** (fase N+1 ramificada de fase N sin mergear = deuda de integración + rebases con conflictos en código sensible).

**Regla fundamental:** *una fase no se cierra cuando el código está terminado. Se cierra cuando está implementada, validada, integrada por PR + merge, y `main` ha sido verificado post-merge.*

Aplica DESPUÉS de que el plan quedó aprobado (Ronda 2 del Protocolo de Investigación). El feature flag correspondiente (`NEXT_PUBLIC_*`) va **OFF** durante toda la fase: mergear a `main` con el flag OFF es seguro (código muerto para los 6 usuarios). El *flip* del flag a ON es su propia decisión, gated por soak period — no es parte de este flujo.

## Los 10 pasos

### 0. PLAN + APROBACIÓN
- objetivo · alcance y fuera de alcance · criterios de aceptación · dependencias con otras fases
- dividir en slices TDD cuando corresponda
- aprobación explícita del equipo/PO (mensaje relatado por el usuario). Una fase no empieza con requisitos ambiguos.

### 1. IMPLEMENTAR FASE
- **crear la rama desde el `main` más reciente y verificado** (paso 8/9 de la fase anterior)
- slices pequeños y coherentes · TDD cuando corresponda
- cambios enfocados: nada no relacionado, ningún refactor oportunista que no pertenezca a la fase
- commits coherentes y explicables · el doc de plan de la fase se actualiza como parte de "terminar"

### 2. VALIDACIÓN LOCAL
- `npx tsc --noEmit` · `npx eslint .` (o los paths tocados) · `npm run test` (unit)
- Integration / E2E relevantes cuando el alcance de la fase los afecta (login, creación, offline, cierre)
- si algo falla → corregir → re-ejecutar → continuar **solo** cuando esté estable

### 3. SINCRONIZACIÓN OBLIGATORIA CON `main` (antes de abrir el PR)
- `git fetch origin && git rebase origin/main`
- conflictos: identificar archivos → **entender la intención de ambos cambios** → resolver explícitamente → `git add` → `git rebase --continue`. **NUNCA** `ours`/`theirs` mecánico, en especial en lógica financiera, cálculos, persistencia, autorizaciones o reglas de negocio.
- si hay que cancelar: `git rebase --abort`
- si el rebase reescribe historia de una rama ya publicada: `git push --force-with-lease` (NUNCA `--force` salvo razón excepcional aprobada)
- **revalidar completamente** (repetir paso 2) — el rebase pudo introducir un conflicto semántico que git no marcó
- **el PR no se abre hasta que rebase + resolución + validación post-rebase estén completos**

### 4. ABRIR PR
- base = `main` actualizado y validado (nunca otra rama de fase)
- contiene: objetivo · resumen de cambios · criterios de aceptación · dependencias · validaciones ejecutadas · limitaciones conocidas · info para QA
- el cuerpo termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

### 5. CI / REVIEW
- esperar y revisar todos los checks: Typecheck · Lint · Unit · Integration · E2E · build/deploy checks cuando correspondan
- **bloqueantes verdes:** Typecheck + Unit + Integration
- **Regla de baseline E2E** (`Known Issues #20` — el job E2E está crónicamente rojo por infra):
  - baseline = qué specs E2E fallan en `main` ANTES del PR (`gh run list --branch main --workflow CI -L 1` → el run)
  - un fallo que ya está en el baseline **no** es regresión del PR — pero **tampoco** justifica ignorar fallos nuevos
  - comparación explícita: `main` antes → baseline · PR → ¿aparecieron fallos nuevos? · fallos nuevos = regresión → **corregir**
  - atajo válido: si la fase solo agrega specs E2E gated tras el flag (`test.skip` cuando OFF) y no toca fixtures compartidas, no puede introducir fallos nuevos → basta declararlo en el PR
  - dejar constancia en el PR: "E2E: N fallos = baseline de main (run #…)" o "E2E: 1 regresión nueva en `foo.spec.ts`, corrigiendo"

### 6. CORRECCIONES
- si CI / review / QA detectan un problema atribuible al cambio: corregir → validar localmente → actualizar el PR → volver a 5
- no avanzar al merge mientras existan fallos atribuibles al cambio

### 7. MERGE
- **aprobación requerida** (usuario/PO) + CI del paso 5 resuelto + QA satisfactorio cuando corresponda
- una vez aprobado, el agente **puede** ejecutar `gh pr merge <N> --squash --delete-branch`
- no iniciar la siguiente fase solo porque el PR "está listo para merge" — la integración real ocurre cuando el cambio está **en `main`**
- **PR con migración (`prisma/migrations/*`): aplicarla en producción ANTES de mergear** (el merge despliega el código a Vercel de inmediato; si el código lee columnas que la base no tiene, `/dashboard` y `/pedidos` caen — incidente del 2026-10-14, #350). Orden: migración aditiva e idempotente en Supabase → verificar con una consulta de solo lectura que existe → recién entonces merge. La migración debe ser compatible con el código anterior (solo agrega, nunca renombra ni borra) para poder aplicarse antes del despliegue.

### 8. POST-MERGE INTEGRATION GATE
- desde un **worktree dedicado**, NO desde el checkout compartido `/home/cristof/Documents/bambu_demo_multimodelo` (hay otras sesiones Claude ahí; un `git checkout main` las rompe)
- `git fetch origin && git checkout main && git pull --ff-only origin main` (el `--ff-only` falla ruidosamente si `main` local divergió)
- `npx tsc --noEmit` · `npx eslint .` · `npm run test` · smoke / integration / E2E crítico cuando corresponda
- **confirmar `main` estable.** Solo entonces la fase está *integrada*. Si el gate falla (conflicto semántico que pasó el CI del PR): `git revert` del merge commit **inmediatamente**, no dejar `main` roto, reabrir el trabajo.

### 9. CREAR LA SIGUIENTE RAMA
- exclusivamente desde el `main` recién actualizado y verificado (paso 8): `git checkout main && git pull --ff-only origin main && git checkout -b feat/nueva-fase`
- nunca sobre la rama de una fase anterior que ya debería estar integrada

### 10. INICIAR SIGUIENTE FASE
- vuelve al paso 0

## Política de tamaño y contexto

El objetivo **no** es maximizar el número de commits — es minimizar el trabajo innecesario de comprensión, integración y corrección.

- slices pequeños y cambios enfocados · evitar PRs innecesariamente grandes
- no acumular fases sin integrar
- dar al agente **solo** el contexto necesario; no obligarlo a reconstruir la historia completa del proyecto
- commits chicos = trazabilidad y recuperación, pero el tamaño del cambio relevante importa más que el conteo de commits

## Regla de integración

**No acumular fases terminadas sin integrar.** Si una fase depende de otra que todavía no puede integrarse, **declarar explícitamente la dependencia y usar stacked PRs encadenados**, en lugar de acumular deuda de integración silenciosa. Un stack explícito y documentado en los PRs es aceptable; un stack silencioso no.

## Notas

- **Squash-merge es el default del repo.** Con ramas de vida corta el squash deja de causar el problema de rebase (ya no hay commits compartidos entre ramas).
- Este flujo **no arregla** `Known Issues #20` (E2E flaky) — lo convive vía la regla de baseline del paso 5.
- **Fase con migración Prisma:** ver `Known Issues #12` — en dev el schema se sincroniza con `db push` (NO `migrate deploy`); en prod Supabase la migración se aplica aparte (vía MCP). El SQL de cada migración nueva debe ser idempotente.

