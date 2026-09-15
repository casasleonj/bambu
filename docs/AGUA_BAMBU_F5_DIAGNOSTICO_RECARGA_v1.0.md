# AGUA BAMBÚ — F5: DIAGNÓSTICO RECARGA (Plan Maestro → código)

**Versión:** 1.1
**Fecha:** 2026-09-15

**v1.1**: segunda pasada pedida por el equipo, exclusivamente sobre los 4 PENDIENTES de §5 — rastreados contra Plan Maestro, ALS, ADRs, conversaciones históricas (todos los transcripts de sesiones previas de este proyecto) y código actual. Resultado consolidado en §6, al final del documento. Regla arquitectónica reafirmada por el equipo (RECARGA = nueva `EmbarqueCarga` dentro del Embarque existente; identidad del Embarque intacta hasta cierre; nunca Embarque nuevo/hijo/operación duplicada) — ya reflejada en §3/§4, sin cambios.
**Responde a:** decisión de producto del equipo — el modelo de RECARGA queda definido (1..N cargas por Embarque, la recarga permanece dentro del mismo Embarque, genera `EmbarqueMovimiento.RECARGA` vinculado por `cargaId`, nunca crea otro Embarque, la conciliación trabaja sobre el conjunto completo, el repartidor solicita pero no autoriza). Se pidió auditoría exhaustiva de `main` (sin asumir ausencia), diagnóstico HECHO/DECISIÓN/BRECHA/PROPUESTA/PENDIENTE, y **cero código hasta demostrar la brecha exacta**.

**Respuesta directa a la pregunta concreta del equipo:**

> ¿Puede hoy un repartidor tener un Embarque abierto/en ruta, recibir una nueva carga y que esa segunda carga quede registrada correctamente como una RECARGA dentro del mismo Embarque, con trazabilidad física, custodia y conciliación?

**NO.** Auditoría exhaustiva de `main` (commit `3e89b182`) confirma: cero endpoint, cero caso de uso, cero método de repositorio, cero UI de acción, cero permiso, cero test — en ningún punto del código existe una operación que agregue una segunda carga a un `Embarque` ya existente. Evidencia completa en §1.

---

## 0. Metodología de la auditoría (qué se buscó, dónde, con qué resultado)

Búsquedas ejecutadas contra `main` completo (no solo el módulo `embarques`), sin asumir nada por la ausencia de un endpoint "evidente":

| Búsqueda | Resultado |
|---|---|
| `RECARGA` (todo `src/`+`prisma/`, excluyendo tests) | Solo 3 matches: 2 son etiquetas de UI de solo-lectura (`movimiento-timeline.tsx` label, `recovery-form-modal.tsx` opción de selector de origen de un sobrante), 1 es el valor del enum en el schema. Cero uso como operación. |
| `tx.embarqueCarga.create` / `.update` | **Un único caller en todo `src/`**: `CrearEmbarqueUseCase.ts:134`. Ningún otro archivo de producción lo llama. |
| `tipo: 'RECARGA'` / `tipo:.*RECARGA` en un `create` | Cero resultados. |
| `recargar`/`abastecer`/`reabastec`/`solicitar.*recarga` (dominio, no ruido de UI genérica) | Cero resultados relevantes — los únicos matches son "recargar la página" (error boundary), "recargar el peek" (Pedido Hub, no relacionado), un callback `recargar()` de refetch de datos en `/rutas` (no relacionado a inventario físico). |
| Rutas API bajo `/api/embarques/[id]/*` | Lista completa: `stats`, `[id]`, `optimizar-orden`, `sustituciones`, `enviar`, `movimientos`, `cerrar`, `pedidos`, `recovery`, `gastos`, `botellones`. **Ninguna ruta `carga`/`recarga`.** |
| `CrearEmbarqueInput` (DTO) | No tiene ningún parámetro tipo `embarqueIdExistente` — su forma es estrictamente "crear un Embarque nuevo". |
| Interfaces de repositorio (`IEmbarqueRepository` y hermanas) | Ninguna referencia a `EmbarqueCarga` fuera del `tx` crudo usado una sola vez en `CrearEmbarqueUseCase` — no existe ni siquiera una abstracción `IEmbarqueCargaRepository`. |
| Nombres de método `agregarCarga`/`addCarga`/`nuevaCarga`/`crearCargaAdicional`/`segundaCarga` | Cero resultados. |
| `permissions.ts` — permisos relacionados a "carga" | Cero entradas (no hay ninguna acción de "carga"/"recarga" en el sistema de permisos porque la acción misma no existe). |
| `embarque-recarga.test.ts` — ¿toca `EmbarqueCarga`/`EmbarqueMovimiento`/`cargaId`? | **Cero referencias a ninguno de los tres.** Solo ejercita `findByTrabajadorAndFecha` a nivel de `Embarque` (ver §1.2). |
| Tests que creen una 2ª `EmbarqueCarga` sobre el mismo `embarqueId` | Cero — los únicos 2 archivos que crean `EmbarqueCarga` (`ledger-fisico-dual-write.test.ts`, `ledger-fisico-constraints.test.ts`) crean exactamente una por fixture, cada uno con su propio `embarqueId` nuevo. |
| Offline/dedup para una solicitud de "recarga" | Cero — no existe ningún `offlineId`/cola relacionada a este concepto. |

---

## 1. HECHO — qué existe hoy en `main`

### 1.1 — Lo que el código llama "recarga" en un comentario es una cosa DISTINTA a la decisión del equipo

`PrismaEmbarqueRepository.ts:57-72` (`findByTrabajadorAndFecha`), comentario literal: *"Sólo un embarque ACTIVO bloquea uno nuevo el mismo día — CERRADO/CANCELADO no cuentan, **así se habilitan recargas (2+ viajes/día)**"*. `embarque-recarga.test.ts` (cabecera) confirma: permite que un trabajador tenga un **segundo `Embarque` completo e independiente** el mismo día, **solo si el primero ya no está `ABIERTO`/`EN_RUTA`** (`CERRADO`/`CANCELADO`).

Esto es estructuralmente lo opuesto a la decisión del equipo: crea **otro `Embarque`** (nuevo `id`, nueva `EmbarqueCarga` propia, nuevo `numeroDia`, nuevo ciclo de vida completo) — exactamente lo que el equipo dijo explícitamente que NO debe pasar ("no se debe crear otro Embarque simplemente porque el repartidor necesite abastecerse"). El nombre "recarga" en ese comentario es una coincidencia de vocabulario con una decisión de negocio distinta (permitir múltiples viajes completos por día), no una implementación parcial de la RECARGA que el equipo acaba de definir.

### 1.2 — Lo que SÍ está listo a nivel de schema (sin caso de uso que lo use)

- `EmbarqueCarga.embarqueId` **no tiene `@@unique`** (`schema.prisma:1133-1154`, solo `@@index`) — el schema YA permite 1..N filas `EmbarqueCarga` por `Embarque` sin ningún cambio de modelo. Esto es HECHO parcial importante: la decisión "1..N cargas" (punto 1 del equipo) **ya es válida a nivel de base de datos hoy**, solo que ningún caso de uso la ejerce.
- `EmbarqueCargaProducto.cargaId` con `@@unique([cargaId, producto])` — cada `EmbarqueCarga` puede tener sus propios productos sin colisión entre cargas distintas del mismo Embarque.
- `EmbarqueMovimiento.cargaId` (nullable, FK a `EmbarqueCarga`) — el campo para vincular un movimiento a su carga de origen ya existe (recién activado para `CARGA` en PR #262, mismo patrón reutilizable para `RECARGA`).
- `TipoMovimiento.RECARGA` ya existe en el enum (`schema.prisma:119`), con efecto documentado en `ADR-FISICO-001` ("+ custodia del vehículo/carga").
- `EmbarqueProducto` (conciliación legacy) tiene `@@unique([embarqueId, producto])` — fuerza una sola fila acumulada por producto por Embarque. Esto significa que la conciliación YA está preparada estructuralmente para que una recarga se sume (`increment`) sobre la misma fila, sin necesidad de cambiar `calcularDiscrepancia()` — siempre que el escritor de la recarga incremente en vez de crear una fila nueva (que el `@@unique` rechazaría).

### 1.3 — Lo que NO existe, confirmado por ausencia exhaustiva (§0)

Ningún caso de uso, endpoint, método de repositorio, UI, permiso, ni test que:
- cree una segunda `EmbarqueCarga` sobre un `embarqueId` existente;
- escriba `EmbarqueMovimiento{tipo:'RECARGA'}`;
- incremente `EmbarqueProducto.cargadas` sobre una fila ya existente (fuera de la creación inicial);
- distinga "carga INICIAL" de una recarga posterior (no existe ningún campo `tipo`/`esInicial` en `EmbarqueCarga`);
- permita a un `REPARTIDOR` "solicitar" una recarga, ni a un `ADMIN`/`ASISTENTE` "ejecutarla".

---

## 2. DECISIÓN — lo que el Plan Maestro ya define (verbatim del equipo, este mensaje)

1. Un Embarque puede tener 1..N cargas.
2. La carga inicial es `INICIAL`.
3. Una recarga debe permanecer dentro del mismo Embarque.
4. La recarga genera `EmbarqueMovimiento.RECARGA`.
5. La carga/recarga queda vinculada mediante `cargaId`.
6. No se crea otro Embarque por necesidad de abastecerse.
7. La conciliación trabaja sobre el conjunto completo de cargas y movimientos.
8. El repartidor puede solicitar, no autorizar/resolver discrepancias.

---

## 3. BRECHA PLAN ↔ CÓDIGO (exacta)

> El modelo de producto está decidido y **parcialmente modelado en schema** (`EmbarqueCarga.embarqueId` sin `@@unique`, `EmbarqueCargaProducto`, `EmbarqueMovimiento.cargaId`, `TipoMovimiento.RECARGA` ya existen y son estructuralmente suficientes), **pero falta por completo la operación de aplicación** que permite agregar una nueva carga a un Embarque existente. Ningún caso de uso, endpoint, permiso ni UI la implementa. Lo que el código llama "recarga" en un comentario (`findByTrabajadorAndFecha`) es un concepto distinto y ya resuelto (múltiples Embarques/día), que el equipo confirmó explícitamente que NO debe usarse como sustituto.

No hay brecha de schema (punto 1, 2*, 5 ya son posibles sin migración — *ver PENDIENTE sobre el campo `INICIAL`). La brecha es 100% de capa de aplicación: casos de uso, endpoint, permisos, UI.

---

## 4. PROPUESTA (cambio mínimo, NO implementado todavía)

Un nuevo caso de uso `RecargarEmbarqueUseCase` (mismo patrón que `CrearEmbarqueUseCase`, reutilizando sus validaciones de dominio existentes — `EmbarqueValidationService.validarMaxUnidades`/`validarCapacidadPeso`/`validarStock`, sin duplicarlas), que:

1. Recibe `embarqueId` (existente) + `carga: Record<ProductCode, number>` (la cantidad de la recarga, no el total acumulado).
2. Bajo el mismo lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}` ya usado por `CrearEmbarqueUseCase` (mismo agregado de concurrencia).
3. Valida que el `Embarque` exista y esté `ABIERTO`/`EN_RUTA` (si está `CERRADO`/`CANCELADO`, no es una recarga — es un caso ya cubierto por "2+ viajes/día").
4. Calcula la carga acumulada real (suma de todas las `EmbarqueCarga` previas del mismo `embarqueId` + la nueva) y valida capacidad/peso/stock **contra el total acumulado**, no solo contra la recarga aislada (evita que recargas sucesivas burlen `MAX_UNIDADES`/capacidad del vehículo).
5. Crea una nueva `EmbarqueCarga` (mismo `embarqueId`) + `EmbarqueCargaProducto` (hecho físico de la recarga).
6. Incrementa (`update...increment`, nunca `create`) `EmbarqueProducto.cargadas` por producto — mantiene la conciliación existente funcionando sobre el conjunto completo sin tocar `calcularDiscrepancia()`.
7. Crea `EmbarqueMovimiento{tipo:'RECARGA', cargaId: <nueva carga>}` por producto (mismo patrón exacto de PR #262 para `CARGA` — granularidad ya verificada en la convergencia previa).
8. Permisos: `POST` requiere `ADMIN`/`ASISTENTE` para ejecutar (mismo patrón que el resto de escrituras de ledger). El rol de "solicitar" del `REPARTIDOR` (punto 8 de la decisión) queda como **PENDIENTE** — ver §5, no se resuelve inventando un mecanismo.

**Explícitamente NO propuesto**: ningún cambio a `CrearEmbarqueUseCase`, `CierreEmbarqueService`/`calcularDiscrepancia()`, `findByTrabajadorAndFecha`, ni al mecanismo de "2+ viajes/día" — esos siguen intactos y siguen siendo la respuesta correcta a un caso distinto (Embarque previo ya cerrado).

---

## 5. PENDIENTE (no resuelto por las fuentes existentes — no lo decido yo)

1. **Marca "INICIAL"**: la decisión dice "la carga inicial es `INICIAL`" — ¿requiere un campo explícito en `EmbarqueCarga` (ej. `origen: 'INICIAL' | 'RECARGA'`), o basta con que sea derivable (la primera `EmbarqueCarga` por `createdAt` de un `embarqueId` = inicial, el resto = recargas)? Si se requiere un campo explícito, es un cambio de schema adicional (aditivo, no bloqueante) — pero no lo asumo sin confirmación.
2. **Mecanismo exacto de "solicitar"** (punto 8): ¿el `REPARTIDOR` necesita un flujo de solicitud rastreado en el sistema (una entidad "SolicitudRecarga" con estado pendiente→resuelta, similar a `RecoveryDecision`/`PedidoExcepcionCredito`), o "solicitar" ocurre fuera del sistema (radio/mensaje) y el `REPARTIDOR` simplemente no tiene ningún acceso de escritura al endpoint de recarga (que ejecuta `ADMIN`/`ASISTENTE`)? Son dos diseños distintos con distinto costo — el segundo es el "cambio mínimo" de la propuesta de §4; el primero es una entidad nueva, fuera de "cambio mínimo" hasta que se confirme que se necesita.
3. **Validación de capacidad acumulada** (§4.4): confirmar si el tope (`MAX_UNIDADES`/capacidad de peso del vehículo) debe aplicarse sobre el acumulado del día (todas las cargas de ese Embarque) — asumido en la propuesta como la lectura correcta de "1..N cargas dentro del mismo Embarque", pero no está dicho explícitamente en la decisión del equipo.
4. **¿Puede haber recarga después de que ya hubo ventas/entregas parciales?** La decisión no lo dice. Si el Embarque ya entregó parte de su carga inicial antes de recargar, la conciliación (`cargadas - entregadas - devueltas...`) seguiría funcionando aritméticamente con el incremento de `cargadas` propuesto en §4.6, pero no hay confirmación explícita de que este escenario sea válido de negocio (¿un repartidor recarga a mitad de ruta, con entregas ya hechas?).

---

## Entregable pedido — 8 puntos

### 1. Archivos afectados (si se implementa la propuesta de §4)
- Nuevo: `src/modules/embarques/application/use-cases/RecargarEmbarqueUseCase.ts`.
- Nuevo: `src/app/api/embarques/[id]/recarga/route.ts` (o `/carga`, a definir naming).
- Nuevo: entrada en `src/modules/embarques/application/dto/index.ts` (`RecargarEmbarqueInput`).
- Sin cambios: `CrearEmbarqueUseCase.ts`, `CierreEmbarqueService`, `PrismaEmbarqueRepository.findByTrabajadorAndFecha`, `EmbarqueValidationService` (se reutiliza tal cual).
- Posible (condicionado a PENDIENTE #1): migración aditiva si se requiere marcar `INICIAL` explícitamente.

### 2. Flujo actual
Un repartidor con Embarque `ABIERTO`/`EN_RUTA` que necesita más stock **no tiene ninguna operación del sistema para registrarlo** dentro de ese Embarque. La única vía existente (`CrearEmbarqueUseCase`) exige que el Embarque previo esté `CERRADO`/`CANCELADO` — si sigue activo, el sistema rechaza con `'El trabajador ya tiene un embarque abierto hoy'`.

### 3. Flujo esperado (según la decisión)
Repartidor solicita recarga (mecanismo PENDIENTE #2) → `ADMIN`/`ASISTENTE` ejecuta `RecargarEmbarqueUseCase` con el `embarqueId` existente → se valida capacidad acumulada → se crean `EmbarqueCarga`+`EmbarqueCargaProducto` (hecho físico) + se incrementa `EmbarqueProducto` (conciliación) + se crea `EmbarqueMovimiento{RECARGA, cargaId}` (ledger físico) → el Embarque sigue siendo el mismo, mismo `id`, mismo ciclo de vida, cierre único al final del día.

### 4. Brecha exacta
Capa de aplicación completa ausente (caso de uso, endpoint, permisos, UI) — ver §3. Sin brecha de schema para los puntos 1/3/4/5/6/7 de la decisión; brecha de diseño pendiente de decisión para los puntos 2 y 8 (ver §5).

### 5. Cambio mínimo
Ver §4 — un caso de uso nuevo que reutiliza validaciones/modelos existentes sin tocar ningún flujo ya construido.

### 6. Tests necesarios (si se implementa)
- Integración: recarga exitosa sobre Embarque `ABIERTO`/`EN_RUTA` → verifica `EmbarqueCarga` nueva + `EmbarqueMovimiento{RECARGA}` con `cargaId` correcto + `EmbarqueProducto.cargadas` incrementado (no duplicado).
- Rechazo si el Embarque está `CERRADO`/`CANCELADO` (ese caso sigue siendo "nuevo Embarque", no recarga).
- Rechazo si la carga acumulada (inicial + recargas) excede `MAX_UNIDADES`/capacidad de peso.
- Concurrencia: dos recargas simultáneas sobre el mismo Embarque se serializan por el lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}` sin sobreconsumo.
- Conciliación: `calcularDiscrepancia()` sigue produciendo el resultado correcto con carga inicial + N recargas, sin cambios en su propio código.
- Permisos: `REPARTIDOR` no puede ejecutar el endpoint de recarga directamente (403), consistente con el punto 8 de la decisión.
- No regresión: `embarque-recarga.test.ts` (2+ viajes/día con el previo `CERRADO`/`CANCELADO`) sigue pasando sin cambios.

### 7. Riesgos / regresiones
- **Validación de capacidad incorrecta** si el caso de uso nuevo valida solo la recarga aislada en vez del acumulado — permitiría sobrecargar el vehículo por partes. Mitigado en el diseño de §4.4, pero es el riesgo técnico más importante a probar explícitamente.
- **Colisión de `EmbarqueProducto`**: si el escritor usa `create` en vez de `update...increment`, el `@@unique([embarqueId, producto])` lo rechazaría con error de constraint — hay que usar `upsert`/`increment` desde el diseño, no como corrección posterior.
- **Confusión con "2+ viajes/día"**: si el endpoint nuevo no valida que el Embarque siga `ABIERTO`/`EN_RUTA`, alguien podría intentar "recargar" un Embarque `CERRADO`, que es semánticamente un caso distinto (ya cubierto por crear uno nuevo) — debe rechazarse explícitamente, no delegarse silenciosamente a `CrearEmbarqueUseCase`.

### 8. PR propuesta (estructura, no contenido — para cuando se apruebe)
Una sola rama `feat/f5-recarga-embarque` desde `main`, con al menos 2 commits separables: (a) el caso de uso + endpoint + permisos, (b) tests. Sin tocar `CrearEmbarqueUseCase`/`CierreEmbarqueService`/conciliación — si el diff toca esos archivos, es señal de que el alcance se salió de lo mínimo.

---

## 6. Segunda pasada — resolución de los 4 PENDIENTES (v1.1)

**Fuentes rastreadas para cada punto**: (a) `AGUA_BAMBU_PLAN_MAESTRO_INTEGRIDAD_COMERCIAL_v1.0.md` completo (el documento base de F0-F8, incluida su §30 "Conservación física" y §29 "Custodia" — las únicas secciones que mencionan `RECARGA`); (b) `AGUA_BAMBU_ALS_INTEGRIDAD_COMERCIAL_v1.0.als` completo (§27-28, mismas secciones homólogas); (c) los 3 ADRs de la Fase 2 del ledger físico (`ADR-FISICO-001`, `ADR-STOCK-001`, `ADR-CUSTODIA-001`); (d) **todos** los transcripts de sesiones previas de este proyecto (`~/.claude/projects/.../*.jsonl`, todas las conversaciones históricas indexadas, no solo esta); (e) el mensaje literal del equipo que introdujo la decisión de RECARGA en esta conversación; (f) el código actual (ya cubierto en §0-§1).

**Metodología de búsqueda negativa** (para no reportar "no encontrado" por una búsqueda floja): en las fuentes históricas (d) se buscaron combinaciones específicas más allá de la palabra suelta "recarga" — `solicitar+recarga`, `SolicitudRecarga`, `repartidor+recarga`, `carga+INICIAL`, `capacidad+acumulad`, `entrega parcial+recarga` — en ambas direcciones de cercanía textual, sobre cada archivo de transcript individualmente. Cero coincidencias en cualquier sesión distinta a la actual.

### PENDIENTE 1 — ¿La marca `INICIAL` necesita un campo explícito o es derivable?

**NO RESUELTO — requiere decisión de negocio.**

- Plan Maestro §30 y ALS §28 solo listan `CARGA`/`RECARGA` como dos tipos de movimiento distintos dentro de la enumeración de 10 — ninguno de los dos documentos define un atributo `INICIAL` en `EmbarqueCarga`, ni dice si la distinción "primera carga = INICIAL" debe persistirse como dato o si es puramente derivable por orden cronológico.
- El propio mensaje del equipo que introdujo esta decisión dice literalmente "la carga inicial es `INICIAL`" — pero no especifica si eso es una propiedad que el sistema debe **almacenar explícitamente** (ej. un campo `origen: 'INICIAL'|'RECARGA'` en `EmbarqueCarga`) o una **etiqueta conceptual** que ya se cumple con el hecho de que existe un tipo de movimiento `CARGA` (para la primera) distinto de `RECARGA` (para las siguientes) — en cuyo caso ya queda resuelto por el propio `TipoMovimiento` del `EmbarqueMovimiento` asociado, sin necesidad de un campo nuevo en `EmbarqueCarga`.
- Cero mención en cualquier transcript histórico de este proyecto.
- **No lo resuelvo por conveniencia técnica** (sería fácil asumir "ya alcanza con el tipo de movimiento" porque es el camino más barato) — es una lectura razonable pero no está confirmada por ninguna fuente, así que queda como pregunta explícita.

### PENDIENTE 2 — Mecanismo exacto de "solicitar" (repartidor solicita, no autoriza)

**NO RESUELTO — requiere decisión de negocio.**

- Ninguna fuente (Plan Maestro, ALS, ADRs, transcripts históricos) menciona un mecanismo de "solicitud" para movimientos físicos en absoluto. El patrón de "solicitud rastreada con estado pendiente→resuelta por otro actor" **sí existe en el código actual** para otros dominios (`RecoveryDecision`, y el patrón de excepciones de crédito `PedidoExcepcionCredito` de F2) — pero ningún ADR ni el Plan Maestro dice que RECARGA deba seguir ese mismo patrón. Citar la existencia de un patrón similar en otro dominio como "la respuesta" sería precisamente la "conveniencia técnica" que el equipo pidió no usar para resolver esto — lo señalo como precedente disponible, no como fuente que decide.
- El mensaje del equipo dice "el repartidor puede solicitar una recarga, pero no debe adquirir permisos para resolver discrepancias o autorizar operaciones que no le corresponden" — esto establece un **límite** (qué NO puede hacer el repartidor) pero no especifica el mecanismo positivo (cómo se registra/rastrea la solicitud, si la ve un ADMIN en una bandeja, si es una llamada/mensaje fuera del sistema, etc.).
- Cero mención en cualquier transcript histórico.

### PENDIENTE 3 — ¿El tope de capacidad aplica sobre el acumulado del día (inicial + recargas)?

**NO RESUELTO — requiere decisión de negocio**, aunque con una inclinación fuerte de la evidencia disponible.

- Ni el Plan Maestro ni el ALS ni ningún ADR mencionan explícitamente cómo debe comportarse `MAX_UNIDADES`/la capacidad de peso frente a múltiples cargas del mismo Embarque — porque, como confirma §1, esos documentos nunca desarrollan RECARGA más allá de nombrarla en la lista de 10 tipos.
- Lo que SÍ hay es una **invariante física obvia y no ambigua** (no es una zona gris de negocio, es física del mundo real): un vehículo tiene una capacidad de peso/unidades fija en todo momento, sin importar cuántas veces se recargue — `EmbarqueValidationService.validarCapacidadPeso`/`validarMaxUnidades` (`embarque-validation.service.ts`) ya reciben `capacidadKg` como un límite del **vehículo**, no de "una carga individual". Validar solo la recarga aislada permitiría que la suma de varias recargas exceda la capacidad física real del vehículo — eso contradice la realidad física que el propio ledger existe para registrar con precisión (`ADR-FISICO-001`: "custodia es inequívoca").
- **Distingo esto de los otros 3 PENDIENTES**: no es una decisión de negocio en el sentido de "el negocio podría preferir A o B" — es una restricción física que no admite una alternativa de producto razonable (no existe una versión del negocio donde "está bien exceder la capacidad física del vehículo"). Aun así, lo dejo formalmente como **NO RESUELTO POR FUENTE ESCRITA** (ninguna fuente lo dice con esas palabras) en vez de asumirlo como "obvio" — el equipo pidió explícitamente no resolver por conveniencia técnica, y aunque la física no es "conveniencia", prefiero que quede confirmado en vez de asumido.

### PENDIENTE 4 — ¿Es válido recargar después de que ya hubo entregas/ventas parciales del cargamento inicial?

**NO RESUELTO — requiere decisión de negocio.**

- Ninguna fuente lo cubre. Es, de los 4, el que más genuinamente depende de cómo opera el negocio en la práctica (¿un repartidor típico recarga a mitad de ruta con entregas ya hechas, o siempre recarga antes de salir/entre viajes con el vehículo vacío?) — no hay ninguna restricción física ni lógica que fuerce una única respuesta razonable, a diferencia del PENDIENTE 3.
- Cero mención en cualquier transcript histórico.

### Conclusión de la segunda pasada

**Ninguno de los 4 PENDIENTES estaba ya resuelto en una fuente existente.** No se encontró ninguna decisión previa que esta segunda pasada estuviera en riesgo de "volver a convertir en pregunta" — la búsqueda fue exhaustiva y negativa en las 6 fuentes distintas listadas arriba, no una omisión de la primera pasada. Los 4 requieren respuesta explícita del equipo/negocio antes de definir el cambio mínimo de aplicación de RECARGA. El PENDIENTE 3, aunque técnicamente sin fuente escrita, tiene una respuesta físicamente obligada (capacidad del vehículo es acumulada, no por-carga) que recomiendo confirmar por trámite, no por ambigüedad real.

**Ningún código escrito en esta pasada.** Esperando las 4 respuestas antes de retomar la definición del cambio mínimo de aplicación (§4), que puede variar significativamente en tamaño según la respuesta al PENDIENTE 2 en particular.
