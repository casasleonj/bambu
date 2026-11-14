# Flujo de entrega · procedimiento vigente reorganizado

> Procedimiento canónico para PR, CI, aprobación, merge y recuperación. Mantiene las fases y los diez pasos del documento anterior, y añade el paso 3 (QA en navegador) como gate obligatorio antes de producción. Corrige cuatro afirmaciones no seguras sobre flags, atribución, E2E y rollback. **Las 94 líneas originales permanecen literalmente en** [fuente-original/05-flujo-entrega-anterior.md](fuente-original/05-flujo-entrega-anterior.md). La norma de investigación/aprobación está en [protocolo-investigacion.md](protocolo-investigacion.md). Cualquier excepción debe justificarse con evidencia en el PR.

# Flujo de Entrega

**Objetivo:** evitar acumular deuda de integración, reducir conflictos de rebase, mantener `main` estable, y minimizar el contexto innecesario que un agente debe procesar.

**Regla de oro: una fase = una rama = un PR. Cada fase entra a `main` ANTES de empezar la siguiente. NUNCA apilar ramas silenciosamente** (fase N+1 ramificada de fase N sin mergear = deuda de integración + rebases con conflictos en código sensible).

**Regla fundamental:** *una fase no se cierra cuando el código está terminado. Se cierra cuando está implementada, validada, integrada por PR + merge, y `main` ha sido verificado post-merge.*

Aplica DESPUÉS de la aprobación del plan tras las tres iteraciones R1+R2 del [protocolo vigente](protocolo-investigacion.md). Si existe un feature flag adecuado (`NEXT_PUBLIC_*` u otro), mantenerlo **OFF** durante la fase cuando corresponda, pero verificar que el cambio no produce efectos indirectos en servidor, jobs, migraciones, cargas o API. **OFF no demuestra por sí solo que el merge sea seguro.** El *flip* del flag a ON es su propia decisión, gated por soak period — no es parte de este flujo.

## Los 11 pasos

### 0. PLAN + APROBACIÓN
- objetivo · alcance y fuera de alcance · criterios de aceptación · dependencias con otras fases
- dividir en slices TDD cuando corresponda
- aprobación explícita del equipo/PO (mensaje relatado por el usuario). Una fase no empieza con requisitos ambiguos.

### 1. IMPLEMENTAR FASE
- **crear la rama desde el `main` más reciente y verificado** (paso 9/10 de la fase anterior)
- slices pequeños y coherentes · TDD cuando corresponda
- cambios enfocados: nada no relacionado, ningún refactor oportunista que no pertenezca a la fase
- commits coherentes y explicables · el doc de plan de la fase se actualiza como parte de "terminar"

### 2. VALIDACIÓN LOCAL
- `npx tsc --noEmit` · `npx eslint .` (o los paths tocados) · `npm run test` (unit)
- Integration / E2E relevantes cuando el alcance de la fase los afecta (login, creación, offline, cierre)
- si algo falla → corregir → re-ejecutar → continuar **solo** cuando esté estable

### 3. QA EN NAVEGADOR (gate obligatorio antes de producción)

Procedimiento completo: [.agents/skills/qa-navegador/SKILL.md](../../.agents/skills/qa-navegador/SKILL.md).
Comando: `/qa <issues o rutas> [entorno]`.

- Recorrer la tarea completa como una persona: login real con el rol del caso → acción → efecto en la pantalla siguiente → recarga (persistencia) → camino adversarial (cancelar, filtro, rol sin permiso, campo vacío).
- Entorno seguro por orden: local con datos sintéticos → preview del PR → producción **solo lectura**. Nunca guardar, pagar, entregar, cerrar caja ni disparar procesos en producción.
- Escritorio y viewport móvil ~390×844 cuando el cambio afecte layout, overlays o botones. Lo visual solo se juzga con captura inspeccionada, nunca deducido del árbol de accesibilidad.
- Evidencia en `.qa/pr-<N>.md` con el bloque `### QA en navegador`. Un hook `PreToolUse` rechaza `gh pr merge` sin estado `PASÓ` o `NO APLICA`; el bypass es solo explícito (`QA_GATE=off`).
- `NO EJECUTADO` si no hay navegador operativo o entorno aislado: no se convierte en un falso PASÓ. Un defecto encontrado se registra con `/hallazgo` y bloquea el merge.

### 4. SINCRONIZACIÓN OBLIGATORIA CON `main` (antes de abrir el PR)
- `git fetch origin && git rebase origin/main`
- conflictos: identificar archivos → **entender la intención de ambos cambios** → resolver explícitamente → `git add` → `git rebase --continue`. **NUNCA** `ours`/`theirs` mecánico, en especial en lógica financiera, cálculos, persistencia, autorizaciones o reglas de negocio.
- si hay que cancelar: `git rebase --abort`
- si el rebase reescribe historia de una rama ya publicada: `git push --force-with-lease` (NUNCA `--force` salvo razón excepcional aprobada)
- **revalidar completamente** (repetir paso 2) — el rebase pudo introducir un conflicto semántico que git no marcó
- **el PR no se abre hasta que rebase + resolución + validación post-rebase estén completos**

### 5. ABRIR PR
- base = `main` actualizado y validado (nunca otra rama de fase)
- contiene: objetivo · resumen de cambios · criterios de aceptación · dependencias · validaciones ejecutadas · limitaciones conocidas · info para QA
- describir autoría y asistencia realmente utilizada. **Nunca atribuir a Claude Code, Codex u otro agente un trabajo que no realizó**; no imponer una firma falsa como requisito universal.

### 6. CI / REVIEW
- esperar y revisar todos los checks: Typecheck · Lint · Unit · Integration · E2E · build/deploy checks cuando correspondan
- **bloqueantes verdes:** Typecheck + Unit + Integration
- **Gate por tipo de cambio (#778).** `detect-changes` (`scripts/ci/clasificar-cambios.mjs`) decide si corresponde correr la suite E2E del ERP. La regla es **fail-closed**: la carga de la prueba la tiene el diff, no el revisor.
  - `e2e_required=false` **solo** cuando todo el diff es declarativo: `docs/**`, `AGENTS.md`, o Markdown dentro de `.agents/skills/<n>/` y `.claude/skills/<n>/`. En ese caso se omiten los 8 shards **y** el Hub, y siguen corriendo auditoría de skills, typecheck, unit e integración.
  - Todo lo demás exige E2E completo: cualquier archivo ejecutable o de configuración dentro de una skill (`scripts/**`, `*.py`, `*.ts`, `*.sh`, `package.json`, lockfiles), `.github/**`, código de producto, ruta desconocida, symlink, cambio de modo, rename entre clases distintas, o diff vacío/ilegible.
  - **Un rename no es documentación.** Se compara con `git diff --raw -z`, que trae los dos extremos y los modos; `--name-only` reportaba solo el destino y dejaba pasar `git mv src/x.ts docs/x.md`.
  - **Nunca se marca `skip` en un spec existente ni se debilita una aserción para conseguir verde.** Omitir el E2E no es rebajar un test: es no ejecutar una suite que el cambio no puede afectar.
  - El `ci-gate` solo acepta un job `skipped` si `e2e_required=false` lo justifica; un omitido sin esa condición es fallo explícito.
  - **Limitación conocida:** el E2E tampoco valida el comportamiento de un agente. Una skill declarativa pasa la auditoría de rutas, no demuestra que el agente se comporte bien. Eso es `QA AGENTE PENDIENTE`, y no se declara aprobado por un check estático.
- **Regla de baseline E2E** (`Known Issues #20` — el job E2E está crónicamente rojo por infra):
  - baseline = qué specs E2E fallan en `main` ANTES del PR (`gh run list --branch main --workflow CI -L 1` → el run)
  - un fallo que ya está en el baseline **no** es regresión del PR — pero **tampoco** justifica ignorar fallos nuevos
  - comparación explícita: `main` antes → baseline · PR → ¿aparecieron fallos nuevos? · fallos nuevos = regresión → **corregir**
  - un cambio de specs gated y sin fixtures compartidas **puede** tener otros efectos (config, imports, build); documentar por qué la suite afectada no puede experimentar regresión, y comparar cuando la evidencia o el riesgo lo requieran. La mera presencia de `test.skip` no equivale a una prueba.
  - dejar constancia en el PR: "E2E: N fallos = baseline de main (run #…)" o "E2E: 1 regresión nueva en `foo.spec.ts`, corrigiendo"

### 7. CORRECCIONES
- si CI / review / QA detectan un problema atribuible al cambio: corregir → validar localmente → actualizar el PR → volver a 5
- no avanzar al merge mientras existan fallos atribuibles al cambio

### Evidencia de ejecución, no de intención

Un «verde» no es un hecho verificable: es un autoinforme. La medición externa lo confirma — 75,8 % de los fallos de agentes de código se reportaron como éxito (Advani, 2026, 1.879 trayectorias), y entre revisiones incompletas el 80,4 % afirmó cobertura completa u omitió el hueco (OverclaimBench, 2026). Delegar a subagentes sube la cobertura pero **no** la honestidad: 50,3 % de las revisiones delegadas e incompletas siguió sobreafirmando. Los LLM-as-judge no lo detectan (AUROC 0,54–0,65, donde 0,5 es azar).

Reglas operativas, para agentes y para quien revise su trabajo:

- **Un resultado de prueba se reporta con su comando, su salida y su código de salida.** «Los tests pasan» no es evidencia; `32/32 · node --test · exit 0` sí. Sin salida pegada, el estado es `NO PROBADO`.
- **El verde caduca al tocar el árbol.** Cualquier edición posterior invalida un chequeo previo: hay que repetirlo antes de declarar nada. Declarar limpio un typecheck corrido antes del último parche es una afirmación falsa, aunque el comando fuera real.
- **El resumen de un subagente es un autoinforme, no un hecho.** Exigir un identificador verificable (URL, SHA, ruta absoluta, número de PR) y comprobarlo antes de darlo por bueno.
- **Contrastar el `git diff` real con lo que se dice haber tocado.** Es la comprobación de cobertura: si el archivo no está en el diff, el cambio no existe por mucho que el informe lo describa.
- **Un fallo encontrado por otro (CI, revisor, usuario) obliga a corregir la causa y repetir toda la validación afectada**, no solo el punto señalado.

### 8. MERGE
- **aprobación requerida** (usuario/PO) + CI del paso 6 resuelto + QA satisfactorio cuando corresponda
- una vez aprobado **y solo cuando todos los gates aplicables estén satisfechos**, el agente **puede** ejecutar `gh pr merge <N> --squash --delete-branch` si dispone de los permisos/autorización requeridos
- no iniciar la siguiente fase solo porque el PR "está listo para merge" — la integración real ocurre cuando el cambio está **en `main`**
- **PR con migración (`prisma/migrations/*`): aplicarla en producción ANTES de mergear** (el merge despliega el código a Vercel de inmediato; si el código lee columnas que la base no tiene, `/dashboard` y `/pedidos` caen — incidente del 2026-10-14, #350). Orden: migración aditiva e idempotente en Supabase → verificar con una consulta de solo lectura que existe → recién entonces merge. La migración debe ser compatible con el código anterior (solo agrega, nunca renombra ni borra) para poder aplicarse antes del despliegue.

### 9. POST-MERGE INTEGRATION GATE
- desde un **worktree dedicado**, NO desde el checkout compartido `/home/cristof/Documents/bambu_demo_multimodelo` (hay otras sesiones Claude ahí; un `git checkout main` las rompe)
- `git fetch origin && git checkout main && git pull --ff-only origin main` (el `--ff-only` falla ruidosamente si `main` local divergió)
- `npx tsc --noEmit` · `npx eslint .` · `npm run test` · smoke / integration / E2E crítico cuando corresponda
- **confirmar `main` estable.** Solo entonces la fase está *integrada*. Si el gate falla (conflicto semántico que pasó el CI del PR): **activar de inmediato un plan de incidente/rollback compatible**, valorar `git revert` si no rompe migraciones, datos ni otros despliegues; no efectuar rollback destructivo automáticamente. Restaurar operación, verificar `main` y reabrir el trabajo.

### 10. CREAR LA SIGUIENTE RAMA
- exclusivamente desde el `main` recién actualizado y verificado (paso 9): `git checkout main && git pull --ff-only origin main && git checkout -b feat/nueva-fase`
- nunca sobre la rama de una fase anterior que ya debería estar integrada

### 11. INICIAR SIGUIENTE FASE
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
- Este flujo **no arregla** `Known Issues #20` (E2E flaky) — lo convive vía la regla de baseline del paso 6.
- **Fase con migración Prisma:** ver `Known Issues #12` — en dev el schema se sincroniza con `db push` (NO `migrate deploy`); en prod Supabase la migración se aplica aparte (vía MCP). El SQL de cada migración nueva debe ser idempotente.

