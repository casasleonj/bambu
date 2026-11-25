# Gates de merge y producción (#703)

## Estado vigente verificado — 2026-11-22 (supersede afirmaciones de 08–09/11)

**ESTADO TÉCNICO ACTUAL:** El ruleset de repositorio [«Protección main - CI obligatorio.»](https://github.com/casasleonj/bambu/rules/27807059), creado el 21/11, está activo sobre la rama predeterminada y exige el status `CI gate (resumen)` con `strict_required_status_checks_policy: true`. También impide borrado y actualizaciones no fast-forward, y exige PR. La API heredada `branches/main/protection` devuelve 403 a esta integración; **ese 403 no significa que no haya ruleset**. Verificado mediante la lectura de `repos/casasleonj/bambu/rulesets/27807059` el 22/11. **La tabla histórica «Qué existe hoy» de abajo describe únicamente la fotografía del 08/11 y NO la configuración vigente.**

**HECHO:** `.github/workflows/ci.yml` conserva CI para `pull_request` y `push` a `main`, con ocho shards E2E y un job E2E Hub (V2 ON). Cada shard y el Hub ejecutan `npm run build` por separado en sus runners. El modo sombra `ci-impact-shadow.yml` no autoriza omitir gates. El resumen del CI actual exige resultado real de integración (`suite_ok=true`) aunque su job se configure como informativo, por lo que la tabla histórica de «lint, integration» tampoco es autoridad vigente.

**BRECHA DOCUMENTAL CORREGIDA:** esta sección declara explícitamente la evidencia más reciente; se conservan intactos los antecedentes y decisiones anteriores con fecha para mantener trazabilidad.

**PROPUESTA NO IMPLEMENTADA:** [#896](https://github.com/casasleonj/bambu/issues/896) analiza reducción de CI repetido y PRs concurrentes. Ver [plan de integración concurrente](./integracion-concurrente-896.md). Ningún cambio de este documento habilita merges sin checks, reemplaza el ruleset ni certifica el despliegue en Vercel.

---


Estado verificado el 2026-11-08 con `gh api` (solo lectura).

## Qué existe hoy

| Pieza | Comportamiento |
|---|---|
| Protección de `main` | **Ninguna**: `protected: false`, sin rulesets (`repos/…/rulesets` → `[]`) y sin checks requeridos. Un PR se puede fusionar con el CI en rojo. |
| `ci.yml` | Corre en `push` a `main`, `pull_request` y `workflow_dispatch`. Ya no hay cron (se retiró el soak del Hub, #703). |
| `quality` (tsc + unit) | Exigido por `ci-gate`. |
| `e2e` (8 turnos) | Exigido por `ci-gate` salvo que el diff sea declarativo (`detect-changes` → `e2e_required=false`): `docs/**`, `AGENTS.md` y Markdown de `.agents/skills/**` o `.claude/skills/**` (#778). |
| `e2e-hub` (V2 ON) | Exigido por `ci-gate`. Se conserva: producción corre con `NEXT_PUBLIC_PEDIDOS_V2=true` y `e2e` prueba V2 OFF. Su retiro es F10b (#312). |
| `lint`, `integration` | Informativos (`continue-on-error`); `ci-gate` los lista sin bloquear. |
| `migrate-deploy.yml` | Corre en `push` a `main` si cambian `prisma/schema.prisma` o `prisma/migrations/**`, **sin esperar al CI**. Usa `vercel@latest`. |
| `migrate-recover.yml` | Solo `workflow_dispatch` en `main`, entorno `production` (#1017). Registra UNA migración ya aplicada pero ausente de `_prisma_migrations`, tras verificar ledger y objetos; sin DDL. Procedimiento en `docs/deploy-migraciones.md`. |
| Despliegue en Vercel | La integración Git despliega cada merge a `main` sin depender del CI (no se pudo consultar la configuración del proyecto desde esta sesión). |

## `ci-gate` (nuevo)

Job `CI gate (resumen)`, siempre se ejecuta (`if: always()`). Falla si `detect-changes`, `quality` o `e2e-hub` no terminan en `success`, o si `e2e` no termina en `success` cuando `e2e_required == 'true'`. Un job omitido, cancelado o con salida vacía **no** cuenta como éxito. Probado con 9 escenarios simulados del script (verde, `failure`, `skipped` con E2E requerido, `cancelled`, docs-only, `e2e_required` vacío, etc.).

## Decisiones que quedan para el PO (no se aplicaron)

1. Activar protección de `main` y marcar **solo** `CI gate (resumen)` como check requerido. No marcar los `E2E (n/8)` individuales: un matrix omitido no genera esos nombres y dejaría PRs colgados (actions/runner#952). Hoy el E2E tiene fallos de baseline (`dlq-4xx`, `productos-comprehensive`…), así que exigirlo bloquearía merges hasta estabilizarlos; considerar exigirlo primero solo en `quality` + `e2e-hub`.
2. Ordenar migración → despliegue: hoy `migrate-deploy` y Vercel arrancan a la vez al fusionar. Opciones: `workflow_run` tras el CI, o mantener la regla manual de AGENTS.md (migración en producción **antes** del merge).
3. Fijar la versión de `vercel` en `migrate-deploy.yml` en vez de `@latest`.

## Reversión

`ci-gate` es un job aparte: revertir su bloque no afecta al resto. El cron se restaura agregando de nuevo un bloque `schedule` en `on:`.


## Actualización 2026-11-09 (#703): protección de `main` y orden migración → despliegue

### Protección de `main` — pendiente de activar por el PO
La sesión de Claude **no puede escribir** la protección (GitHub responde 403 «Write access … not permitted through this proxy»). Para activarla: GitHub → Settings → Branches → *Add branch ruleset / protection rule* sobre `main`, con:
- **Require status checks to pass:** `Type check + Tests`, `E2E Hub (V2 ON)` y **`Detect change scope (docs-only vs. executable)`** (los tres corren siempre, también en PRs solo de documentación, y han sido fiables). El tercero es obligatorio desde #778: es el job que ejecuta las pruebas del clasificador y decide si se omite el E2E; si falla solo, `ci-gate` lo marca, pero mientras `ci-gate` no sea requerido un PR podría fusionarse con el clasificador roto y el E2E omitido. **No** marcar los `E2E (n/8)` ni `Agent Instructions Audit` (este solo corre al tocar `AGENTS.md`: quedaría pendiente para siempre en otros PRs). `CI gate (resumen)` se puede sumar cuando el E2E se estabilice.
- Sin exigir revisiones ni «Do not allow bypassing» (el PO puede seguir fusionando); bloquear *force pushes* y borrado de `main`.
- Equivalente por línea de comandos: `gh api -X PUT repos/casasleonj/bambu/branches/main/protection` con `{"required_status_checks":{"strict":false,"contexts":["Type check + Tests","E2E Hub (V2 ON)","Detect change scope (docs-only vs. executable)"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}`.

### Orden migración → despliegue — script listo, **sin activar**
`scripts/vercel-ignore-build.mjs` (con 13 pruebas en `scripts/__tests__/vercel-ignore-build.test.ts`, incluida la comprobación de que fallan si la lógica se rompe) es un *Ignored Build Step* de Vercel (`ignoreCommand` de `vercel.json`; salida 1 = construir, 0 = cancelar, según la documentación de Vercel). En producción, si el commit toca `prisma/schema.prisma` o `prisma/migrations/**`, espera hasta 12 min a que `migrate-deploy.yml` termine en `success` **para ese mismo commit**; si falla, no aparece o se agota el tiempo, cancela el despliegue (el código nuevo no sale; se reintenta con *Redeploy*). Commits sin migración y vistas previas no cambian.

**Por qué no está activado:** `migrate-deploy.yml` falla en TODAS sus ejecuciones recientes (15 seguidas, desde 2026-10-26) con `The token provided via the --token option is not valid` (secreto `VERCEL_TOKEN` inválido). Activar el `ignoreCommand` hoy cancelaría para siempre todo despliegue con migración. Antes de enchufarlo hay que:
1. Que el PO genere un token nuevo (vercel.com/account/tokens, de una cuenta con acceso al equipo) y lo guarde como secreto `VERCEL_TOKEN` en GitHub.
2. Verificar con seguridad que `prisma migrate deploy` contra producción es correcto: si las migraciones posteriores a julio se aplicaron a mano (MCP) y no figuran en `_prisma_migrations`, el workflow intentaría reaplicarlas. Comparar `_prisma_migrations` con `prisma/migrations/` (consulta de solo lectura) y, si difieren, registrar con `prisma migrate resolve --applied <nombre>`.
3. Entonces agregar a `vercel.json`: `"ignoreCommand": "node scripts/vercel-ignore-build.mjs"` (opcionalmente `GITHUB_TOKEN` de solo lectura en Vercel para no depender del límite anónimo de la API de GitHub).

Hasta entonces sigue vigente la regla manual de AGENTS.md (Flujo de Entrega, paso 7): aplicar la migración en producción **antes** de fusionar.


## #896 — fase piloto: feedback de borrador y certificación (propuesto para esta rama)

El estado del 08–09/11 anterior es histórico. Este cambio de código no demuestra
que `main` tenga protección efectiva ni que Vercel espere por una certificación.

- Por defecto no se cambia la cobertura E2E de los PR: ausencia de
  `BAMBU_CI_896_DRAFT_PILOT=true` conserva la política #778. La decisión
  `draft_candidate` se registra en el log sin usarla para omitir pruebas.
- **No habilitar todavía** la variable del repositorio
  `BAMBU_CI_896_DRAFT_PILOT`. Primero verificar reglas efectivas de GitHub,
  actualizar la base del candidato, exigir el check estable `CI gate (resumen)`
  sin bypass administrativo no autorizado, comprobar protección de cambios al
  propio workflow y controles de despliegue; ejecutar casos del piloto aislado.
- Con el piloto habilitado, únicamente se difiere E2E en un PR que GitHub
  identifica como borrador en opened/synchronize/reopened, con diff no vacío,
  legible y formado por cambios A/M/D de archivos normales en src/ o docs/.
  Renames, symlinks, modos ejecutables, e2e/, scripts/, prisma/, configuración
  y demás rutas fuera de esas dos áreas conservan E2E. No es una clasificación
  por riesgo del producto: incluso un cambio de negocio de src/ debe completar
  todas las pruebas requeridas antes de liberar. El gate del borrador diferido
  falla explícitamente como **pendiente de certificación**, no como falso verde.
- Abrir un PR directamente listo para revisión, synchronize/reopened no-draft,
  ready_for_review, push a main y dispatch conservan la exigencia E2E definida
  por #778. Un ready_for_review ejecuta la validación de nuevo, incluso con el
  piloto OFF, para no confiar en una corrida antigua. Esto puede sumar una
  ejecución durante la transición: medir coste antes de habilitar el piloto.
  Los grupos de concurrencia de borrador y normal se separan para que una
  reejecución antigua de borrador no cancele un candidato listo.
- El check de integración conserva su nombre histórico por compatibilidad,
  y conserva temporalmente continue-on-error a nivel de job por compatibilidad,
  pero el gate exige el resultado real suite_ok=true del paso Vitest y el
  resultado success del job. Un fallo de integración ya NO certifica CI verde.
  Lint sigue siendo informativo en CI ordinario y bloqueante en nightly_full.
  No se eliminan specs ni se cambian flags/proyectos E2E. La estabilización
  del fixture E10 se implementa por separado en el PR #907 (Refs #882).
- Reversión del piloto: variable ausente o distinta de true y nueva validación
  del candidato; revertir los cambios de código si hace falta. No revertir datos.
- Alcance de esta fase: solo preparación, comparación de resultados y
  feedback de borrador y gate de integración verificable. La regresión
  nocturna y la observación de deduplicación YA están en main por #905;
  el selector de dependencias permanece en el PR #901 (modo sombra, sin
  permisos para omitir). No activa promoción protegida, selección E2E activa,
  reutilización de suites PR→main ni build compartido. Nunca usar un éxito
  de borrador como comprobante de promoción.

Comprobación local: `node --test scripts/ci/__tests__/politica-ci.node.test.mjs`.
Validar además GitHub Actions con PR docs-only, código, borrador piloto OFF y,
solo con autorización y aislamiento, borrador piloto ON + ready_for_review,
diff incompleto, cancelación y fallo real de integración. Verificar identidad
del SHA/base y check requerido, no solo conclusión nominal del workflow.

La protección de rama de main figuraba desactivada en el endpoint GitHub
branches/main al preparar esta fase; ningún workflow puede por sí solo impedir
que alguien con permisos de escritura fusione sin esperar checks si el
repositorio no exige el `CI gate (resumen)`. Configurar required check y
restricción de push/promoción es una acción de administración separada;
**no se debe declarar hecha ni usar este piloto para sustituirla**.


## 2026-11-21 · CI progresivo, PR de activación (fase condicionada)

- **HECHO comprobado:** la lectura de `branches/main` indica `protected:false` y la API de protección devuelve 403 para esta integración. Las reglas efectivas de aprobación y checks requeridos no pueden verificarse/configurarse por aquí. Por tanto **no fusionar el PR de activación** hasta habilitar y comprobar protección real de `main`, con `CI gate (resumen)` requerido. El gate que falla en un borrador NO protege por sí solo un repositorio sin branch protection.
- **DECISIÓN de diseño:** borrador apto (#896: diff normal A/M/D, restringido a `src/` o `docs/`, legible, no vacío) ejecuta TypeScript, unitarias, lint e integración; difiere 8 shards y E2E Hub. El `CI gate (resumen)` reporta failure intencional «pendiente de certificación» para impedir falso verde.
- **Certificación:** `ready_for_review` lanza el workflow completo con la misma política de clasificación #778; el E2E exigible y Hub deben aprobarse junto a calidad e integración. PR abierto directamente listo, nuevos commits, reabiertos, `push` a `main`, dispatch y regresión nocturna mantienen su cobertura.
- **Excepciones conservadoras:** cambios en tests, CI, infraestructura, Prisma, dependencias, renames/symlinks/modos, diff incierto o rutas fuera del allowlist corren full **también en borrador**. En esos casos salir de borrador puede repetir full (siguiente optimización requeriría reutilización verificable del candidato exacto, todavía no implementada).
- **Rollout:** el workflow propone `BAMBU_CI_896_DRAFT_PILOT` activo por defecto; valor exacto `false` deshabilita el diferimiento como interruptor de emergencia, pero deja el evento de certificación (podría repetir CI completo). No activar ni mergear esta versión hasta protección, pruebas adversariales y QA de Actions con PR draft→ready, sincronizaciones y `main` actualizado. `CI impact shadow` no repite cálculo por transición sin cambios.
- **Control de aceptación:** confirmar CI gate requerido en GitHub, run de borrador con E2E deliberadamente saltados y gate NO verde, run tras `ready_for_review` con E2E exigibles en verde, y que un nuevo commit invalida la certificación anterior. Registrar mediciones reales de ahorro. No equiparar pruebas de política locales con pruebas reales del pipeline. No modificar flags ni pruebas del producto.
