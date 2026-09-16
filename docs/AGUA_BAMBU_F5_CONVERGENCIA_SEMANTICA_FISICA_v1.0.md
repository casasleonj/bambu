# AGUA BAMBÚ — F5: CONVERGENCIA DE SEMÁNTICA FÍSICA (CARGA/RECARGA/RETORNO/CAMBIO/PROMOCIÓN/RECOVERY)

**Versión:** 2.0
**Fecha:** 2026-09-15
**Responde a:** mensaje del equipo con la semántica operativa completa de Agua Bambú (11 secciones conceptuales) y 16 puntos de revisión explícitos. Instrucción explícita: no convertir esto en refactorización — primero clasificar cada punto (ya existe / parcial / incorrecto / brecha real / solo documentación / requiere cambio de código / requiere decisión adicional), con evidencia archivo:línea.

**v2.0**: el equipo corrigió v1.0 — varios puntos que quedaron marcados "requiere decisión de negocio" ya estaban decididos por el equipo en el mismo mensaje que originó este documento; no debían volver a presentarse como pregunta. Tabla y resumen actualizados: cada punto ahora distingue explícitamente **DECISIÓN** (semántica de negocio, ya cerrada, no se reabre) de **BRECHA PLAN ↔ CÓDIGO** (que esa decisión no está implementada) — son dos cosas distintas y no deben colapsarse. Se agrega plan de priorización P0/P1/P2 y checklist de implementación (§11 del mensaje del equipo). El P0 (`PROMOCIÓN`) se implementa en un PR separado, enlazado al final de este documento una vez abierto.

---

## Hallazgo más importante — no estaba en el radar de F5 hasta esta convergencia

> **`PROMOCIÓN` genera una discrepancia falsa en el cierre de cada embarque que la usa — bug activo hoy, en producción, independiente de RECARGA.**

`POST /api/promociones/route.ts:73-86` escribe `EmbarqueMovimiento{tipo:PROMOCION}` (el ledger físico) pero **no toca `Pedido`/`PedidoItem` ni `EmbarqueProducto`** — verificado leyendo el archivo completo. La conciliación de cierre (`cierre-embarque.service.ts:73`: `discrepancia = cargadas - entregadas - devueltas - cambios - rotas`) obtiene `entregadas` sumando campos de `Pedido` (`CerrarEmbarqueUseCase.ts:362-368`) — una paca que salió como `PROMOCION` nunca entra en esa suma. **Resultado: cada unidad promocional entregada aparece como "faltante" en el cierre**, y ese faltante alimenta automáticamente `CrearDescuentoDiscrepanciaService`→`ResponsibilityCase` (`CerrarEmbarqueUseCase.ts:174-183`) salvo que alguien la justifique manualmente en cada cierre. `ADR-FISICO-001`/`ADR-PROMOCION-001` documentan el efecto físico ("consume inventario como una entrega, sin cobro") pero ninguno de los dos cierra el círculo con la conciliación — es una brecha real, no solo documental, y **no depende de que se implemente RECARGA** — ya existe hoy para cualquier embarque que use promociones.

Esto se señala aquí porque la sección 6/13 del mensaje del equipo lo pedía explícitamente ("no debe desaparecer dentro de una cifra genérica de salidas") y la investigación lo confirmó con evidencia de código, no como hipótesis.

---

## Tabla de clasificación — los 16 puntos (v2.0: DECISIÓN separada de BRECHA)

| # | Punto | DECISIÓN (semántica, cerrada por el equipo) | BRECHA PLAN ↔ CÓDIGO | Prioridad |
|---|---|---|---|---|
| 1 | CARGA dual-write al ledger físico | CARGA es un movimiento del ledger físico con efecto propio (`ADR-FISICO-001`) — cerrado desde F5 v1.0 | Diseñado en PR #262 (sin mergear). `main` hoy solo escribe `EmbarqueCarga`, no `EmbarqueMovimiento` | P1 |
| 2 | RECARGA dentro del mismo Embarque | **CERRADA**: RECARGA ocurre dentro del mismo Embarque, nunca crea otro Embarque ni Embarque hijo | Diseño técnico completo en PR #264. Cero código en `main` | P1 |
| 3 | Solicitar ≠ Ejecutar RECARGA | **CERRADA**: no son obligatoriamente personas distintas; `ADMIN`/`ASISTENTE` pueden ejecutar directo sin depender de una solicitud previa del repartidor | Ya reflejado en el diseño de PR #264 §7 Regla 3 — sin brecha de diseño, falta implementar junto con el punto 2 | P1 |
| 4 | Permisos repartidor/admin/asistente | **CERRADA**: mismo patrón que `Sustitucion`/`RecoveryDecision` (ADMIN/ASISTENTE ejecutan, repartidor no autoriza) | Diseñado, no implementado (PR #264 §8.3) | P1 |
| 5 | Capacidad física disponible tras RECARGA | **CERRADA**: la capacidad es del vehículo en el momento, no un acumulado histórico; `EmbarqueProducto.entregadas` NO debe usarse como contador universal — necesita nombre y alcance propios, puramente físicos (§A) | `Pedido.embarqueId` se pierde en toda entrega parcial (`Pedido.ts:201`), sin otro rastro inmutable — confirmado, sin implementar | P1 |
| 6 | Capacidad física ≠ pedidos asignados ≠ venta libre | **CERRADA**: son 3 conceptos distintos que deben mantenerse separados; una recarga aumenta (A) sin crear (B) automáticamente | Confirmado en §B: hoy no son magnitudes separadas — el único control es peso agregado de pedidos vs capacidad del vehículo, desconectado de `EmbarqueProducto.cargadas`; venta libre no valida capacidad en absoluto | P1 |
| 7 | Incorporar pedidos a Embarque activo | **CERRADA, y ya implementada** — no se toca | **Sin brecha.** `POST /api/pedidos/[id]/enviar` y `PUT /api/embarques/[id]` ya lo permiten (`enviar/route.ts:115-117`, `[id]/route.ts:177-184`) | — |
| 8 | RETORNO = hecho físico; DEVUELTA/FILTRADA/DAÑADA = motivo | **CERRADA**: son conceptos distintos — RETORNO es el hecho, el motivo determina qué pasa después. No deben tratarse como sinónimos | `EmbarqueMovimiento.metadata` usado de 3 formas inconsistentes sin contrato (§C); el RETORNO del cierre (el más frecuente) no lleva motivo en absoluto | P1 |
| 9 | FILTRADA → RETORNO → REEMPAQUE → INVENTARIO | **CERRADA**: flujo de negocio explícito; una filtrada NO es automáticamente merma | No existe ningún flujo ni conexión entre movimientos — `REEMPAQUE` es un movimiento manual aislado, sin FK a un RETORNO previo, sin efecto sobre disponibilidad | P1 |
| 10 | DEVUELTA → INVENTARIO directo (comercializable, no defectuosa) | **CERRADA** | La UI del wizard de cierre etiqueta la columna de `rotas` como **"Filtradas"** (`cerrar-client/index.tsx:738,782,1043`) — el propio sistema ya mezcla los dos conceptos que la decisión pide separar. Esta etiqueta es, en sí misma, una brecha (no solo un matiz de redacción) | P1 (lógica) / P2 (UI) |
| 11 | DAÑADA/ROTA → REEMPAQUE si recuperable, MERMA/DESCARTE si no | **CERRADA** | Confirmado: la elección REEMPAQUE vs DESCARTE es 100% manual del usuario, sin ninguna regla de sistema que la condicione | P1 |
| 12 | CAMBIO: cantidad reclamada ≠ cantidad repuesta; disposición diferida (PENDIENTE DE INSPECCIÓN); decide el responsable de administración, no el repartidor | **CERRADA** | `Sustitucion` no separa cantidad reclamada de repuesta (un solo campo `cantidad`), es atómico en un solo paso, sin ningún estado "PENDIENTE DE INSPECCIÓN" en ningún modelo | P1 |
| 13 | PROMOCIÓN: sale físicamente, consume disponibilidad, no es venta ordinaria, NO debe aparecer como faltante | **CERRADA** | **BUG/DEFECTO DE INTEGRIDAD, no solo brecha de alcance.** Confirmado con código: la conciliación no la contempla, genera discrepancia falsa y puede disparar `ResponsibilityCase` contra alguien sin causa real | **P0** |
| 14 | RECOVERY ≠ devolución; resuelve una discrepancia sin borrarla ni reinterpretarla | **CERRADA** | **Sin brecha real** — `RecoveryDecision` ya satisface esto (actor/autorizador/motivo/resultado/cantidad/cantidadAplicada, vínculo a `sourceEvent`/pedidos). Reutilizar tal cual, no rediseñar | — |
| 15 | Conciliación: `CARGA + RECARGA − ENTREGA − VENTA_RUTA − PROMOCION + RETORNOS + RECOVERY ± otros`, sin mezclar con `Pedido.entregadas` | **CERRADA** | Hoy es parcial: `devueltas`/`cambios`/`rotas` sí están correctamente separados de "venta"; falla en `PROMOCION` (P0) y nunca integra `EmbarqueMovimiento`/`RecoveryDecision` para nada | P0 (Promoción) / P1 (resto) |
| 16 | Offline/idempotencia/concurrencia: todo cambio nuevo debe seguir el patrón ya establecido | **CERRADA** — patrón ya decidido en todo el repo | **Sin brecha** — `offlineId` + dedup-dentro-del-lock es uniforme (`CrearEmbarqueUseCase`, `Sustitucion`, `RecoveryDecision`, `botellones`); cualquier PR nuevo debe seguirlo, no inventar uno propio | — (checklist, ver §11) |

---

## §A — Corrección al diseño de capacidad tras RECARGA (punto 5, sección 8 del mensaje del equipo)

El mensaje del equipo advierte explícitamente: *"No debemos utilizar `EmbarqueProducto.entregadas` como registro universal de todo lo que ocurrió físicamente. ENTREGADAS representa cumplimiento de pedidos. El ledger físico representa movimiento/custodia del producto. Son responsabilidades diferentes."*

Esto corrige, con razón, el nombre propuesto en PR #264 v2.1. La columna aditiva que se propuso ahí **no debe llamarse `entregadas`** (ese nombre ya tiene una semántica reservada: cumplimiento comercial de pedidos) — debe representar exclusivamente "cuánto ha salido físicamente del vehículo, por cualquier motivo" (entrega de pedido, venta libre, promoción — todo lo que reduce custodia del vehículo), sin implicar cumplimiento de ninguna obligación comercial. Nombre corregido a proponer cuando se retome la implementación: algo como `EmbarqueProducto.salidas` (o `custodiaSalida`) — un contador puramente físico, símil de `cargadas` (que tampoco implica nada comercial), nunca leído por `calcularDiscrepancia()` ni por ningún flujo de Pedido. La lógica de incremento (en el mismo punto donde hoy se pierde el dato, antes de nulear `embarqueId`) sigue siendo la misma que PR #264 §10 ya identificó — **corrige el nombre y su alcance semántico, no el mecanismo**.

Esto también resuelve parcialmente el punto 6 (§B): si esta columna cuenta TODA salida física (no solo entregas de pedido), automáticamente incluye ventas libres y promociones en el cálculo de "cuánto queda físicamente disponible" — sin necesidad de sumar 3 fuentes distintas como proponía la v2.1 original.

---

## §B — Capacidad física / pedidos asignados / venta libre (punto 6)

**Confirmado: no son magnitudes separadas y conciliadas hoy.** Evidencia:

- El único control de "cuánto cabe" es un presupuesto de **peso agregado**: `src/lib/embarque-capacidad.ts:68-79` (`calcularPesoEmbarque`) suma el peso de los `Pedido`/items **asignados al embarque**, comparado contra `Trabajador.capacidadKg` (`enviar/route.ts:119,134-136`, `embarques/[id]/route.ts:217-220,391-393`). **Nunca se compara contra `EmbarqueProducto.cargadas`** (lo realmente cargado) — son dos números que hoy no se cruzan.
- **Venta libre no valida capacidad en absoluto**: `venta-libre/route.ts` solo exige que el embarque exista y esté `ABIERTO` (línea 119) — cero llamada a `calcularPesoEmbarque` ni a ningún validador de stock. Confirmado por ausencia total en el archivo completo.
- Esto significa que hoy es posible, en teoría, asignar pedidos + vender libre por encima de lo que el vehículo realmente tiene cargado, sin que el sistema lo detecte en el momento — solo se vería como discrepancia al cierre (y, como ya se documentó, ni siquiera ahí de forma completa por el bug de `PROMOCION`).

**Esto es una brecha real, más amplia que la capacidad de RECARGA que motivó la investigación original** — pero **no se propone resolverla en este documento** (excede "cerrar RECARGA con mínimo cambio"). Se registra para que el equipo decida si entra al alcance de F5 o queda separada.

---

## §C — RETORNO / motivo (punto 8)

`EmbarqueMovimiento.metadata` (Json libre) se usa hoy de 3 formas inconsistentes, sin contrato compartido:
- `ledger-fisico.service.ts:88`: `{motivo:'DEFECTUOSA'}` (para `Sustitucion`).
- `sustituciones/route.ts:114`: agrega además `motivoDetalle` (texto libre).
- `botellones.service.ts:23`: `{tipoEnvase:'RECOGIDO'}` (concepto no relacionado a motivo de defecto).
- El RETORNO más frecuente — el que se escribe al **cerrar** el embarque (`registrar-movimientos-cierre.service.ts:112-124`) — **no escribe metadata en absoluto**. Es decir, el camino que más volumen de RETORNO genera es, precisamente, el que menos distingue motivo.

El modelo `Retorno` (con su campo `motivo` documentado en comentario: `EMPAQUE_ROTO, PACA_FILTRADA, DEFECTUOSA, CLIENTE_RECHAZA`) sigue siendo el lugar estructuralmente correcto para esto — sigue huérfano (confirmado de nuevo, cero escritores reales).

---

## Plan de priorización (§11 del mensaje del equipo)

**P0 — corregir antes que cualquier otra cosa:**
- `PROMOCIÓN` en la conciliación (punto 13/15). Bug de integridad activo, aislado, sin dependencia de RECARGA ni de ningún otro punto de este documento.

**P1 — implementación de las decisiones ya cerradas:**
- CARGA → ledger físico (punto 1, PR #262).
- RECARGA dentro del mismo Embarque + solicitar≠ejecutar + permisos (puntos 2-4, PR #264).
- Capacidad física tras RECARGA, con el naming corregido de §A (punto 5).
- Capacidad física / pedidos asignados / venta libre como magnitudes separadas (punto 6, §B).
- RETORNO con motivo explícito + FILTRADA/DAÑADA → REEMPAQUE → INVENTARIO (puntos 8-11, §C).
- CAMBIO con cantidad reclamada≠repuesta + estado de inspección pendiente (punto 12).
- Conciliación física completa (`CARGA+RECARGA−ENTREGA−VENTA_RUTA−PROMOCION+RETORNOS+RECOVERY`), sin mezclar con `Pedido.entregadas` (punto 15).

**P2 — hardening de UX/UI, terminología, estados, visualización** (una vez P0/P1 estén resueltos en el modelo/lógica):
- Corregir la etiqueta "Filtradas" en `cerrar-client/index.tsx` para que refleje el motivo real, no el nombre de columna legacy.
- Cualquier ajuste visual/de copy derivado de las nuevas distinciones (motivo de retorno, estado de inspección, etc.).

## Checklist obligatorio para cada PR de implementación (§11)

Cada cambio de este dominio debe demostrar, explícitamente en su descripción:
1. Qué DECISIÓN de este documento implementa (cita la fila de la tabla).
2. Qué BRECHA PLAN↔CÓDIGO corrige (evidencia file:line del estado anterior).
3. Qué NO modifica (autoridades/flujos que se mantienen intactos — `Pedido`/`PedidoItem` como autoridad comercial, `CierreEmbarqueService` salvo donde el propio punto lo autorice explícitamente, etc.).
4. Pruebas (unitarias + integración contra Postgres real, mismo estándar de todo F1-F5 hasta ahora).
5. Idempotencia (`offlineId`, mismo patrón ya establecido).
6. Concurrencia (locks existentes reutilizados, sin inventar mecanismos nuevos).
7. Comportamiento offline, cuando aplique.
8. Trazabilidad/auditoría (`logAudit`, mismo patrón).

Sin refactor general. Sin segunda fuente de verdad. Sin convertir una discrepancia legítima en responsabilidad automática. "El sistema prepara; la persona decide; el backend protege; la auditoría conserva."

**Estado de implementación de este documento**: el P0 (`PROMOCIÓN`) se aborda en un PR separado — se referencia aquí en cuanto se abra. El resto (P1/P2) sigue sin código, a la espera de que el equipo confirme el orden dentro de P1.
