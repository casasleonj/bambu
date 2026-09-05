# AGUA BAMBÚ — N2: ESPECIFICACIÓN FUNCIONAL Y ARQUITECTÓNICA

**Versión:** 1.0
**Fecha:** 2026-09-05
**Responde a:** instrucción del equipo "Cierre N2 y especificación definitiva" (2026-09-04) — las 3 decisiones quedan **cerradas**, no se relitigan.
**Base técnica:** `main` `c3822999` (post `#191`)
**Regla seguida:** las decisiones del equipo son la entrada; este documento las convierte en especificación verificable y las contrasta contra `main`. Ninguna contradicción de código se resuelve cambiando la decisión — se clasifica como brecha.

**Documentos que acompañan esta entrega:**
- `AGUA_BAMBU_N2_ALS_v2.0.md` — Architecture Level Specification actualizado.
- `AGUA_BAMBU_N2_MATRIZ_PLAN_CODIGO_v1.0.md` — trazabilidad Plan↔Código.
- `AGUA_BAMBU_N2_MATRIZ_PRUEBAS_v1.0.md` — matriz de pruebas por invariante/caso.

---

## 1. Las 3 decisiones (cerradas, transcritas para trazabilidad)

### 1.1 `Actividad.modo`

- Valores permitidos: `PUNTO | DOMICILIO`.
- Representa el **modo operativo actual** de esa `Actividad` — no una preferencia del cliente, no un atributo del `Pedido` original.
- **No se crean** `modoSolicitado`/`modoPlanificado`/`modoEjecutado` ni jerarquía equivalente.
- El modo pertenece a la `Actividad`, nunca al `Cliente` de forma global; dos `Actividad` del mismo cliente pueden tener modos distintos sin conflicto.
- El cambio PUNTO→DOMICILIO es un comando explícito, nunca automático; el pedido histórico no se reescribe; la trazabilidad se conserva por auditoría/eventos.

### 1.2 Diferencial económico

```
Diferencial = Valor actualmente aplicable al pendiente − Valor histórico atribuible al pendiente
            = cantidadPendiente × (valorUnitarioActualAplicable − valorUnitarioHistóricoAtribuible)
```

- No es una nueva venta; no duplica el reconocimiento comercial.
- No modifica retroactivamente precio, pedido original, cantidades originales ni condiciones comerciales históricas.
- El valor histórico atribuible respeta las condiciones económicas reales del pedido original (no el precio de lista bruto si el pedido tenía descuento/especial).
- El valor actual se determina con las reglas comerciales **vigentes** aplicables a la nueva gestión.
- Diferencial > 0 → cobro adicional. Diferencial < 0 → ajuste favorable al cliente (saldo/crédito, según el modelo financiero ya existente — nunca se pierde silenciosamente). Diferencial = 0 → sin ajuste.
- Debe seguir siendo correcto con múltiples cumplimientos parciales: sin cobro doble, sin atribución doble de unidades, sin alterar el histórico, sin saldo incorrecto.
- **Fiscalidad del diferencial = PENDIENTE EXTERNO** (contador + proveedor de facturación electrónica + DIAN). La mecánica económica queda decidida; el tratamiento fiscal/documental específico no.

### 1.3 `ObligacionPendiente`

- **No** se crea automáticamente en cada entrega parcial. El pendiente ordinario ya está representado por `Pedido`/`PedidoItem` (`cantPedido − cantEntrega`), tal como PR-1 (`#175`) implementó y tiene en producción.
- `ObligacionPendiente` aparece **únicamente** cuando existe una decisión explícita del usuario de gestionar ese pendiente ("Gestionar pendiente").
- Principio: *"el sistema prepara; el usuario decide"* — el sistema puede detectar, mostrar, priorizar y sugerir pendientes, pero no convertirlos automáticamente en obligaciones operativas.

---

## 2. Modelo de responsabilidades (quién es dueño de qué)

```
PEDIDO
  = obligación comercial original (identidad comercial estable, Pedido.numero)

PEDIDO / PEDIDOITEM
  = cantidad solicitada, cantidad cumplida, cantidad pendiente
  (fuente única para el pendiente ORDINARIO — sin gestión activa)

OBLIGACIONPENDIENTE
  = representación operativa, creada SOLO cuando el usuario decide
    gestionar un pendiente. Cuenta cantidades (original/cumplida/asignada),
    nunca dinero.

ACTIVIDAD
  = acción operativa concreta (trabajo ejecutable) que cuelga de una
    ObligacionPendiente. Actividad.modo = PUNTO | DOMICILIO.

EMBARQUE
  = ejecución logística. No es dueño de la obligación comercial.

CARTERA (Pago / Abono / ReceivableEntry / Cliente.saldoFavor)
  = consecuencia financiera. Nunca se duplica en Actividad/ObligacionPendiente.
```

Ninguna de estas capas duplica el rol de otra. En particular: `Pedido.total`/`totalPagado`/`saldo` siguen siendo la única fuente de verdad del dinero del pedido (incluido, cuando exista, el diferencial — ver §5).

---

## 3. Flujo canónico

```
Pedido (canal = PUNTO o DOMICILIO, fijado en creación, inmutable)
   │
   ├── Entrega COMPLETA → fin. Sin ObligacionPendiente. (Caso A)
   │
   └── Entrega PARCIAL
          │
          ▼
       Pendiente vive en Pedido/PedidoItem (cantPedido − cantEntrega)
          │
          │   ← el sistema puede mostrarlo/priorizarlo/sugerirlo, sin crear nada
          │
          ▼
       Usuario decide "Gestionar pendiente"  (única puerta de entrada)
          │
          ▼
       Crear ObligacionPendiente (cantidadOriginal = remanente en ese instante)
          │
          ▼
       Crear/activar Actividad (modo = PUNTO | DOMICILIO, decidido por el usuario)
          │
          ├── modo = PUNTO  → Caso C
          └── modo = DOMICILIO → Caso D → calcular diferencial (§5) → mostrar impacto → confirmar
          │
          ▼
       Asignar a Embarque (mismo mecanismo de asignación que ADR-ACTIVIDAD-001:
       lock OBLIGACION:{id}, constraint de una asignación activa)
          │
          ▼
       Ejecución / Cumplimiento (incrementa Actividad.cantidadCumplida y
       ObligacionPendiente.cantidadCumplida, bajo el mismo lock)
          │
          ▼
       Consecuencia económica (si hubo diferencial: cobro/ajuste — §5)
```

---

## 4. Invariantes

| # | Invariante | Alcance |
|---|---|---|
| I-1 | `cantidadCumplida + cantidadAsignada <= cantidadOriginal` | `ObligacionPendiente` (ya congelado, `ADR-OBLIGACION-001`) |
| I-2 | `cantidadDisponible` nunca se almacena — siempre derivada | `ObligacionPendiente` (ya congelado) |
| I-3 | Máx. 1 asignación activa por `(obligación, embarque)` | `Actividad` (ya congelado, constraint DB) |
| I-4 | La existencia de una `Actividad`/`ObligacionPendiente` no modifica `Pedido.total`/`totalPagado`/`saldo` por sí sola | Nuevo, deriva de §2 |
| I-5 | `Pedido.numero` es la única identidad comercial — nunca se crea un segundo `Pedido` para representar el pendiente o el diferencial | Ya congelado (PR-1) + extendido al diferencial |
| I-6 | El histórico de `PedidoItem` (precio, cantidades originales) nunca se reescribe | Ya congelado (Plan Maestro V11.1 §15) |
| I-7 | El diferencial se calcula **una sola vez por cantidad gestionada** — nunca dos veces sobre la misma unidad | Nuevo — ver §5.4 (Caso I) |
| I-8 | Toda operación de creación/asignación/liberación/cambio de modo/cumplimiento es idempotente por `offlineId` | Ya congelado (Plan Maestro V11.1 §14), extendido a las entidades nuevas |
| I-9 | `Actividad.modo` es inequívoco en todo momento — nunca `null` ni ambiguo mientras la Actividad esté activa | Nuevo |
| I-10 | Cancelar una gestión de pendiente antes de ejecutarse no deja cantidad "perdida" ni "fantasma" — el remanente vuelve a ser 100% responsabilidad de `Pedido`/`PedidoItem` | Nuevo — ver Caso J |
| I-11 | **Mientras exista una `ObligacionPendiente` `ABIERTA` con `cantidadAsignada > 0` sobre un producto de un `Pedido`, el flujo ORDINARIO de entrega (`EntregarPedidoUseCase`, cierre de embarque) no puede incrementar `cantEntrega` de ese producto más allá de `cantPedido − cantidadOriginal` de esa Obligación.** | Nuevo — hallazgo de la revisión adversarial, §11 |

---

## 5. El diferencial en detalle

### 5.1 Cómputo — reutiliza el motor de precios existente, sin lógica nueva

```
valorHistoricoAtribuible = cantidadPendiente × PedidoItem.precio
   (el precio YA es un snapshot de las condiciones reales del pedido original
    — especiales de cliente/negocio, precio por volumen, manual — nunca "precio
    de lista bruto". Esto ya es así hoy, sin cambios.)

valorActualAplicable = resolverPreciosPedido(
   [{ codigo: producto, cantidad: cantidadPendiente }],
   canal: 'DOMICILIO',   // el modo nuevo de la Actividad
   clienteId, negocioId,
)  // MISMO motor de src/lib/pricing.ts — ya resuelve especiales, volumen y
   // sobrecosto de domicilio. Cero pricing nuevo que inventar.

diferencial = valorActualAplicable − valorHistoricoAtribuible
```

Esto responde directamente §2.3 de la instrucción del equipo: el valor histórico **ya** respeta las condiciones reales (es el snapshot, no el bruto); el valor actual **ya** se calcula con las reglas vigentes (reutilizando `resolverPreciosPedido`, el mismo motor que usa cualquier pedido nuevo).

### 5.2 Representación económica (propuesta técnica — no una decisión del PO, se señala como tal)

El PO decidió la fórmula y la semántica ("ajuste, no venta nueva"); **no** especificó la representación en schema. Se propone, por consistencia con patrones ya existentes y verificados en este mismo ciclo (F-A, `#184`):

- **Diferencial positivo:** incrementa `Pedido.total` del pedido **original** (mismo `Pedido.numero`, `I-5`) en exactamente el monto del diferencial. `Pedido.totalPagado` no cambia → `Pedido.saldo` sube por el mismo monto (`chk_pedido_saldo_calc` lo exige). Ese saldo se cobra con el mecanismo YA existente (`pagar-fiado`/cartera) — cero mecanismo de cobro nuevo. El histórico (precio y cantidades de los ítems ya entregados/snapshot del pendiente) no se toca — es un incremento aditivo, no una reescritura.
- **Diferencial negativo:** **no** se puede bajar `Pedido.total` si ya hay `totalPagado` mayor al nuevo total (violaría `chk_pedido_montopagado_le_total` y, más importante, reescribiría el histórico). Se acredita a `Cliente.saldoFavor` — el mismo mecanismo canónico ya usado en `#159` (pagar-fiado) y `#184` (F-A, recurrentes). Nunca se pierde.
- **Diferencial cero:** ningún movimiento.
- **Registro auditable del hecho:** se propone extender `PedidoCantidadAjuste` (ya existe, ya tiene `obligacionId?`, `autorizadoPorId`, `motivo`) con un campo aditivo `montoDiferencial Decimal?` en vez de crear una entidad paralela — evita una tabla nueva para un hecho que ya calza en el modelo de "ajuste autorizado sobre una obligación".

### 5.3 Casos F/G/H (numéricos, del enunciado del equipo)

| Caso | Histórico | Actual | Diferencial | Efecto |
|---|---|---|---|---|
| F — positivo | $40.000 (4×$10.000) | $44.000 (4×$11.000) | **+$4.000** | `Pedido.total += 4.000` → saldo nuevo $4.000, cobrable por cartera |
| G — negativo | $40.000 | $37.000 | **−$3.000** | `Cliente.saldoFavor += 3.000` |
| H — cero | $40.000 | $40.000 | **$0** | Sin movimiento |

### 5.4 Caso I — múltiples cumplimientos parciales (conservación)

Regla: **cada tramo de cumplimiento parcial dentro de una misma `ObligacionPendiente` calcula su diferencial únicamente sobre la cantidad de ESE tramo**, nunca sobre el remanente total repetidamente.

```
Obligación: cantidadOriginal = 4 (histórico $10.000/u)
Tramo 1: se cumplen 2 unidades a modo DOMICILIO ($11.000/u actual)
   → diferencial tramo 1 = 2 × (11.000 − 10.000) = +$2.000
   → cantidadCumplida = 2, cantidadAsignada = 0

Tramo 2: se cumplen las 2 unidades restantes, precio actual sube a $11.500/u
   → diferencial tramo 2 = 2 × (11.500 − 10.000) = +$3.000
   → cantidadCumplida = 4 (= cantidadOriginal, la Obligación se cierra)

Total cobrado en diferenciales = $2.000 + $3.000 = $5.000
```

Cada tramo es un `PedidoCantidadAjuste` (§5.2) propio, con su propia `cantidadNueva`/`delta` y su propio `montoDiferencial`, ligado a la misma `obligacionId`. La suma de `delta` de todos los ajustes de una obligación nunca puede superar `cantidadOriginal` (mismo invariante `I-1`, ya protegido por constraint DB). Esto evita mecánicamente: cobrar dos veces el mismo diferencial (cada ajuste es un hecho append-only propio), atribuir dos veces las mismas unidades (`cantidadCumplida` es monotónica y acotada por constraint), modificar el histórico (cada ajuste referencia el precio histórico snapshot original, no lo cambia) y generar saldo incorrecto (`Pedido.total` solo sube por la suma de `montoDiferencial` efectivamente aplicados, cada uno una sola vez).

---

## 6. Casos (A–J)

| Caso | Escenario | Resultado |
|---|---|---|
| **A** | Pedido 10, entregadas 10, pendientes 0 | Sin `ObligacionPendiente`. Ya cubierto hoy (`estadoEntrega=ENTREGADO`). |
| **B** | Pedido 10, entregadas 6, pendientes 4, **sin gestión** | Las 4 quedan en `Pedido`/`PedidoItem` (PR-1, ya implementado). **No** se crea `ObligacionPendiente`. |
| **C** | Pendiente 4 → "Gestionar pendiente" → `Actividad.modo = PUNTO` | `ObligacionPendiente` + `Actividad` nacen; sin diferencial si el modo coincide con el canal original y el precio no cambió (puede haber diferencial si cambió la tarifa vigente incluso en el mismo modo — ver nota abajo). |
| **D** | Pendiente 4 → "Gestionar pendiente" → `Actividad.modo = DOMICILIO` | Igual que C + cálculo de diferencial (§5) antes de confirmar. |
| **E** | Cambio posterior de modalidad, `Actividad` aún no ejecutada | Comando `CambiarModoActividad` (transaccional, bajo lock `OBLIGACION:{id}`), recalcula diferencial contra el nuevo modo, evento de auditoría con modo anterior/nuevo/actor/motivo/timestamp. Ver ALS §7. |
| **F** | Diferencial positivo $4.000 | §5.3 |
| **G** | Diferencial negativo −$3.000 | §5.3 |
| **H** | Diferencial cero | §5.3 |
| **I** | Varias gestiones parciales | §5.4 |
| **J** | Cancelación de una gestión antes de ejecutarse | §7 |

**Nota sobre C/D:** el diferencial no depende de "cambió el modo" sino de "cambió el valor aplicable". Si el modo se gestiona como PUNTO pero la tarifa vigente de PUNTO ya no es la histórica, también hay diferencial. La fórmula de §5.1 lo cubre sin distinción especial — se recomienda no hard-codear "solo DOMICILIO puede generar diferencial".

---

## 7. Caso J — cancelación de una gestión pendiente antes de ejecutarse

| Entidad | Efecto al cancelar |
|---|---|
| `ObligacionPendiente` | Pasa a `estado = ANULADA` (el enum `ObligacionEstado` ya existe — verificar en el ALS/matriz si tiene ese valor o hace falta agregarlo). `cantidadAsignada` de la(s) Actividad(es) canceladas vuelve a 0. |
| `Actividad` | Pasa a `estado = CANCELADA` (ya existe en `ActividadEstado`). Libera su `embarqueId` si tenía uno asignado (mismo patrón que liberar cualquier asignación). |
| Cantidades | El remanente vuelve **íntegramente** a ser responsabilidad de `Pedido`/`PedidoItem` (`cantPedido − cantEntrega` sigue siendo la verdad, nunca cambió durante la gestión — `I-4`). No queda cantidad "atrapada" en una Obligación cancelada. |
| Diferencial | Si ya se había calculado pero **no confirmado/cobrado**, se descarta sin dejar rastro económico. Si ya se había confirmado y cobrado (ver §5.2), la cancelación de la gestión **no** revierte automáticamente el cobro — requiere el mismo flujo de reversión ya existente (`registrarReversionPedido`, `NotaCredito`) que usa `CancelarPedidoUseCase`, aplicado al monto del diferencial específicamente. |
| Pagos | Ningún `Pago` histórico se toca. Si hubo un `Pago` sobre el diferencial ya confirmado, se revierte con el mecanismo estándar de reversión (mismo patrón que anular un pedido pagado). |
| Cartera | `ReceivableEntry` recibe un tipo `REVERSION` si hubo un `PAGO`/`ABONO` que revertir (mismo patrón `ADR-CORRECCION-MONETARIA-001`, ya implementado). |

Esto requiere un caso de uso `LiberarActividadUseCase` (contrato ya descrito en `ADR-OBLIGACION-001`/Plan Maestro V11.1 §7, pero **sin implementación hoy** — ver matriz Plan↔Código). No es una decisión nueva: es la aplicación del mismo patrón de reversión ya usado en `CancelarPedidoUseCase`.

---

## 8. Criterios de éxito

### Integridad comercial
- [ ] Una unidad pendiente no puede convertirse accidentalmente en dos ventas (garantizado por `I-5`: nunca se crea un segundo `Pedido`).
- [ ] El pedido histórico permanece intacto (`I-6`).
- [ ] Las cantidades se conservan (`I-1`, protegido por constraint DB).
- [ ] No se inventan pedidos.

### Integridad financiera
- [ ] Ningún importe se reconoce dos veces (`I-7`, cada `PedidoCantidadAjuste` es append-only y su `delta` está acotado).
- [ ] El diferencial se calcula de forma determinista (§5.1, reutiliza `resolverPreciosPedido`).
- [ ] El diferencial positivo se cobra correctamente (vía `Pedido.saldo` + cartera existente).
- [ ] El diferencial negativo no se pierde (`Cliente.saldoFavor`).
- [ ] Los múltiples cumplimientos no duplican ajustes (`I-7`, `§5.4`).

### Integridad operativa
- [ ] Un pendiente normal no genera automáticamente una nueva obligación (decisión 1.3, ya validado contra PR-1 — ver matriz Plan↔Código).
- [ ] `ObligacionPendiente` aparece únicamente al gestionar (decisión 1.3).
- [ ] Toda actividad tiene un modo operativo inequívoco (`I-9`).
- [ ] PUNTO y DOMICILIO son distinguibles y auditables (decisión 1.1).

### Trazabilidad
- [ ] Puede reconstruirse `Pedido original → unidades entregadas → unidades pendientes → decisión de gestionar → ObligacionPendiente → Actividad → modo → Embarque → cumplimiento → consecuencia económica` sin modificar retrospectivamente la historia — ver ALS §12 (Auditoría) para el mecanismo exacto.

---

## 9. Dependencias externas

- **Fiscalidad del diferencial** (nota débito / factura por diferencia): contador + proveedor de facturación electrónica + normativa DIAN. **No resuelto, no se inventa.** Bloquea únicamente la emisión del documento fiscal del diferencial — no bloquea la mecánica económica interna (`Pedido.total`/`saldoFavor`), que puede implementarse y validarse (incluso en modo "diferencial pendiente de facturar") sin esperar la resolución fiscal, siempre que no se emita ningún documento fiscal hasta que ese gate se cierre.

---

## 10. Brechas contra el código (resumen — detalle completo en la Matriz Plan↔Código)

| Elemento | Estado |
|---|---|
| `Actividad.modo` | No existe en schema — aditivo, sin migración destructiva |
| Comando "Gestionar pendiente" (crea `ObligacionPendiente` bajo demanda) | No existe |
| `CambiarModoActividadUseCase` | No existe |
| `LiberarActividadUseCase` | No existe |
| Cálculo de diferencial | No existe como flujo, pero **el motor de precios que necesita ya existe y no requiere cambios** (`resolverPreciosPedido`) |
| Registro del diferencial (`PedidoCantidadAjuste.montoDiferencial`) | Campo no existe — aditivo |
| `ObligacionEstado`/`ActividadEstado` para cancelación | Verificar valores exactos del enum en la matriz Plan↔Código |
| `Pedido`/`PedidoItem` como fuente del pendiente ordinario | **Ya implementado** (PR-1) |
| Lock `OBLIGACION:{id}` | **Ya implementado** (`AsignarActividadUseCase`) |

---

## 11. Revisión adversarial (previa a la entrega)

Búsqueda explícita de: duplicidad de ventas/cantidades/pagos, pérdida de saldo, modificación retroactiva, precios incorrectos, múltiples parciales, concurrencia, idempotencia, cancelaciones, cambios de modo, inconsistencias entre entidades, contradicciones con decisiones anteriores.

### Hallazgo 1 (real, corregido en esta entrega): doble cumplimiento Pedido-ordinario vs Actividad-gestionada

Sin una regla explícita, nada impedía que, una vez creada una `ObligacionPendiente`/`Actividad` para gestionar 4 unidades pendientes, el flujo **ordinario** de entrega (`EntregarPedidoUseCase`, o el cierre de un embarque donde el mismo pedido apareciera de nuevo) marcara esas mismas 4 unidades como entregadas **también** por la vía directa de `Pedido`/`PedidoItem` — resultando en `cantEntrega` incrementado dos veces para la misma mercancía física (una vez vía el cumplimiento de la Actividad, otra vez vía el flujo ordinario). Esto sería duplicación de cantidad y, si alguna de las dos vías cobra dinero, duplicación de cobro.

**Corrección aplicada:** invariante `I-11` (nueva) — mientras la Obligación esté `ABIERTA` con cantidad asignada, el flujo ordinario queda acotado a `cantPedido − cantidadOriginal(Obligación)`. Esto requiere que `EntregarPedidoUseCase` (y la rama COMPLETO/PARCIAL del cierre de embarque) **consulten si existe una `ObligacionPendiente` `ABIERTA`** para ese `Pedido` antes de aceptar una cantidad de entrega que invada el remanente gestionado. Esto es un contrato técnico nuevo (no estaba en ningún documento anterior) — se agrega a la Matriz Plan↔Código como "no implementado", y es **bloqueante para la implementación de `GestionarPendienteUseCase`**, no opcional.

### Hallazgo 2 (real, corregido en esta entrega): el diferencial mostrado en "preview" no es necesariamente el que se aplica

El flujo `Gestionar pendiente → ... → mostrar diferencial → confirmar` (ALS_v2.md §13) tiene una ventana de tiempo entre "calcular y mostrar" y "confirmar". Si las tarifas vigentes cambian en esa ventana (p.ej. un cambio de precio de domicilio administrado por otro usuario), aplicar el diferencial mostrado sin recalcular sería aplicar un valor stale — mismo tipo de bug que ya se corrigió en otras partes de esta app para previews de precio (`resolver/route.ts`, guard `seqRef` contra resultados de requests obsoletos).

**Corrección aplicada:** el diferencial se **recalcula dentro de la misma transacción de confirmación** (`CambiarModoActividadUseCase`, §3.2/3.3 del ALS) — el valor mostrado en el preview es informativo, el que se cobra/acredita es siempre el recalculado al confirmar. Si el recalculado difiere del mostrado por más de un umbral, se recomienda (no obligatorio para la primera versión) exigir una re-confirmación explícita del usuario — se deja como nota de UX, no bloqueante.

### Hallazgo 3 (ya señalado, reforzado aquí): falta de `offlineId` en `PedidoCantidadAjuste`

Sin una clave idempotente propia, un replay de `CambiarModoActividadUseCase` (offline, reintento de red) podría aplicar el diferencial dos veces — exactamente el tipo de duplicidad de pago que esta revisión busca. Ya incorporado como brecha bloqueante en la Matriz Plan↔Código y en el ALS §7/§14 (no es un hallazgo nuevo de esta sección, se listó primero en la especificación de casos de uso — se reafirma aquí porque calza directamente en "duplicidad de pagos"/"idempotencia" de la revisión pedida).

### Sin hallazgos en:

- **Duplicidad de ventas:** descartada por `I-5` (nunca se crea un segundo `Pedido`).
- **Pérdida de saldo:** descartada por el tratamiento de diferencial negativo (`saldoFavor`, nunca se descarta silenciosamente).
- **Modificación retroactiva:** descartada por `I-6` (el histórico de `PedidoItem` nunca se reescribe; el diferencial es siempre un hecho aditivo nuevo con su propio timestamp).
- **Concurrencia:** cubierta por los locks de §6 del ALS, incluida la prueba nueva de dos "Gestionar pendiente" concurrentes sobre el mismo remanente.
- **Contradicciones con decisiones anteriores:** ninguna encontrada. Esta especificación es consistente con PR-1 (#175), F-A (#184), F-B (#187), `ADR-PLANIFICADOR-003/006`, `ADR-OBLIGACION-001`, `ADR-ACTIVIDAD-001` y `ADR-PEDIDO-ORIGEN-CANAL-001`. No se modifica ninguno de esos ADRs.
- **Contradicciones con documentación histórica:** la única detectada (clasificación `DECISIÓN` vs `PROPUESTA` de "PUNTO→DOMICILIO explícito" en `#189`) ya fue identificada y corregida en `#190`; no es documentación obsoleta ni contradicción real, fue una imprecisión de etiquetado ya resuelta.
