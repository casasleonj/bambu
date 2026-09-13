# AGUA BAMBÚ — GATE H0.7: AUTORIDAD Y TRANSICIÓN DE ELEGIBILIDAD CREDITICIA

**Versión:** 1.0
**Fecha:** 2026-09-13
**Responde a:** instrucción del equipo tras el cierre semántico de H0.6 (`docs/AGUA_BAMBU_GATE_H0.6_SEMANTICA_AUTORIDAD_CLIENTE_BLOQUEADO_v1.0.md`, modelo de dos niveles ya decidido).
**Base técnica:** `main`, sin cambios de código desde H0.6.
**Regla seguida:** análisis y propuesta de transición, **cero implementación**. No se crea `PedidoExcepcionCredito`, no se construye la Autoridad de Crédito, no se centraliza `cliente.bloqueado`, no se elimina ningún escritor, no se agregan campos al schema, no se toca `Caso`, `vencimiento-promesas` ni el toggle manual.

**Nota de trazabilidad** (señalada por el equipo): ninguno de los documentos de esta serie (H0.5, H0.6, este H0.7) ni los cambios de código de los gates anteriores están comiteados todavía — siguen como cambios locales sin commitear directamente sobre el working tree de `main`. No creé rama ni hice commit por mi cuenta porque el equipo no lo pidió explícitamente y hay riesgo de checkout compartido con otra sesión. Queda pendiente de decisión del equipo cómo formalizar esto antes de que cualquiera de estos documentos pueda considerarse "fuente de decisión" trazable en el sentido que pide `AGENTS.md` (una fase = una rama = un PR).

**Guardrail respetado:** documento de análisis puro.

---

## 0. Punto de partida (no se reabre)

De H0.6, ya decidido y no sujeto a revisión en este documento:

```text
Autoridad de Crédito
        │
        ├── NIVEL CLIENTE — elegibilidad habitual
        │       └── Cliente.bloqueado
        │
        └── NIVEL OPERACIÓN — excepción puntual
                └── PedidoExcepcionCredito
```

- B (bloqueo manual) y D (vencimiento de promesas) actúan en el **nivel Cliente**.
- C (reclamaciones múltiples) es una **señal de Riesgo** que hoy produce un efecto de Crédito por el mismo mecanismo que B, sin pasar por ninguna autoridad.
- `Caso ≠ Crédito`, `Riesgo ≠ Crédito`, `PedidoExcepcionCredito ≠ estado crediticio del Cliente`, `B/C/D ≠ Autoridad de Crédito` — regla de arquitectura vigente.

Lo que H0.7 debe resolver: **cómo se llega desde el estado actual (3 escritores directos y no coordinados) a ese modelo, sin fragmentar de nuevo la autoridad y sin perder la capacidad de negocio que cada uno resuelve hoy.**

---

## 1. Principio de transición (aplica a los tres)

Antes de resolver caso por caso, un punto que aplica a los tres y que evita repetirlo tres veces:

**"Única autoridad" no significa "un solo evento/trigger".** B, C y D representan tres eventos de negocio genuinamente distintos (juicio humano libre, señal de riesgo con decisión humana, regla objetiva automática) — colapsarlos en un solo trigger sería inventar una uniformidad que no existe en el negocio real. Lo que sí debe ser único es **la puerta de escritura**: hoy los tres escriben `cliente.bloqueado` directamente (`prisma.cliente.update`); en el modelo objetivo, los tres deben producir el efecto **a través de la misma operación de la Autoridad de Crédito**, nunca escribiendo el campo por su cuenta. La diversidad de orígenes se preserva; la fragmentación de escritura desaparece.

Esto es lo que distingue "unificar autoridad" de "unificar negocio" — el equipo no pidió lo segundo, y este documento no lo propone.

---

## 2. B — bloqueo manual

| Pregunta | Respuesta (PROPUESTA, no implementada) |
|---|---|
| ¿Cómo se incorpora a la Autoridad de Crédito? | **Se delega.** El `PATCH /api/clientes/[id]` genérico (`{bloqueado: true}`) deja de escribir el campo directamente. En su lugar invoca una operación explícita de la Autoridad de Crédito (ej. `bloquearElegibilidad(clienteId, motivo, actorId)`) que valida, registra y aplica el cambio. El humano sigue decidiendo lo mismo que decide hoy — cambia *por dónde* se ejecuta esa decisión, no *quién* la toma. |
| ¿Qué autoridad puede ejecutarlo? | Sin cambio de alcance respecto a hoy: ADMIN/ASISTENTE (mismo `requireRole` actual). Ampliar o restringir el rol es una decisión de permisos (Plan Maestro §11) que este gate no toca — **PENDIENTE**, no se propone acá. |
| ¿Qué registro/auditoría debe generar? | Motivo + autor + fecha, como parte de la operación de la Autoridad (no un `logAudit` genérico posterior) — ya identificado como brecha de trazabilidad en H0.5/H0.6. La estructura exacta (entidad nueva vs. campos en `Cliente`) sigue **PENDIENTE**, según lo que el equipo ya dejó explícito ("NO agregar todavía `bloqueadoEn`/`bloqueadoPor`/`bloqueadoMotivo`"). |
| ¿Cómo se desbloquea y quién puede hacerlo? | Operación simétrica de la misma Autoridad (`desbloquearElegibilidad`), mismos roles que hoy. Si el desbloqueo debe exigir *más* autorización que el bloqueo (asimetría deliberada) sigue **PENDIENTE** — ya se dejó abierto en H0.6 y no hay evidencia nueva que lo resuelva. |

### ¿Se reemplaza, se delega o se transforma?

**Se delega y se transforma. No se reemplaza.**

- **No se reemplaza** porque el problema de negocio que B resuelve — juicio humano no capturable por una regla objetiva ("conozco a este cliente y no debería seguir fiándole", sin que haya vencido ninguna promesa todavía) — no tiene equivalente automático. Una Autoridad de Crédito que solo aplicara reglas objetivas (como D) perdería una capacidad de negocio real que existe hoy. Reemplazar B sería una regresión funcional, no una limpieza de arquitectura.
- **Se delega** porque el *mecanismo de escritura* dejaría de ser un `PATCH` genérico y pasaría a ser una operación con nombre propio de la Autoridad.
- **Se transforma** porque la *forma del dato* cambia: de un booleano mudo a una decisión con motivo/autor/fecha (aunque la estructura exacta del cambio queda pendiente, como arriba).

---

## 3. D — vencimiento de promesas

| Pregunta | Respuesta (PROPUESTA, no implementada) |
|---|---|
| ¿Cómo se incorpora como regla automática? | **Se incorpora dentro de la Autoridad de Crédito como regla que ella misma evalúa y aplica.** El cron sigue existiendo como disparador temporal (algo tiene que ejecutarse a las 6am), pero en vez de hacer `prisma.cliente.update` directo, invoca una operación de la Autoridad (ej. `evaluarPromesaVencida(pedidoId)`) que aplica la regla con la misma disciplina de auditoría que cualquier otro cambio de elegibilidad. |
| ¿Qué evento dispara la decisión? | Sin cambio: `promesaPagoFecha` de un pedido vencida y el pedido sigue sin pagar. Es un evento objetivo y verificable — no se toca. |
| ¿La regla escribe directamente el estado o pasa por una operación de la Autoridad? | Objetivo: pasa por la Autoridad. Hoy escribe directo — ese es exactamente el defecto que se corrige. |
| ¿Cómo se audita y cómo se revierte/desbloquea? | La auditoría debería quedar bajo `entidad:'Cliente'` (corrige la asimetría ya documentada en H0.5/H0.6, donde hoy queda registrada bajo `entidad:'Pedido'`). La reversión sigue siendo manual, vía B (el cron nunca desbloquea hoy y este documento no propone que empiece a hacerlo). |

### ¿Se reemplaza o se incorpora como regla?

**Se incorpora como regla. No se reemplaza en el sentido de eliminar el mecanismo.**

Se consideró la alternativa de "reemplazo total": que el bloqueo por promesa vencida deje de ser un flag persistido por un batch diario y pase a ser una condición **calculada en vivo** en cada verificación de elegibilidad (sin escribir nada, solo evaluando "¿tiene este cliente una promesa vencida ahora mismo?" en el momento de crear el pedido). Esto sería arquitectónicamente más limpio (elimina el problema de "estado permanente vs. derivado" que quedó pendiente desde H0.6 §1), pero es un cambio de forma mayor que excede lo que este gate pidió resolver — **queda registrado como PENDIENTE de diseño técnico, no como propuesta de este documento**, precisamente para no decidir por conveniencia técnica algo que el equipo no pidió todavía.

Con el guardrail de "no decidir por conveniencia", la propuesta mínima y justificada por el negocio (no por lo que sería más elegante de programar) es: **la regla y su cadencia (diaria, por cron) no cambian — lo que cambia es que deja de escribir el campo por su cuenta y pasa a hacerlo a través de la Autoridad**, exactamente el mismo movimiento que B.

---

## 4. C — reclamaciones múltiples

Este es el caso donde el equipo pidió explícitamente separar qué parte es Riesgo y qué parte es Crédito, sin convertir la señal en autoridad.

### Qué permanece en Riesgo (no se toca)
- La detección: contar reclamaciones ≥3 sobre un cliente.
- La alerta/`Caso` en sí: severidad, asignación, investigación, resolución del caso como tal.
- El propósito original de `Caso`: identificar un patrón que amerita atención humana.

### Qué pertenece a Crédito
- La decisión de bloquear el fiado del cliente **no es parte de la señal** — es una decisión de crédito que un humano toma *después* de mirar la señal. Hoy esa decisión se ejecuta con un atajo técnico (`bloquear_fiados` → `PATCH /api/clientes/[id]` directo) que la hace indistinguible, en el código, de cualquier otro bloqueo manual sin contexto.

### Cómo se propone que la señal desemboque en la decisión, sin que la señal se vuelva autoridad

**El botón "Bloquear fiados" del `Caso` deja de tener su propio camino hacia `cliente.bloqueado`.** En su lugar, invoca la **misma operación delegada de B** (§2) — el mismo `bloquearElegibilidad(clienteId, motivo, actorId)` que usaría un ADMIN bloqueando desde la ficha del cliente en frío. La única diferencia es que, viniendo desde un `Caso`, el motivo puede pre-llenarse con el contexto ("bloqueado por patrón de reclamaciones, caso #X") y el registro puede conservar la referencia al caso — exactamente el mismo patrón de `casoId` opcional que ya existe hoy en el endpoint, adaptado a la nueva operación.

Esto significa: **`RECLAMACIONES_MULTIPLES` nunca toma la decisión de crédito por sí misma** — solo la sugiere y facilita. La decisión sigue siendo 100% humana, ejecutada por el mismo mecanismo que cualquier bloqueo manual. No hay una "excepción de crédito automática" ni una segunda puerta de escritura — hay una sola puerta (la de B), con dos puntos de entrada posibles (la ficha del cliente en frío, o el contexto de un caso).

### ¿Se reemplaza o se convierte en señal?

**Se convierte en señal pura (Caso permanece 100% Riesgo) y su atajo actual se reemplaza — no por una decisión automática, sino por una invocación a la vía ya delegada de B.**

No hay una tercera vía propia para C. Esto es intencional: si C tuviera su propio mecanismo de escritura (aunque fuera delegado a la Autoridad de forma independiente de B), seguiría existiendo más de una puerta de entrada técnica al mismo efecto — exactamente el patrón que el equipo pidió evitar.

---

## 5. Verificación del objetivo del gate

> "El objetivo es que al terminar H0.7 podamos demostrar que existe una única autoridad sobre la elegibilidad crediticia, sin dejar escritores paralelos que vuelvan a fragmentar `Cliente.bloqueado`."

Con la propuesta de las secciones 2-4:

- **B** escribe a través de la Autoridad (delegado).
- **D** escribe a través de la Autoridad (incorporado como regla interna).
- **C** no escribe nada por su cuenta — reusa la vía de B.

Resultado: **una sola puerta de escritura** (la operación de bloqueo/desbloqueo de la Autoridad de Crédito), con **tres orígenes legítimos y distintos** que la invocan (juicio humano libre, señal de riesgo con decisión humana, regla automática objetiva). Esto cumple el objetivo del gate sin colapsar la diversidad real del negocio en un solo evento artificial.

---

## 6. Clasificación final

### HECHOS
- Hoy B, C y D escriben `cliente.bloqueado` mediante escritura directa (`prisma.cliente.update`), sin pasar por ningún módulo común.
- C usa el mismo endpoint técnico que B (`PATCH /api/clientes/[id]`), pero se dispara desde un contexto distinto (un `Caso` de tipo `RECLAMACIONES_MULTIPLES`).
- D es el único de los tres sin intervención humana en el disparo, y el único cuya auditoría hoy no queda bajo `entidad:'Cliente'`.

### ESTADO TÉCNICO ACTUAL
- No existe ninguna Autoridad de Crédito, ni siquiera como módulo vacío — toda propuesta de este documento es sobre una autoridad que todavía no se ha empezado a construir.
- Ninguno de los cambios de código de gates anteriores (retiro de `FIADO_REcurrente`, fix Preview/Commit, consolidación de `pedido-utils.ts`) ni los documentos de esta serie están comiteados — siguen sin rama, sin PR, directamente en el working tree de `main` (ver nota de trazabilidad al inicio).

### DECISIONES (heredadas de H0.6, no se reabren)
- Modelo de dos niveles (Cliente vs. Pedido) — §0.
- `Caso ≠ Crédito`, `Riesgo ≠ Crédito` — §0.
- B ≠ `PedidoExcepcionCredito`.

### PROPUESTAS (de este documento — requieren aprobación, no implementadas)
- B se delega (mecanismo) y se transforma (forma del dato) — no se reemplaza.
- D se incorpora como regla interna de la Autoridad — no se reemplaza el mecanismo de fondo (sigue siendo un batch diario que aplica una regla objetiva), solo la puerta de escritura.
- C se convierte en señal pura; su atajo actual se reemplaza por una invocación a la misma vía delegada de B — no se crea una tercera puerta de escritura.
- Principio general: "única autoridad" = única puerta de escritura, no un único evento/trigger (§1).

### PENDIENTES (no resueltos acá, genuinos)
- Estructura exacta del registro de motivo/autor/fecha para B (entidad propia vs. campos en `Cliente` vs. otra forma) — el equipo ya pidió no implementar `bloqueadoEn`/`bloqueadoPor`/`bloqueadoMotivo` todavía.
- Si el desbloqueo requiere igual o mayor autorización que el bloqueo.
- Si D debería, a futuro, dejar de persistir un flag y pasar a calcularse en vivo (alternativa de "reemplazo total" considerada y descartada para este gate por exceder su alcance — ver §3).
- Si debería existir alguna reversión automática cuando se paga la promesa vencida que originó un bloqueo de D (pregunta de negocio no resuelta en ningún gate anterior).
- Alcance de permisos (¿debe ampliarse/restringirse quién puede ejecutar el bloqueo/desbloqueo más allá de ADMIN/ASISTENTE?) — corresponde al diseño de permisos del Plan Maestro §11, no a este gate.
- Cómo y cuándo se formaliza en git el trabajo de esta serie de gates (branch/commit/PR) — ver nota de trazabilidad al inicio.

### BRECHA PLAN ↔ CÓDIGO
- Ninguna nueva respecto a H0.6. La brecha ya documentada (asimetría de auditoría de D bajo `entidad:'Pedido'`) se mantiene como brecha a cerrar cuando se implemente la incorporación propuesta en §3, no antes.

---

## 7. Qué sigue

Este documento no habilita construir la Autoridad de Crédito — solo dice, para cada escritor actual, cuál sería su relación con ella si se construyera según el modelo ya decidido en H0.6. Antes de pasar a diseño técnico, los PENDIENTES de la sección 6 (especialmente la estructura del registro de B y el alcance de permisos) parecen, en mi lectura, los que más directamente condicionan cómo se vería esa Autoridad en código — pero corresponde al equipo decidir si eso se resuelve en un H0.8 o ya se considera suficiente para empezar a bocetar el diseño técnico.
