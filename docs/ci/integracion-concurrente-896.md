# #896 · Integración concurrente de PR sin CI infinito

Fecha de verificación: 2026-11-22. **Estado: PROPUESTA documentada; ningún mecanismo de merge ni ahorro en release está activado por este documento.** Revisión adversarial iterada (cinco rondas, incluidas las pruebas de release y el contraataque a las barreras de producción). Las restricciones nuevas de la auditoría **prevalecen sobre cualquier frase anterior** si hubiera tensión entre ellas.

## Hallazgo P0: despliegue anticipado con migración fallida (verificado 22/11)

**HECHO TÉCNICO ACTUAL, evidencia cruzada GitHub + Vercel:** para el mismo commit `ff4b20a95905b0ca9c8ff75d174613af5026f83f` (merge PR #971), se verificó:

| Evento | Momento UTC, 22/11/2026 | Evidencia |
|---|---|---|
| Inicio Vercel producción | 12:20:27.492 | Deployment `dpl_6rKEMDLZL4S5XEv8BtAW5Ycrbg7U` |
| Vercel READY con alias `portal.aguabambu.com` | **12:21:56.791** | mismo deployment |
| GitHub Prisma migrate falla | **12:22:16** (fin del run; error en `vercel whoami` 12:22:13.905) | [run 45021765496](https://github.com/casasleonj/bambu/actions/runs/45021765496) |
| CI de main concluye success | **12:40:09** | [run 45021765405](https://github.com/casasleonj/bambu/actions/runs/45021765405) |

El merge PR #971 incluía `prisma/migrations/20261122_gasto_anulacion_auditada_755/migration.sql` y `prisma/schema.prisma`. El job de migraciones **falló antes de aplicar una migración desde ese workflow** porque `VERCEL_TOKEN` no era válido. **Verificación adicional SOLO LECTURA en el proyecto Supabase conectado**: la tabla `public."Gasto"` incluye las cuatro columnas de la migración (`version`, `anuladoAt`, `montoAntesAnular`, `motivoAnulacion`), pero la consulta exacta a `public."_prisma_migrations"` no encontró registro de `20261122_gasto_anulacion_auditada_755`. Esto es evidencia de posible brecha de trazabilidad, **no demuestra** quién/qué aplicó esos campos ni prueba que la BD consultada sea efectivamente la usada por el proyecto Vercel en producción. Falta verificar correspondencia de entornos antes de clasificar como drift real de producción.

**BRECHA CRÍTICA:** ese candidato fue declarado READY y asociado al dominio de producción **antes** de que el CI completo finalizara y aunque el workflow de migración falló posteriormente. La configuración efectiva de Deployment Checks de Vercel **no es visible en los datos del proyecto consultados**: no inferir `enabled=false` por su ausencia en la API ni por `vercel.json`. Sin embargo la cronología + alias revelan que no hubo una barrera que detuviera esta liberación frente a aquel fallo de migración.

**CAMBIO DE PRIORIDAD SUSTANCIAL TRAS CUARTA AUDITORÍA:** antes de experimentar con omitir checks de release, hay que:
1. **HECHO PARCIALMENTE VERIFICADO:** en el único proyecto Supabase accesible, cuatro columnas de `Gasto` existen mientras que el nombre de la migración no figura en `_prisma_migrations`. Siguiente: confirmar asociación Vercel ↔ Supabase y reconciliar historia/esquema con permisos de solo lectura. No ejecutar `migrate resolve` ni DDL automáticamente.
2. Revisar Vercel Deployment Checks/auto-assignment/entornos y la protección del dominio de producción, con acceso al dashboard/administración cuando corresponda. Diseñar una barrera de **promoción** que dependa del CI y de la migración correspondiente, y comprobarla con fallo inducido **solo en entorno aislado**.
3. Recuperar de forma segura el flujo de credenciales del job de migración (rotar token por la persona autorizada, sin compartirlo por chat), revisar pinning de Vercel CLI y el orden/schema drift. Una migración fallida nunca debe quedar disfrazada de éxito de deploy.
4. Mantener estrictamente `CI gate (resumen)` de los PR; **no** introducir bypass de merge, deduplicación PR→main ni promoción hasta que la barrera esté comprobada.

Esta revisión no prueba daño real de datos, no modifica migraciones, esquema, deploy, variables ni reglas. **Estado: PENDIENTE crítico de mitigación y verificación.**

### Iteración 5: intentar romper la nueva barrera de producción

La evidencia del commit #971 obligó a **corregir el orden del plan**: la integridad del proceso de release precede a cualquier optimización que pueda reducir el tiempo de validación. El simple remedio «migrar primero y desplegar después» tampoco basta:

| Adversarial sobre la barrera corregida | Regla necesaria |
|---|---|
| Migración aplica, pero rompe la versión actualmente viva mientras Vercel espera | Migraciones expand/contract compatibles hacia atrás; antes del despliegue ejecutar solo expansión segura, y contracción en etapa posterior |
| Token corregido, pero el job apunta a otra cuenta/equipo/proyecto | Validar identidad team/proyecto, rama y commit exactos; secretos solo en entorno protegido. Nunca imprimir credenciales |
| Falló `_prisma_migrations`, pero una persona aplicó SQL manualmente | Inspección read-only de historia y esquema real; conciliación explícita antes de ejecutar; jamás reejecutar DDL por suposición |
| GitHub CI y migración pasan para commit A, pero Vercel va a promover B | Comprobar SHA de deployment, cabeza actual de `main`, resultado de CI, esquema requerido y contexto de entorno justo antes de dar alias |
| Vercel omite un Deployment Check porque no encuentra su script o no llega señal | Configurar un check **realmente requerido** y probar falta, error, timeout y fallo con un candidato sintético; nunca confundir ausencia con success |
| Vercel/GitHub emiten checks con el mismo nombre | Nombres/identidades únicos, revisar fuente de emisión para evitar colisiones y race conditions |
| Llega un commit nuevo mientras la versión anterior espera promoción | Serialización de promociones y control de obsolescencia, no permitir que el deployment viejo sobreescriba el nuevo |
| Una migración destructiva obliga a rollback de código | No dar por hecho rollback transaccional de DDL ni compatibilidad inversa; plan de recuperación y backup validado, sin DDL en pruebas aisladas |
| Una fusión docs-only activa CI y Vercel innecesariamente | Se puede optimizar trabajo documental después de demostrar barrera de release; no convertir paths o ignoreCommand en bypass del gate |
| Deployment Check bloqueante no está disponible/configurable para el proyecto | No simularlo con etiqueta o status informativo; mantener proceso manual de promoción con autorización y prueba verificable hasta resolver limitación |

**Convergencia revisada tras cinco rondas (orden por dependencia y riesgo):**

1. **R0 seguridad de producción:** analizar solo lectura la migración #971, verificar estado real de Deployment Checks/auto-alias en Vercel y diseñar barrera fail-closed que valide CI + esquema/migración + identidad del deployment. Sin tocar producción todavía.
2. **R1 medición de rendimiento:** obtener baseline que separe latencia vs. consumo y muestras equivalentes.
3. **R2 experimento de CI ligero:** build aislado por perfil, distribución segura entre shards en mismo run, sin menos tests y con rollback.
4. **R3 impacto en modo sombra:** cerrar evidencia de falsos negativos y alcance de specs, sin alterar gate.
5. **R4 concurrencia:** priorizar Merge Queue nativo sujeto a titularidad de organización e integraciones verificadas; si no, serialización strict y CI acelerado.
6. **R5 reuso PR→main:** solo si la identidad de candidato, control de promoción y resultados de ejecución hacen verificable el ahorro sin liberar código no certificado.

**Condición de parada:** nuevas hipótesis arquitectónicas no deben convertirse en requisitos sin experimentos de laboratorio y lecturas de configuración efectiva. Los escenarios restantes necesitan verificaciones empíricas: temporalidad real de checks de Vercel, `_prisma_migrations`, benchmarks comparables, activación nativa Merge Queue tras evaluación y fallos sintéticos. **La corrección de la barrera es P0 propuesto por exposición comprobada, no una prueba de incidente de datos.**

## Problema y objetivo

El usuario reporta un ciclo en el que los PR A y B completan CI en verde, A se fusiona y B vuelve a ejecutar toda la suite porque `main` avanzó. El objetivo es disminuir **latencia de fusión, runner-minutos y revalidaciones redundantes**, conservando la detección de incompatibilidades y sin permitir código no certificado en producción.

No confundir: (1) un nuevo `push` al mismo PR; (2) avance de `main` por otro PR; (3) nueva prueba `push` en `main`; (4) repetición de builds dentro de una ejecución. Son problemas distintos, con controles distintos.

## Hechos verificados (reposición actual)

- Ruleset de `main` [27807059](https://github.com/casasleonj/bambu/rules/27807059): activo, `strict_required_status_checks_policy=true`, requiere `CI gate (resumen)`; evita eliminación y no-fast-forward. **No desactivarlo como solución rápida.**
- `.github/workflows/ci.yml`: CI en PR y en push a `main`. En PR clasifica cambios documentales y distingue borradores; `concurrency` cancela intentos obsoletos de una referencia, no deduplica trabajo entre PRs independientes. El gate exige calidad, integración real y E2E aplicable.
- La matriz E2E tiene ocho shards. Cada shard realiza instalación/Prisma, `npm run build` y Playwright en su runner. El job Hub (V2 ON) también hace `npm run build`; hay hasta **nueve builds por ejecución full**. El build con V2 ON **no es intercambiable** automáticamente con V2 OFF: las variables `NEXT_PUBLIC_*` quedan incorporadas al build.
- [Selector sombra](./selector-impacto-sombra.md), `ci-impact-shadow.yml` y `scripts/ci/reuso-ci.mjs` ya existen. Su análisis y artefactos de deduplicación son **observacionales**, `canSkipRelease=false`. No duplicar ni convertir esos datos en autorización de merge.
- La regresión `ci-nightly.yml` ya está configurada y conserva separación del gate de release. No sustituye la certificación requerida antes de liberar.
- Ejemplos de ejecuciones consultadas: [PR #972 (aprox. 15 min)](https://github.com/casasleonj/bambu/actions/runs/45036618417), [main (aprox. 20 min)](https://github.com/casasleonj/bambu/actions/runs/45033674810), [main (aprox. 58 min)](https://github.com/casasleonj/bambu/actions/runs/45026219550). Muestras puntuales, **no** p50/p95 calculados.

## DECISIÓN DE DIRECCIÓN (PO 22/11) Y LÍMITE DE AUTORIZACIÓN

Continuar #896 como única iniciativa de CI adaptativo, conservando gates y evidencia verificable. Priorizar mejora del paralelismo y reducción de trabajo duplicado por etapas. El acuerdo de dirección **no autoriza** alterar el ruleset, desplegar, habilitar selección de pruebas para saltar gates ni ejecutar merge automático. La arquitectura de integración se conserva como **PROPUESTA** sujeta a pruebas adversariales.

## Diseño propuesto

### F1. Baseline y optimización de builds, sin reducir cobertura

1. Medir p50/p95 de `ready_for_review → merge`, duración por job, runner-minutos, cancelaciones, número de compilaciones, coste y fallos de baseline, usando historial suficientemente representativo.
2. **HIPÓTESIS, no optimización demostrada:** probar, de manera controlada y reversible, un build por perfil efectivo para los ocho shards y el Hub, **únicamente dentro del mismo workflow run y mismo candidato de merge**. Perfiles no se reducen ciegamente a ON/OFF: se incluyen todos los `NEXT_PUBLIC_*`, también `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR`, y los overrides de `workflow_dispatch`. No publicar artefactos de PR en un flujo privilegiado de deployment. Generar un archivo empaquetado de rutas explícitas del build standalone (no un `include-hidden-files:true` indiscriminado), comprobar integridad, manifiesto, contenido, permisos y ausencia de secretos antes de distribuir a shards. Validar `public/`, `.next/static/`, Prisma y runtime del servidor. Mantener PostgreSQL, Redis y fixtures aislados por shard, con el mismo número de tests/flags/assertions.
3. Evaluar dos métricas separadas: **latencia en el camino crítico** y **runner-minutos totales**. El patrón build `needs` → shards crea una barrera serial y puede ser más lento que nueve builds paralelos. Comparar variantes A/B sobre commits equivalentes con múltiples muestras y dispersión; mantener la variante actual si el nuevo grafo empeora p95 o confiabilidad. **No modificar tests ni asserts del producto para obtener ahorro.**

### F2. Selector de pruebas por impacto, modo sombra

Aprovechar `#901` integrado: medir falsos negativos, cobertura exacta por entorno, rol, flag y dependencias transitivas. Tests compartidos, API/Prisma, Caja/Finanzas/Inventario, auth, infra/fixtures y cambios ambiguos fuerzan cobertura conservadora. Un resultado sin tests esperados es error. El modo sombra jamás certifica release.

### F3. Validar PRs concurrentes como combinación exacta

Se deben separar **certificación de PR individual** y **certificación del candidato de integración**. La confirmación de PR A verde + PR B verde no prueba automáticamente A+B.

**Alternativa preferida, condicionada:** GitHub Merge Queue **solo** si el repositorio pasa a ser público de organización o cumple las condiciones vigentes de GitHub para la característica. Hoy `casasleonj/bambu` pertenece a una cuenta personal: **no dispone de Merge Queue nativo en esa titularidad**. Antes de recomendar traslado hay que auditar integraciones de Vercel, Supabase, Sentry, GitHub Apps, OAuth, secrets, webhooks, dominio, ramas protegidas, redirects y rollback; no ejecutar traslado como parte de CI. Una vez habilitado, configurar un único check requerido que se emita en `pull_request` y `merge_group`, validar el candidato exacto y probar lotes de tamaño inicial uno; crecer a dos **solo** con evidencia de estabilidad. Un `merge_group` no debe quedar con required check pendiente por falta de trigger.

**Alternativa práctica sin cambiar titularidad (por ahora):** **serialización conservadora bajo `strict=true` y gate actual**; preparar/validar un PR cada vez, cancelar intentos obsoletos, acelerar la suite y evitar commits meramente administrativos. Puede seguir requiriendo nueva certificación cuando avanza `main`: reconocer esta limitación expresamente. Una cola casera con rama temporal es **DESCARTADA como implementación inmediata**, porque su check no equivale automáticamente al estado requerido de los PR originales; una excepción al ruleset o un push directo abrirían una brecha de seguridad. Retomarla solamente con demostración independiente de identidad, atomicidad, source-check, permisos y ausencia de bypass.

### F4. Duplicación PR → push y despliegue

Distinguir validar un mismo árbol de ejecutar otra certificación sobre otro SHA. GitHub `pull_request` verifica normalmente un **test merge commit**; `head.sha` por sí solo no identifica ese candidato. Comparar SHA de merge/candidato, padres, árbol, base, perfil exacto, configuración/lockfile, workflow/selector, resultados y fuentes de status. Reutilización PR→push de `main` sigue **no habilitada** incluso si el árbol coincide: un merge squash/rebase cambia el commit y Vercel puede compilar otro candidato con otro entorno. Artefacto sombra, caché y check de otra base no certifican release. Revisar el proyecto Vercel **desde configuración efectiva**, porque `vercel.json` no prueba por sí solo si están habilitados Deployment Checks. Corroborar secuencia de Prisma, deploy y promoción; ningún skip de CI postmerge sin evidencia de la barrera efectiva. Evitar nombres de check duplicados entre GitHub/Vercel.

## Casos adversariales obligatorios

| Escenario | Esperado |
|---|---|
| PR A (gastos) y B (pedidos) cambian distintos archivos, pero comparten validador/import indirecto | Detectar dependencia, no declarar independencia por rutas |
| PR A y B pasan aislados pero falla su unión | Bloquear candidato; no generar falso verde |
| `main` avanza durante la validación de candidato | Invalidar/rehacer comprobación de identidad; nunca merge sobre evidencia obsoleta |
| Cancelación de un PR tras push nuevo | Cancelar solo la referencia obsoleta; no cancelar verificación de otro candidato |
| Múltiples PR con mismo archivo, rename, symlink o diff no legible | Escalamiento conservador y resolución de conflicto |
| Flags V2 ON/OFF | Generar y validar artefactos separados |
| Cambio de Prisma, auth, caja, cartera, dinero, offline, workflows o tests | Cobertura ampliada/full según política, sin atajo manual |
| Falla de descarga de build, checksum incorrecto, artifact missing | Fallar job, nunca ejecutar E2E sobre build parcial |
| Cambios de lockfile/entorno/versiones, o selector modificado | Invalidar reutilización previa |
| Fallo del deployment/migración, incluso con CI verde | Mantener bloqueo de promoción y trazabilidad del incidente |


## Auditoría adversarial iterada (22/11/2026)

### Iteración 1: romper la primera propuesta

**Sesgos detectados:**
- **Sesgo de disponibilidad:** se presentó una cola personalizada como sustituto de Merge Queue sin probar que los checks del candidato temporal satisfacen la protección de los PR originales. **Cambio sustancial:** descartar la cola propia inmediata; sin traslado, serializar bajo strict.
- **Sesgo de capacidad/CPU:** pasar de nueve builds a dos no demuestra reducir latencia: los jobs actuales trabajan en paralelo y con build compartido todos esperan `needs: build`. **Cambio:** ensayo A/B sobre la ruta crítica, no inferencia por conteo de builds.
- **Sesgo de independencia por rutas:** ausencia de conflictos Git no garantiza independencia semántica (importaciones indirectas, límites de dinero, sesiones, esquema). **Cambio:** validar unión y riesgo real.
- **Sesgo de muestra:** duraciones puntuales de 15/20/58 min no son p50/p95 ni permiten fijar una meta de ahorro. **Cambio:** instrumentación y distribución real por tipo de PR y job.

**Ambigüedad eliminada:** `strict` de ruleset es una protección de **merge**, no una promesa de que el deployment haya esperado los jobs en `main`. El gate de CI no certifica migraciones ni configuración efectiva de Vercel. Una rama temporal no hereda automáticamente el estado exigido por `main`.

### Iteración 2: intentar romper la propuesta corregida

1. **Artefacto oculto/incompleto:** GitHub `upload-artifact@v4` excluye archivos ocultos por defecto, y el build Next standalone está en `.next`. Si se activa indiscriminadamente `include-hidden-files`, podrían colarse `.env` u otros secretos. **Mitigación:** `tar` con allowlist explícita y validación de inventario/manifiesto; no habilitar glob de todo el repositorio. Mantener permisos y verificar checksum tras descarga.
2. **Parámetros diferentes al build:** Hub V2 ON incluye `NEXT_PUBLIC_PEDIDOS_V2=true` y `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR=true` en el paso de build; los defaults del job legacy y `workflow_dispatch` varían. **Mitigación:** identidad por conjunto **completo** de variables efectivas y entorno, nunca alias simplista ON/OFF.
3. **Arranque de servidor desde paquete:** el `output: standalone` exige `node .next/standalone/server.js` y copiar `public` y `.next/static`. Reempacar mal rompe UI o provoca falsos negativos. **Mitigación:** smoke real del build desempaquetado y comprobación de hash/archivos antes de Playwright.
4. **Construcción dependiente de secreto:** cada shard genera `NEXTAUTH_SECRET` antes del build; un build desacoplado puede cambiar el momento de fijarlo. **Mitigación:** comprobar primero si el secreto es consumido al compilar o solo en runtime; mantener secretos de autenticación por job, nunca empaquetarlos.
5. **Colisión o envenenamiento de artefactos:** un artifact de PR no es entrada confiable de deploy privilegiado; `workflow_run` y caches compartidas son superficies de ataque. **Mitigación:** solo artefactos **dentro del mismo run no privilegiado**, IDs de upload outputs inmutables, checksum/verificación, `permissions: contents:read`, sin `pull_request_target` ni secretos de producción. Cualquier fallo aborta.
6. **Misma base, distinto código probado:** en `pull_request`, `GITHUB_SHA` referencia el merge de prueba, no necesariamente `head.sha`. Si avanza `main`, el head no cambia pero el merge de prueba sí. **Mitigación:** manifest con test-merge SHA, parents/base y candidato exacto; revalidar cuando no coincidan.
7. **Más workers, menos aislamiento:** `playwright.config.ts` explica que workers>1 producen carreras de sesiones por reset de BD. **Mitigación:** mantener 8 shards con `workers=1` hasta demostrar aislamiento real por worker; no inflar paralelismo para compensar tiempos.
8. **Comportamiento de Vercel desconocido:** `vercel.json` no contiene un guard de release, pero Deployment Checks pueden estar en dashboard. **Mitigación:** tratar protección efectiva de promoción como **PENDIENTE DE VERIFICACIÓN**, no afirmar que está activada/desactivada.
9. **Fuente del check alterada:** cambios de workflows, script de gate o checks externos pueden producir un status verde engañoso. **Mitigación:** proteger paths de política con review específica, identidad de aplicación emisora y cambio conservador de gate. No aceptar metadata arbitraria en el artifact.

### Iteración 3: romper los controles de la segunda iteración

| Contraejemplo | Cómo rompe el diseño mejorado | Salvaguarda final |
|---|---|---|
| Build único tarda más en subir/bajar que ocho builds paralelos | El ahorro de runner-minutos empeora p95 del desarrollador | Pilotar ambas variantes con mismo código, revertir si p95 o flake empeora |
| Un artefacto empaquetado contiene `.env` por un symlink / archivo generado | Se filtra secreto incluso con nombre de tar inocente | Revisar árbol real, symlinks, archivos permitidos, tamaño y contenido sensible; no publicar hasta validación |
| Check principal falla pero `continue-on-error` aparenta job verde | Resultado nominal confunde certificación real | Verificar `suite_ok`, steps exigidos y resultado de gate; no usar solo `conclusion` |
| Dos PR son verdes individualmente y rompen juntos una consulta PostgreSQL | Tests aislados insuficientes | Candidato combinado con integración real, E2E y escenarios de datos sintéticos |
| PR A entra en cola, B cambia, C fusiona a `main` | Resultado del lote queda obsoleto | Verificar SHA/árbol/padres del candidato en una operación atómica o dejar que Merge Queue nativo lo gestione |
| Nueva `merge_group` no dispara gate obligatorio | Check queda eternamente pendiente | Prueba end-to-end con `on: merge_group`, nombre único y check exigido; probar caso fail/timeout |
| Batch de 5 PR falla por uno de ellos | Ahorrar CI individual crea colas lentas y aislar el fallo cuesta más | Empezar con batch=1, medir; ampliar a 2 solo con evidencia y aislamiento de fallos, establecer límite de espera |
| Una actualización bot usa `GITHUB_TOKEN` y no desencadena el flujo esperado | La cola queda pendiente o parece inactiva | Comprobar causalidad/eventos, no asumir que todo push del bot dispara Actions; validar permisos y trigger real |
| Transferir repositorio para usar Merge Queue rompe Vercel o integración GitHub App | Se acelera CI pero se interrumpe producción | Ensayo/reversión de titularidad e integraciones, responsable y ventana aprobada antes de migrar |
| Pasan los tests en candidato GitHub, Vercel reconstruye con distintas variables | El artefacto certificado no es el que ejecuta producción | Identidad de deploy + verificación explícita de flags/entorno, deployment check obligatorio antes de alias/promoción |
| Se mezcla smoke nocturno con gate de release | Un skipped/verde tardío enmascara un fallo actual | Identidades y check names distintos; nightly no sustituye merge gate |
| Al hacer squash se conserva el árbol pero cambia SHA | Reutilizar resultado por árbol exclusivamente ignora entorno, origen y política | Registrar equivalencia completa como hipótesis, nunca activar bypass hasta probar autorización de promoción |
| El selector clasifica mal SQL dinámico o una dependencia no importada | Omite una regresión financiera | Full conservador para dinero, inventario, Prisma, permisos, offline, CI o dependencias inciertas |
| Despliegue comienza después del merge pero antes de las pruebas de `push` | CI correcto a destiempo no protege producción | Guard de promoción efectivo, no confiar solo en CI de PR |

### Resultado de convergencia: política mejorada

**PROPUESTA CONVERGIDA, AÚN NO IMPLEMENTADA:**

- **C0: conservar seguridad actual.** `strict=true` y `CI gate (resumen)` siguen activos. Nada de bypass, cambio de ruleset, merge automático, secretos de producción ni reducción de cobertura; mantener PR #976 como documental.
- **C1: medir antes de optimizar.** Separar tiempo por commit, runner-minutos, tiempo en cola, build, CI PR, CI push, y tiempos posteriores al merge. Revisar estado real de Vercel/migraciones como dependencia bloqueante de cualquier release gate nuevo.
- **C2: ensayo de build compartido dentro del mismo run.** Dos o más artefactos **por perfil efectivo**, sin reutilizar entre PRs ni en despliegue; benchmark A/B y rollback explícito. También medir alternativa más sencilla de evitar instalaciones repetidas y pinning de versiones sin cambiar semántica.
- **C3: acabar modo sombra de selector.** Comparación automática por ID de test, proyecto, flags y candidato, con falsos negativos adversariales. No activar omisiones todavía.
- **C4: fusiones concurrentes.** Para eliminar de verdad la revalidación de ramas, evaluar traslado seguro a organización y Merge Queue nativo, en fase/decisión aparte. Hasta entonces, flujo serial `strict` + CI más eficiente. No introducir cola casera.
- **C5: promoción segura.** Investigar primero si Vercel tiene deployment checks requeridos y si Prisma migración/producción quedan ordenados; **no** usar omisiones PR→push ni confiar en checks de GitHub como control de dominios de producción.

**Criterio de detener iteración:** tras las rondas 2 y 3, los riesgos restantes derivan de datos que no pueden concluirse con análisis documental (rendimiento de artefactos, configuración efectiva de Vercel, viabilidad de titularidad y comportamiento de Actions real). Proponer más mecanismos sin medir esos hechos sería complejidad especulativa. El siguiente aprendizaje de alto valor es **un ensayo controlado con datos sintéticos y CI real**, manteniendo política vigente.

### Evidencia externa de las correcciones

- [GitHub: Merge Queue y `merge_group`](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub: eventos PR y test merge SHA](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub: artifacts ocultos y permisos](https://github.com/actions/upload-artifact)
- [Next.js: standalone, `public` y `.next/static`](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [OWASP: GitHub Actions security](https://cheatsheetseries.owasp.org/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.html)
- [Vercel: Deployment Checks](https://vercel.com/docs/deployment-checks)
- [GitHub: transferencia de repositorios](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)


## Criterios de aceptación de un futuro PR funcional

- Comparación documentada antes/después con muestras equivalentes, sin extrapolar de un único run.
- E2E V2 OFF (ocho shards) y Hub V2 ON pasan con **los mismos specs/assertions** y sin escrituras en producción.
- Pruebas unitarias del planificador/identidad/artefactos; mutaciones sintéticas que demuestren que la política bloquea errores sembrados.
- Pruebas reales de GitHub Actions: 2 PR disjuntos, 2 PR conflictivos, nuevo push durante cola, fallo de CI, avance de `main`, rollback y cancelación.
- Evidencia de guardas de producción, especialmente migración/CI en Vercel. No fusionar si esta barrera no puede verificarse.
- Revisión de cambios del ruleset en una etapa explícita y separada. Nunca hacer `strict=false` silenciosamente como prueba de concepto.
- Un PR por fase, con instrucciones de rollback. No fusionar por el mero hecho de documentar este plan.

## Referencias

- [Issue central #896](https://github.com/casasleonj/bambu/issues/896)
- [GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub Required Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Investigación Google sobre regression test selection](https://research.google/pubs/techniques-for-improving-regression-testing-in-continuous-integration-development-environments/)
- [Selector sombra #896](./selector-impacto-sombra.md)

**Estado final de este documento:** DIAGNÓSTICO + PROPUESTA. No se ha cambiado la semántica del producto ni los gates.
