# VENTA_LIBRE en el Pedido Hub — Mentalidad · Casos · Criterios de éxito

**Qué es este documento.** Una **precisión de producto** que se incorpora a la arquitectura de experiencia del Pedido Hub ya decidida (`docs/pedidos/03-blueprint-experiencia-hub.md`, PR #220). **No es una nueva fase de reconcepción.** No reabre decisiones cerradas, no inventa políticas pendientes, no duplica lógica de Embarques, no convierte VENTA_LIBRE en un CRUD, no crea un segundo mecanismo antifraude, no infiere origen desde cliente o canal.

**Insumo directo.** La auditoría técnica `docs/pedidos/VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md` (mismo PR). Sus BRECHA-2/4/6 dejan de ser "hallazgos" y pasan a ser **requisitos de diseño** de esta parte.

**Autoridad.** Este documento es la autoridad de **mentalidad + casos + criterios de éxito de VENTA_LIBRE en Pedidos**. El blueprint sigue siendo la autoridad del Hub en general; `00-plan-frontend-rediseno-integral.md` la de fases/PRs; los ADRs la de dominio.

**Instrucción de cierre del equipo (2026-09-08) — incorporada.** La §0 (definición canónica), la §0bis (matriz de autorización), la §3 refinada y la §3bis ("Pedidos NO crea Venta Libre") recogen la instrucción de cierre. Verificación de código asociada: la opción de Fase 5 "Venta durante la ruta →" **solo navega** al contexto de Embarques y **no** ejecuta creación desde Pedidos (`src/app/(app)/pedidos/pedidos-client/__tests__/hub-accion-frontera.test.ts`, rama `feat/pedidos-fase5-n2`).

---

## 0. Definición canónica de referencia (vinculante — no reabrir)

> **VENTA_LIBRE** representa una **venta que no estaba respaldada previamente por un Pedido y que ocurre dentro del contexto de un Embarque.**

**Se registra ÚNICAMENTE por dos vías, ambas ancladas a un Embarque concreto:**

- **(A) En ruta — repartidor asignado.** El repartidor que ejecuta ese Embarque registra una venta emergente mientras el Embarque está activo/en ruta. **El backend valida esta autorización** (repartidor asignado a ese Embarque); no basta con ocultar el botón en el frontend.
- **(B) En conciliación — Admin/Asistente autorizado.** Durante la conciliación de **ese Embarque específico**, Administración/Asistencia registra una venta que el repartidor reportó. **No** es un "Crear Venta Libre" genérico: está acotada a la conciliación de ese Embarque y a su repartidor responsable.

**NO existe** un mecanismo genérico de "Crear Venta Libre" desde Administración fuera de la conciliación de un Embarque. **El Pedido Hub NO crea VENTA_LIBRE** — solo puede mostrarla, consultarla y contextualizarla (`mostrar ≠ crear`).

**Trazabilidad mínima e inequívoca — siempre distinguibles:**

| Dimensión | Qué es |
|---|---|
| **Comprador** | para quién fue la venta (cliente existente / cliente nuevo / consumidor final) |
| **Repartidor responsable** | quién ejecutaba el Embarque |
| **Usuario registrador** | quién capturó la operación en el sistema |
| **Momento de ocurrencia** | cuándo se produjo la venta |
| **Momento de registro** | cuándo se capturó en el sistema |
| **Contexto de captura** | ruta vs conciliación |

**Una diferencia de conciliación (faltante) NO es, por sí sola, una Venta Libre.** La venta libre solo se registra ante una **operación comercial real**.

---

## 0bis. Matriz de autorización (vinculante)

| Acción | Contexto requerido | Quién puede | Backend lo valida |
|---|---|---|---|
| **Registrar Venta Libre** | Embarque activo / en ruta | **Repartidor asignado a ese Embarque** | Sí — `EMBARQUE_NO_PERTENECE` para REPARTIDOR |
| **Registrar Venta Libre reportada** | Conciliación de **ese** Embarque | **Admin / Asistente autorizado** (sobre ese Embarque y su repartidor) | ⚠️ **parcial — ver BRECHA-8 en la auditoría** |
| **Crear desde el Pedido Hub** | cualquier contexto | **NO PERMITIDO** | Sí — Pedidos no expone endpoint de creación de VL; verificado por `hub-accion-frontera.test.ts` |
| **Crear genérica desde Administración** | fuera de conciliación | **NO PERMITIDO** | ⚠️ **BRECHA-8** — `POST /api/pedidos/venta-libre` hoy acepta ADMIN/ASISTENTE contra cualquier Embarque `ABIERTO` sin gate de conciliación |

> La fila 2 y la fila 4 comparten la **BRECHA-8** (auditoría §2.18): el path A del endpoint permite a ADMIN/ASISTENTE crear una VL sobre cualquier Embarque abierto sin ser el repartidor asignado y sin contexto de conciliación. La regla canónica exige que ADMIN/ASISTENTE solo registren VL **dentro de la conciliación de un Embarque**. Corrección = requisito, no rediseño.

---

## 1. Mentalidad fundamental del Hub (precisión)

El usuario **no** debe pensar en entidades técnicas (`Pedido → tipo → origen → canal → estado → embarque`). Debe pensar:

> **¿Qué operación ocurrió? ¿En qué contexto? ¿Para quién? ¿Qué se comprometió o vendió? ¿Qué pasó después? ¿Hay algo que requiera mi atención?**

El Hub es una **superficie operacional contextual**, no una tabla CRUD de registros. Muestra **contexto**, no solo registros; **explica operaciones**, no solo estados; **reutiliza información**, no la vuelve a pedir; **muestra relaciones**, no mezcla dominios; **hace visibles excepciones**, no convierte todo en alertas; **permite decisiones**, no obliga a interpretar el sistema.

> **Principio rector del Hub (queda en la definición de mentalidad):**
> Pedidos no es solo el lugar donde se crean y editan pedidos. Es la superficie donde el usuario **comprende y gestiona el contexto comercial** de las operaciones que afectan la demanda, su ejecución y su resultado, **respetando las responsabilidades de cada dominio**.

---

## 2. VENTA_LIBRE no es un "tipo de pedido" para el usuario

Internamente el mecanismo canónico es `Pedido.origen = VENTA_LIBRE` (auditoría §1 — no hay tabla dedicada, la entidad `VentaLibre.ts` es inerte y se elimina). **Esa estructura interna no se traslada al lenguaje de la interfaz.**

| Modelo técnico | Modelo mental del usuario |
|---|---|
| `Pedido` └ `origen = VENTA_LIBRE` | Operación comercial └ ocurrió durante una ruta |

El usuario ve **"Venta durante la ruta"** (o el término que se valide en la revisión de UX), nunca `origen = VENTA_LIBRE` ni `embarqueOrigenId`.

---

## 3. VENTA_LIBRE **aparece** en Pedidos, pero **no nace** en Pedidos

Pedidos puede **mostrar, consultar y contextualizar** una venta libre. **No es su punto genérico de creación.** Hay **dos** momentos legítimos de captura — ambos deben estar contemplados en los criterios de éxito:

### A. Durante la ruta (repartidor)
```
Embarque → En ruta → Repartidor → registra Venta Libre
```
El repartidor ejecuta un Embarque y registra una venta no respaldada por un Pedido previo.

### B. Durante la conciliación (Administración / Asistencia)
```
Embarque → Conciliación de ESE embarque → Admin/Asistente autorizado → registra Venta Libre reportada por el repartidor
```
El Embarque terminó; el repartidor entregó reporte, dinero, mercancía. Durante la conciliación **de ese Embarque** se registra una venta libre que pertenece a esa ruta y a ese repartidor.

**No es un "Crear Venta Libre" genérico.** Está acotada a:
- la **conciliación de un Embarque concreto** (no un formulario de alta suelto en Administración);
- el **repartidor responsable** de ese Embarque (la venta se atribuye a su ruta, no al registrador);
- una venta que el repartidor **reportó** (la conciliación registra lo reportado, no inventa operaciones).

> **Corrección de una trampa que estábamos a punto de introducir:** "VENTA_LIBRE nace en Embarques" es correcto como **pertenencia operacional**. "Solo puede capturarla el repartidor en ruta" **no** lo es. La conciliación es un segundo punto de captura legítimo. El diseño **no** debe asumir "Venta Libre = venta creada por repartidor".
>
> Pero el converso también es una trampa: **la conciliación no habilita un alta libre**. Admin/Asistente registra VL **solo dentro de la conciliación de un Embarque**, nunca como una acción genérica "en cualquier momento". El backend debe hacer cumplir esto (hoy no del todo — auditoría BRECHA-8).
>
> Estado en `main`: ambos caminos existen (auditoría §1 — A = `POST /api/pedidos/venta-libre`, B = `CrearVentasLibresService` desde el cierre). El path A, sin embargo, acepta ADMIN/ASISTENTE contra cualquier Embarque `ABIERTO` sin gate de conciliación (BRECHA-8). El diseño de experiencia debe representar los dos caminos **sin confundirlos** y el backend debe cerrar la brecha de autorización.

---

## 3bis. Pedidos **NO crea** Venta Libre

**`mostrar ≠ crear`.** El Pedido Hub:

- **puede** mostrar una VL en la lista, abrir su Peek, explicar su contexto, cruzarla con un Pedido relacionado;
- **no puede** — y no debe tener acción que lo haga — crear una VL, ni en el path del repartidor ni en el del admin.

**La opción de Fase 5 "Venta durante la ruta →"** (que aparece en el panel de frontera N2 cuando hay remanente sin obligación) **es navegación, no un flujo de creación.** Lleva al contexto de Embarques (`/embarques/[id]` si el pedido tiene embarque, `/embarques` si no) y **no ejecuta** ninguna creación de VENTA_LIBRE desde Pedidos.

- No existe un `POST /api/pedidos/venta-libre` invocado desde ningún componente del Pedido Hub.
- No hay una segunda implementación de Venta Libre dentro de Pedidos.
- Verificación: `src/app/(app)/pedidos/pedidos-client/__tests__/hub-accion-frontera.test.ts` (source-check: `case 'venta-libre'` solo hace `router.push(...)` a `/embarques`, nunca `setShowModal`/`fetch`/`/api/pedidos/venta-libre`).

Si la revisión de UX decide que "Venta durante la ruta →" confunde (parece ofrecer creación), la mitigación es de **copy/ubicación** (moverla, renombrarla "Ver en Embarques →", o quitarla), **nunca** convertirla en un flujo de alta.

---

## 4. Cuatro dimensiones que **no** se colapsan

La experiencia y el modelo deben distinguir cuatro hechos distintos, cada uno con valor de trazabilidad propio:

| Dimensión | Qué responde | Ejemplo | Fuente en `main` |
|---|---|---|---|
| **Comprador** | ¿Para quién fue la venta? | "Tienda La Esperanza" / "Consumidor final" | `Pedido.clienteId` — **hoy siempre `CONSUMIDOR_FINAL` en el path A** (auditoría BRECHA-4) |
| **Responsable operativo** | ¿Quién ejecutaba el Embarque? | "Juan Pérez · Repartidor" | `Embarque.trabajadorId` (vía `Pedido.embarqueOrigenId`) |
| **Registrador** | ¿Quién capturó la operación en el sistema? | "Juan Pérez" (ruta) o "María López · Asistente" (conciliación) | `Pedido.createdById` |
| **Momento de captura** | ¿Cuándo se registró (y cuándo ocurrió)? | "Durante la ruta · 10:42" / "Durante conciliación · 17:18" | `occurredAt` / `capturedAt` / `serverReceivedAt` / `createdAt` |

**El registrador ≠ el responsable operativo.** En una venta libre de conciliación, el responsable operativo es el repartidor de la ruta; el registrador es Administración/Asistencia. La interfaz **nunca** debe presentar al registrador como si fuera quien hizo la venta.

> **Requisito de diseño:** la lista y el Peek deben poder mostrar estas cuatro dimensiones por separado (con divulgación progresiva — no todas a la vez en la lista).
>
> Estado en `main`: "responsable operativo" y "registrador" hoy **coinciden** en el path A (el repartidor es ambos) y **se pueden confundir** en el path B (el `createdById` del `Pedido` es el admin; el repartidor solo se infiere vía `embarqueOrigenId → Embarque.trabajadorId`). El diseño debe hacer explícita la distinción; el dato existe.

---

## 5. Representación en la **lista** (divulgación progresiva)

La lista **no** es una tabla administrativa gigante. La representación inicial debe identificar **inequívocamente** la operación y su resultado, priorizando:

1. **identidad de la operación** (qué / para quién)
2. **contexto** (ruta / momento)
3. **resultado** (pago / entrega)
4. **atención requerida** (solo si es real)

**Forma conceptual** (el diseño visual final se valida en la revisión de UX):

```
Venta durante la ruta
Tienda La Esperanza · 5 pacas · $15.000
Embarque #104 · Juan Pérez · registrada en ruta
✓ Pagada · ✓ Entregada
```

Y cuando aplique **de verdad**:
```
⚠ Requiere revisión
```

**Reglas:**
- El estado se comunica como **microcopy** ("registrada en ruta", "registrada en conciliación", "esperando entrega"), no como badges apilados (G6).
- **No** usar alarmas indiscriminadas. `⚠` solo con una señal, inconsistencia o excepción **real**.
- La venta libre **de conciliación** se distingue en la lista: `registrada en conciliación` en vez de `registrada en ruta`.

---

## 6. Representación en el **Peek** (contexto antes que campos)

El Peek **cuenta la historia**, no lista campos. No `ID / Origen / Canal / Estado / Cliente / …`.

**Forma conceptual — capa 1 (instantánea, del payload de la lista):**
```
Venta durante la ruta
Tienda La Esperanza · 5 pacas · $15.000

Embarque #104 · Ruta Centro
Responsable del embarque: Juan Pérez
Registrada por: Juan Pérez · durante la ruta · 10:42
```

**Capa 2 (bajo demanda / lazy, patrón `panel-prefetch`):**
- **Mercancía** — producto → cantidad → precio → total.
- **Pago** — qué se recibió, cuánto, estado (`REPORTADO`/`CONFIRMADO`/`DISCREPANTE`), evidencia disponible (foto).
- **Ejecución** — entrega (inmediata / posterior), GPS, foto, movimiento físico cuando corresponda.
- **Relaciones** — Pedido relacionado, Embarque, Factura, Cartera, conciliación — **solo cuando realmente existen** (acceso, no fusión; el Peek distingue "saldo de esta operación" de "cartera del cliente", igual que en Fase 4b).
- **Atención** — únicamente señales, inconsistencias o excepciones reales.

**Venta libre de conciliación — variante del Peek:**
```
Venta durante la ruta (registrada en conciliación)
Tienda La Esperanza · 5 pacas · $15.000

Embarque #104 · Ruta Centro
Responsable del embarque: Juan Pérez
Registrada por: María López · Asistente · durante conciliación · 17:18
```

---

## 7. Qué **NO** es una VENTA_LIBRE (casos negativos, obligatorios)

| No es | Es | Regla |
|---|---|---|
| Modificación de un Pedido | Operación nueva e independiente | Ver §8 |
| Vía para cuadrar un faltante de conciliación | — | Ver §9 |
| Una devolución / retorno | Flujo de retorno del Embarque | Un retorno **nunca** se convierte automáticamente en venta libre |
| Un producto dañado | Flujo de daño/rotura del Embarque | Producto dañado ≠ venta libre; se queda en su dominio |
| Una corrección de precio | Detección + tratamiento según reglas vigentes | Una discrepancia de precio **no** se resuelve creando otra operación |
| Un ajuste / sobrante / reposición | Su dominio correspondiente | — |

---

## 8. Caso crítico: **Pedido + demanda adicional durante la ruta** (VL-03)

```
Pedido: 20 pacas
Durante la ruta el cliente pide +5 pacas
```

- La operación original **sigue siendo** `Pedido = 20`. **No** se modifica silenciosamente a `25`.
- La nueva operación es `Venta durante la ruta = 5`.
- La interfaz **puede explicar la relación**: "Pedido original: 20 · Venta adicional durante la ruta: 5".
- La interfaz **nunca** comunica "Pedido modificado de 20 a 25".

Esto mantiene la separación ya establecida entre **corrección** (G11.A — mismo pedido), **nueva demanda** (G11.B — pedido nuevo relacionado por `pedidoOrigenId`) y **venta emergente durante ruta** (venta libre).

> Estado en `main`: la venta libre de "+5" **no** queda vinculada al pedido de 20 (auditoría BRECHA-3 — `venta-libre/route.ts` no setea `pedidoOrigenId`). El diseño de experiencia **requiere** ese vínculo para poder "explicar la relación". → depende de que el path A tenga identificación de cliente (BRECHA-4).

---

## 9. VENTA_LIBRE **no** se usa para cuadrar diferencias de conciliación (VL-09)

Si en la conciliación aparece "faltan 5 pacas", eso **no** es "crear una venta libre de 5".

```
Diferencia física → reconciliación → investigación → excepción/responsabilidad según corresponda
```
**NUNCA**: `diferencia → Venta Libre`.

La venta libre solo se registra cuando existe una **operación comercial real** que corresponde registrar. Esto es fundamental para que la conciliación no se vuelva un mecanismo para ocultar diferencias.

> Estado en `main`: el cierre del embarque ya trata las diferencias como discrepancia (con `justificacionDiscrepancia`/`justificacionFaltante` → `DeudaTrabajador`). El path B de captura de venta libre y el flujo de discrepancia son **caminos distintos** en `CerrarEmbarqueUseCase`. El riesgo es de **experiencia**: la UI de conciliación no debe sugerir "registra una venta libre" ante un faltante. → requisito para el rediseño de la UI de conciliación (Embarques), **no** para el Hub; se anota aquí como frontera.

---

## 10. Inventario: comprometido vs disponible (VL-07 / VL-08)

El sistema debe distinguir conceptualmente:
```
Carga total (70) = mercancía comprometida (a Pedidos asignados, 60) + mercancía disponible (10)
```
Una venta libre consume **mercancía realmente disponible** según las reglas del dominio. **No** se asume que toda la carga está disponible para venta libre.

> Estado en `main`: **no existe** esta distinción en el momento de la venta (auditoría BRECHA-2 — `venta-libre/route.ts` no lee la carga; el descuadre solo se ve al cierre).
>
> **Decisión de política ante insuficiencia de disponibilidad: PENDIENTE.** No se inventa en esta fase. Queda **separada de la decisión UX**:
> - **PENDIENTE-VL-INV-1:** ¿la validación de disponibilidad es preventiva (rechazar la venta libre) o detectiva (permitir + señal + registro)?
> - **PENDIENTE-VL-INV-2:** ¿qué cuenta como "comprometido" — solo pedidos `EN_RUTA` asignados, o también `PENDIENTE` planificados a esa ruta?
>
> El **mecanismo** (leer `Embarque.productos`/carga en el punto de captura, tanto online como en el replay offline) es implementación, no política.

---

## 11. Consumidor final (VL-05)

La interfaz **no** obliga a convertir una venta emergente en un cliente formal cuando no hay relación comercial que lo justifique. Debe poder representar **"Consumidor final"** sin atravesar un formulario de cliente completo.

**Regla: mínima fricción compatible con trazabilidad suficiente.**

**No confundir:**
- **ausencia de cliente real** (venta anónima legítima — CONSUMIDOR_FINAL) — válido, sin fricción.
- **información incompleta que deberíamos haber capturado** (era un cliente real / cliente nuevo y se registró como anónimo por falta de la feature) — esto es BRECHA-4, no "consumidor final".

> Estado en `main`: hoy **todo** el path A es CONSUMIDOR_FINAL por falta de selector (BRECHA-4). El diseño debe permitir las **tres** opciones explícitas: cliente existente · cliente nuevo (con la evidencia que se recupere, EH-2) · consumidor final. Y debe hacer que "consumidor final" sea una **elección**, no un default forzado.

---

## 12. Matriz de casos y criterios de éxito

`criterio de éxito` = qué debe lograr la experiencia · `main` = estado actual (cross-ref auditoría) · `falta` = qué habilita este diseño.

| ID | Caso | Criterio de éxito (experiencia) | `main` | Falta |
|---|---|---|---|---|
| **VL-01** | Venta libre durante ruta | El repartidor la registra; queda asociada al Embarque; es visible después en Pedidos con su contexto (ruta, repartidor, momento) | ✅ se crea y queda con `embarqueOrigenId`; ⚠️ aparece en Pedidos pero sin representación de "venta durante la ruta" (hoy es una fila más) | Representación en lista/Peek (§5, §6) |
| **VL-02** | Venta libre registrada en conciliación | Admin/Asistencia la registra; se conservan Embarque, **responsable operativo** (repartidor), **comprador**, **registrador**, **momento de captura** y demás datos; la lista/Peek la marcan "registrada en conciliación" y **no** confunden registrador con responsable operativo | ✅ se crea (path B); ⚠️ el `createdById` es el admin y el repartidor solo se infiere vía `embarqueOrigenId`; sin distinción visual | Distinción explícita de las 4 dimensiones (§4); microcopy "registrada en conciliación" |
| **VL-03** | Pedido + venta adicional | `Pedido = 20` intacto; `Venta libre = 5` independiente; la interfaz explica la relación; **nunca** "pedido modificado a 25" | ✅ no se modifica el pedido; ❌ no hay vínculo (BRECHA-3) | `pedidoOrigenId` en la venta libre + representación de la relación en el Peek de ambos |
| **VL-04** | Venta libre para cliente existente | Reutiliza contexto conocido del cliente cuando es seguro (dirección, historial), sin re-pedir datos | ❌ path A no puede elegir cliente (BRECHA-4); path B sí (solo existentes) | Selector de cliente en el path A + reutilización de contexto |
| **VL-05** | Venta libre para consumidor final | Operación sin forzar creación de cliente; "consumidor final" es una **elección** explícita, no un default | ⚠️ es el único camino hoy (default forzado) | Que sea una de tres opciones, no la única |
| **VL-06** | Venta libre de empleado (precio preferencial) | Una compra legítima de empleado con precio preferencial **puede existir**; **no** se convierte automáticamente en fraude; la operación legítima se distingue y los controles detectan patrones anómalos | ❌ no hay concepto de "venta a empleado"; un precio manual bajo de ADMIN/ASISTENTE pasa sin fricción, uno de REPARTIDOR se bloquea | **PENDIENTE-VL-EMP-1**: ¿cómo se declara una venta preferencial a empleado? (categoría de cliente / autorización / registro) — decisión de negocio, no se inventa |
| **VL-07** | Mercancía disponible | La venta libre se registra cuando hay disponibilidad válida | ❌ no se valida disponibilidad (BRECHA-2) | Lectura de carga en el punto de captura |
| **VL-08** | Mercancía insuficiente | El sistema respeta la política de negocio vigente; si no existe, se mantiene **explícitamente PENDIENTE** y separada de la decisión UX | ❌ no se valida | **PENDIENTE-VL-INV-1/2** (§10) |
| **VL-09** | Diferencia de conciliación | **No** se crea automáticamente una venta libre para cuadrar faltantes; la diferencia sigue el flujo de reconciliación/investigación/excepción | ✅ son caminos distintos en el cierre | Que la **UI de conciliación** no sugiera "venta libre" ante un faltante (frontera con Embarques, §9) |
| **VL-10** | Retorno | Una devolución/retorno **no** se convierte automáticamente en venta libre | ✅ flujos distintos | — (mantener) |
| **VL-11** | Producto dañado | Producto dañado ≠ venta libre; se queda en su dominio | ✅ `rotas` es su propio campo del cierre | — (mantener) |
| **VL-12** | Precio incorrecto | Una discrepancia de precio se detecta y se trata según reglas vigentes; **no** se resuelve creando otra operación | ⚠️ el detector `PRECIO_POR_DEBAJO_TABLA` existe pero **no ve las ventas libres anónimas** (BRECHA-6) | Que el antifraude observe las ventas libres (§13) |
| **VL-13** | Venta ficticia | Trazabilidad suficiente para que el sistema detecte inconsistencias entre operación declarada · mercancía · pago · embarque · usuario · comprador · conciliación | ⚠️ backstop de cierre (stock + caja agregados); ❌ sin señal por operación (BRECHA-6) | Correlación por `embarqueOrigenId`/repartidor en el detector |
| **VL-14** | Subdeclaración (se declara menos de lo entregado) | El sistema contempla el riesgo de declarar menos mercancía vendida que la realmente entregada | ⚠️ solo el descuadre de stock del cierre lo revela, agregado | Correlación mercancía declarada en ventas libres vs mercancía faltante en el cierre |
| **VL-15** | Captura offline | Respeta idempotencia · sincronización · concurrencia · auditoría · confirmación de pago; **no** asume que `navigator.onLine` demuestra conectividad real | ✅ `fetchResilient` + `requestQueue` + `offlineId @unique` + `clasificacionTemporal`; ❌ sin validación de stock offline (BRECHA-2) | Validación de stock en el replay (cuando exista la política) |

### 12bis. Casos de autorización y frontera (instrucción de cierre)

`criterio de éxito` = qué debe garantizar el sistema (experiencia **y** backend). Estos casos complementan la matriz de experiencia de §12 y son la referencia para las pruebas E2E de autorización.

| ID | Caso | Criterio de éxito | `main` |
|---|---|---|---|
| **VL-A01** | Repartidor asignado registra VL en ruta | Se permite; queda anclada al Embarque y al repartidor; visible luego en Pedidos con su contexto | ✅ (path A) |
| **VL-A02** | Usuario **no** asignado a ese Embarque intenta registrar VL en ruta | Backend rechaza (no solo el frontend). Para REPARTIDOR: `EMBARQUE_NO_PERTENECE` | ✅ para REPARTIDOR / ❌ para ADMIN-ASISTENTE (**BRECHA-8**) |
| **VL-A03** | Admin/Asistente registra VL **reportada** dentro de la conciliación de ese Embarque | Se permite; se conserva repartidor responsable ≠ registrador; se marca "registrada en conciliación" | ✅ (path B, `CrearVentasLibresService`) |
| **VL-A04** | Admin/Asistente intenta registrar VL **fuera** de una conciliación (alta genérica) | **NO PERMITIDO** — no debe existir el mecanismo | ❌ path A lo permite contra cualquier Embarque `ABIERTO` (**BRECHA-8**) |
| **VL-A05** | Cualquier usuario intenta crear VL **desde el Pedido Hub** | **NO PERMITIDO** — Pedidos no ofrece creación; "Venta durante la ruta →" solo navega | ✅ verificado (`hub-accion-frontera.test.ts`) |
| **VL-A06** | Una VL ya registrada aparece en la lista de Pedidos | Se muestra como "venta durante la ruta" con su contexto; **no** como una fila de pedido más | ⚠️ hoy es una fila más (§5/§6 lo resuelven) |
| **VL-A07** | El Peek de una VL | Permite comprender qué/para quién/qué ruta/qué repartidor/quién registró/cuándo ocurrió/cuándo se registró/pago/entrega/relaciones/atención — sin conceptos técnicos | ⚠️ Peek genérico; §6 define la variante VL |
| **VL-A08** | Distinguir comprador / repartidor / registrador | Las tres nunca se colapsan; el registrador jamás se presenta como quien hizo la venta | ⚠️ dato existe, distinción visual falta (§4) |
| **VL-A09** | Pedido + VL adicional en la misma ruta | El Pedido original no se modifica retroactivamente; la VL es independiente; la relación se puede explicar | ✅ no se modifica / ❌ sin vínculo (BRECHA-3) |
| **VL-A10** | Pendiente N2 de un pedido | **No** se convierte automáticamente en VL; completar N2 y registrar una VL son decisiones distintas y explícitas del usuario | ✅ (Fase 5 — frontera explícita, sin inferencia) |
| **VL-A11** | Diferencia de conciliación (faltante) | **No** genera una VL automáticamente ni la UI de conciliación la sugiere; sigue el flujo de reconciliación/investigación | ✅ caminos distintos en el cierre / ⚠️ requisito UX de conciliación (§9) |
| **VL-A12** | Consumidor final | Se puede registrar sin crear cliente formal; es una **elección** explícita, no un default forzado | ⚠️ hoy default forzado en path A (BRECHA-4) |
| **VL-A13** | Trazabilidad completa | Embarque + usuario registrador + repartidor + momento de ocurrencia + momento de registro + mercancía quedan siempre reconstruibles | ✅ path A (timestamps + `clasificacionTemporal`) / ⚠️ path B sin timestamps |
| **VL-A14** | Offline / concurrencia | Idempotencia (`offlineId @unique`), sincronización, confirmación de pago REPORTADO→CONFIRMADO; `navigator.onLine` no se toma como prueba de conectividad | ✅ (`fetchResilient` + `requestQueue`) |
| **VL-A15** | Señal antifraude sobre una VL | Es una **señal para revisión administrativa**, no una acusación ni un bloqueo automático; nunca se convierte sola en deuda del cliente | ✅ principio (`clasificacionTemporal` señala, no bloquea) / ⚠️ detector no ve VLs anónimas (BRECHA-6) |
| **VL-A16** | Corrección de una VL | Vía auditable que preserva la historia; no se borra ni se reescribe el registro original | ⚠️ hoy VL `ENTREGADO` solo se corrige anulando (BRECHA-7) |

> **Regla transversal (instrucción de cierre):** una señal de diferencia o de fraude **no equivale automáticamente a una deuda del cliente**. Para convertir una diferencia en obligación de cobro hay que determinar la causa (error de Agua Bambú / modificación legítima / error del cliente / operación irregular / otra) y pasar por el flujo de revisión/autorización correspondiente. Ver `docs/pedidos/POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0.md`.

---

### 13. Fraude de volumen — caso explícito

**No** limitar el análisis a "¿se creó una venta libre?". El problema puede ser:
```
Venta real: 2 + 3 + 2 + 3   →   declarada como: 10 unidades   →   con condición de precio favorable
```

- **Agrupar operaciones a posteriori en un pedido de volumen: estructuralmente imposible** (auditoría §2.7 — no hay fusión de pedidos). Este vector está cubierto por diseño.
- **Registrar directamente una venta libre de 10 (o de un precio) que no corresponde a la venta real: NO cubierto hoy.** Los controles deben considerar **patrones y correlaciones** (cantidad vs stock del cierre, montos anómalos por repartidor, % de ventas libres anónimas, precio bajo tabla en venta libre), **no** solo la existencia del registro.
- **Reutilizar la infraestructura antifraude existente** (`alertas-detector.ts` / `alertas-config.ts` / `/casos`). **No** crear un segundo sistema paralelo dentro de Pedidos.

> Estado en `main`: BRECHA-6 — `alertas-detector.ts:166` filtra `CONSUMIDOR_FINAL` → **ninguna venta libre en vivo (todas anónimas) es observada** por el detector por cliente. Y no hay regla de "ventas libres anómalas por repartidor".
>
> **Requisito de diseño:** el antifraude debe observar las ventas libres — con o sin cliente — agrupadas por `embarqueOrigenId` / repartidor. Reglas nuevas en `alertas-config.ts`; rama del detector que **no** excluya las ventas libres anónimas. Los controles específicos previstos en el diseño histórico de Embarques/Ruta son **EH-4 — EVIDENCIA HISTÓRICA A RECUPERAR** (¿límite de ventas libres por ruta? ¿tope de monto? ¿regla dedicada?).

---

## 14. Pedidos **no** absorbe Embarques

La **experiencia** puede estar integrada. El **dominio** no.

| Dominio | Responsable de |
|---|---|
| **Embarques** | ejecución de ruta · Embarque · repartidor · movimientos físicos · captura durante ruta · disponibilidad operacional |
| **Conciliación** | recepción del reporte · dinero · mercancía · contraste declarado vs observado · excepciones |
| **Pedidos** | representación comercial · consulta · contexto · historial · relaciones · navegación contextual |

El Hub **muestra** la venta libre y su contexto de Embarque; **no** la crea genéricamente ni gestiona la ruta.

---

## 15. Criterios de éxito de la experiencia (globales)

**La experiencia es exitosa si** un usuario abre Pedidos y, ante una venta libre, puede responder — **sin navegar por múltiples módulos ni entender conceptos técnicos**:

¿Qué ocurrió? · ¿Para quién? · ¿Qué se vendió? · ¿Cuánto? · ¿En qué ruta? · ¿Qué repartidor estaba a cargo? · ¿Quién la registró? · ¿Cuándo ocurrió? · ¿Cuándo fue registrada? · ¿Se pagó? · ¿Se entregó? · ¿Está relacionada con algún Pedido? · ¿Cómo quedó la conciliación? · ¿Hay algo que deba revisar?

**Y simultáneamente:** la experiencia **no** oculta información crítica cuando hay una inconsistencia, excepción o riesgo significativo.

### Regla de oro

No se optimiza para que "registrar una venta libre sea rápido". Se optimiza para **rapidez + comprensión + trazabilidad + integridad**:
- operación legítima → fácil;
- operación ambigua → pide contexto adicional;
- inconsistencia → se hace visible;
- acción sensible → fricción apropiada;
- diferencia de conciliación → **nunca** se resuelve creando una venta libre.

### Verificación explícita antes de cerrar esta parte

Se verifica que la experiencia permite comprender una venta libre **tanto** cuando fue registrada en ruta por el repartidor **como** cuando fue registrada durante la conciliación por Administración/Asistencia, **sin** confundir al registrador con el responsable operativo y **sin** que la venta libre sea una vía para modificar Pedidos o cuadrar diferencias.

### Pruebas (unit + E2E) que deben cubrir esta parte

**Autorización (backend — no solo UI):**
- Repartidor asignado registra VL en ruta → OK; VL queda anclada al Embarque (`VL-A01`).
- Repartidor **no** asignado → `EMBARQUE_NO_PERTENECE` (`VL-A02`, ya cubierto: `venta-libre/route.ts` tests).
- ADMIN/ASISTENTE POSTea VL a un Embarque `ABIERTO` que no está en conciliación → **debe rechazarse** una vez cerrada BRECHA-8 (`VL-A04`). Hoy: test de regresión que documenta el comportamiento actual + `@todo` BRECHA-8.
- Ningún componente de `pedido-hub/**` ni `pedidos-client` llama a `/api/pedidos/venta-libre` (`VL-A05`) — source-check `hub-accion-frontera.test.ts` (ya existe, rama `feat/pedidos-fase5-n2`).
- "Venta durante la ruta →" hace `router.push('/embarques...')` y **no** abre modal ni hace fetch (`VL-A05`) — `hub-accion-frontera.test.ts`.

**Experiencia:**
- Lista: una VL se muestra como "venta durante la ruta" con contexto (ruta, repartidor, momento), no como fila de pedido (`VL-A06`, §5).
- Peek de VL: capa 1 (instantánea) muestra comprador/embarque/repartidor/registrador/momento; capa 2 (lazy) mercancía/pago/ejecución/relaciones/atención (`VL-A07`, §6).
- Peek distingue "registrada en ruta" vs "registrada en conciliación" y registrador ≠ responsable operativo (`VL-A03`, `VL-A08`).
- Frontera N2: completar pendiente y "Venta durante la ruta →" son acciones distintas y explícitas; N2 no se convierte en VL por inferencia (`VL-A10`, Fase 5).

**Regla transversal:** ningún test debe asumir que una señal antifraude o una diferencia de conciliación genera una `Deuda`/CxC automáticamente (`VL-A15`; política de saldo a favor).

---

## 16. Estado de las decisiones

### Cerrado (no reabrir)
- Mecanismo canónico = `Pedido.origen = VENTA_LIBRE` (sin modelo dedicado).
- `embarqueOrigenId` inmutable · `Pago.embarqueId` (contexto de captura) · REPORTADO/CONFIRMADO · entrega inmediata/posterior · timestamps + `clasificacionTemporal` · offline + dedup por `offlineId` · concurrencia de numeración.
- Dos puntos de captura legítimos: **ruta** y **conciliación**.
- VENTA_LIBRE aparece en Pedidos pero no nace ahí.
- El usuario ve "venta durante la ruta", no `origen = VENTA_LIBRE`.
- Las 4 dimensiones (comprador / responsable operativo / registrador / momento) no se colapsan.
- La venta libre no modifica un Pedido, no cuadra diferencias, no es retorno/daño/ajuste.
- Antifraude: reutilizar `alertas-detector`/`/casos`, no segundo sistema.
- Pedidos no absorbe Embarques.
- La captura de VENTA_LIBRE **no** entra en `POST /api/pedidos/preview` ni en el flujo estándar del Hub en esta fase.
- **El Pedido Hub NO crea VENTA_LIBRE** (instrucción de cierre 2026-09-08). `mostrar ≠ crear`. "Venta durante la ruta →" solo navega a Embarques.
- **Autorización canónica**: VL solo la registra (A) el repartidor asignado en ruta — validado en backend — o (B) Admin/Asistente **dentro de la conciliación de ese Embarque**. No hay alta genérica.
- Una **señal** de diferencia/fraude no se convierte automáticamente en **deuda** del cliente ni en bloqueo.
- Un **diferencial negativo** que acreditó saldo a favor es un efecto económico real y trazable; si la operación cambia luego, se **compensa con un ajuste nuevo trazable**, no se borra la historia (ver `POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0.md`).

### PENDIENTE de negocio (no se inventa en esta fase)
- **PENDIENTE-VL-INV-1** — validación de disponibilidad: ¿preventiva o detectiva? (§10)
- **PENDIENTE-VL-INV-2** — qué cuenta como "mercancía comprometida". (§10)
- **PENDIENTE-VL-EMP-1** — cómo se declara una venta preferencial a empleado (VL-06).

### EVIDENCIA HISTÓRICA A RECUPERAR (bloqueo externo — el ALS Operación Comercial nunca se comiteó)
- **EH-1** — ¿la validación de inventario de la venta libre debía ser preventiva o detectiva?
- **EH-2** — mecanismo y evidencia exigida para "conseguí un cliente nuevo" en ruta.
- **EH-3** — ¿se contemplaba vincular una venta libre de "más demanda" al pedido original?
- **EH-4** — controles antifraude específicos de venta libre previstos en Embarques/Ruta.
- **EH-5** — ¿se contemplaba corregir una venta libre ya entregada preservando su número/factura?

### Requisitos de diseño derivados (de la auditoría, ahora vinculantes para esta parte)
- **RD-1** (de BRECHA-4) — el path del repartidor debe poder identificar al comprador: cliente existente · cliente nuevo · consumidor final explícito.
- **RD-2** (de BRECHA-6) — el antifraude debe observar las ventas libres (con o sin cliente) por `embarqueOrigenId`/repartidor.
- **RD-3** (de BRECHA-2) — el sistema debe conocer la disponibilidad real de mercancía en el punto de captura (implementación; la política es PENDIENTE).
- **RD-4** (de BRECHA-1) — eliminar la entidad `VentaLibre` inerte antes de tocar nada.
- **RD-5** (de BRECHA-3) — una venta libre de "más demanda" queda vinculada al pedido original (`pedidoOrigenId`).

---

## 17. Qué debe quedar reflejado en el artefacto de MENTALIDAD → CASOS → CRITERIOS DE ÉXITO → UX/UI → CONTRATO

Al cerrar esta parte, el artefacto debe reflejar explícitamente:

1. Qué entiende el usuario por una operación comercial. → §1
2. Cómo diferencia un Pedido de una venta durante ruta. → §2
3. Dónde nace cada operación. → §3
4. Cómo puede aparecer posteriormente en Pedidos. → §3, §5, §6
5. Cómo se representa una venta libre en la lista. → §5
6. Cómo se representa en el Peek. → §6
7. Qué información es esencial y cuál es progresiva. → §5, §6
8. Cómo se distingue comprador, repartidor y registrador. → §4
9. Cómo se representa una venta libre registrada durante conciliación. → §3B, §4, §5, §6
10. Cómo se representa su relación con un Pedido cuando exista. → §8, RD-5
11. Qué ocurre con consumidor final. → §11
12. Qué ocurre con inventario comprometido/disponible. → §10, PENDIENTE-VL-INV
13. Qué NO es una venta libre. → §7, §9
14. Cómo se diferencia una venta libre real de una diferencia de conciliación. → §9
15. Cómo se integran señales antifraude sin convertirlas automáticamente en bloqueos. → §13, RD-2
16. Qué casos normales y excepcionales deben pasar las pruebas. → §12, §12bis
17. Qué decisiones están cerradas y cuáles siguen PENDIENTES. → §16
18. Quién puede registrar una VL y en qué contexto. → §0, §0bis, §12bis (VL-A01..A05)
19. Que el Pedido Hub no crea VL (solo muestra/consulta). → §0, §3bis, VL-A05
20. Que una diferencia/señal no es automáticamente una deuda del cliente. → §12bis (VL-A15), regla transversal, `POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0.md`
