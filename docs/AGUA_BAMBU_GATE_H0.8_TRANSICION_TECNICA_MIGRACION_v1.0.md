# AGUA BAMBÚ — GATE H0.8: TRANSICIÓN TÉCNICA Y MIGRACIÓN DE AUTORIDAD

**Versión:** 1.1
**Fecha:** 2026-09-13 (revisión el mismo día: matriz de transición + precisión sobre "origen heredado")
**Responde a:** aprobación de H0.7 con aclaración del equipo (`docs/AGUA_BAMBU_GATE_H0.7_TRANSICION_AUTORIDAD_CREDITO_v1.0.md`) + instrucción de definir la transición técnica, más la aprobación de la v1.0 de este documento "como base, con una precisión importante" (ver §4bis).
**Base técnica:** `main`, sin cambios de código desde H0.7.
**Regla seguida:** análisis y propuesta de transición, **cero implementación**. No se construye la Autoridad de Crédito, no se crea `PedidoExcepcionCredito`, no se elimina ningún escritor, no se toca el schema de `Cliente`, no se agregan `bloqueadoEn`/`bloqueadoPor`/`bloqueadoMotivo`. **No se inventa ninguna migración de datos ni semántica histórica** — donde la evidencia no alcanza, queda explícitamente como PENDIENTE. "Origen heredado/no determinado" (§4bis) es vocabulario de análisis para razonar la transición, **no** un campo, estado o regla funcional nuevo de `Cliente`.

**Aclaración de H0.7 incorporada (vigente para todo este documento):** B, C y D **no se eliminan**. Lo que se elimina, cuando se implemente, es la escritura independiente sobre `cliente.bloqueado` — los mecanismos que originan las decisiones permanecen.

---

## 0. Modelo objetivo (heredado de H0.7, no se reabre)

```text
B → decisión humana ─────────────┐
                                 │
C → señal de Riesgo → decisión ──┼→ AUTORIDAD DE CRÉDITO
                                 │            ↓
D → regla automática ────────────┘    Cliente.bloqueado
```

```text
Cron → detecta condición → Autoridad de Crédito → cambia elegibilidad     (D, objetivo)
Caso/Riesgo → señal → decisión humana → Autoridad de Crédito              (C, objetivo)
Humano → decisión → Autoridad de Crédito → cambia elegibilidad           (B, objetivo)
```

Y no:

```text
Cron → UPDATE Cliente.bloqueado                    (D, estado actual)
Caso → endpoint directo → Cliente.bloqueado         (C, estado actual)
```

---

## 0bis. Matriz de transición (vista consolidada pedida por el equipo)

Cada columna es uno de los 7 puntos pedidos. El detalle de evidencia (archivo:línea) de cada celda está desarrollado en §1-§3; esta matriz es la vista resumida para comparar los tres escritores lado a lado.

| | **B — bloqueo manual** | **C — `RECLAMACIONES_MULTIPLES`** | **D — `vencimiento-promesas`** |
|---|---|---|---|
| **ESCRITOR ACTUAL** | `PATCH /api/clientes/[id]`, `updateData.bloqueado = bloqueado` → `prisma.cliente.update` (`clientes/[id]/route.ts:315-317,325-328`) | Handler `bloquear_fiados` en `caso-guia-modal.tsx:201-221` → llama al **mismo endpoint** que B, directamente | `tx.cliente.update({ data: { bloqueado: true } })` dentro del cron (`cron/vencimiento-promesas/route.ts:51-54`) |
| **DISPARADOR QUE SE CONSERVA** | Clic explícito de ADMIN/ASISTENTE en la ficha del cliente, con confirmación | La señal de Riesgo (`Caso` `RECLAMACIONES_MULTIPLES`: detección de ≥3 reclamaciones, severidad, asignación) + el clic humano de ADMIN/ASISTENTE que decide actuar sobre ella | El cron diario (6am) y su condición objetiva (`promesaPagoFecha` vencida sin pago) |
| **QUÉ SE DELEGA/REEMPLAZA** | El `prisma.cliente.update` directo se reemplaza por una invocación a la operación de la Autoridad de Crédito (forma exacta: PENDIENTE, diseño técnico posterior) | El handler deja de llamar al endpoint de `Cliente` directamente; invoca **la misma operación delegada de B** — C no tiene ni debe tener una operación propia | El `tx.cliente.update` directo se reemplaza por una invocación a una operación de la Autoridad (ej. "evaluar/aplicar regla de promesa vencida") |
| **QUÉ NO CAMBIA** | El resultado observable (cliente queda bloqueado/desbloqueado), quién puede hacerlo (ADMIN/ASISTENTE), la confirmación en UI | El `Caso` sigue siendo 100% Riesgo (detección/severidad/investigación), el botón sigue apareciendo igual para el usuario | El evento disparador (promesa vencida), la cadencia (diaria), la ausencia de intervención humana |
| **AUDITORÍA** | Pasa de `logAudit` genérico post-`update` a un registro generado por la propia operación de la Autoridad (transaccional); estructura exacta de motivo/autor/fecha sigue PENDIENTE | Igual que B, conservando la referencia al caso de origen (mismo patrón de `casoId` opcional que existe hoy) | Corrige la asimetría ya documentada: pasa de quedar solo bajo `entidad:'Pedido'` a quedar también bajo `entidad:'Cliente'`, como cualquier otro cambio de elegibilidad |
| **COMPATIBILIDAD DURANTE LA TRANSICIÓN** | Puede convivir temporalmente con el mecanismo actual si se implementa detrás de una validación en paralelo (ver principio de "modo sombra" abajo) — no requiere que C o D estén listos primero | Depende estructuralmente de que la operación delegada de B ya exista y esté probada — C no puede cortar antes que B | Puede convivir temporalmente con la escritura directa actual mediante el mismo patrón de detección de divergencia ya usado en `ADR-MONETARIO-001` (ver abajo) — no depende de B ni C |
| **CRITERIO DE CORTE DEL ESCRITOR DIRECTO** | Se retira `updateData.bloqueado` de la ruta actual cuando la operación de la Autoridad exista, esté probada, y el frontend (`toggleBloqueado`) ya la invoque exitosamente | Se retira la llamada directa del botón cuando **B ya haya cortado su propio escritor directo** — este es el único de los tres con una dependencia de orden obligatoria | Se retira el `tx.cliente.update` del cron cuando la operación de la Autoridad exista, esté probada, y el cron ya la invoque exitosamente — no depende de B ni C |

**Principio de "modo sombra" (PROPUESTA, reutiliza un patrón ya decidido, no inventa uno nuevo):** `ADR-MONETARIO-001` ya estableció, para el ledger monetario, que ante una migración de fuente de verdad no se autocorrige ni se confía ciegamente — se detecta divergencia y se registra (`DUAL_WRITE_DIVERGENCE`) antes de cortar la fuente vieja. La misma disciplina podría aplicarse acá: durante una ventana de transición, B y D podrían escribir por el camino actual **y además** invocar la operación nueva de la Autoridad en paralelo, comparando resultados antes de cortar el camino directo. Esto es una propuesta de **cómo validar el corte con seguridad**, no una decisión — la forma exacta de implementarlo (si aplica) es diseño técnico posterior.

**Nota sobre la dependencia C→B:** es la única asimetría real de la matriz. C nunca tuvo su propio mecanismo de escritura independiente (reutiliza el endpoint de B desde el día en que existe) — por lo tanto tampoco puede tener su propio "corte" independiente. Cualquier plan de implementación debe secuenciar el corte de B antes que el de C, no en paralelo.

---

## 1. B — bloqueo manual

| Pregunta | Respuesta |
|---|---|
| ¿Qué código deja de escribir directo? | El bloque `if (bloqueado !== undefined) { updateData.bloqueado = bloqueado }` → `prisma.cliente.update({ data: updateData })` en `src/app/api/clientes/[id]/route.ts:315-317,325-328`. Esa escritura directa desaparece de esta ruta. |
| ¿Qué código permanece como disparador? | El botón `toggleBloqueado` en `clientes-client/index.tsx` (clic explícito de ADMIN/ASISTENTE, con confirmación "¿Bloquear fiados para este cliente?"). El disparador humano no cambia. |
| ¿Qué operación de la futura autoridad lo recibe? | El mismo endpoint (u otro) deja de hacer el `update` él mismo y delega a una operación de la Autoridad de Crédito. **Nombre y forma exacta de esa operación: PENDIENTE** — es diseño técnico que corresponde a cuando se construya la Autoridad, no a este gate. |
| ¿Cómo se conserva la semántica actual? | El resultado observable no cambia: un clic de ADMIN/ASISTENTE sigue pudiendo bloquear/desbloquear a un cliente, con confirmación, y el cliente queda sin poder fiar. Cambia *dónde* se ejecuta la escritura, no *qué* hace ni *quién* la decide. |
| ¿Cómo se audita? | Hoy: `logAudit` genérico posterior al `update` (`entidad:'Cliente'`, con `casoId` opcional). Objetivo: el registro se genera como parte de la propia operación de la Autoridad (transaccional), con motivo/autor/fecha — la estructura exacta de esos campos sigue PENDIENTE (ya identificado en H0.5/H0.6, el equipo pidió explícitamente no implementarlo todavía). |
| ¿Cómo se desbloquea? | Operación simétrica de la misma Autoridad. Sin cambio de roles propuesto (ADMIN/ASISTENTE, igual que hoy). |

---

## 2. D — cron `vencimiento-promesas`

| Pregunta | Respuesta |
|---|---|
| ¿Qué código deja de escribir directo? | `await tx.cliente.update({ where: { id: pedido.clienteId }, data: { bloqueado: true } })` en `src/app/api/cron/vencimiento-promesas/route.ts:51-54`. |
| ¿Qué código permanece como disparador? | El cron mismo: ejecución diaria (6am), la consulta que detecta `promesaPagoFecha` vencida sin pago (`src/app/api/cron/vencimiento-promesas/route.ts:19-34`). El evento de negocio (promesa vencida, objetivamente verificable) no cambia. |
| ¿Qué operación de la futura autoridad lo recibe? | El cron pasa a invocar una operación de la Autoridad (ej. "evaluar y aplicar regla de promesa vencida") en lugar de escribir el campo por su cuenta. **Forma exacta: PENDIENTE.** |
| ¿Cómo se conserva la semántica actual? | Mismo disparador (cron diario), mismo evento (promesa vencida), mismo efecto final (bloqueo automático sin intervención humana). No se propone cambiar la cadencia ni la condición — solo el mecanismo de escritura. |
| ¿Cómo se audita? | Hoy: queda bajo `entidad:'Pedido'` (`tx.historial.create`, `src/app/api/cron/vencimiento-promesas/route.ts:58-71`), con el bloqueo mencionado solo dentro del JSON (`clienteBloqueado`), no como registro propio de `Cliente`. Objetivo: la operación de la Autoridad debe generar el registro bajo `entidad:'Cliente'`, corrigiendo esta asimetría ya documentada en H0.5/H0.6. |
| ¿Cómo se desbloquea? | Sin cambio: D nunca desbloquea hoy y este documento no propone que empiece a hacerlo. El desbloqueo sigue dependiendo de B. |

---

## 3. C — `Caso` `RECLAMACIONES_MULTIPLES` → botón "Bloquear fiados"

| Pregunta | Respuesta |
|---|---|
| ¿Qué código deja de escribir directo? | El handler `accionId === 'bloquear_fiados'` en `src/components/caso-guia-modal.tsx:201-221`, que hoy llama `fetch(PATCH /api/clientes/${caso.clienteId}, {bloqueado:true})` directamente. |
| ¿Qué código permanece como disparador? | Todo lo que es Riesgo puro: la detección de ≥3 reclamaciones, la alerta/`Caso` en sí, su severidad, asignación e investigación (`alertas-config.ts:214-236`, `alertas-detector.ts`). También permanece el disparador humano: el ADMIN/ASISTENTE viendo la señal y decidiendo actuar. |
| ¿Qué operación de la futura autoridad lo recibe? | **La misma operación delegada de B (§1), no una propia.** El botón deja de tener su propio camino — invoca el mismo mecanismo que un bloqueo manual desde la ficha del cliente, con el `casoId` como metadato de contexto (patrón que ya existe hoy en el endpoint). |
| ¿Cómo se conserva la semántica actual? | El `Caso` sigue mostrando la señal y ofreciendo la acción con un clic — el usuario no percibe diferencia. Internamente, deja de tener una segunda puerta de escritura. |
| ¿Cómo se audita? | Igual que B, con la referencia al caso de origen conservada (mismo patrón de `casoId` opcional que ya existe). |
| ¿Cómo se desbloquea? | No existe hoy un botón de desbloqueo simétrico dentro del `Caso` (confirmado en H0.6). Este documento no propone agregar uno — el desbloqueo, si ocurre, pasa por B. |

---

## 4bis. Precisión del equipo (2026-09-13) sobre "origen heredado/no determinado"

El equipo aprobó el hallazgo histórico de la v1.0 (§4) con una corrección importante que reemplaza el lenguaje de esa sección: **"origen heredado/no determinado" es una clasificación de migración/análisis — sirve para razonar sobre la transición en este documento — pero no debe convertirse ahora en un nuevo estado, campo o regla funcional de `Cliente`.** La v1.0 de este documento sugería que "la Autoridad de Crédito debería poder representar" ese origen como un estado — eso excede lo que se pidió y se retira. Lo que sigue vigente es únicamente la pregunta de comportamiento: **cómo conviven, en el día 1 de la Autoridad de Crédito, los clientes que ya tienen `bloqueado = true` sin que el sistema fabrique un origen que no puede verificar.**

Respuesta a esa pregunta, sin agregar nada al schema ni a la lógica de `Cliente`:

- **El día 1, todo `bloqueado = true` existente simplemente sigue siendo `true`.** La Autoridad de Crédito no necesita "saber" si vino de B, C o D para que el cliente siga sin poder fiar — el campo ya tiene el valor correcto, y ese es el único dato que el resto del sistema (`puedeCrearPedido`, recurrentes, etc.) consume hoy.
- **No hay backfill, no hay migración de datos, no hay reclasificación.** La Autoridad, cuando exista, simplemente lee `Cliente.bloqueado` como está — el mismo booleano que lee hoy `pedido-validation.service.ts`. Los clientes bloqueados antes de la Autoridad quedan indistinguibles, en el dato, de un bloqueo hecho el mismo día en que la Autoridad se activa — y eso es correcto: **no inventar el origen significa, precisamente, no crear una distinción que la evidencia no respalda.**
- El único lugar donde "origen heredado/no determinado" tiene sentido es como **nota de análisis en este documento** (para explicar por qué no se puede auditar retroactivamente), no como algo que el sistema en producción necesite representar.

## 4. Qué ocurre con clientes que ya tienen `bloqueado = true` — sin inventar migración

**Nota:** el contenido original de esta sección (hallazgo + evidencia) se mantiene sin cambios — sigue siendo correcto. Lo que cambió es la propuesta de cierre, corregida en §4bis arriba: donde decía "la Autoridad debería poder representar un cuarto estado", léase §4bis.

Esta es la pregunta donde el riesgo de "inventar semántica histórica" es más alto, así que se responde solo con lo que la evidencia permite afirmar.

### HECHO
- `Cliente.bloqueado` no tiene, hoy, ningún campo que registre su origen (`bloqueadoEn`/`bloqueadoPor`/`bloqueadoMotivo` no existen — confirmado en H0.5 §1).
- El único rastro indirecto es `Historial` (vía `logAudit`), y es **parcial y no uniforme**:
  - B y C dejan registro bajo `entidad:'Cliente'`, con `casoId` opcional — pero B y C son indistinguibles entre sí en ese registro si `casoId` no viaja (un bloqueo manual "en frío" y un bloqueo manual disparado desde un `Caso` sin `casoId` explícito se ven idénticos).
  - D deja registro bajo `entidad:'Pedido'`, no `'Cliente'` — buscar el historial de un cliente específico no lo encontraría sin saber de antemano que hay que cruzar con `Pedido`.
  - No hay garantía de que `Historial` tenga cobertura completa desde el origen de cada cliente (podría haber bloqueos anteriores a que existiera este mecanismo de auditoría, o registros perdidos).

### Consecuencia (no es una decisión, es lo que la evidencia obliga a concluir)
**Para un cliente que hoy tiene `bloqueado = true`, no existe una forma confiable de determinar programáticamente si el origen fue B, C o D.** Cualquier intento de clasificarlo automáticamente (por ejemplo, "si tiene una promesa vencida en su historial, asumir que fue D") sería **inventar una semántica histórica que el equipo pidió explícitamente no inventar** — sería una inferencia, no un hecho verificable.

### Cierre corregido (2026-09-13, ver §4bis — reemplaza la propuesta original de esta subsección)
**Superado:** la v1.0 proponía que la Autoridad representara un cuarto estado de origen ("bloqueado, origen heredado/no determinado"). El equipo corrigió esto explícitamente: esa etiqueta es solo vocabulario de análisis para este documento, no algo que deba existir en el schema, el estado o la lógica de `Cliente`. Ver §4bis para la respuesta vigente: el día 1 de la Autoridad, todo `bloqueado=true` existente simplemente se lee como está, sin backfill, sin reclasificación, sin ningún campo o distinción nueva.

### PENDIENTE (decisión de negocio, no técnica — no la resuelvo acá)
- Si antes de activar la Autoridad de Crédito el equipo quiere hacer una revisión **humana y manual** (no automatizada) de los clientes actualmente bloqueados, para decidir caso por caso si se mantienen bloqueados o se liberan con el nuevo criterio. Esto es una decisión de producto/operación, no algo que este gate deba o pueda decidir.

---

## 5. Clasificación final

### HECHOS
- Los 3 puntos exactos de escritura directa a reemplazar están identificados con archivo y línea (§1, §2, §3).
- Ninguno de los 3 mecanismos guarda hoy origen estructurado; el único rastro (`Historial`) es parcial, no uniforme entre los tres, y no cubre a D bajo `entidad:'Cliente'`.
- No hay garantía de cobertura histórica completa en `Historial` desde el origen de cada cliente bloqueado.

### DECISIONES (heredadas, no se reabren)
- B, C, D no se eliminan — se elimina la escritura independiente, no los mecanismos (aclaración de H0.7).
- Modelo de dos niveles y `Caso ≠ Crédito` (H0.6, H0.7).

### PROPUESTAS (de este documento)
- Cada uno de los 3 puntos de escritura directa (§0bis, §1-§3) se reemplaza por una invocación a una operación de la Autoridad — sin definir todavía el nombre/forma de esa operación.
- Los registros con `bloqueado=true` preexistentes a la activación de la Autoridad **no requieren ningún tratamiento especial**: se leen tal cual están, sin backfill ni reclasificación (§4bis, corregido tras la precisión del equipo).
- "Modo sombra" (detectar divergencia sin autocorregir, reutilizando el patrón de `ADR-MONETARIO-001`) como forma de validar el corte de B y D con seguridad antes de retirar la escritura directa (§0bis).
- C no puede cortar su escritura antes que B, por dependencia estructural (§0bis) — esto condiciona el orden de cualquier plan de implementación futuro.

### PENDIENTES
- Forma exacta de la(s) operación(es) de la Autoridad que reciben cada disparador (nombre, firma, si es una operación única parametrizada o una por origen) — diseño técnico, no de este gate.
- Estructura exacta del registro de motivo/autor/fecha (ya pendiente desde H0.5/H0.6).
- Si el desbloqueo requiere igual o mayor autorización que el bloqueo (ya pendiente desde H0.6).
- Si debe existir una revisión humana manual de los clientes ya bloqueados antes de activar la Autoridad (decisión de negocio, §4bis).
- Si se adopta o no el "modo sombra" propuesto en §0bis, y por cuánto tiempo correría antes del corte definitivo.
- Cómo y cuándo se formaliza en git esta serie de gates (sigue abierto desde H0.7 — ver inventario separado).

### BRECHA PLAN ↔ CÓDIGO
- La asimetría de auditoría de D (bajo `entidad:'Pedido'` en vez de `'Cliente'`) se mantiene registrada como brecha a cerrar en la implementación futura, no antes.

---

## 6. Qué sigue

Con H0.8, la serie H0.5→H0.8 deja: qué significa `cliente.bloqueado` (H0.5/H0.6), cómo se relaciona con `PedidoExcepcionCredito` (H0.6), qué papel juega cada escritor en el modelo objetivo (H0.7), y ahora exactamente qué línea de código cambia y qué pasa con el estado heredado (H0.8). Lo que falta, en mi lectura, es empezar a bocetar la forma técnica de la Autoridad de Crédito misma — pero eso ya no es una pregunta de semántica ni de transición, es diseño de la entidad/servicio en sí, y corresponde al equipo decidir si eso amerita un H0.9 o si ya se considera información suficiente para pasar a un plan de implementación formal (rama, fases, PRs) bajo el Flujo de Entrega de `AGENTS.md`.

**Precisión sobre la divergencia Preview/Commit mencionada para la siguiente fase:** la divergencia específica identificada en la auditoría de convergencia original (`docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` §1 — `PreviewPedidoUseCase` no respetaba el guard `totalPagado < total` que `CrearPedidoUseCase`/`venta-libre` ya aplicaban de forma intencional) **ya fue corregida** en `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts` durante esta misma sesión, con tests de regresión — pero sigue sin commitear (ver inventario de git). Si el equipo se refiere a esta divergencia, ya está resuelta y solo falta formalizarla en un commit/PR. Si se refiere a otra divergencia Preview/Commit no identificada todavía, no hay evidencia de ella en los documentos de esta serie — quedaría como un hallazgo nuevo a investigar en la siguiente fase, no algo que este documento pueda dar por resuelto sin evidencia adicional.
