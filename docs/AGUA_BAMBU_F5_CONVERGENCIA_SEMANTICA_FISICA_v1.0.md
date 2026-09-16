# AGUA BAMBÚ — F5: CONVERGENCIA DE SEMÁNTICA FÍSICA (CARGA/RECARGA/RETORNO/CAMBIO/PROMOCIÓN/RECOVERY)

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** mensaje del equipo con la semántica operativa completa de Agua Bambú (11 secciones conceptuales) y 16 puntos de revisión explícitos. Instrucción explícita: no convertir esto en refactorización — primero clasificar cada punto (ya existe / parcial / incorrecto / brecha real / solo documentación / requiere cambio de código / requiere decisión adicional), con evidencia archivo:línea. **Cero implementación en este documento.**

---

## Hallazgo más importante — no estaba en el radar de F5 hasta esta convergencia

> **`PROMOCIÓN` genera una discrepancia falsa en el cierre de cada embarque que la usa — bug activo hoy, en producción, independiente de RECARGA.**

`POST /api/promociones/route.ts:73-86` escribe `EmbarqueMovimiento{tipo:PROMOCION}` (el ledger físico) pero **no toca `Pedido`/`PedidoItem` ni `EmbarqueProducto`** — verificado leyendo el archivo completo. La conciliación de cierre (`cierre-embarque.service.ts:73`: `discrepancia = cargadas - entregadas - devueltas - cambios - rotas`) obtiene `entregadas` sumando campos de `Pedido` (`CerrarEmbarqueUseCase.ts:362-368`) — una paca que salió como `PROMOCION` nunca entra en esa suma. **Resultado: cada unidad promocional entregada aparece como "faltante" en el cierre**, y ese faltante alimenta automáticamente `CrearDescuentoDiscrepanciaService`→`ResponsibilityCase` (`CerrarEmbarqueUseCase.ts:174-183`) salvo que alguien la justifique manualmente en cada cierre. `ADR-FISICO-001`/`ADR-PROMOCION-001` documentan el efecto físico ("consume inventario como una entrega, sin cobro") pero ninguno de los dos cierra el círculo con la conciliación — es una brecha real, no solo documental, y **no depende de que se implemente RECARGA** — ya existe hoy para cualquier embarque que use promociones.

Esto se señala aquí porque la sección 6/13 del mensaje del equipo lo pedía explícitamente ("no debe desaparecer dentro de una cifra genérica de salidas") y la investigación lo confirmó con evidencia de código, no como hipótesis.

---

## Tabla de clasificación — los 16 puntos

| # | Punto | Clasificación | Evidencia resumida |
|---|---|---|---|
| 1 | CARGA dual-write al ledger físico | **Diseñado, no en `main`** | PR #262 (abierto, sin mergear) implementa exactamente esto. En `main` hoy, `CrearEmbarqueUseCase` solo escribe `EmbarqueCarga`, no `EmbarqueMovimiento`. |
| 2 | RECARGA dentro del mismo Embarque | **Brecha real — diseño listo, sin implementar** | PR #264 (diagnóstico + diseño técnico completo). Confirmado exhaustivamente: cero código hoy. |
| 3 | Solicitud y ejecución de RECARGA | **Diseño ya alineado con el nuevo requisito** | PR #264 §7 Regla 3 ya propone: `REPARTIDOR` puede disparar notificación (solicitar); `ADMIN`/`ASISTENTE` ejecutan directo sin depender de una solicitud previa — cumple "no necesariamente tienen que ser tres personas diferentes". |
| 4 | Permisos repartidor/admin/asistente para intervenir | **Ya diseñado, no en `main`** | Mismo diseño de PR #264 §8.3. Precedente ya construido y funcionando para el mismo patrón: `Sustitucion` (ADMIN/ASISTENTE únicamente, repartidor sin acceso) y `RecoveryDecision` (mismo patrón). |
| 5 | Capacidad física disponible tras RECARGA | **Brecha real, confirmada — requiere cambio de código (ver corrección de naming abajo)** | PR #264 §9-§10: `Pedido.embarqueId` se pierde en toda entrega parcial (`Pedido.ts:201`), sin ningún otro rastro inmutable. Columna propuesta debe **renombrarse** — ver §A de este documento. |
| 6 | Capacidad física ≠ pedidos asignados ≠ venta libre | **Brecha real, más amplia de lo que F5 había cubierto** | Ver §B — no son magnitudes separadas hoy; el único control es peso agregado de pedidos vs capacidad del vehículo, desconectado de `EmbarqueProducto.cargadas`. |
| 7 | Incorporar/asignar nuevos pedidos a Embarque activo | **YA EXISTE — sin brecha** | `POST /api/pedidos/[id]/enviar` y `PUT /api/embarques/[id]` YA permiten asignar pedidos a un Embarque `ABIERTO`/`EN_RUTA` (`enviar/route.ts:115-117`, `[id]/route.ts:177-184`, comentario explícito "*En EN_RUTA solo se permite asignar/quitar pedidos*"). No requiere ningún cambio para RECARGA. |
| 8 | RETORNO y sus razones/condiciones | **Brecha real de modelo + un hallazgo de terminología ya confusa en producción** | Ver §C. `metadata` (Json libre) usado de 3 formas distintas sin contrato; el RETORNO del cierre (el más frecuente) no lleva motivo en absoluto. |
| 9 | FILTRADA → REEMPAQUE → INVENTARIO | **Brecha real — no existe ningún flujo, ni conexión entre movimientos** | `REEMPAQUE` es un movimiento manual aislado, sin FK a un RETORNO previo, sin ningún efecto sobre disponibilidad/stock (`grep` sin resultados en `src/modules`/`src/lib`). |
| 10 | DEVUELTA → INVENTARIO | **Parcial / terminología ya confusa** | La UI del wizard de cierre etiqueta la columna de `rotas` como **"Filtradas"** (`cerrar-client/index.tsx:738,782,1043`) — el propio sistema ya mezcla "rotas" y "filtradas" como si fueran lo mismo, exactamente lo que el equipo pide separar. `devueltas` (columna separada) sí es conceptualmente correcta (producto que no se vendió, no defectuoso) pero no tiene ninguna ruta de vuelta "a inventario disponible" rastreable — solo resta en la fórmula de discrepancia. |
| 11 | DAÑADA → REEMPAQUE o MERMA según resultado | **Brecha real — sin regla de sistema** | Confirmado: la elección REEMPAQUE vs DESCARTE es 100% manual del usuario en la UI, sin ninguna validación cruzada ni condición de "recuperable" en el código (`ledger-fisico.service.ts` no tiene esa regla). |
| 12 | CAMBIO → inspección → inventario/merma | **Brecha real de modelo, confirmada** | `Sustitucion` no separa cantidad reclamada de cantidad repuesta (un solo campo `cantidad`, `validators.ts:664`), es atómico en un solo paso (`route.ts:116-160`), y no existe ningún estado "PENDIENTE DE INSPECCIÓN" en ningún modelo. |
| 13 | PROMOCIÓN como salida física diferenciada | **YA EXISTE el registro físico — INCORRECTO en la conciliación (bug activo, ver arriba)** | Ver el hallazgo principal de este documento. |
| 14 | RECOVERY como resolución de discrepancia | **YA EXISTE, alineado con el requisito — con un matiz menor** | `RecoveryDecision` (`schema.prisma:1382-1415`) captura `actorId`, `authorizedById`, `reason`, `resultado` (APLICADA/PARCIAL/RECHAZADA), `cantidad`/`cantidadAplicada`, vinculado a `sourceEvent`/`pedidoOrigen`/`pedidoDestino`. Cumple explícitamente "no modificar retroactivamente, no inventar venta/entrega, no borrar la discrepancia" (ya verificado en trabajo previo de esta sesión). Matiz: `actorId` conflates "quién detectó" y "quién decidió" en un solo campo — no hay campo separado para "quién solicitó/reportó" cuando es distinto de quién resuelve. |
| 15 | Conciliación y cierre | **Parcial — respeta la mayoría de la semántica, falla en PROMOCIÓN (bug) y no integra el ledger físico para capacidad** | `calcularDiscrepancia()` sí distingue `devueltas`/`cambios`/`rotas` como términos separados (no los trata como "ventas") — eso está bien hecho. Falla en `PROMOCION` (bug arriba) y nunca lee `EmbarqueMovimiento` para nada (sigue siendo 100% legacy `EmbarqueProducto`+`Pedido`). |
| 16 | Offline/replay/concurrencia/idempotencia | **YA EXISTE, patrón consistente** | `offlineId` + dedup-dentro-del-lock ya es el patrón uniforme en `CrearEmbarqueUseCase`, `Sustitucion`, `RecoveryDecision`, `botellones` — cualquier operación nueva (RECARGA incluida) debe seguir el mismo patrón, ya establecido, sin inventar uno nuevo. |

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

## Resumen de qué requiere qué (sin diseñar todavía)

- **Solo documentación / higiene de nombres** (bajo costo, sin cambio de comportamiento): corregir la etiqueta UI "Filtradas" → "Rotas" (o separar el campo si se decide distinguirlas de verdad, ver siguiente punto) en `cerrar-client/index.tsx:738,782,1043`.
- **Requiere decisión de negocio antes de cualquier código**: si DEVUELTA/FILTRADA/DAÑADA deben ser 3 motivos reales y distinguibles en el `Retorno`/`EmbarqueMovimiento.metadata` (con un contrato de valores, no JSON libre), o si por ahora basta con que "rotas" siga significando ambas cosas como hasta hoy. Ídem para CAMBIO (¿se necesita de verdad el estado PENDIENTE DE INSPECCIÓN, o el flujo atómico actual es aceptable para el volumen real del negocio?). Ídem para si la brecha de capacidad de §B entra a F5.
- **Brecha real que sí requiere cambio de código, ya diagnosticada y aislada**: el bug de `PROMOCION` en la conciliación (hallazgo principal) — independiente de RECARGA, no bloquea F5 pero es un defecto activo que el equipo puede priorizar aparte.
- **Ya diseñado, esperando aprobación para implementar**: RECARGA completa (PR #264), con el ajuste de naming de §A.
- **Ya existe, sin ninguna acción necesaria**: asignar pedidos a un Embarque activo (punto 7), RECOVERY (punto 14), offline/idempotencia (punto 16).

**Cero código escrito en este documento.** A la espera de que el equipo decida, punto por punto, cuáles de estas brechas entran a F5 y cuáles quedan registradas para después.
