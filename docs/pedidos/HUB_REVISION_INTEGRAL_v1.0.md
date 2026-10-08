# Revisión integral del Pedido Hub — decisiones, paridad e integridad

- **Versión:** 1.0 — 2026-10-08
- **Estado:** DIAGNÓSTICO + PLAN PARA APROBACIÓN. Sin cambios de código.
- **Origen:** solicitud del equipo "Revisión integral del nuevo Hub de Pedidos" (2026-10-08).
- **Base de código revisada:** `main` @ `a4e97fc2`.
- **Datos de producción:** consultas de solo lectura y agregadas (Supabase), 2026-10-08.

---

## 0. Fuentes de autoridad

| # | Fuente pedida por el equipo | Disponible | Qué se usó en su lugar |
|---|---|---|---|
| 1 | Contexto Maestro v1.1 | ❌ no está en el repo ni en el historial de la sesión | `AGENTS.md` (contratos del proyecto) |
| 2 | Plan Maestro Consolidado v3.1 | ❌ no está en el repo | `AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` + ADRs `Aceptado` |
| 3 | Plan Técnico de Desarrollo de Pedidos v1 | ⚠️ parcial | `AGUA_BAMBU_PEDIDOS_PLAN_TECNICO_UX_ANTIFRAUDE_v1.0.md`, `00-plan-frontend-rediseno-integral.md` |
| 4 | Plan de Crédito/Fiado y Excepciones v1.1 | ⚠️ versiones v1.0 | `AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md`, `AGUA_BAMBU_F2_MAPA_Y_DISENO_EXCEPCIONES_CREDITO_v1.0.md` |
| 5 | ALS UX + decisiones posteriores | ✅ | `AGUA_BAMBU_PEDIDOS_UX_ARCHITECTURE_LEVEL_SPECIFICATION_v1.0.als.md`, `03-blueprint-experiencia-hub.md`, `PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md`, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` |
| 6 | Código de `main` | ✅ | `a4e97fc2` |

> **Acción para el equipo:** si las versiones v1.1 / v3.1 / v1 existen fuera del repo, compartirlas. Donde contradigan algo de este documento, ganan ellas, y el punto se corrige.

Convención de clasificación usada en todo el documento:

- **DECIDIDO** — decisión aprobada con fuente.
- **PROPUESTA** — documentada, no aprobada.
- **PENDIENTE** — el negocio no la ha decidido.
- **ESTADO TÉCNICO** — lo que hace `main` hoy.
- **BRECHA** — diferencia entre plan y código.

---

## 1. Incidente P0 activo — ventas rápidas sin pago persistido

**ESTADO TÉCNICO (producción, verificado 2026-10-08):**

| | 14 días antes de activar el Hub | Desde la activación (2026-09-23 ~19:35 Bogotá) |
|---|---|---|
| `VENTA_RAPIDA` creadas | 88 · **todas `PAGADO`**, saldo $0 | 57 entregadas + 2 anuladas · **todas `PENDIENTE` de pago** |
| Filas `Pago` | normales | **0** (la última es del 2026-09-23 23:34 UTC, justo antes de activar) |
| Saldo registrado | $0 | **$621.900**, todo a cargo de `CONSUMIDOR_FINAL` |
| `CierreDia` en la ventana | — | 0 |
| Último pedido | — | 2026-10-06 20:36 UTC (el Hub sigue activo) |

**Causa raíz (verificada en código):**

1. El workspace del Hub no tiene zona de cobro. `DraftPedido.pagos` nace `[]` (`workspace-reducer.ts:26`). La acción `SET_PAGOS` existe (`workspace-reducer.ts:121`), pero **ningún componente la dispara**. El commit envía `pagos: state.draft.pagos` (`pedido-workspace/index.tsx:313`), es decir siempre vacío.
2. El servidor solo crea `Pago` si recibe `pagos` (`CrearPedidoUseCase.ts`, `normalizarPagos(input.pagos || [], …)`). Con `[]` la venta queda `ENTREGADO` + `PENDIENTE` con saldo igual al total.
3. **El backend no impide saldo sobre `CONSUMIDOR_FINAL`.** `GetFiadoStatusUseCase.ts:92` devuelve `NOT_APPLICABLE` para el cliente canónico sin mirar si la operación deja saldo. El legacy lo impedía **solo en la UI** (`pedido-form-unified/index.tsx`: `requiereCliente = … || saldoPendiente > 0`). Eso viola la ALS A6 ("UI guidance ≠ security"). El Hub no replicó la regla de UI, y nada la sostuvo en el servidor.
4. Ningún test (unit, integración ni E2E del Hub) verifica que una venta del Hub persista `Pago` y quede `PAGADO`. Por eso pasó los gates F10-1..F10-8.

**Regla del soak (`fase10a-preflight-informe.md`, "Reglas del soak") — DECIDIDO:** "Rollback inmediato ante regresión crítica (… precio o saldo incorrecto …)". **El caso cumple el criterio.** Recomendación: `NEXT_PUBLIC_PEDIDOS_V2=false` en Production + redeploy de `main` actual. No conviene promover el deploy legacy del 23/09, porque se perderían #277–#285.

**Datos históricos:** no se corrige nada sin conciliación. Ver §6, P0-4.

---

## 2. Decisiones históricas recuperadas

### 2.1 Origen, canal, cumplimiento y situación económica

| ID | Decisión | Clase | Fuente |
|---|---|---|---|
| D-OC1 | `origen` = **procedencia / mecanismo de captura** (`PEDIDO`, `VENTA_RAPIDA`, `VENTA_LIBRE`, `RECURRENTE`). No determina el estado final; ese sale de lo ocurrido (entrega/pago) | DECIDIDO | ADR-PEDIDO-ORIGEN-CANAL-001 §3 |
| D-OC2 | `canal` (`PUNTO`/`DOMICILIO`) es independiente de `origen`. Las 4 combinaciones son válidas, incluida `VENTA_RAPIDA + DOMICILIO` | DECIDIDO | ADR-PEDIDO-ORIGEN-CANAL-001; ALS §7 ("Nunca `PUNTO = VENTA_RAPIDA`") |
| D-OC3 | `VENTA_RAPIDA` = "experiencia de captura rápida en punto, no un tipo de negocio" | DECIDIDO | ADR-PEDIDO-ORIGEN-CANAL-001 §3 (cita Plan §22) |
| D-OC4 | **`origen` se deriva de si hay cliente real**: cliente seleccionado o nuevo → `PEDIDO`; sin cliente (`CONSUMIDOR_FINAL`) → `VENTA_RAPIDA`. Nunca de `canal` | DECIDIDO (PO 2026-09-06, PR #205) | `PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md` §5.5.2 |
| D-OC5 | `CONSUMIDOR_FINAL` = **ausencia de cliente real**, no un tipo comercial | DECIDIDO | AGENTS.md; ALS §21; Plan Técnico UX ("Consumidor final") |
| D-OC6 | Intent picker: "Vender ahora (mostrador/ruta)" → `VENTA_RAPIDA` (oficina); `VENTA_LIBRE` (repartidor) **diferido** con el modo REPARTIDOR | DECIDIDO + PENDIENTE §8.3 | Blueprint §3.1, §8.3–8.4 |
| D-OC7 | `VENTA_LIBRE` = operación originada en ejecución logística sin pedido previo (`embarqueOrigenId`). El comprador es cliente existente, cliente nuevo o consumidor final **como elección explícita** | DECIDIDO | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001; `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §11 (VL-05) |
| D-OC8 | La venta rápida puede entregarse después (`entregado=false` → `PENDIENTE` + `ANTICIPADO` si va prepagada). Gated por flag, **OFF en producción** | DECIDIDO | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 |
| D-OC9 | Origen / canal / entrega / pago se presentan **contextualmente**, nunca colapsados en un "tipo" | DECIDIDO | Blueprint §1.1 (4), gate G5 |

> ⚠️ **TENSIÓN ENTRE FUENTES (requiere decisión, §7 D1).** D-OC4 (PO, 06/09) hace `VENTA_RAPIDA ⇔ sin cliente real`. La solicitud del equipo del 08/10 pide **no** inferir "Venta Rápida = Consumidor Final" y quiere una venta rápida con cliente cuando hace falta. D-OC4 fue declarada "no se reabre" en cuatro documentos. No se resuelve por inferencia: o la solicitud reabre D-OC4 explícitamente, o se mantiene y la "venta rápida con cliente" se registra como `PEDIDO` capturado con la experiencia rápida (§7 D1).

### 2.2 Dinero, crédito y fiado

| ID | Decisión | Clase | Fuente |
|---|---|---|---|
| D-$1 | `venta ≠ cobro ≠ cartera ≠ efectivo` | DECIDIDO | Blueprint §1.4 |
| D-$2 | Prepago / pago al crear viaja en `pagos[]` del `POST /api/pedidos` (ADMIN/ASISTENTE/REPARTIDOR) | DECIDIDO | Blueprint §1.4 |
| D-$3 | Cobro posterior de un fiado → `POST /api/pedidos/pagar-fiado` (lock `CARTERA:{clienteId}`, FIFO multi-factura). El rediseño de Pedidos **no** rediseña Cartera | DECIDIDO | Blueprint §1.4, §6.2 |
| D-$4 | Autoridad única de crédito: `GetFiadoStatusUseCase` (Preview, Commit, Venta Libre). Bloquea **solo si la operación deja saldo** y `count >= límite` | DECIDIDO (F1) | F1 Diseño §1, §7 |
| D-$5 | `CONSUMIDOR_FINAL` **nunca se bloquea por límite** (`NOT_APPLICABLE`) | DECIDIDO (F1) | F1 Diseño §7 |
| D-$6 | Una operación con saldo **exige cliente identificado** | ESTADO TÉCNICO solo en UI legacy; el servidor no lo exige | `pedido-form-unified/index.tsx` (`requiereCliente`); la solicitud del 08/10 lo pide como regla |
| D-$7 | Excepción de crédito autorizada (`excepcionId`) permite superar el límite con traza | DECIDIDO (F2) | F2 Mapa/Diseño; `validators.ts:114-115` |
| D-$8 | Saldo a favor se aplica automáticamente; el excedente se acredita | DECIDIDO | `POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0.md`; `CrearPedidoUseCase` |
| D-$9 | Pagos de embarque: captura y conciliación propias | DECIDIDO | ADR-PAGO-EMBARQUE-CAPTURA-001, ADR-PAGO-REPORTADO-CONFIRMADO-001 |

> D-$5 y D-$6 no se contradicen. D-$5 dice que a `CONSUMIDOR_FINAL` no se le aplica el *límite de fiados*. D-$6 dice que una operación *con saldo* no puede quedar a cargo de `CONSUMIDOR_FINAL`. Hoy D-$6 vive solo en la UI legacy, y eso es la **BRECHA B-02**.

### 2.3 Precios, promociones y regalos

| ID | Decisión | Clase | Fuente |
|---|---|---|---|
| D-P1 | El backend calcula precio y total; el frontend muestra (A1) | DECIDIDO | ALS §2 A1, §9 |
| D-P2 | Precedencia de precio: `negocio.preciosEspeciales` → `cliente.preciosEspeciales` → tabla/volumen | DECIDIDO | AGENTS.md Known Issue #18 (`/api/precios/resolver`) |
| D-P3 | Precio excepcional: autorizado vs propuesto, diferencia, motivo y autorización si la política lo pide | DECIDIDO | ALS §9, §14 |
| D-P4 | Regalo/promoción: consume inventario **una vez**, exige `autorizadoPorId`, nunca es un cobro ficticio. Movimiento `PROMOCION` en el ledger físico | DECIDIDO | ADR-PROMOCION-001, ADR-AUTORIZACION-REGALOS-001 |
| D-P5 | Descuento: registrar valor, %, motivo, usuario y autorización | PROPUESTA (Plan Técnico UX) | Plan Técnico UX "Descuentos" |
| D-P6 | Umbrales monetarios de control | PENDIENTE DE NEGOCIO | Blueprint §8.2 |

### 2.4 Cumplimiento, embarque y detalle

| ID | Decisión | Clase | Fuente |
|---|---|---|---|
| D-C1 | Cumplimiento parcial: el pedido conserva identidad; el remanente se gestiona por N2 (modo, diferencial sobre la parte afectada) | DECIDIDO | N2 ALS v2.0, `CUMPLIMIENTO_PARCIAL_ALS_v2.md`, ADR-OBLIGACION-001 |
| D-C2 | Corrección (G11.A) ≠ nueva demanda (G11.B), elección explícita | DECIDIDO | Blueprint §5.2 |
| D-C3 | Peek por capas; el **detalle completo `/pedidos/[id]` sigue existiendo** para deep-links y casos que el peek no cubre | DECIDIDO | Blueprint §3.5 |
| D-C4 | Vincular a embarque no inventa entrega ni pago | DECIDIDO | Blueprint §6.2 |

---

## 3. Diagnóstico contra `main`

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **B-01** | El Hub no captura pagos: `pagos` siempre `[]` | `pedido-workspace/index.tsx:313`; `workspace-reducer.ts:26,121`; ningún dispatch de `SET_PAGOS` | **P0** |
| **B-02** | El servidor acepta saldo sobre `CONSUMIDOR_FINAL` | `GetFiadoStatusUseCase.ts:92`; producción: 57 ventas, $621.900 | **P0** |
| **B-03** | Ningún test verifica `Pago` persistido + `estadoPago` desde el Hub | inventario de `e2e/pedidos-hub.spec.ts` y `src/components/pedido-workspace/__tests__` | **P0** |
| **B-04** | El Hub no envía `excepcionId`: un cliente en límite con saldo no tiene camino de excepción desde el Hub | `DraftPedido` sin `excepcionId` (`pedido-workspace/types.ts`) | P0 (crédito) |
| **B-05** | Venta rápida forzada a `CONSUMIDOR_FINAL` sin opción de identificar al comprador | `pedido-workspace/index.tsx` (`intent === 'venta-rapida'` → `clienteId: 'CONSUMIDOR_FINAL'`; panel fijo "Venta rápida — Consumidor Final") | P1 (depende de §7 D1) |
| **B-06** | El origen se deriva en el commit de `tieneClienteReal`, no de la intención. Elegir "Tomar un pedido" sin cliente produce `VENTA_RAPIDA` | `pedido-workspace/index.tsx:305` | P1 (consistente con D-OC4; choca con la solicitud del 08/10) |
| **B-07** | El detalle da 404: el peek y el command menu enlazan a `/pedidos/${id}`, que no existe | `peek-panel.tsx:163`, `command-menu.tsx:90`; no existe `src/app/(app)/pedidos/[id]/` | **P1** |
| **B-08** | `?openPedido=` solo abre si el pedido está en la lista cargada (hoy) | `pedidos-client/index.tsx:609-616` | P1 |
| **B-09** | Venta rápida sin "Entregar después" en el Hub. El legacy lo tiene, gated por flag OFF en producción | `SET_ENTREGADO` sin dispatch; legacy `entrega-ahora`/`entrega-despues` | P2 (flag OFF) |
| **B-10** | La venta rápida oculta la zona de entrega: no puede ser `DOMICILIO` con datos | `pedido-workspace/index.tsx` (`!esVentaRapida && <WorkspaceEntrega>`) | P1 (D-OC2 exige `VENTA_RAPIDA + DOMICILIO`) |
| **B-11** | La búsqueda cubre nombre, teléfono, contactos, negocios, barrio, dirección y referencia, pero el resultado no indica **qué entidad** coincidió ni preselecciona el negocio | `src/lib/cliente-search.ts`; `PedidoContextPanel` | P2 |
| **B-12** | Precio editable en línea y "Restaurar precio base": **existen** (paridad OK) | `pedido-item-editor.tsx:111-121` | — |
| **B-13** | Precios especiales y por volumen: el preview los aplica (`precioOrigen`). Paridad a confirmar con E2E por cliente con precio especial | `use-preview.ts`, `PreviewPedidoUseCase` | P2 (verificación) |
| **B-14** | Promoción, regalo y descuento: **no hay captura en ninguna UI de Pedidos** (ni legacy ni Hub). Solo se ve el movimiento `PROMOCION` en el ledger de Embarques | `movimiento-timeline.tsx`; sin coincidencias en `pedidos/`, `pedido-workspace/`, `pedido-form-unified/` | No es regresión; brecha de plan (§7 D4) |
| **B-15** | Venta originada en ruta (`VENTA_LIBRE`): no está en el Hub, **diferida por decisión** (§8.3). Sigue por `/repartidor` | Blueprint §2.5, §8.3 | No es regresión |
| **B-16** | Embarque y repartidor: visibles en el peek (`peek-relaciones.tsx:48-50`); en la lista solo "asignado / sin planificar" | `derive-operacion.ts:74` | P2 |
| **B-17** | "Nueva operación" visible para CONTADOR (backend 403) | O-2 del informe F10a | P2 |
| **B-18** | `PedidoAuditDiff` no existe (F10-5) | informe F10a §F10-5 | Gate F10b |

---

## 4. Matriz de paridad funcional y UX (legacy → Hub)

| Capacidad | Legacy | Hub | Brecha | Prioridad |
|---|---|---|---|---|
| Pago al crear (chips de método + monto, pago combinado, "pagar completo") | ✅ | ❌ | B-01 | P0 |
| Saldo > 0 exige cliente | ✅ solo UI | ❌ | B-02 (mover a backend) | P0 |
| Bloqueo por límite de fiados con saldo | ✅ (backend F1) | ✅ (backend F1) | — | — |
| Excepción de crédito | ⚠️ revisar | ❌ | B-04 | P0 |
| Venta rápida con comprador identificado | ⚠️ derivado (con cliente pasa a `PEDIDO`) | ❌ forzado CF | B-05, §7 D1 | P1 |
| Venta rápida + domicilio | ✅ (con D-OC4) | ❌ | B-10 | P1 |
| Entregar ahora / después (venta rápida) | ✅ (flag) | ❌ | B-09 | P2 |
| Precio editable en línea + restaurar | ✅ | ✅ | — | — |
| Precio especial / volumen automático | ✅ | ✅ (preview) | verificar E2E | P2 |
| Búsqueda multi-campo | ✅ | ✅ | identificar entidad (B-11) | P2 |
| Cliente nuevo rápido sin salir | ✅ | ✅ (`PedidoContextPanel`) | — | — |
| Detalle completo / deep-link | ✅ modal | ❌ 404 | B-07, B-08 | P1 |
| Repetir / patrón de consumo | parcial | ✅ | — | — |
| Corrección vs nueva demanda (G11) | ❌ | ✅ | — | — |
| Pendiente N2 (remanente, diferencial) | ❌ | ✅ | — | — |
| Edición VENTA_LIBRE / RECURRENTE | ✅ | sigue en legacy | consumidor vivo F10b | F10b |
| Promo / regalo / descuento | ❌ | ❌ | B-14 | decisión |

---

## 5. Caso adversarial obligatorio — cliente 4/4 fiados

| Momento | Comportamiento esperado (solicitud + F1/F2) | Hoy en `main` |
|---|---|---|
| **Antes de entregar**, sin pago completo | Preview muestra límite, exposición actual, nueva operación, exposición resultante y exceso; el commit se bloquea salvo excepción F2 autorizada | Backend ✅ bloquea (`CLIENTE_DEBE`). Hub: muestra el warning, pero **no ofrece pedir excepción** (B-04) |
| **Antes de entregar**, pagado completo | No se bloquea | ✅ (F1: solo bloquea si queda saldo). El Hub hoy no puede registrar el pago (B-01), así que **sí queda bloqueado** |
| **Después de una entrega real** sin pago | Documentar el hecho físico y la obligación; regularizar con control. No borrar la deuda, no inventar pago, no pasarla a CF, no culpar automáticamente al trabajador | **No existe camino**: el commit rechaza por límite y no hay "regularización post-entrega". Hoy la salida fácil es registrarla como CF, que es justo lo que pasó 57 veces. Requiere diseño sobre F2 (§7 D3) |

---

## 6. Plan de corrección priorizado

Cada ítem es una rama y un PR, en orden y entrando a `main` antes del siguiente (Flujo de Entrega). Ninguno empieza sin aprobación.

### P0 — Integridad

| # | Corrección | Archivos | Prueba que la demuestra |
|---|---|---|---|
| P0-0 | **Rollback operativo**: Hub OFF en Production (decisión del equipo, no código) | Vercel env | Smoke: venta rápida en legacy → `Pago` creado |
| P0-1 | **Backend: saldo > 0 exige deudor identificado.** `CrearPedidoUseCase` (y Preview, `allowedActions` sin `crear`) rechazan `clienteId = CONSUMIDOR_FINAL` con `totalPagado < total`. Error tipado `DEUDOR_REQUERIDO`. Venta Libre igual | `CrearPedidoUseCase.ts`, `PreviewPedidoUseCase`, `venta-libre` | Integración Postgres: CF + saldo → 4xx; CF pagado → 201 + `Pago`. Regresión de los 3 consumidores F1 |
| P0-2 | **Hub: zona Dinero** (total, pago recibido, método(s), cambio, aplicado, saldo). Atajo "Pagado completo" por defecto en venta rápida inmediata; pago combinado; saldo → pide cliente sin perder el draft | `pedido-workspace/*`; reusar `METODOS_PAGO` | Unit reducer; E2E: venta rápida efectivo → `Pago` en BD y `estadoPago=PAGADO`; combinado; parcial con cliente |
| P0-3 | **Hub: excepción de crédito** (`excepcionId`) en el flujo con límite alcanzado | workspace + endpoints F2 existentes | E2E 4/4: bloqueado sin excepción; pasa con excepción autorizada |
| P0-4 | **Conciliación de las 57 ventas** (sin modificación masiva): listado por fecha, monto e ID para que el equipo confirme contra caja y cierres reales. Corrección **solo** con confirmación escrita, por script auditado (`Pago` con método confirmado, `logAudit`) | script read-only + script de corrección revisado | Antes/después por pedido; saldo CF = 0; cuadre por día |

### P1 — Fallos funcionales

| # | Corrección | Prueba |
|---|---|---|
| P1-1 | 404: `/pedidos/[id]` como ruta real (server component que carga por id y abre el detalle o peek). `?openPedido=` carga por id aunque no esté en la lista | E2E: abrir detalle desde peek y command menu → 200; deep-link a pedido de otra fecha |
| P1-2 | Venta rápida con canal `DOMICILIO` (zona de entrega cuando aplica) — D-OC2 | E2E `VENTA_RAPIDA + DOMICILIO` desde el Hub |
| P1-3 | Comprador en venta rápida según §7 D1 | según la decisión |

### P2 — Paridad y UX

| # | Corrección |
|---|---|
| P2-1 | Búsqueda: mostrar la entidad que coincidió (negocio / contacto / barrio) y preseleccionar el negocio |
| P2-2 | "Entregar después" en el Hub (respetando el flag) |
| P2-3 | Embarque y repartidor visibles en la lista |
| P2-4 | Ocultar "Nueva operación" a CONTADOR (O-2) |
| P2-5 | E2E de precio especial / volumen automático desde el Hub |

### Gates antes de F10b (sin cambios, se mantienen)

`PedidoAuditDiff` (F10-5), los 4 E2E del peek móvil (O-3), el inventario de cobertura E2E del Hub (F10-6), los consumidores legacy vivos (edición VL/RECURRENTE, deep-link desde Clientes, `cliente-detail-cache.ts:154`) y la extracción de dependencias de `pedido-form-unified`. **Además: un soak nuevo y limpio después de P0.**

---

## 7. Decisiones que necesita el equipo

| # | Pregunta | Opciones | Por qué no se infiere |
|---|---|---|---|
| **D1** | ¿Se reabre D-OC4 (origen derivado de cliente real)? | (a) Se mantiene: la experiencia rápida con cliente crea `PEDIDO`, y `VENTA_RAPIDA` sigue significando "sin cliente". (b) Se reabre: `origen` sale de la **intención** ("Vender ahora" → `VENTA_RAPIDA`, con o sin cliente) | D-OC4 está aprobada y declarada "no se reabre"; la solicitud del 08/10 pide lo contrario. Cambia reportes que leen `origen` |
| **D2** | Rollback del Hub en Production ahora | sí / no | Toca a los 6 usuarios; la regla del soak lo indica |
| **D3** | Regularización post-entrega para cliente en límite | ¿se modela como excepción F2 con estado "post-entrega" o como flujo propio? | No hay diseño aprobado; F2 cubre la excepción preventiva |
| **D4** | Promoción, regalo y descuento en Pedidos | ¿entran en este alcance o siguen solo en Embarques? | ADR-PROMOCION-001 existe, pero no hay decisión de UI de Pedidos; D-P6 (umbrales) sigue PENDIENTE |
| **D5** | Las 57 ventas | ¿todas de contado? ¿con qué método? ¿hubo fiado real? | Solo la operación real lo sabe; no se fabrican pagos |

---

## 8. Maquetas

Las 14 maquetas pedidas (móvil + escritorio) se producen **después** de D1, porque D1 cambia la estructura de los flujos 1, 5, 7 y 9. Orden propuesto: primero las que bloquean P0 (venta rápida ordinaria con Dinero, pago parcial con cliente, límite alcanzado, mercancía ya entregada) y después el resto.

---

## 9. Riesgos residuales

- Mientras el Hub siga ON, cada venta rápida nueva agrega deuda falsa a CF.
- Los reportes de ventas y de caja del 24/09 al 06/10 están subestimados en dinero cobrado.
- El soak de F10a no es válido como evidencia de cierre; hay que repetirlo.
- Fuentes v1.1/v3.1 no disponibles: alguna decisión puede estar más actualizada fuera del repo.
