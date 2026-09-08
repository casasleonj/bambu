# VENTA_LIBRE — Auditoría contrato histórico ↔ `main` actual

**Objetivo (instrucción del equipo):** recuperar y verificar lo que Agua Bambú **ya decidió y construyó** para VENTA_LIBRE, identificar exactamente qué falta o se ha desviado, y evitar tanto la pérdida de conocimiento histórico como la creación de una segunda implementación incompatible.

**NO es** una propuesta conceptual nueva. **NO se rediseña** VENTA_LIBRE. **NO se crea** una segunda arquitectura antes de completar esta comparación.

**Baseline de código:** `main` @ `a8a7114a` (2026-09-08). Auditoría hecha leyendo el código, no los documentos.

---

## 0. Contrato de producto (recuperado — vinculante)

VENTA_LIBRE es una **venta realizada durante la ejecución de una ruta/Embarque, que no estaba respaldada previamente por un Pedido.**

**No es:** un Pedido sin nombre · una edición de Pedido · una venta sin control · una devolución · una reclamación · una reposición · un daño · un sobrante · un ajuste.

**Puede ocurrir con:** un cliente existente sin Pedido previo · una persona/negocio que compra espontáneamente en ruta · un cliente nuevo que aparece en ruta.

**Ejemplo canónico:** Cliente X tenía un Pedido de 20 pacas. Durante la ruta pide 5 adicionales. Las 5 **no modifican** el Pedido de 20 — son una **operación adicional de Venta Libre**.

Consume **mercancía física del Embarque** y debe conservar trazabilidad sobre, como mínimo: Embarque de origen, producto, cantidad, momento, usuario, comprador/cliente cuando corresponda, precio, cobro, entrega y conciliación.

**Separación correcta (no colapsar en un mismo formulario):**

| origen | qué es |
|---|---|
| `PEDIDO` | demanda previamente registrada |
| `VENTA_RAPIDA` | operación inmediata fuera del ciclo normal de pedido |
| `VENTA_LIBRE` | operación comercial generada **durante una ruta**, usando mercancía libre del Embarque |

**Estado del contrato:** VENTA_LIBRE **NO está pendiente de definición de producto.** Fue definido en el diseño de Embarques/Ruta y tuvo línea de implementación (PRs #155, #158, #170; ADRs `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`, `ADR-PAGO-EMBARQUE-CAPTURA-001`, `ADR-PAGO-REPORTADO-CONFIRMADO-001`, `ADR-OFFLINE-001`). La decisión de mantenerlo fuera de `POST /api/pedidos/preview` y del Pedido Hub **en esta fase** sigue vigente y **no** implica que esté sin definir.

---

## 1. Hallazgo estructural: **tres** superficies, dos activas, una inerte

| # | Superficie | Estado | Qué hace |
|---|---|---|---|
| **A** | `POST /api/pedidos/venta-libre` (`src/app/api/pedidos/venta-libre/route.ts`) | **ACTIVO** — path del repartidor en vivo | Crea un `Pedido` con `origen=VENTA_LIBRE`. UI: `repartidor-client.tsx` (`btn-venta-libre`). |
| **B** | `CrearVentasLibresService` (`src/modules/embarques/domain/services/crear-ventas-libres.service.ts`), llamado desde `CerrarEmbarqueUseCase` | **ACTIVO** — captura del admin al cerrar embarque | Crea un `Pedido` `origen=VENTA_LIBRE`, `ENTREGADO`, con factura, por cada fila que el admin capturó en `venta-libre-row.tsx`. |
| **C** | Entidad `VentaLibre` (`src/modules/embarques/domain/entities/VentaLibre.ts`) + `IVentaLibreRepository` | **INERTE / VESTIGIAL** | Modelo de dominio y puerto de repositorio que **nadie usa**: `CrearVentasLibresService` escribe `tx.pedido.create` directo, no vía el repo. No hay tabla `VentaLibre` en `schema.prisma`. Es un esqueleto de un modelo dedicado que se descartó a favor de `origen=VENTA_LIBRE`. |

**Mecanismo canónico (confirmado):** `origen = OrigenPedido.VENTA_LIBRE` sobre `Pedido`. **NO hay** modelo `VentaLibre` ni `VentaEnRuta` en la base de datos (`.claude/specs/pedidos.md:219`, guardrails INVENTARIO §8.5). La entidad `VentaLibre.ts` **no contradice esto** — está muerta, pero su sola existencia induce a error a quien lea el módulo de embarques.

> **BRECHA-1 (baja, cosmética):** la entidad `VentaLibre` + `IVentaLibreRepository` inertes deberían **eliminarse** para que no parezcan una implementación paralela.
> - Debería ocurrir → un solo mecanismo visible (`origen=VENTA_LIBRE`).
> - Ocurre → coexiste un modelo de dominio muerto en `src/modules/embarques/domain/`.
> - Evidencia → `IVentaLibreRepository.createMany` sin implementación real; `CrearVentasLibresService` no lo importa.
> - Riesgo → un desarrollador futuro "completa" el repo y crea la segunda implementación que el equipo quiere evitar.
> - Corrección → borrar `VentaLibre.ts`, `IVentaLibreRepository.ts` y sus exports en `src/modules/embarques/domain/index.ts`. Sin impacto funcional. **PENDIENTE**, no bloqueante.

---

## 2. Matriz de auditoría: contrato → `main` → evidencia → estado

Clasificaciones: `HECHO` · `DECISIÓN` · `ESTADO TÉCNICO ACTUAL` · `BRECHA PLAN↔CÓDIGO` · `PENDIENTE` · `DESCARTADO` · `OBSOLETO` · `EVIDENCIA HISTÓRICA A RECUPERAR`.

### 2.1 Origen

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Declaración | La operación se declara VENTA_LIBRE al crearse; inmutable | `Pedido.origen = OrigenPedido.VENTA_LIBRE`, fijado en `create`, sin escritor que lo cambie | `venta-libre/route.ts:231`; `crear-ventas-libres.service.ts:86`; enum `OrigenPedido` en `schema.prisma` | **HECHO** |
| Modelo dedicado | No hay `VentaLibre`/`VentaEnRuta` como tabla | Correcto; `origen` es el mecanismo | `.claude/specs/pedidos.md:219`; sin tabla en schema | **DECISIÓN** (guardrail INVENTARIO §8.5) |
| Entidad de dominio | — | `VentaLibre.ts` existe pero inerte | §1 fila C | **BRECHA-1** (ver arriba) |
| Origen no se infiere del cliente | `origen` responde CÓMO se originó, independiente de `canal` y de si hay cliente real | Path A: `origen` hardcode `VENTA_LIBRE` siempre. Path B: idem. En C4 (edición) el origen persistido se respeta (no se re-deriva) | `ADR-PEDIDO-ORIGEN-CANAL-001`; corrección PR #229 `d6d3e09e` | **HECHO** |

### 2.2 Embarque de origen

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Vínculo persistente | Conservar en qué Embarque se originó, aunque el Pedido se reasigne | `Pedido.embarqueOrigenId` (inmutable, FK `SetNull`, índice); se setea en A y B; `embarqueId` (mutable) = asignación física actual | `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §3; migración `20260901_*`; `venta-libre/route.ts:239`; `crear-ventas-libres.service.ts:92` | **HECHO** |
| No se limpia al reasignar | `procesarNoEntregado` / `CancelarEmbarqueUseCase` limpian `embarqueId` pero NO `embarqueOrigenId` | Implementado | ADR §3; INVENTARIO §334 | **HECHO** |
| Consultas de "operaciones del embarque X" | usar `embarqueOrigenId`, no `embarqueId` | Conciliación de caja del cierre usa `embarqueOrigenId` vía `fetchPagosOrigenDiferido` (en retiro, ver 2.13) | `CerrarEmbarqueUseCase`; ADR §0 | **ESTADO TÉCNICO ACTUAL** (transición en curso a `Pago.embarqueId`) |
| Validación del embarque | El embarque debe existir y estar `ABIERTO`; el repartidor debe ser dueño | Path A valida ambos (`EMBARQUE_INVALIDO`, `EMBARQUE_NO_PERTENECE`). Path B corre dentro del cierre (embarque ya validado) | `venta-libre/route.ts:103-122` | **HECHO** |

### 2.3 Inventario (mercancía física del Embarque)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Consumo de mercancía disponible en ruta | La VL consume stock físico del Embarque | Al **cierre**: las cantidades de VL (A-como-pedido + B) alimentan `conciliarProductos` → `carga` vs `entregadas + devueltas + rotas + cambios` → discrepancia | `CerrarEmbarqueUseCase.conciliarProductos:362-376` | **HECHO (a posteriori, en el cierre)** |
| Validación en el momento de la venta | Impedir vender más de lo que hay en el camión | **NO existe.** `venta-libre/route.ts` no consulta la carga del embarque ni descuenta stock. Resuelve precios y crea el pedido | grep: sin `stock`/`carga`/`disponible`/`EmbarqueItem` en el route | **BRECHA-2** |
| Reserva de mercancía comprometida a Pedidos asignados | La mercancía de un Pedido asignado al embarque no debería poder venderse como VL | **NO existe.** No hay reserva ni lock de inventario por pedido | idem | **BRECHA-2** (misma raíz) |

> **BRECHA-2 (media-alta):** no hay control de inventario en el momento de la Venta Libre.
> - Debería ocurrir → al crear una VL en ruta, el sistema verifica que hay `cantidad` disponible de ese producto en el Embarque (carga − ya entregado a pedidos − ya vendido en VLs previas) y la descuenta / la marca consumida.
> - Ocurre → se crea la VL sin mirar la carga; el descuadre solo se detecta al cerrar el embarque (discrepancia de producto), sin poder atribuirlo a una VL concreta.
> - Evidencia → `venta-libre/route.ts` (creación) no lee `Embarque.productos`/carga; `conciliarProductos` opera solo en el cierre.
> - Riesgo → (a) sobre-venta física silenciosa hasta el cierre; (b) mercancía comprometida a un Pedido asignado se puede vender como VL sin señal; (c) el faltante de stock al cierre es un agregado, no permite responsabilizar operación por operación.
> - Corrección → decisión de producto: ¿validación dura (rechazar VL sin stock) o blanda (permitir + señal + registro)? El diseño histórico habla de "consume mercancía física" pero **no está registrado si esa validación debía ser preventiva**. → marcar el **umbral/modo** como `EVIDENCIA HISTÓRICA A RECUPERAR`; el mecanismo (leer carga del embarque en `venta-libre/route.ts` y en el offline replay) es implementación.

### 2.4 Pedidos (no debe agrupar/modificar retrospectivamente)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Una VL NO modifica un Pedido existente | El ejemplo canónico (20 + 5) → 5 es operación nueva | `venta-libre/route.ts` **solo hace `create`**. No tiene rama de update. No recibe un `pedidoId` a modificar | route completo | **HECHO** |
| Una VL NO agrupa varias operaciones a posteriori | No se pueden fusionar VL001..VL004 en "Tienda X → 10 pacas" | **No existe ningún endpoint ni use case que agrupe/fusione pedidos.** Cada VL es un `Pedido` + `PedidoItem[]` independiente, con su `numero`, factura, pagos | grep: sin "merge"/"agrupar"/"fusionar" pedidos | **HECHO (estructuralmente imposible)** |
| Relación con nueva demanda (G11.B) | Nueva demanda sobre un cliente con pedido previo → `Pedido` nuevo relacionado por `pedidoOrigenId` | G11 (PR #206): `pedidoOrigenId` FK self. La VL **no** setea `pedidoOrigenId` (nace sin pedido previo por definición); si el caso es "cliente X con pedido de 20 pide 5 más en ruta", hoy la VL no lo vincula al pedido de 20 | `ADR` G11; `venta-libre/route.ts` no setea `pedidoOrigenId` | **BRECHA-3** (menor) |

> **BRECHA-3 (baja):** una VL de "más demanda de un cliente que ya tenía pedido en esa ruta" no queda vinculada al pedido original.
> - Debería ocurrir → trazabilidad: desde el pedido de 20 se ve "generó también una VL de 5 en la misma ruta".
> - Ocurre → la VL y el pedido original quedan sueltos (solo comparten `clienteId` y `embarqueOrigenId`).
> - Evidencia → `venta-libre/route.ts` no acepta ni setea `pedidoOrigenId`.
> - Riesgo → bajo; se puede reconstruir por `clienteId + embarqueOrigenId + fecha`. Pero dificulta la lectura administrativa.
> - Corrección → aceptar `pedidoOrigenId?` opcional en `VentaLibreSchema` y setearlo cuando el repartidor parte de un pedido del cliente en esa ruta. Requiere que el path A tenga identificación de cliente (BRECHA-4). No inventar: confirmar con producto si esto estaba en el diseño histórico → `EVIDENCIA HISTÓRICA A RECUPERAR`.

### 2.5 Cliente (existente / nuevo / CONSUMIDOR_FINAL)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Cliente existente | Una VL puede atribuirse a un cliente ya registrado | **Path A (repartidor): NO.** `clienteId` está **hardcodeado a `'CONSUMIDOR_FINAL'`** (`useState('CONSUMIDOR_FINAL')`), sin selector en la UI. **Path B (cierre): SÍ**, `<select>` de clientes existentes en `venta-libre-row.tsx`. El endpoint A *acepta* `clienteId` en el schema, pero ninguna UI de producción lo envía distinto de CONSUMIDOR_FINAL | `repartidor-client.tsx:98,239`; `venta-libre-row.tsx:51-64`; `VentaLibreSchema` | **BRECHA-4** |
| Cliente nuevo ("conseguí un cliente nuevo") | Mecanismo para declarar y evidenciar un cliente nuevo aparecido en ruta | **NO existe en producción.** `VentaLibreSchema` tiene un campo `clienteNuevo` (nombre/tel/dirección) heredado de `VentaRapidaForm`, pero ese form es **huérfano** (sin página que lo monte) y el route "usa los valores de `items`/`pagos`; `clienteNuevo` se ignora salvo que se cablee". El path B tampoco crea clientes (solo elige existentes) | `VentaLibreSchema:233` comentario "form is currently an orphan"; memoria `pedidos-operacion-comercial-fase0` PR #171 nota | **EVIDENCIA HISTÓRICA A RECUPERAR** |
| CONSUMIDOR_FINAL | Venta anónima válida; no crea cliente, no genera comportamiento comercial de cliente real | Implementado: `ensureConsumidorFinalCanonical`, factura a `CONSUMIDOR_FINAL`, sin fiado (pago completo obligatorio para anónimo) | `venta-libre/route.ts:126-138,161-165` | **HECHO** |

> **BRECHA-4 (alta):** el path del repartidor (el más frecuente para VL) **no puede identificar al comprador**. Toda VL en vivo es anónima.
> - Debería ocurrir → el repartidor, al registrar una VL, puede: (a) elegir un cliente existente, (b) declarar "cliente nuevo" con la evidencia que exigía el diseño histórico, o (c) dejar CONSUMIDOR_FINAL explícito.
> - Ocurre → siempre CONSUMIDOR_FINAL, sin opción.
> - Evidencia → `repartidor-client.tsx:98` `useState('CONSUMIDOR_FINAL')`, sin `setClienteId` desde ninguna UI; modal sin selector.
> - Riesgo → (a) se pierde la historia comercial real del cliente (patrón de consumo, cartera); (b) imposible detectar fraude por cliente porque **el detector de alertas filtra CONSUMIDOR_FINAL** (ver BRECHA-6); (c) una VL fiada a un cliente real es imposible (anónimo → pago completo obligatorio) — se fuerza a registrarla mal o no registrarla.
> - Corrección → recuperar del diseño histórico: (1) qué evidencia exigía "cliente nuevo" (¿foto? ¿teléfono verificado? ¿ubicación?); (2) plumbing: selector de cliente + alta de cliente offline en `repartidor-client.tsx` + `OfflinePedido`/`sync.ts`. La memoria del proyecto ya registra que esto "requiere primero agregar selector de cliente (UX en 2G rural = decisión de producto) + plumbing offline" y quedó **sin hacer**. → `EVIDENCIA HISTÓRICA A RECUPERAR` + `PENDIENTE`.

### 2.6 Precio

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Precio real | Se determina con la tabla de precios (volumen, canal, cliente) | `resolverPreciosPedido(items, 'DOMICILIO', clienteId, null, tx)` — mismo resolver que un pedido normal. Los tiers de volumen aplican **sobre la cantidad de esa VL** | `venta-libre/route.ts:152-158` | **HECHO** |
| REPARTIDOR no manipula precio | El repartidor no puede bajar el precio para quedarse el diferencial | `BLOQUEAR_PRECIOS_REPARTIDOR` (config): si el rol es REPARTIDOR y manda cualquier `precioManual` → 403. Doble defensa: schema rechaza `precioManual` y el route re-chequea `!== undefined` | `venta-libre/route.ts:69-75` | **HECHO** (para REPARTIDOR; ADMIN/ASISTENTE sí pueden — ver 2.14) |
| Precio cobrado = precio registrado | Lo que el repartidor cobra debe coincidir con lo que registra | **No verificable en sistema.** El repartidor registra `pagos` con los montos que él declara; el sistema no tiene forma de saber cuánto cobró realmente. Solo el descuadre de caja al cierre lo revela | — | **BRECHA-5** (inherente al modelo offline; ver 2.14) |

### 2.7 Cantidad — **fraude de volumen (atención especial del equipo)**

**Escenario:** `VL001→2 pacas→$3.000`, `VL002→3→$3.000`, `VL003→2→$3.000`, `VL004→3→$3.000`. El repartidor **no puede** convertir esas cuatro en `Tienda X → 10 pacas → tarifa de volumen` para quedarse el diferencial.

| Vector | ¿El sistema lo impide / registra / detecta? | Evidencia | Estado |
|---|---|---|---|
| **Agrupar VL001..004 en un pedido de 10 a tarifa de volumen** | **IMPIDE (estructural).** No existe endpoint ni use case de fusión de pedidos. Cada VL es un `Pedido` inmutable con su `numero`/factura. El tier de volumen se calcula sobre la cantidad de cada VL individual (2 → precio base, no tarifa de 10) | grep sin "fusionar"/"merge" pedidos; `resolverPreciosPedido` recibe la cantidad de la VL | **HECHO (imposible por diseño)** |
| **Registrar directamente una VL de 10 a tarifa de volumen para un cliente que no compró 10** | **NO detecta.** Se crea la VL; el tier de 10 aplica legítimamente por cantidad. Que el cliente no haya comprado 10 solo se sabría por descuadre de stock al cierre | `venta-libre/route.ts` sin validación de cantidad vs stock (BRECHA-2) | **BRECHA-2 + BRECHA-6** |
| **Cliente ficticio** | Path A: **imposible** (no crea clientes, siempre CONSUMIDOR_FINAL). Path B: **imposible** (solo clientes existentes). Positivo colateral de BRECHA-4 | §2.5 | **HECHO (por ausencia de la feature)** |
| **Cliente real con cantidad ficticia** | **NO detecta en vivo.** Solo descuadre de stock al cierre (BRECHA-2). El detector de alertas por cliente **no ve VLs anónimas** (BRECHA-6) | §2.3, §2.15 | **BRECHA-2 + BRECHA-6** |
| **Venta inexistente (inventada)** | Si lleva `pago` → descuadre de caja al cierre. Si es "fiada" a anónimo → **bloqueada** (`PAGO_COMPLETO_OBLIGATORIO`). Fiada a cliente real → imposible en path A (BRECHA-4) | `venta-libre/route.ts:161-165` | **PARCIAL** (backstop de cierre) |
| **Precio cobrado ≠ registrado** | NO detecta (solo descuadre de caja) | §2.6 | **BRECHA-5** |
| **Venta atribuida a otro cliente** | Path A: imposible (anónimo). Path B: el admin puede elegir cualquier cliente del `<select>` sin control | `venta-libre-row.tsx:51` | **ESTADO TÉCNICO ACTUAL** (sin control, pero es el admin, no el repartidor) |
| **Mercancía comprometida a un Pedido, vendida como VL** | NO impide, NO señala (BRECHA-2) | §2.3 | **BRECHA-2** |
| **Duplicación de una VL** | `Pedido.offlineId @unique` deduplica el **replay exacto** (mismo `offlineId`). Una VL con `offlineId` distinto y mismo contenido **NO** se deduplica | `venta-libre/route.ts:199-206` | **PARCIAL** |
| **Modificación posterior de cantidad/precio/cliente de una VL** | VL `ENTREGADO` (path A/B normal): editar cantidad la bloquean los guards de G11.A (`CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`, `cantEntrega > 0`). VL `PENDIENTE` (entrega posterior): **editable** vía `ActualizarPedidoUseCase` (form legacy) — C4 la excluye del workspace | `AjustarPedidoCantidadUseCase` guards (PR #206); C4 gate `origen ∈ {PEDIDO, VENTA_RAPIDA}` | **PARCIAL** |
| **Colusión repartidor↔cliente / empleado↔empleado** | Sin control específico | — | **PENDIENTE** (fuera del alcance técnico puro; requiere política) |
| **Crear clientes solo para justificar operaciones** | Imposible vía VL (no crea clientes) | §2.5 | **HECHO (por ausencia)** |
| **VLs que desaparecen / no cuadran en el cierre** | Backstop: discrepancia de producto + discrepancia de caja del cierre generan `DeudaTrabajador` / requieren `justificacionDiscrepancia`/`justificacionFaltante` | `CerrarEmbarqueSchema:697-700`; `CerrarEmbarqueUseCase` | **HECHO (backstop)** |

**Resumen fraude de volumen:** el vector *literal* del equipo (fusionar 4 VLs en un pedido de 10) **está estructuralmente impedido** — no hay forma de agrupar pedidos en este código. Lo que **NO** está cubierto es el registro directo de cantidades/precios que no corresponden a la venta real: hoy solo lo revela el **descuadre agregado al cierre** (stock + caja), sin poder atribuirlo operación por operación, y **sin que el detector de alertas mire las VLs** porque son anónimas.

### 2.8 Usuario

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Quién originó/registró | Cada VL registra el usuario | `Pedido.createdById = authResult.user?.id` (path A: el repartidor; path B: el admin del cierre); `logAudit({ usuarioId })` | `venta-libre/route.ts:229,324-330`; `crear-ventas-libres.service.ts:115` | **HECHO** |

### 2.9 Momento

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Cuándo se produjo vs se registró | Distinguir `occurredAt` (operador) / `capturedAt` (dispositivo) / `serverReceivedAt` (servidor) | Path A: los 3 campos + `Pedido.clasificacionTemporal` (`NORMAL`/`TARDIA`/`SOSPECHOSA`) vía `clasificarVentaLibre`. Path B (cierre): **no** los setea (se captura al cerrar) | `ADR-OFFLINE-001` §11; `venta-libre/route.ts:52-63`; `venta-libre-clasificacion.ts`; `venta-libre/__tests__/timestamps.test.ts` | **HECHO (path A)** / **ESTADO TÉCNICO ACTUAL (path B sin timestamps, aceptable)** |
| Umbrales | 30 min → TARDIA; 24 h → SOSPECHOSA; `occurred − captured > 30min` → SOSPECHOSA (timestamp local manipulado) | Implementado, `incrementMetric('venta_libre_tardia_count'|'..._sospechosa_count')` | `venta-libre-clasificacion.ts:14-15` | **HECHO** |

### 2.10 Cobro

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Qué se cobró, cómo | `Pago` por cada método; monto declarado | `tx.pago.create` por cada `pago` con `monto > 0` | `venta-libre/route.ts:270-282` | **HECHO** |
| Quién lo registró | El repartidor (path A) / el admin (path B) | `createdById` del pedido + auditoría | §2.8 | **HECHO** |
| Reportado vs Confirmado | Pago digital cobrado en ruta nace `REPORTADO` (escritorio verifica); efectivo nace `CONFIRMADO` (custodia física → cierre) | `datosConfirmacionInicial(metodo, metodosConfirmacion)`; config `METODOS_REQUIEREN_CONFIRMACION` | `ADR-PAGO-REPORTADO-CONFIRMADO-001`; `venta-libre/route.ts:270-282` | **HECHO** |
| Contexto de captura del pago | Cada `Pago` etiquetado con el embarque donde se cobró | `Pago.embarqueId = embarqueId` (el del contexto de la VL) | `ADR-PAGO-EMBARQUE-CAPTURA-001`; `venta-libre/route.ts:278` | **HECHO** |
| Proyección de auditoría | `ReceivableEntry` por los pagos | `registrarReceivableEntry(tx, { tipo: 'PAGO', ... })` si `totalPagado > 0` | `venta-libre/route.ts:285-295` | **HECHO** |
| Pago no recibido realmente | El monto digital declarado no entró | Cubierto por el flujo `REPORTADO → CONFIRMADO/DISCREPANTE` + `ResponsibilityCase PAGO_NO_CONFIRMADO` | `ADR-PAGO-REPORTADO-CONFIRMADO-001` | **HECHO** |

### 2.11 Entrega

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Entrega inmediata | `entregado = true` (o ausente) → `ENTREGADO`, `cantEntrega = cantPedido`, **foto obligatoria** | Implementado; guard de foto autoritativo en el route (no solo el schema) | `venta-libre/route.ts:45-50,168` | **HECHO** |
| Entrega posterior | `entregado = false` → `PENDIENTE` + `ANTICIPADO` (si prepago), `embarqueId = null` (planificable), `cantEntrega = 0`, sin foto | Implementado, **gated por `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR`** (default OFF) | `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`; `venta-libre/route.ts:42-45,167-171,216-218,238` | **HECHO (detrás de flag)** |
| `ANTICIPADO → PAGADO` al entregar | `EntregarPedidoUseCase` proyecta el estado de pago | `proyectarEstadoPago` (G5.1) | `ADR-PEDIDO-ESTADO-CANONICO-001` §2 | **HECHO** |
| GPS | Se captura ubicación de la venta | `gpsLat`/`gpsLng` obligatorios en el schema; guardados en `Pedido` | `VentaLibreSchema:214-215`; `venta-libre/route.ts:245-246` | **HECHO** |
| Integración con Planificador | La VL diferida entra al plan de ruta | `elegibilidad.service.ts`: `VENTA_LIBRE ∈ ORIGENES_PLANIFICABLES`; las entregadas quedan `ENTREGADO` y no matchean | `elegibilidad.service.ts:21,32,62` | **HECHO** |

### 2.12 Conciliación (cierre del Embarque)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Caja | El `Pago` se concilia en el cierre del embarque donde fue **capturado** | `ADR-PAGO-EMBARQUE-CAPTURA-001` (PR-2a/2b): el cierre suma `Σ Pago WHERE embarqueId = E`. Transición: `fetchPagosOrigenDiferido` (usa `embarqueOrigenId`) + `continue` de `coleccionarPagos` están **en retiro** a favor de `Pago.embarqueId` | `CerrarEmbarqueUseCase`; `cerrar-embarque-caja.helper.ts`; ADR §0 follow-up | **ESTADO TÉCNICO ACTUAL** (migración de mecanismo incompleta) |
| Producto | La mercancía de la VL descuadra la carga si no cuadra | `conciliarProductos`: `carga` vs `entregadas (pedidos + VL) + devueltas + rotas + cambios` | `CerrarEmbarqueUseCase:362-390` | **HECHO** |
| `totalVentas` / comisión | — | **BRECHA documentada en el ADR:** una venta diferida cobrada en un embarque **no** cuenta en `totalVentas`/comisión de ese cierre (se cuenta al entregarse) | `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 "Fuera de alcance" | **BRECHA PLAN↔CÓDIGO** (conocida, aceptada como follow-up) |
| Conciliación por pedido vs por pago | El fix correcto es tag `Pago.embarqueId` y conciliar por pago | En transición (arriba). Casos borde documentados: fiado diferido cobrado en otro embarque; embarque de origen nunca cerrado | ADR §0 | **BRECHA PLAN↔CÓDIGO** (conocida, `ADR-PAGO-EMBARQUE-CAPTURA-001` es el cierre) |

### 2.13 Auditoría (evidencia posterior)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Registro de creación | Queda evidencia de quién/qué/cuándo | `logAudit({ entidad:'Pedido', accion:'CREATE', datos:{ origen:'VENTA_LIBRE', numero, total, embarqueId, entregado } })` | `venta-libre/route.ts:324-330` | **HECHO** |
| Evidencia financiera | `ReceivableEntry` de los pagos | §2.10 | **HECHO** |
| Realtime | `pedido.created` + `embarque.updated` | `venta-libre/route.ts:332-333` | **HECHO** |
| Foto + GPS + timestamps | Evidencia de la operación física | Foto en Storage, GPS y timestamps en `Pedido` (path A) | §2.9, §2.11 | **HECHO (path A)** |
| Diff de correcciones | `PedidoAuditDiff` | Solo para **ediciones** (`ActualizarPedidoUseCase` / `AjustarPedidoCantidadUseCase`), no para la creación de la VL — correcto (la creación no es un diff) | — | **HECHO** |
| Path B (cierre) | Evidencia de la captura del admin | `logAudit` del cierre; **sin foto/GPS/timestamps** (se capturó a mano al cerrar) | `CerrarEmbarqueUseCase` | **ESTADO TÉCNICO ACTUAL** (menor evidencia física; es el admin en escritorio) |

### 2.14 Antifraude

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Señal ≠ bloqueo ≠ acusación | Las señales preservan evidencia para detección administrativa posterior, no acusan | `clasificacionTemporal` + métricas: señalan, no bloquean. Alineado con el principio | `venta-libre-clasificacion.ts` doc | **HECHO (principio)** |
| Detección temporal | Timestamp local manipulado / offline prolongado | `clasificarVentaLibre` → `TARDIA`/`SOSPECHOSA` + `incrementMetric` | §2.9 | **HECHO** |
| Detección por cliente (monto anómalo, precio bajo tabla, pedidos rápidos, cambio de precio brusco) | El detector de alertas (`alertas-detector.ts` + `/casos`) debería ver las VLs | **NO las ve.** `alertas-detector.ts:164-166` **filtra explícitamente `CONSUMIDOR_FINAL`** antes de cualquier análisis por cliente. Como **toda VL en vivo es anónima** (BRECHA-4), ninguna VL pasa por `MONTO_ANOMALO` / `PRECIO_POR_DEBAJO_TABLA` / `MULTIPLES_PEDIDOS_RAPIDO` / `CAMBIO_PRECIO_BRUSCO` | `alertas-detector.ts:164-166` `pedidos.filter(p => p.clienteId !== CANONICAL_CONSUMIDOR_FINAL_ID)` | **BRECHA-6** |
| Detección por repartidor | Devoluciones/roturas/descuentos/deuda anómalos por repartidor | `calcularAlertasRepartidor` — pero **no tiene una regla de "VLs anómalas por repartidor"** (volumen de VLs, montos, % anónimas, discrepancia recurrente) | `alertas-detector.ts:795+` | **BRECHA-6** (misma raíz) |
| Precio manual por ADMIN/ASISTENTE | Umbral / autorización / doble control | **No existe** (decisión de negocio pendiente en el blueprint §8.2). ADMIN/ASISTENTE pueden poner cualquier `precioManual` en una VL sin fricción | `venta-libre/route.ts:69-75` (solo bloquea REPARTIDOR) | **PENDIENTE** (categoría ya definida — no inventar aquí) |
| `PedidoRiskSignals` (C2, nuevo) | Riesgo preventivo en el flujo de captura | VL está **fuera** de `POST /api/pedidos/preview` → sin señal preventiva. Decisión vigente | blueprint §5.3; contrato §preview alcance | **DECISIÓN** (vigente) |

> **BRECHA-6 (alta):** el sistema de alertas antifraude **no observa las Ventas Libres en vivo** porque son anónimas y el detector filtra CONSUMIDOR_FINAL. La única señal sobre una VL es la temporal (`clasificacionTemporal`), que solo cubre manipulación de reloj / offline, no cantidad/precio/patrón.
> - Debería ocurrir → las VLs (con o sin cliente) alimentan reglas de detección: volumen inusual de VLs por repartidor, montos anómalos, % de anónimas, discrepancia recurrente al cierre, precio por debajo de tabla en VL.
> - Ocurre → las VLs anónimas se excluyen del detector; no hay regla de VL a nivel repartidor.
> - Evidencia → `alertas-detector.ts:166`.
> - Riesgo → todos los vectores de fraude de §2.7 que no sean "agrupar pedidos" quedan sin señal hasta el descuadre agregado del cierre.
> - Corrección → (1) recuperar del diseño histórico qué controles antifraude de VL estaban previstos (¿regla dedicada? ¿límite de VLs por ruta? ¿tope de monto?) → `EVIDENCIA HISTÓRICA A RECUPERAR`; (2) implementación: una rama del detector que SÍ mire VLs (incluidas anónimas) agrupadas por `embarqueOrigenId` / repartidor, y reglas nuevas en `alertas-config.ts`. **Reusar** `alertas-detector`/`/casos`, no crear un segundo sistema.

### 2.15 Offline / sin conexión

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Registro con conectividad limitada | La VL se puede capturar offline y sincroniza al recuperar red | Path A: `fetchResilient('/api/pedidos/venta-libre', { localEndpoint: 'venta-libre' })` → si la red falla, encola el request crudo en Dexie `requestQueue`. Rama `!online`: `queuePedidoOffline` (Dexie legacy). Replay: `syncWithServer()` | `repartidor-client.tsx:231-290`; `fetch-resilient.ts`; `db/sync.ts` | **HECHO** |
| Dedup en el replay | El mismo request no se procesa dos veces | `Pedido.offlineId @unique` (cliente genera `crypto.randomUUID()`); el route devuelve el existente si `offlineId` ya está | `venta-libre/route.ts:199-206` | **HECHO** |
| Detección de captura tardía | Una VL que llega mucho después es detectable, no destructiva | `clasificacionTemporal` (`occurredAt`/`capturedAt` viajan en el payload offline) | §2.9 | **HECHO** |
| Validación de stock offline | — | **NO existe** (BRECHA-2); además offline el cliente no tiene la carga del embarque fresca | — | **BRECHA-2** |
| Foto offline | La foto (base64) se guarda en Dexie hasta sincronizar | Sí; sin límite de tamaño en la cola local salvo el cap de 15 MB del schema | `VentaLibreSchema:211-213` | **ESTADO TÉCNICO ACTUAL** (riesgo de saturar IndexedDB con varias VLs offline) |

### 2.16 Concurrencia

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Numeración / secuencia | Sin colisiones de `Pedido.numero`/`Factura.numero` | `withAdvisoryLock('SECUENCIA', 'pedido')` + `acquireAdvisoryLockTx(tx, 'SECUENCIA', 'factura')` — misma serialización que `CrearPedidoUseCase` | `venta-libre/route.ts:101,304` | **HECHO** |
| Idempotencia | Replay concurrente del mismo `offlineId` → un solo pedido | Lock + `offlineId @unique` + return del existente | §2.15 | **HECHO** |
| Concurrencia sobre el mismo inventario | Dos VLs simultáneas sobre el mismo embarque no deben sobre-vender | **Sin coordinación** — no hay decremento de stock ni lock de inventario (BRECHA-2). El lock `SECUENCIA:pedido` es global de numeración, no protege el stock del embarque | — | **BRECHA-2** |
| Path B durante el cierre | Las VLs se crean dentro de la tx serializable del cierre | Sí (`CerrarEmbarqueUseCase` corre en `executeSerializableWithRetry`) | — | **HECHO** |

### 2.17 Correcciones (sin destruir trazabilidad)

| Área | Contrato | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Corregir una VL sin borrar su historia | Debe existir una vía auditable | **No hay vía dedicada.** Opciones existentes: (a) `AjustarPedidoCantidadUseCase` (G11.A) — error de captura, aplica en vivo bajo lock, con 3 guards; una VL `ENTREGADO` la bloquea `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`; (b) `AnularPedidoUseCase` (desde `ENTREGADO`) / `CancelarPedidoUseCase` (desde `PENDIENTE`) → `NotaCredito` por lo cobrado | `AjustarPedidoCantidadUseCase` (PR #206); `AnularPedidoUseCase`/`CancelarPedidoUseCase` | **ESTADO TÉCNICO ACTUAL** |
| Reversión monetaria | Error de cobro / pago no recibido | `ADR-CORRECCION-MONETARIA-001` (`CorreccionAbono` append-only + `ReceivableTipo.REVERSION`); `ResponsibilityCase PAGO_NO_CONFIRMADO` | ADR G2 | **HECHO (genérico, aplica a VL)** |
| Corregir una VL `ENTREGADO` con cantidad/precio equivocado | — | Efectivamente **solo por anulación** (los guards de G11.A bloquean editar lo ya entregado). No hay "corregir la cantidad de una VL ya entregada" preservando el mismo pedido | guards G11.A | **BRECHA-7** (menor) |

> **BRECHA-7 (baja):** una VL `ENTREGADO` mal capturada (cantidad/precio) solo se puede corregir anulándola y creando otra — se pierde la continuidad del número/factura originales (aunque la `NotaCredito` deja rastro).
> - Debería ocurrir → ¿el diseño histórico contemplaba corregir una VL ya entregada? (probablemente no — es coherente con G11).
> - Ocurre → anular + recrear.
> - Riesgo → bajo; la traza existe vía NC. Molesto operativamente si el error es frecuente.
> - Corrección → probablemente ninguna (es coherente con G11.A: no corregir lo ya entregado). Confirmar con producto → `EVIDENCIA HISTÓRICA A RECUPERAR` (bajo).

---

## 3. Índice de brechas (qué debería ocurrir → qué ocurre → evidencia → riesgo → corrección)

| ID | Sev | Título | Corrección (resumen) |
|---|---|---|---|
| **BRECHA-1** | Baja | Entidad `VentaLibre` + `IVentaLibreRepository` inertes | Borrarlas. Sin impacto funcional. |
| **BRECHA-2** | **Media-alta** | Sin control de inventario en el momento de la VL (ni reserva de mercancía comprometida) | Decisión de producto: validación dura vs blanda. Leer carga del embarque en `venta-libre/route.ts` + replay offline. **Umbral/modo = EVIDENCIA HISTÓRICA A RECUPERAR.** |
| **BRECHA-3** | Baja | VL de "más demanda" no se vincula al pedido original del cliente en esa ruta | `pedidoOrigenId?` opcional en `VentaLibreSchema`. Depende de BRECHA-4. |
| **BRECHA-4** | **Alta** | El path del repartidor no puede identificar al comprador (siempre CONSUMIDOR_FINAL) | Recuperar diseño histórico de "cliente existente / cliente nuevo + evidencia" + plumbing (selector + alta offline). **EVIDENCIA HISTÓRICA A RECUPERAR + PENDIENTE.** |
| **BRECHA-5** | Media | Precio cobrado ≠ precio registrado no es verificable (inherente al offline) | Backstop de cierre (caja). Mitigación posible: señales de patrón (BRECHA-6). |
| **BRECHA-6** | **Alta** | El detector antifraude no observa las VLs (anónimas → filtradas); sin regla de VL por repartilo | Rama del detector que mire VLs por `embarqueOrigenId`/repartidor + reglas en `alertas-config.ts`. **Reusar `alertas-detector`/`/casos`. Diseño histórico de controles de VL = EVIDENCIA HISTÓRICA A RECUPERAR.** |
| **BRECHA-7** | Baja | VL `ENTREGADO` mal capturada solo se corrige anulando | Probablemente correcto (coherente con G11.A). Confirmar. |
| — | Media | `totalVentas`/comisión del cierre no cuenta ventas diferidas | Ya documentada en `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0. |
| — | Media | Conciliación de caja por pedido vs por pago; embarque de origen nunca cerrado | `ADR-PAGO-EMBARQUE-CAPTURA-001` es el cierre; migración en curso. |

---

## 4. Relación con el Pedido Hub y el rediseño (vigente, sin cambios)

- VENTA_LIBRE **fuera** de `POST /api/pedidos/preview` y del flujo estándar del Pedido Hub en esta fase → **DECISIÓN vigente**, no "pendiente de definición".
- `PEDIDO` / `VENTA_RAPIDA` / `VENTA_LIBRE` **no** se colapsan en un mismo formulario aunque compartan la entidad `Pedido`. La Composición C1-C4 del workspace cubre **solo `PEDIDO` y `VENTA_RAPIDA`** (creación y edición); C4 lo hace explícito con el gate `origen ∈ {PEDIDO, VENTA_RAPIDA}`.
- La captura de VENTA_LIBRE (repartidor en ruta + admin en cierre) **no se toca** en esta fase.

---

## 5. Qué NO hacer (guardrails para la implementación de las brechas)

1. **No** crear un modelo `VentaLibre`/`VentaEnRuta` como tabla. El mecanismo es `Pedido.origen = VENTA_LIBRE`. (Antes de tocar nada, borrar la entidad inerte — BRECHA-1.)
2. **No** convertir la edición de Pedido (C4) en vía para agrupar/absorber VLs. G11 no cambia.
3. **No** crear un segundo sistema de alertas para VL. Extender `alertas-detector.ts`/`alertas-config.ts`/`/casos`.
4. **No** inventar umbrales de inventario, de precio manual, de doble control, de límite de VLs. Esos puntos son `EVIDENCIA HISTÓRICA A RECUPERAR` o `PENDIENTE` de negocio — se parametrizan y se deciden por producto.
5. **No** tocar `src/modules/embarques/domain/**` ni `src/modules/planificador/**` sin ADR (guardrail INVENTARIO §8).
6. **No** cambiar la semántica de `embarqueOrigenId` / `Pago.embarqueId` / `entregado` — están cerradas por ADR.

---

## 6. Evidencia histórica a recuperar (bloqueos externos — no son decisiones nuevas)

| # | Qué falta recuperar | Por qué importa |
|---|---|---|
| EH-1 | ¿La validación de inventario en la VL debía ser **preventiva** (rechazar) o **detectiva** (permitir + señal)? | Define BRECHA-2. |
| EH-2 | Mecanismo y **evidencia exigida** para "conseguí un cliente nuevo" en ruta (foto, teléfono verificado, ubicación, aprobación) | Define BRECHA-4. |
| EH-3 | ¿Se contemplaba vincular una VL de "más demanda" al pedido original (`pedidoOrigenId`)? | Define BRECHA-3. |
| EH-4 | Controles antifraude específicos de VL previstos en el diseño de Embarques/Ruta (regla dedicada, límite de VLs por ruta, tope de monto, % anónimas) | Define BRECHA-6. |
| EH-5 | ¿Se contemplaba corregir una VL ya entregada preservando su número/factura? | Define BRECHA-7 (probablemente "no"). |

El documento fuente (ALS Operación Comercial) **nunca se comiteó** — solo quedaron referencias por sección en los ADRs y el INVENTARIO. Si no se recupera, EH-1..EH-5 se marcan como decisiones de producto a tomar con este documento en mano, **no** como rediseño.

---

## 6b. Insumo para el diseño de experiencia

Este documento (auditoría técnica) es el **insumo** de `docs/pedidos/VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md`, que cierra la **mentalidad + casos (VL-01..VL-15) + criterios de éxito** de cómo VENTA_LIBRE aparece en el Pedido Hub. Ahí, BRECHA-2/3/4/6 pasan de "hallazgos" a **requisitos de diseño** (RD-1..RD-5) y se contemplan explícitamente los **dos puntos de captura** (ruta / conciliación) y las **cuatro dimensiones** (comprador / responsable operativo / registrador / momento).

---

## 7. Conclusión

- El **contrato de producto de VENTA_LIBRE está definido** y mayormente implementado: origen, embarque de origen inmutable, entrega inmediata/posterior, cobro con contexto de captura, reportado/confirmado, timestamps, offline, concurrencia de numeración, conciliación de producto y (en transición) de caja.
- **No hay una segunda implementación funcional** — la entidad `VentaLibre` es un esqueleto muerto (BRECHA-1).
- Las **dos brechas serias** son: **BRECHA-4** (el repartidor no identifica al comprador → toda VL en vivo es anónima) y **BRECHA-6** (el antifraude no observa las VLs, en parte *por* BRECHA-4). Ambas tienen raíz común y ambas dependen de recuperar diseño histórico (EH-2, EH-4).
- **BRECHA-2** (inventario en el momento de la venta) es la tercera prioridad y también necesita EH-1.
- El vector de fraude *literal* del equipo (fusionar VLs en un pedido de volumen) **está estructuralmente impedido**. Lo que falta cubrir es el registro de cantidades/precios que no corresponden a la venta real, hoy solo visible por descuadre agregado al cierre.
