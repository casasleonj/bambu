# #1023 · Línea base y piloto de integración

**Estado: HECHO — línea base medida; DECISIÓN PO — procedimiento y piloto aprobados; PENDIENTE — integración de esta ampliación, observación del piloto y comparación posterior. No es una certificación de ahorro.** Base histórica de la medición `a44a55f978220bbce4e4b56809673633d81e6760`; base inicial de implementación `6f81666a0fc274515b35f80729452c9cd8e9fc3c`; base reconciliada tras #1027 `e2981f85e31da7b40ac06a0720f45589c8707587`.

## Alcance y autoridad

El PO aprobó el procedimiento y el piloto tras revisar la propuesta, el parche y esta línea base ([registro en #1023](https://github.com/casasleonj/bambu/issues/1023#issuecomment-7170432955)). La regla inicial ya llegó a main en #1024; esta ampliación se incorpora a la misma [sección 5.1 del flujo canónico](../agentes/flujo-entrega.md), sin política paralela ni otro backlog. Esta fase cambia documentación y evidencia, conservando CI, permisos, rulesets, variables, despliegues y código ERP. El coordinador inicial es el PO, delegable expresamente a una única persona o agente. El piloto real no se da por iniciado por publicar este documento: comienza con la primera solicitud/concesión registrada una vez integrado y verificado el procedimiento.

## Fuentes y ventana

- API GitHub REST de `casasleonj/bambu`, workflow `.github/workflows/ci.yml`, ejecuciones **creadas** entre `2026-11-18T16:49:08Z` y `2026-11-25T16:49:08Z`. Las ejecuciones antiguas reintentadas dentro de esa semana quedan fuera de esta cohorte; no se presenta como consumo de toda la cuenta.
- 755 ejecuciones `pull_request` y 81 `push` a `main`; 834 completas y 2 en progreso al recoger el listado. Se obtuvieron jobs paginados de las 834 completas, `filter=all`, incluidos intentos; sin errores de cobertura después de reintentar una lectura fallida. Hay 8295 registros de jobs.
- 81 PR fusionados en la misma ventana. Timeline completo de `ReadyForReviewEvent`/`ConvertToDraftEvent`: 42 tienen evento de listo; en 39 se infiere apertura sin borrador por ausencia de ambas transiciones en su historial completo. La inferencia se marca individualmente, no se inventa un evento.
- Ruleset [27807059](https://github.com/casasleonj/bambu/rules/27807059), lectura 25/11: activo, `strict_required_status_checks_policy=true`, requerido `CI gate (resumen)` emitido por integración 15368. No se modificó. La lectura de la variable del piloto de borradores devolvió 403: no se presume su valor ni se depende de él.
- Se ejecutó el medidor existente `scripts/ci/baseline-ci.mjs`; el análisis suplementario conserva nearest-rank con dos decimales, mientras ese medidor redondea a uno. Sus **12/12 pruebas existentes pasaron**, `node --test scripts/ci/__tests__/baseline-ci.node.test.mjs`, exit 0. Ese módulo mide `created_at→updated_at`, no jobs ni listo→merge. La ampliación de datos de este estudio es de solo lectura y no instala otra plataforma de métricas.

Datos públicos seleccionados, sin autores/correos, logs, cuerpos de conversación ni credenciales: [runs](./evidencia-1023-2026-11-25/runs.csv), [jobs](./evidencia-1023-2026-11-25/jobs.csv), [PR](./evidencia-1023-2026-11-25/prs.csv). Cada fila conserva identificadores, timestamps y enlace verificable. Celdas vacías significan no medido/desconocido, no cero.

## Resultado observado (antes)

| Métrica | PR | Push main |
| --- | ---: | ---: |
| Ejecuciones | 755 | 81 |
| Aprobadas | 229 | 66 |
| Fallidas | 65 | 0 |
| Canceladas | 459 | 15 |
| En progreso en el listado | 2 | 0 |
| Cancelaciones entre completas | 61,0% | 18,5% |
| p50 duración de workflow aprobado, min | 24,87 | 18,87 |
| p95 duración de workflow aprobado, min | 82,65 | 33,10 |
| Minutos observables de jobs con intervalo válido | 47.139,03 | 10.269,45 |
| De ellos, en ejecuciones canceladas | 9.822,93 | 1.291,82 |
| Pasos de build no omitidos con inicio informado | 3197 | 713 |

**No son ahorros demostrados.** Una cancelación puede ser corrección legítima de código, preparación de evidencia o sustitución de un intento obsoleto. El p50 de workflows PR cancelados es 1,3 min; no equivale a desperdiciar una suite completa por cancelación. Runners estándar observados: `ubuntu-latest` y `ubuntu-24.04`. No se auditó facturación; no se multiplica tiempo por una tarifa para inventar gasto.

| Tiempo de PR (81 fusionados) | p50, min | p95, min |
| --- | ---: | ---: |
| Último listo técnico de GitHub → merge | 56,72 | 1.036,27 |
| Creación → merge | 143,12 | 1.487,60 |

Estos tiempos incluyen espera humana y trabajo, no solo CI. La segunda métrica se conserva para evitar una mejora aparente al retrasar `ready_for_review` hasta obtener turno. Solicitud→concesión→merge no existe históricamente como evento homogéneo; se recogerá en el piloto sin fingir una línea base retrospectiva.

### Caso #1018 y causas separadas

| Run | HEAD | Resultado | Workflow min | Jobs min |
| --- | --- | --- | ---: | ---: |
| [45635814818](https://github.com/casasleonj/bambu/actions/runs/45635814818) | `7e017186` | cancelled | 9.03 | 93.45 |
| [45637294035](https://github.com/casasleonj/bambu/actions/runs/45637294035) | `cc35a477` | success | 36.32 | 145.90 |
| [45644179645](https://github.com/casasleonj/bambu/actions/runs/45644179645) | `3683f02f` | success | 22.58 | 139.03 |
| [45649633331](https://github.com/casasleonj/bambu/actions/runs/45649633331) | `88b012a2` | success | 27.77 | 137.63 |

La primera cancelación siguió al commit de evidencia `cc35a477`, no se atribuye automáticamente a otro PR. Los HEAD `3683f02f` y `88b012a2` son merges con `main`, con padres `cb3f9de0` (#1014) y `730a69aa` (#1020): estas dos ejecuciones suman **276,67 minutos de jobs**. Esto confirma la clase del problema, no asegura que todo ese trabajo desaparezca con la regla propuesta. La descripción inicial hablaba de tres corridas; se verifican **tres aprobadas y una cancelada: cuatro totales**.

Se verificaron 12 candidatos de actualización con main posteriores a un CI verde en 8 PR, según padres de commit disponibles y sucesión temporal. **Es un mínimo observado, no una estimación exhaustiva ni 12 ejecuciones evitables**: solo 184 de 798 HEAD distintos están disponibles en la historia local consultada; rebases y commits ausentes quedan sin clasificar. #990 es un contraejemplo importante: su actualización con main expuso un fallo real del QA adicional (429 de contador heredado); corregirlo y volver a validar era necesario.

#1014 y #1020 reutilizaron `ccr-a29e4248-jxribc`: agrupar únicamente por rama mezclaría sus runs. Se asoció por PR explícito de REST cuando existe, o por rama **y ventana creación→merge única**; 618 runs se asocian a los 81 PR fusionados; 109 se identifican con otros PR por REST y 28 no se asocian a un PR. No se mezclan esas poblaciones. No hay asociaciones ambiguas aceptadas.

## Minutos por job (intervalos válidos, todos los intentos)

| Evento | Job | Muestras | Total min | p50 min | p95 min |
| --- | --- | ---: | ---: | ---: | ---: |
| pull_request | CI gate (resumen) | 584 | 73.78 | 0.12 | 0.25 |
| pull_request | Detect change scope (docs-only vs. executable) | 584 | 168.88 | 0.13 | 0.63 |
| pull_request | E2E (1/8) | 439 | 4360.38 | 11.95 | 15.25 |
| pull_request | E2E (2/8) | 439 | 4443.97 | 12.30 | 15.13 |
| pull_request | E2E (3/8) | 439 | 3585.73 | 9.60 | 12.23 |
| pull_request | E2E (4/8) | 439 | 4237.38 | 11.53 | 14.98 |
| pull_request | E2E (5/8) | 439 | 4306.77 | 11.47 | 15.45 |
| pull_request | E2E (6/8) | 439 | 4286.48 | 11.55 | 15.18 |
| pull_request | E2E (7/8) | 439 | 3532.70 | 9.27 | 13.85 |
| pull_request | E2E (8/8) | 439 | 4140.08 | 11.35 | 14.25 |
| pull_request | E2E Hub (V2 ON) | 494 | 4093.50 | 10.40 | 15.32 |
| pull_request | Integration tests (non-blocking) | 584 | 6304.67 | 12.70 | 20.30 |
| pull_request | Lint (non-blocking) | 584 | 1066.02 | 1.95 | 2.58 |
| pull_request | Type check + Tests | 584 | 2538.68 | 5.02 | 7.32 |
| push | CI gate (resumen) | 81 | 9.23 | 0.10 | 0.25 |
| push | Detect change scope (docs-only vs. executable) | 81 | 12.50 | 0.13 | 0.28 |
| push | E2E (1/8) | 81 | 993.60 | 12.98 | 15.68 |
| push | E2E (2/8) | 81 | 1007.58 | 12.98 | 16.13 |
| push | E2E (3/8) | 81 | 806.35 | 10.02 | 13.38 |
| push | E2E (4/8) | 81 | 954.02 | 12.33 | 14.88 |
| push | E2E (5/8) | 81 | 994.98 | 12.45 | 15.55 |
| push | E2E (6/8) | 81 | 978.00 | 12.72 | 15.73 |
| push | E2E (7/8) | 81 | 770.22 | 9.82 | 12.37 |
| push | E2E (8/8) | 81 | 945.93 | 12.35 | 15.30 |
| push | E2E Hub (V2 ON) | 81 | 912.92 | 11.42 | 15.28 |
| push | Integration tests (non-blocking) | 81 | 1254.00 | 16.22 | 21.18 |
| push | Lint (non-blocking) | 81 | 170.30 | 2.00 | 2.57 |
| push | Type check + Tests | 81 | 459.82 | 5.63 | 7.33 |

Hay **66 intervalos inválidos**, con conclusión cancelada y sin pasos ejecutados en los datos recogidos; se conservan sus timestamps y se excluyen de las sumas, sin convertirlos artificialmente en negativos o ceros. Una consulta puntual a job `139315555344` confirmó `runner_id:null`, fechas invertidas por un segundo y ningún paso. Los totales son duración observable, no un comprobante de cobro ni una duración exacta para filas inválidas. La cohorte contiene 8 runs con dos intentos y 1 con tres; sumar `updated_at-created_at` no representa por sí solo tiempo de runner ni una única ejecución continua.

## Método reproducible y límites

1. Listar runs por workflow, evento, ventana de creación y páginas de 100; no truncar a una página ni incluir Backlog/soak/sombra como si fueran este CI.
2. Para cada run completo, GET `/repos/casasleonj/bambu/actions/runs/{id}/jobs?filter=all&per_page=100&page={n}`; conservar todos los jobs e intentos, deduplicar por id, y validar timestamps antes de sumar. No descargar logs para esta métrica.
3. Leer PR fusionados y timeline paginado de listo/borrador; excluir de la cohorte fechas fuera de ventana. Asociar runs evitando nombres de rama reutilizados.
4. p50/p95 nearest-rank: ordenar valores válidos; índice `ceil(n*p/100)-1`. Minutos de jobs: suma de `(completed_at-started_at)/60` por intervalo válido. Job omitido no cuenta como ejecutado. Mantener n y faltantes.
5. Conservar SHA/configuración/perfiles, reintentos, cancelaciones y casos no clasificables. Comparar por tipo de PR y versión de workflow; no equiparar automáticamente una rama verde con el candidato de merge ni comparar build V2 ON con OFF.
6. Scripts privados de extracción fueron usados para esta medición; las tablas CSV conservan los datos suficientes para recomputar las cifras. El medidor canónico existente sigue sin cambios. No hay cron, servicio, workflow ni almacenamiento externo nuevo.

## Reconciliación con cambios posteriores a la medición

- #1024 ya incorporó una regla inicial de cadencia. Se amplía esa sección, sin duplicarla ni reemplazar el resto de instrucciones.
- Dependencia reconciliada: #1027 se integró en `e2981f85e31da7b40ac06a0720f45589c8707587`. Se actualizó esta rama y se resolvió la sección 5.1 preservando la elegibilidad exacta del borrador y la coordinación aprobada. La prueba local se repite sobre la combinación real; no se apilan ramas silenciosamente ni se reutiliza una certificación de la base anterior. #1027 también cambia la elegibilidad de `src/` con QA, otro confusor que debe distinguirse de efectos del turno en la comparación.
- #1030 (`6d6e62e`) amplió `diffAptoBorrador` en `scripts/ci/politica-ci.mjs`: el borrador difiere el E2E largo para cualquier diff de archivos normales A/M/D, salvo estructura dudosa o la maquinaria del gate (`ci.yml`, `scripts/ci/**`, su prueba vitest); al pasar a listo el E2E completo corre siempre. Se integró `main` en esta rama con un merge, sin reescribir historia, y se actualizó la sección 5.1 con esa política (decisión del PO, 25/11/2026; actualización hecha por otra sesión, con autorización expresa, tras el comentario de coordinación en este PR). **Nuevo confusor de la comparación:** una reducción posterior de E2E en borradores fuera de `src/`/`docs/` podría deberse a #1030 y no al turno. Comparar dentro de la misma clase/configuración o declarar la falta de equivalencia.
- #1026 integró #1025: el clasificador acepta la ruta exacta `.qa/pr-<N>.md` como evidencia declarativa. Se conserva ese cambio; esta fase no toca el clasificador. **Confusor de la comparación:** una reducción posterior de E2E en PR documentales con QA podría deberse a #1025 y no al turno. Comparar dentro de la misma clase/configuración o declarar la falta de equivalencia; no atribuir todo al piloto.
- Duplicación de SHA de #1019 verificada: [run 2411 / 45645606649](https://github.com/casasleonj/bambu/actions/runs/45645606649) y [run 2412 / 45645606713](https://github.com/casasleonj/bambu/actions/runs/45645606713), creados ambos a las 15:28:45 UTC del 25/11, mismo HEAD `7a291157df35a430a7ca92db9bf0aa47d2b19b38`, ambos intento 1. Logs del gate: job `139329323407` registra `CI_ACTION: ready_for_review`, `CI_DRAFT: false`; job `139332227583` registra `CI_ACTION: synchronize`, `CI_DRAFT: true`. No son un reintento del mismo run ni un cambio de main demostrado: son dos eventos de PR distintos. El grupo de concurrencia del workflow distingue borrador y certificación. Evitar lanzar el último push y la transición a listo como acciones simultáneas; no cambiar esa separación ni desactivar triggers en esta fase. El protocolo no promete eliminar todos los eventos repetidos.
- La contención de capacidad de runners no está demostrada por estos datos. Las duraciones pueden incluir dependencias, colas, instalación, compilación y pruebas; no se atribuye un p95 alto a una causa única sin evidencia del scheduler. No se proponen runners de pago.

## Tres rondas de contraste y decisión aprobada

| Ronda de R1+R2 | Evidencia/refutación | Ajuste |
| --- | --- | --- |
| 1 | Strict y gate existentes; medir antes de optimizar; Merge Queue no disponible para cuenta personal | Proponer coordinación de la certificación final y conservar todos los controles |
| 2 | PR desconocido antes de apertura, rama reutilizada, readiness retrasada y cancelaciones de 1,3 min | Evidencia antes del CI final; asociación temporal; conservar creación→merge y espera de turno |
| 3 | Dos agentes pueden solicitar al mismo tiempo; un turno puede abandonarse; #990 requiere repetir tras fallo real; timestamps/HEAD incompletos | Concesión única explícita, suspensión sin expiración automática; no omitir certificación; faltantes declarados |

La ruta Codex CLI 0.163.0 se intentó con `gpt-6.1-sol`/medium/read-only y **falló 401 sin respuesta de modelo**. No se afirma que ese modelo investigó. El contraste anterior fue realizado directamente por este agente con fuentes verificables. La vía CLI sigue bloqueada por autenticación; no se atribuye una auditoría de otra familia.

### Escenarios del protocolo a comprobar (definidos, aún no ejecutados en un piloto real)

| Caso | Resultado exigido |
| --- | --- |
| Dos PR completos solicitan a la vez | Un solo turno concedido; el otro continúa preparación y espera; solicitud no equivale a concesión |
| Dos agentes creen libre el turno o usan la misma cuenta GitHub | No se autoconcede; decide el único coordinador. Reconocer límite cooperativo, sin atribuir autenticidad humana a una cuenta compartida |
| Turno abandonado o responsable desconectado | Suspensión/reasignación explícita; no apropiación por timeout |
| Hotfix prioritario | PO documenta interrupción y revoca el turno anterior antes de otra concesión; conserva gates |
| Falta el número de PR para nombrar QA | Preparar QA local; completar el nombre tras apertura y antes del CI final; reconocer primer run inevitable cuando aplique |
| Cambia código/evidencia o falla CI | Nueva validación real; espera larga libera turno explícitamente; no reinterpretar el verde anterior |
| Otro actor adelanta main, incluso sin archivos en común | Actualizar y recertificar; strict sigue protegiendo la integración |
| Falla postmerge o migración | No liberar como verificado; aplicar respuesta a incidente vigente; no seguir acumulando merges |
| La medición mejora solo al retrasar ready | Detectarlo con creación→merge y solicitud→merge; no declarar ahorro |
| PR preparado antes del piloto / aprobaciones pendientes | Marcar transición o espera; no consumir el turno esperando una decisión de producto |

## Piloto aprobado y cierre honesto

- Observar los **primeros cinco PR elegibles consecutivos** que soliciten certificación tras integrar y verificar el procedimiento aprobado. Es una muestra operativa, no una prueba estadística de mejora estable de p95. No fabricar cambios/PRs ni hotfixes para completar categorías. Registrar composición real; ampliar si no hay casos representativos o si no coinciden versiones/perfiles.
- Mantener Gates, triggers, strict, permisos, Vercel, migraciones y selector/reuso sombra. Las reglas específicas de Codex, Claude y OpenCode remiten al mismo flujo canónico; no replicar la política en cada adaptador.
- Publicar datos después y comparación descriptiva de repeticiones de base, cancelaciones, minutos de jobs y latencia **incluida la espera**; no prometer que serializar reduce p95: puede aumentar cola y requiere coordinación humana. El paso 9 vigente se preserva y su tiempo se incluye.
- Si mejora la mecánica pero aumenta la espera, documentar el trade-off y decidir con el PO; cinco muestras no prueban una mejora estable de p95. Mantener o revisar el piloto por evidencia.
- **Aún no hay datos después, A/B de builds ni prueba de nuevos agentes.** Compartir builds es una hipótesis separada de #896 F1; no modificar el grafo de CI sin A/B por perfil/candidato y sin evidencia de p95/confiabilidad. `queue:max` de Actions permite espera de workflows pero no congela merges humanos ni actualiza por sí solo el candidato.
- #1023 se mantiene abierto hasta implantación, observación real y comparativa publicada. La aprobación está registrada; este PR usa `Refs #1023`, no `Closes`. #1022 continúa independiente.

## Fuentes externas verificadas · 25/11/2026

- [GitHub: concurrency y queue](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency): soporta `queue:max`; orden por entrada en espera, no garantiza orden por despacho. No equivale a Merge Queue.
- [GitHub: Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue): disponibilidad para repos públicos de organización; el repo actual es personal. No trasladarlo.
- [GitHub Engineering](https://github.blog/engineering/engineering-principles/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day/): precedente de probar la combinación exacta; no trasladar su escala ni atribuir un benchmark de ese mecanismo a este piloto manual.
- [GitHub: facturación](https://docs.github.com/en/billing/concepts/product-billing/github-actions): runners estándar en repos públicos gratuitos; mayores se facturan. No se auditó factura ni se propone contratar servicios.
- [GitHub REST jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run): timestamps, jobs paginados y todos los intentos. Extracción API con versión solicitada `2022-11-28`; sin endpoints de escritura. Context7 consultado y contrastado con estas fuentes primarias.
