# AGUA BAMBÚ — F5: DIAGNÓSTICO RECARGA (Plan Maestro → código)

**Versión:** 2.1
**Fecha:** 2026-09-15

**v2.1**: el equipo rechazó correctamente el framing de v2.0 ("solo sobreestima ligeramente") y pidió cerrar la fricción de la Regla 4 con rigor: trazar 7 escenarios concretos y determinar, con evidencia, si el modelo actual puede garantizar que nunca se supera la capacidad física. **Veredicto: NO puede garantizarse hoy — y no es un caso raro, es el comportamiento estructural de TODA entrega parcial.** Ver §9 (evidencia de código exacta, los 7 escenarios trazados) y §10 (la única modificación mínima identificada, con la arquitectura exacta que toca). Sigue sin escribirse ningún código.

**v1.1**: segunda pasada pedida por el equipo, exclusivamente sobre los 4 PENDIENTES de §5 — rastreados contra Plan Maestro, ALS, ADRs, conversaciones históricas (todos los transcripts de sesiones previas de este proyecto) y código actual. Resultado consolidado en §6. Regla arquitectónica reafirmada por el equipo (RECARGA = nueva `EmbarqueCarga` dentro del Embarque existente; identidad del Embarque intacta hasta cierre; nunca Embarque nuevo/hijo/operación duplicada) — ya reflejada en §3/§4, sin cambios.

**v2.0**: el equipo cerró los 4 PENDIENTES como propuesta de convergencia (5 reglas concretas) y pidió el diseño técnico mínimo de los 14 puntos, demostrando primero que cada regla es implementable sobre el modelo actual y señalando explícitamente cualquier punto que sí requiera ajustar el modelo. Ver §7 (verificación regla por regla, incluye el único punto real de fricción encontrado — cómputo de "disponible en vivo" — con evidencia, no suposición) y §8 (los 14 puntos). **Sigue sin escribirse ningún código.**
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

---

## 7. Verificación regla por regla contra el modelo actual (v2.0)

El equipo pidió demostrar, antes de escribir código, que cada una de las 5 reglas de convergencia es implementable sobre el modelo actual — y señalar explícitamente cualquier punto donde de verdad haga falta modificarlo.

### Regla 1 — RECARGA continúa el Embarque original (nunca Embarque nuevo/hijo)

**Implementable sin cambios de modelo.** Ya verificado en §1.2: `EmbarqueCarga.embarqueId` no tiene `@@unique` — el schema ya permite 1..N `EmbarqueCarga` por `Embarque`. Un nuevo caso de uso que reciba un `embarqueId` existente y le agregue una `EmbarqueCarga` más no requiere ninguna migración.

### Regla 2 — INICIAL vs RECARGA explícito, sin depender solo de `createdAt`

**Implementable sin campo nuevo en `EmbarqueCarga`.** El modelo actual ya tiene el mecanismo correcto en otro lugar: `EmbarqueMovimiento.tipo` (`CARGA` o `RECARGA`) + `EmbarqueMovimiento.cargaId` (FK a la `EmbarqueCarga` que originó ese movimiento, activado en PR #262 para `CARGA`). Si cada `EmbarqueCarga` nace siempre junto con **exactamente un** `EmbarqueMovimiento` de tipo `CARGA` (la primera) o `RECARGA` (las siguientes) con `cargaId` apuntándose a sí misma, entonces la pregunta "¿esta carga fue inicial o una recarga?" se responde con una consulta explícita (`EmbarqueMovimiento.findUnique({where:{cargaId, tipo:{in:['CARGA','RECARGA']}}})`), **nunca por orden cronológico** — el campo `tipo` es el marcador explícito que pide el equipo, ya persistido en una columna real, solo que en la tabla del movimiento en vez de en `EmbarqueCarga` misma. No hace falta un campo nuevo en `EmbarqueCarga`.

**Único matiz a confirmar, no a decidir yo**: esto asume que TODA `EmbarqueCarga` (incluida la inicial, ya creada por `CrearEmbarqueUseCase` desde PR #262) sigue este invariante 1:1 con su movimiento. Ya es así desde PR #262 — sin cambios adicionales.

### Regla 3 — Solicitar ≠ registrar, sin entidad nueva compleja

**Implementable reutilizando el sistema de notificaciones existente, sin entidad nueva.** Precedente directo ya construido en el propio repo para el mismo patrón exacto ("un actor con menos autoridad señala una necesidad; un actor con más autoridad la resuelve"): `NotificationEventType.EXCEPCION_CREDITO_SOLICITADA`/`_RESUELTA` (F2, `schema.prisma:2296-2297`) — 2 valores de enum, migración aditiva, cero entidad de negocio nueva. Propuesta: agregar `EMBARQUE_RECARGA_SOLICITADA` al mismo enum; el `REPARTIDOR` dispara un evento (`notifyEvent()`, ya existe) con `embarqueId`/producto/cantidad estimada en el payload; `ADMIN`/`ASISTENTE` lo ven en su feed de notificaciones existente y ejecutan la operación real (el caso de uso de §8.1) por su cuenta. **No hay una "solicitud" persistida como entidad de negocio propia** — el registro de que se pidió vive en el log de notificaciones, ya auditado por el sistema existente. Si el equipo necesitara más adelante una bandeja de "solicitudes pendientes" con estado propio, sería una entidad nueva — pero no hay evidencia hoy de que se necesite, y el equipo pidió explícitamente no crearla sin necesidad demostrada.

### Regla 4 — Capacidad = disponible en el vehículo AHORA, no acumulado histórico

**Implementable, pero con un punto real de fricción que hay que señalar, no ocultar.** "Disponible" = `capacidadKg`/`MAX_UNIDADES` − (todo lo cargado hasta ahora en este Embarque − todo lo que ya salió del vehículo hasta ahora). Las dos mitades de esa resta tienen autoridades distintas y **ya existentes**, ninguna nueva:

- **Lo cargado**: suma de `EmbarqueCargaProducto.cantidad` de todas las `EmbarqueCarga` de este `embarqueId` — disponible en tiempo real hoy mismo (se escribe en el momento de cada `CrearEmbarqueUseCase`/futura recarga).
- **Lo que ya salió**: aquí está el matiz. Verificado en el código: `EmbarqueMovimiento{tipo:ENTREGA|VENTA_RUTA|RETORNO}` **solo se escribe al CERRAR el embarque** (`RegistrarMovimientosCierre`, invocado únicamente desde `CerrarEmbarqueUseCase`) — **excepto `BOTELLON`**, que sí se escribe en vivo vía `POST /api/embarques/[id]/botellones` (`botellones.service.ts`, contrato §16, movimientos separados de recogida/entrega). Para los otros 4 productos (`PACA_AGUA`, `PACA_HIELO`, `BOLSA_AGUA`, `BOLSA_HIELO`), `EmbarqueMovimiento` **no tiene ningún hecho de salida hasta que el embarque cierra** — sumar solo `EmbarqueMovimiento` para "lo que ya salió" subestimaría las salidas reales durante una misión activa, y por lo tanto sobreestimaría la capacidad disponible.
  - **La autoridad real de "cuánto se ha entregado" ya existe y es otra**: `Pedido`/`PedidoItem.cantEntrega` (exactamente la misma autoridad que usa `CierreEmbarqueService.calcularDiscrepancia()` para "entregadas", solo que ahí se recibe como parámetro ya armado por el wizard de cierre, no por una consulta en vivo). Para RECARGA, la validación mid-misión necesita sumar `PedidoItem.cantEntrega` de los pedidos de este embarque **en el momento de la solicitud**, no esperar al cierre.
  - **Esto NO es crear una segunda fuente de verdad** — es usar la ÚNICA fuente de verdad de entregas (`Pedido`) que ya existe, en vez de leer `EmbarqueMovimiento` (que, para 4 de 5 productos, todavía no tiene el dato mid-misión porque su escritura está diseñada para ocurrir solo al cierre). Combinar `EmbarqueCargaProducto` (autoridad de cargas) + `Pedido`/`PedidoItem` (autoridad de entregas) + `EmbarqueMovimiento` de botellón (autoridad de recogida/entrega de botellón) es leer 3 autoridades ya existentes, no inventar una cuarta.
  - **Límite honesto a declarar, no a esconder**: si un `Pedido` fue entregado PARCIALMENTE y luego `Pedido.embarqueId` se liberó a `null` (comportamiento ya establecido de PR-1/F4, "libera `embarqueId` en parcial"), una consulta `WHERE embarqueId = X` en el momento de la recarga **ya no vería ese pedido** — la porción entregada de ese pedido no contaría como "salida" en el cálculo de disponibilidad en vivo. Es un caso de borde real, no hipotético. Impacto: la disponibilidad en vivo podría estar **ligeramente sobreestimada** en ese caso específico (nunca subestimada) — un falso positivo de "hay espacio", nunca un falso negativo. No afecta la conciliación final del cierre (que sí usa la lista completa de pedidos del wizard) ni ningún dato comercial/financiero — solo podría permitir una recarga que en la práctica deja el vehículo con un poco menos de margen del calculado. **Señalado explícitamente para que el equipo decida si es aceptable como aproximación de una validación no bloqueante para la integridad de datos, o si requiere tratamiento aparte** — no lo decido yo.

### Regla 5 — RECARGA válida después de entregas parciales

**Se cumple automáticamente si la Regla 4 se implementa correctamente.** No requiere ningún caso especial: si "disponible" se recalcula en vivo (capacidad − cargado + salido) en cada solicitud de recarga, una recarga después de entregas parciales simplemente ve más "disponible" que antes de esas entregas — es el comportamiento natural de la fórmula, no una rama de código aparte.

---

## 8. Diseño técnico mínimo — los 14 puntos (NO implementado)

### 8.1 Caso de uso
`RegistrarRecargaEmbarqueUseCase` — nuevo archivo, mismo patrón y mismas dependencias de dominio que `CrearEmbarqueUseCase` (reutiliza `EmbarqueValidationService`, no lo duplica). Recibe `embarqueId`, `carga: Record<ProductCode, number>` (cantidad de la recarga, no el total), `actorId`, `offlineId?`.

### 8.2 Endpoint
`POST /api/embarques/[id]/recarga`. Reutiliza el patrón de `botellones/route.ts` (auth + rol + `requireOwnership` para `REPARTIDOR`).

### 8.3 Permisos
**Ejecutar la recarga real (escribir `EmbarqueCarga`/movimiento)**: `ADMIN`/`ASISTENTE` únicamente — cumple explícitamente el límite del equipo ("no debe adquirir permisos para resolver discrepancias o autorizar operaciones que no le corresponden"). **Solicitar** (Regla 3): `REPARTIDOR` puede disparar el evento de notificación, sin escribir nada del ledger.

### 8.4 Validación de estado del Embarque
`estado` debe ser `ABIERTO` o `EN_RUTA`. Si es `CERRADO`/`CANCELADO`, se rechaza explícitamente (ese caso ya es "nuevo Embarque", cubierto por `CrearEmbarqueUseCase` + `findByTrabajadorAndFecha`, sin tocarlo).

### 8.5 Validación de capacidad física disponible
Fórmula de la Regla 4 (§7): `capacidadKg`/`MAX_UNIDADES` del Embarque menos (suma de `EmbarqueCargaProducto` de todas sus `EmbarqueCarga`) más (suma de salidas: `PedidoItem.cantEntrega` de pedidos `WHERE embarqueId=X` + `EmbarqueMovimiento{ENTREGA/RETORNO}` de botellón). Rechaza si la recarga solicitada excedería la capacidad disponible resultante. Reutiliza `EmbarqueValidationService.validarCapacidadPeso`/`validarMaxUnidades` pasándoles la `Carga` ya neta (disponible), sin modificar esos métodos.

### 8.6 Creación de `EmbarqueCarga`
Un `tx.embarqueCarga.create({ data: { embarqueId, availabilityBasis, ... } })` — mismo shape que el bloque ya existente en `CrearEmbarqueUseCase`, apuntando al `embarqueId` recibido en vez de a uno recién creado.

### 8.7 Creación de `EmbarqueCargaProducto`
Igual que 8.6, un `create` anidado por producto con `cantidad > 0` — mismo patrón exacto, sin cambios de forma.

### 8.8 `EmbarqueMovimiento.RECARGA`
Un `create` por producto con `cantidad > 0`, `tipo:'RECARGA'`, `destino:'VEHICULO'` — mismo patrón exacto que el dual-write de `CARGA` en PR #262, cambiando únicamente el literal del tipo.

### 8.9 `cargaId`
Cada `EmbarqueMovimiento{RECARGA}` se auto-referencia a la `EmbarqueCarga` recién creada en 8.6 — mismo patrón que PR #262. Resuelve también la Regla 2 (marcador INICIAL/RECARGA vía `tipo`, ver §7).

### 8.10 Trazabilidad/custodia
`logAudit` con actor, `embarqueId`, cantidad, disponible-antes/después (mismo patrón que el resto de escrituras del ledger). `origen`/`destino` del movimiento siguen el vocabulario `CUSTODIAS` ya existente (`ledger-fisico.service.ts`) — sin inventar valores nuevos.

### 8.11 Idempotencia / offline / reintentos
`offlineId` único en `EmbarqueCarga` (dedup antes de crear, mismo patrón que `CrearEmbarqueUseCase.ts:39-44`) — un retry con el mismo `offlineId` devuelve el resultado existente, no duplica. Lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}` — mismo namespace y mismo agregado de concurrencia que `CrearEmbarqueUseCase`, serializa recargas concurrentes del mismo trabajador/día sin sobreconsumo de capacidad.

### 8.12 Integración con conciliación
`EmbarqueProducto.cargadas` se **incrementa** (`update` con `increment`, nunca `create`) para el `embarqueId`+producto ya existente — el `@@unique([embarqueId, producto])` ya fuerza esto estructuralmente. `CierreEmbarqueService.calcularDiscrepancia()` **no se toca**: sigue leyendo `EmbarqueProducto`/`Carga` tal cual, y como esos valores ya reflejan el acumulado (inicial + recargas) gracias al incremento, la conciliación final sigue siendo correcta sin ningún cambio de su propio código — cumple "no modificar la conciliación sin demostrar incompatibilidad" (no hay incompatibilidad: el incremento la alimenta correctamente).

### 8.13 UI mínima necesaria
- Vista de detalle de Embarque (`ledger-client`): ya tiene el tipo `RECARGA` soportado en `movimiento-timeline.tsx`/`types.ts` — sin cambios de esa parte.
- Acción de "solicitar recarga" para `REPARTIDOR` en `/repartidor` (dispara el evento de notificación de 8.3, sin formulario de cantidades — la cantidad exacta la determina quien ejecuta).
- Formulario de "registrar recarga" para `ADMIN`/`ASISTENTE` (cantidad por producto, mismo patrón visual que el formulario de creación de embarque, mostrando la capacidad disponible calculada por 8.5 antes de confirmar).

### 8.14 Tests
- **Unitarios**: cómputo de "disponible" (Regla 4) con distintas combinaciones de cargas/entregas/botellón.
- **Integración** (Postgres real): recarga exitosa → `EmbarqueCarga`+`EmbarqueCargaProducto`+`EmbarqueMovimiento{RECARGA,cargaId}` correctos; `EmbarqueProducto.cargadas` incrementado (no duplicado, respeta `@@unique`); rechazo si `CERRADO`/`CANCELADO`; rechazo si excede capacidad disponible; concurrencia (2 recargas simultáneas se serializan sin sobreconsumo); recarga válida después de entrega parcial (Regla 5); `REPARTIDOR` no puede ejecutar el endpoint de registro (403); conciliación (`calcularDiscrepancia()`) da el mismo resultado correcto con carga inicial + N recargas; no regresión de `embarque-recarga.test.ts` (2+ viajes/día con el previo `CERRADO`, sigue intacto).
- **E2E**: flujo completo `ADMIN` registra recarga sobre un Embarque `EN_RUTA` con entregas ya hechas → aparece en el timeline del ledger como `RECARGA` con su `cargaId`. **Nota sobre el soak (Fase 10, Hub V2)**: este flujo vive enteramente en `src/modules/embarques/`/`src/app/(app)/embarques/`, fuera de `pedido-hub/` y del flag `NEXT_PUBLIC_PEDIDOS_V2` — el job `e2e-hub` del soak solo corre 5 specs explícitamente listadas (`pedidos-hub*`, `pedidos-entrega-suficiencia`, `pedidos-g11`, `pedidos-peek-riesgo`), ninguna de embarques. Un E2E nuevo de recarga entra al job legacy `e2e` (8 shards, ya con su propio baseline de flakiness conocido) — **no toca ni resetea el contador del soak**, siempre que no se modifique `.github/workflows/ci.yml`.

---

## Restricciones — verificación explícita, una por una

- **No tocar `CrearEmbarqueUseCase`**: cumplido — el nuevo caso de uso es un archivo separado; `CrearEmbarqueUseCase` sigue intacto, sigue siendo la única vía para "nuevo Embarque".
- **No crear Embarques hijos**: cumplido — no existe ningún concepto de jerarquía Embarque-padre/hijo en esta propuesta, la `EmbarqueCarga` nueva cuelga del mismo `embarqueId`.
- **No modificar la conciliación sin demostrar incompatibilidad**: verificado en §8.12 — no hay incompatibilidad, el incremento la alimenta correctamente sin tocar su código.
- **No crear una segunda fuente de verdad**: verificado en §7 Regla 4 — se combinan 3 autoridades ya existentes (`EmbarqueCargaProducto`, `Pedido`/`PedidoItem`, `EmbarqueMovimiento` de botellón), ninguna nueva.
- **No refactorizar Embarques en general**: cumplido — cero cambios a `CierreEmbarqueService`, `EmbarqueTransitionsService`, rutas de envío/cancelación, etc.
- **No implementar reglas adicionales no justificadas**: la única pieza no 100% especificada por el equipo (el límite de aproximación de la Regla 4 con pedidos ya desasignados) se señaló explícitamente como punto a decidir, no se resolvió inventando una regla nueva.

**Sigue sin escribirse ningún código.** A la espera de que el equipo confirme (a) el límite de aproximación señalado en la Regla 4, y (b) que el diseño de los 14 puntos puede pasar a implementación.

---

## 9. Regla 4 revisitada — evidencia de código exacta, no aproximación (v2.1)

### 9.1 — El hallazgo central: `Pedido.embarqueId` se pierde EN EL MISMO INSTANTE de toda entrega parcial, no en un caso raro

Código exacto, ambos caminos de entrega:

- `src/modules/pedidos/domain/entities/Pedido.ts:201` — dentro de `entregar()`: `embarqueId: completo ? this.props.embarqueId : undefined`. Comentario en la línea anterior: *"Una entrega parcial deja el pedido re-planificable: se desasigna del embarque"*.
- `src/modules/embarques/domain/services/procesar-pedido.service.ts:486` — mismo patrón exacto en el camino de cierre: `embarqueId: completo ? pedido.embarqueId : null`.

Esto significa: **no es una condición que ocurra "a veces" o "en un caso de borde"** — es la regla incondicional para el 100% de las entregas parciales, por diseño explícito de PR-1/F4 (re-planificabilidad del remanente). Dado que F4 (Cumplimiento) existe precisamente porque las entregas parciales son un caso de negocio frecuente y esperado (no excepcional), la pérdida del vínculo `embarqueId` tampoco es excepcional.

### 9.2 — Verificado: no existe ningún otro rastro inmutable de "esta cantidad salió bajo el embarque X"

- `Pago.embarqueId` (ADR-PAGO-EMBARQUE-CAPTURA-001) es inmutable, pero **solo existe cuando hay cobro** (`validators.ts:189-190`, `tieneCobro`) — una entrega sin pago asociado no genera ningún `Pago`, y por tanto ningún rastro.
- `logAudit` en `EntregarPedidoUseCase` (`EntregarPedidoUseCase.ts:166-176`) registra `{accion:'ENTREGA', estadoEntrega, estadoPago, parcial}` — **sin `embarqueId` ni cantidades por producto**. El `Historial` no permite reconstruir "cuánto salió de qué embarque" para este evento.
- `EmbarqueProducto` (`schema.prisma:1107-1120`) tiene `cargadas/devueltas/cambios/rotas` — **no tiene una columna `entregadas`**. Lo que `calcularDiscrepancia()` llama "entregadas" es un parámetro calculado en vivo por el wizard de cierre a partir de `Pedido`/`PedidoItem` en ESE momento — nunca se persiste incrementalmente durante la misión.

**Conclusión de 9.1+9.2**: no hay ningún dato en el modelo actual, en ningún lugar, que permita reconstruir con precisión "cuánto ha salido físicamente de este Embarque hasta ahora" una vez que una entrega parcial ocurrió. No es una limitación de la consulta que yo proponía en v2.0 — es una ausencia real del dato mismo.

### 9.3 — Los 7 escenarios, trazados con la evidencia de 9.1-9.2

Fixture común: Embarque `EMB-1`, capacidad 60, carga inicial `EmbarqueCargaProducto=60`.

1. **Carga inicial sin entregas**: disponible = 60 − 0 = 60. **Exacto** — no hay ninguna entrega que rastrear todavía, no se activa el hallazgo.

2. **Entrega parcial**: Pedido A (cantPedido=20) entrega 15 de 20. En el MISMO evento, `Pedido A.embarqueId` pasa a `undefined` (9.1). Una consulta `WHERE embarqueId=EMB-1` inmediatamente después **ya no ve al Pedido A**. Disponible calculado = 60 − 0 = **60 (incorrecto)**. Disponible real = 60 − 15 = **45**. **BRECHA CONFIRMADA, en el segundo escenario más simple posible — no en un caso de borde.**

3. **Múltiples entregas**: Pedidos A, B, C con entregas parciales (cada uno se desasigna al momento de su propia entrega) + Pedido D con entrega completa (mantiene `embarqueId`). La consulta solo capturaría a D — la subestimación de "salido" crece con cada entrega parcial adicional, sin límite.

4. **Entrega parcial + desasignación**: no son dos eventos separados — es el mismo evento atómico (9.1). El escenario 2 ya lo cubre exactamente.

5. **Recarga posterior**: si se solicita una recarga después de los escenarios 2-3, "disponible" calculado por consulta en vivo estaría inflado — permitiría cargar por encima de lo que el vehículo realmente tiene espacio, exactamente el riesgo que el equipo señaló.

6. **Recarga + nuevas entregas**: la recarga en sí se registra correctamente (`EmbarqueCargaProducto`, tiempo real, sin brecha). Entregas posteriores completas mantienen el cálculo correcto; entregas posteriores parciales reintroducen el mismo error de 9.1 sobre la nueva base.

7. **Garantía de que nunca se supera la capacidad física**: **NO puede garantizarse con el modelo actual.** El error de subestimación de "salido" (y por tanto de sobreestimación de "disponible") es sistemático y acumulativo con cada entrega parcial — no un margen fijo ni pequeño. Rechazo explícito de mi propio framing de v2.0 ("solo sobreestima ligeramente, nunca subestima") — la magnitud del error no está acotada por el modelo, depende de cuántas entregas parciales hayan ocurrido.

---

## 10. Modificación mínima necesaria (v2.1) — identificada, NO implementada

**No existe ninguna forma de calcular "disponible" con garantía a partir de datos que el modelo actual ya persiste de forma confiable — hace falta un cambio de modelo real, aditivo y acotado.**

### 10.1 — Qué se agrega

Una sola columna nueva: `EmbarqueProducto.entregadas Int @default(0)` — mismo modelo que ya existe (`cargadas`/`devueltas`/`cambios`/`rotas`), mismo espíritu: un agregado físico **a nivel de Embarque**, no una autoridad de "cuánto le corresponde a un Pedido" (eso sigue siendo, sin ninguna ambigüedad, `Pedido`/`PedidoItem.cantEntrega` — no se toca, no se relee, no se referencia desde ningún flujo comercial).

### 10.2 — Cuándo se escribe

Un único `tx.embarqueProducto.update({ where: { embarqueId_producto: {...} }, data: { entregadas: { increment: cantidad } } })` por producto, **en la misma transacción** donde hoy `Pedido.entregar()`/`procesarEntregaParcial` ya deciden nulear `embarqueId` — es decir, en el único instante en que el hecho físico ("esto acaba de salir del vehículo") todavía se conoce con certeza, antes de que se pierda. Se incrementa siempre (entrega completa o parcial), nunca condicionalmente — así el contador nunca depende de si `embarqueId` sobrevive o no.

### 10.3 — Qué arquitectura/decisión existente toca, exactamente

- **`EntregarPedidoUseCase.ts`** (F4/PR-1): se le agrega UNA llamada adicional de escritura, en el mismo punto donde ya escribe el resultado de `pedido.entregar()`. **No cambia ninguna decisión de PR-1** — `Pedido.embarqueId` se sigue neuleando exactamente igual, `total`/`totalPagado` siguen intactos, la re-planificabilidad del remanente no cambia en absoluto.
- **`procesar-pedido.service.ts`** (mismo patrón, rama `procesarEntregaParcial`/completa embebida en cierre): mismo tipo de llamada adicional.
- **`CierreEmbarqueService`/`calcularDiscrepancia()`: CERO cambios.** La nueva columna `entregadas` no la lee ni la escribe la conciliación — sigue exactamente como está, recibiendo su parámetro calculado por el wizard tal como siempre. Esto cumple explícitamente "no modificar la conciliación sin demostrar incompatibilidad": no hay incompatibilidad porque no hay ninguna intersección de código.
- **Migración**: aditiva, un `Int @default(0)`, sin backfill necesario (los Embarques ya cerrados no necesitan este dato — solo importa para Embarques `ABIERTO`/`EN_RUTA` futuros, que empezarán en 0 correctamente).

### 10.4 — Por qué esto NO es una segunda fuente de verdad ni un ledger paralelo

- **No es segunda fuente de verdad de "cuánto se entregó a un Pedido"**: esa pregunta la sigue respondiendo únicamente `PedidoItem.cantEntrega`. `EmbarqueProducto.entregadas` responde una pregunta distinta y hoy sin respuesta: "cuánto ha salido de ESTE VEHÍCULO en total", igual que `cargadas` responde "cuánto entró en total" — ambas son agregados del Embarque, nunca del Pedido.
- **No es un ledger paralelo**: no es una tabla nueva, no registra eventos individuales, no compite con `EmbarqueMovimiento` — es un contador agregado en una tabla que YA existe y YA cumple este rol para los otros 3 hechos físicos del Embarque (cargado/devuelto/cambiado/roto). Es el mismo patrón, aplicado al único hecho físico que le faltaba.
- **No "adelanta el ledger de movimientos"**: deliberadamente NO se propone escribir `EmbarqueMovimiento{ENTREGA}` en vivo para todos los productos (que sí sería adelantar el ledger, y sí generaría doble conteo con `RegistrarMovimientosCierre` al cierre, forzando a tocar esa pieza — evaluado y descartado explícitamente por esto). La columna nueva vive fuera del ledger físico por completo.

### 10.5 — Qué NO se resuelve con este cambio (transparencia, no promesa de más de lo que da)

- Sigue sin existir un registro POR EVENTO de "esta entrega específica salió bajo este embarque" — solo un agregado corriente. Suficiente para el chequeo de capacidad de RECARGA (que solo necesita el total, no el detalle por evento), pero no serviría, por ejemplo, para una auditoría forense de "qué pasó exactamente en la entrega de las 3pm" — eso seguiría sin tener ese nivel de detalle, igual que hoy.
- Requiere que TODOS los callers de entrega (`EntregarPedidoUseCase`, `procesar-pedido.service.ts`, y cualquier futuro camino de entrega) incrementen la columna consistentemente — un tercer camino de entrega que se agregue en el futuro sin este incremento reintroduciría el hueco silenciosamente. Es un costo de mantenimiento real, no gratuito.

**Sigue sin escribirse ningún código.** Este documento identifica la modificación exacta pero espera aprobación explícita antes de tocar `EntregarPedidoUseCase.ts`/`procesar-pedido.service.ts`/el schema.
