# AGUA BAMBÚ — F5: MAPA DE BRECHAS (EJECUCIÓN FÍSICA)

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** Plan Maestro "Integridad Comercial" v1.0 §61 — texto verbatim de F5 (único usado, sin interpretación libre):

> **F5 — Ejecución física:** embarque; custodia; movimientos; entrega; retorno/recovery.

**Metodología:** igual que F1-F4 — evidencia archivo:línea, no memoria ni suposición. Por cada uno de los 5 puntos: qué YA EXISTE (no reconstruir), qué es PARCIAL, y qué es BRECHA REAL. Cero implementación en este documento.

---

## 1. Embarque — YA EXISTE, maduro. 2 hallazgos de consistencia (no bloqueantes)

Ciclo de vida completo (creación/envío/cierre/cancelación) existe, está expuesto en producción end-to-end (UI real → API real → use cases reales), sin feature flag que lo oculte, y sin ningún `TODO`/`FIXME`/`BRECHA` explícito en el código.

| | Estado técnico | Evidencia |
|---|---|---|
| Modelo | `Embarque` (`schema.prisma:1017-1104`), `EstadoEmbarque` = `ABIERTO\|EN_RUTA\|CERRADO\|CANCELADO` | `schema.prisma:99-104` |
| Creación | `CrearEmbarqueUseCase.ts:29-153`, lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}` | `CrearEmbarqueUseCase.ts:33-35` |
| Envío | Lógica inline en la route (no vía `EmbarqueTransitionsService.enviar()`, que existe pero no se usa), `executeSerializableWithRetry` | `enviar/route.ts:41-,60,80` |
| Cierre | `CerrarEmbarqueUseCase.ts:66-`, orquesta 8+ domain services, soporta dry-run | `CerrarEmbarqueUseCase.ts:51-60,290-296` |
| Cancelación | `CancelarEmbarqueUseCase.ts:23-51` (vía `DELETE /api/embarques?id=`) | `embarques/route.ts:314` |

**Hallazgo 1 — cancelación duplicada.** `DELETE /api/embarques/[id]` (`[id]/route.ts:483-560`) reimplementa la lógica de cancelación inline (su propio lock, su propio dedup, su propia reasignación de pedidos) en vez de delegar a `CancelarEmbarqueUseCase` — dos rutas HTTP distintas (`/api/embarques?id=X` vs `/api/embarques/[id]`) resuelven el mismo caso de uso con código escrito dos veces. Riesgo: que diverjan silenciosamente con el tiempo. No es un bug hoy, es duplicación estructural verificada.

**Hallazgo 2 — asimetría de concurrencia en el envío.** Crear/cerrar/cancelar usan advisory lock (`EMBARQUE_CARGA`/`CIERRE`, namespace de `src/lib/locks.ts:30-41`); envío usa `executeSerializableWithRetry` (aislamiento Postgres Serializable + retry en conflicto), un mecanismo de concurrencia distinto al resto del ciclo de vida (`enviar/route.ts:8,60`). Documentado como decisión deliberada (fix F-N1, `enviar-concurrencia.test.ts:1-11`), pero es una inconsistencia de patrón real entre las 4 transiciones de estado.

**Hallazgo 3 (menor) — sin test end-to-end único crear→enviar→cerrar.** Cada fase tiene su propio test de integración aislado (`embarque-recarga.test.ts`, `enviar-concurrencia.test.ts`, `cierre-idempotencia.test.ts`, etc.), ninguno compone el ciclo completo en una sola prueba. Además, `enviar/__tests__/route.test.ts` y `CerrarEmbarqueUseCase.test.ts` son tests de **forma** (`readFileSync` + regex sobre el código fuente), no de comportamiento real contra DB — no habrían detectado una regresión de lógica.

**Clasificación: YA EXISTE — sin brecha bloqueante. Los 3 hallazgos son deuda de consistencia, candidatos a "cirugía menor" si el equipo lo pide, no requisito de F5.**

---

## 2. Custodia — YA EXISTE (confirmado por convergencia previa), 2 brechas nuevas no cubiertas antes

La convergencia del 2026-09-12 (`docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md:63-64`) ya clasificó "custodia explícita" como **YA EXISTE / no reconstruir**, citando `ADR-CUSTODIA-001` y `EmbarqueMovimiento.origen/destino`. Esta investigación confirma que hay wiring real (no solo el valor del enum): `CrearRecoveryDecisionUseCase.ts:113-123` crea `CUSTODY_TRANSFER` real (`INSPECCION→ALMACEN`) al resolver un sobrante, y `POST /api/embarques/[id]/movimientos` permite crearlo manualmente (rol `ADMIN`/`ASISTENTE`).

Dos brechas que la convergencia **no cubrió** porque su alcance era "¿existe el mecanismo?", no "¿está enlazado a todo lo que debería?":

**Brecha 1 — reasignar `trabajadorId` de un Embarque no toca el ledger de custodia.** `PUT /api/embarques/[id]` permite cambiar el trabajador asignado (`[id]/route.ts:210-255,301`, valida capacidad/moto) pero no crea ningún `EmbarqueMovimiento{tipo:CUSTODY_TRANSFER}` ni ningún otro registro — "quién está asignado" (`Embarque.trabajadorId`) puede divergir silenciosamente de "qué dice el ledger sobre quién tiene el stock".

**Brecha 2 — `origen`/`destino` son strings libres sin FK ni enum server-side.** `EmbarqueMovimiento.origen`/`.destino` (`schema.prisma:1181-1184`) son `String?` con una "convención documentada" solo en comentario (`VEHICULO, ALMACEN, INSPECCION, CLIENTE, PRODUCCION, DESCARTE, EXTERNO`); el Zod de `POST .../movimientos` (`movimientos/route.ts:52-53`) acepta cualquier string, sin validar contra esa lista. No existe ningún campo de "custodio actual" a nivel `Embarque`/`Trabajador` — la búsqueda de `custodioActual`/`currentCustodian`/`responsableActual` en todo `src/` + schema dio 0 resultados.

**Brecha 3 (cobertura) — sin test de integración (no-E2E) de `CUSTODY_TRANSFER`.** La única cobertura real del flujo es `e2e/embarques-fisico.spec.ts:56-94` (Playwright, UI completa). `recovery-concurrencia.test.ts` ejercita el camino que internamente crea `CUSTODY_TRANSFER` pero nunca asserta sobre el `EmbarqueMovimiento` resultante.

**Clasificación: YA EXISTE el mecanismo — 2 brechas reales de enlazado/validación + 1 de cobertura, ninguna cubierta por la convergencia previa.**

---

## 3. Movimientos — PARCIAL, brechas reales de fondo

8 de 10 `TipoMovimiento` (`ENTREGA`, `VENTA_RUTA`, `RETORNO`, `REEMPAQUE`, `DESCARTE`, `CUSTODY_TRANSFER`, `PROMOCION`, `AJUSTE_AUTORIZADO`) tienen caller de producción real (use case o endpoint genérico + UI). El modelo, sus CHECK constraints (`chk_embarque_movimiento_cantidad_pos`, `chk_embarque_movimiento_ajuste_autorizado`) y `ADR-FISICO-001` (Aceptado, congelado) están completos y verificados.

**Brecha 1 (estructural) — CARGA y RECARGA nunca se escriben como `EmbarqueMovimiento`.** La carga inicial de inventario al crear un embarque se modela exclusivamente en `EmbarqueCarga`/`EmbarqueCargaProducto` (`CrearEmbarqueUseCase.ts:134-150`) — un modelo paralelo al ledger de movimientos. Búsqueda exhaustiva: cero `tx.embarqueMovimiento.create({data:{tipo:'CARGA'|'RECARGA',...}})` en todo `src/`. El ledger físico captura salidas/transferencias pero no el evento de entrada inicial — el ADR mismo (`ADR-FISICO-001.md:60-62`) solo documenta implementación de escritura para `ENTREGA`/`VENTA_RUTA`/`RETORNO`, nunca reclama CARGA/RECARGA como escritos.

**Brecha 2 (estructural) — sin reconciliación basada en el ledger.** No existe ningún servicio que sume `EmbarqueMovimiento` por producto para comparar contra un stock esperado (`stockFinEsperado`/`stockFinFisico`/`diferencia` no existen ligados a este modelo). La única conciliación activa (`cierre-embarque.service.ts:calcularDiscrepancia()`, línea 106) opera sobre el modelo legacy `EmbarqueProducto` (`cargadas - entregadas - devueltas - cambios - rotas`), completamente desacoplada del ledger físico. Son dos sistemas paralelos que nunca se validan entre sí — un movimiento manual (REEMPAQUE/DESCARTE/AJUSTE_AUTORIZADO vía UI) puede desviar el ledger sin que la conciliación de cierre lo note, y viceversa.

**Brecha 3 (ya conocida, reconfirmada) — sin `pedidoId`.** `EmbarqueMovimiento` no tiene columna `pedidoId` (confirmado de nuevo en esta investigación) — solo 2 de 10 tipos tienen alguna atribución indirecta a Pedido (`Sustitucion.pedidoId`, `RecoveryDecision.pedidoOrigenId/pedidoDestinoId`). Ya registrada como "BRECHA DE MODELO / PENDIENTE DE DISEÑO" en F4 respecto a `ObligacionPendiente` — aplica igual aquí, no se resuelve en F5 tampoco (mismo criterio del equipo: no tocar sin evidencia de necesidad real).

**Brecha 4 (cobertura) — sin test de integración HTTP para REEMPAQUE/DESCARTE/CUSTODY_TRANSFER/PROMOCION.** Solo se prueba el CHECK constraint a nivel de escritura directa (`ledger-fisico-constraints.test.ts`), no el flujo end-to-end vía el endpoint real.

**Clasificación: PARCIAL — 2 brechas estructurales reales (CARGA/RECARGA fantasma en el ledger, sin reconciliación cruzada), 1 ya conocida de F4, 1 de cobertura.**

---

## 4. Entrega — PARCIAL, incluye 1 bug de producción verificado independientemente

**Alcance de esta investigación**: solo evidencia física de la entrega (GPS/foto/código de visita/offline). La lógica de "cuánto se cumplió" (N2/ObligacionPendiente/`obligacion-guard.ts`) ya cerró en F4 y no se reabre aquí.

**Brecha 1 — CRÍTICA, bug de producción verificado (no solo por el agente, re-verificado directamente por mí, ver evidencia abajo).** `REQUIERE_GPS_PARA_ENTREGA` nunca se activa server-side pese a que el seed y la UI cliente asumen que sí:
- Seed siembra `requerirGpsParaEntrega`/`permitirEntregaSinGpsConJustificacion` (camelCase) — `prisma/seed.ts:174-175`.
- El cliente (`pedidos-client/index.tsx:813,828-829`) lee esas mismas claves camelCase y activa correctamente el modal de captura/justificación GPS.
- El servidor (`src/app/api/pedidos/[id]/entrega/route.ts:82-83`) valida contra `REQUIERE_GPS_PARA_ENTREGA`/`PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION` (SCREAMING_SNAKE_CASE) — claves **nunca sembradas**.
- `getConfigBool`/`getConfig` (`src/lib/config.ts:22-30`) hace `prisma.config.findUnique({where:{clave}})` con match exacto de string, sin normalizar mayúsculas/formato.
- Resultado: `getConfigBool('REQUIERE_GPS_PARA_ENTREGA', false)` siempre encuentra `null` → cae al default `false`. **El enforcement server-side del GPS obligatorio está permanentemente apagado**, aunque la UI muestre el flujo como si fuera obligatorio. Un caller que llame la API directamente (o un cliente que se salte el modal) puede registrar una entrega sin GPS ni justificación sin que el servidor lo rechace.
- Agravante: ninguna de las 5 claves de config relacionadas (`REQUIERE_GPS_PARA_ENTREGA`, `PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION`, `requerirGpsParaEntrega`, `permitirEntregaSinGpsConJustificacion`, `umbralGpsEntregaMetros`) es editable desde la UI de configuración (`configuracion-client.tsx:20-34`, interfaz fija sin estos campos) — solo corregible escribiendo directo en la tabla `Config`.

**Brecha 2 — anti-fraude de ubicación es 100% client-side y solo cubre un flujo.** `isWithinDeliveryRadius`/`haversineKm` (`src/lib/gps.ts:30-61`) comparan contra `clienteCoords` únicamente dentro de `GpsCaptureModal`, usado solo por el flujo de oficina (`pedidos-client/index.tsx:2606-2626`). El flujo móvil real de un repartidor en campo (`repartidor-client.tsx`) captura GPS crudo pero **nunca** compara contra la ubicación esperada — cero referencias a `isWithinDeliveryRadius`/`clienteCoords` en ese archivo. El servidor no recalcula ni valida distancia en ningún punto — solo comprueba presencia de coordenadas o de justificación. `entregadoConGps` es un booleano auto-reportado sin validación cruzada contra la presencia real de `gpsLat`/`gpsLng`.

**Brecha 3 — `codigoVisita` es un campo completo pero inerte.** Existe end-to-end en schema/dominio/DTOs/use case (`Embarque.codigoVisita`, `Pedido.codigoVisita`, propagado por todas las capas), pero: `EmbarqueCreateSchema` no lo acepta como input al crear un embarque, no hay generador en ningún archivo del repo, ninguna UI lo captura como campo de entrada, y `EntregarPedidoUseCase` lo persiste sin comparar contra ningún valor de referencia. Es una feature de esquema completa que nunca se activó.

**Brecha 4 — foto: fallback documentado a base64 crudo.** Si el upload a Supabase Storage falla, se persiste el base64 completo en `Pedido.fotoEntrega` (comportamiento intencional y documentado en el propio código, `entrega/route.ts:128-138`, con cap de 15MB reconocido en `validators.ts:173-176`). No es un bug oculto, pero es una brecha de robustez conocida sin resolver.

**Brecha 5 — offline-first solo se ejerce desde la vista de oficina.** El wiring `fetchResilient`+`offlineId` para `.../entrega` es sólido (`use-entregar-pedido.ts:45-55`), pero su único caller es `pedidos-client/index.tsx` — `/repartidor` no tiene ninguna acción de "entregar pedido pendiente" (solo venta libre). Un repartidor en campo sin conectividad no tiene forma de marcar una entrega desde su propia pantalla.

**Brecha 6 (cobertura) — el test de la route es de forma, no de comportamiento.** `entrega/__tests__/route.test.ts` es `readFileSync`+regex sobre el código fuente — no ejecuta el handler. No habría detectado el bug de la Brecha 1 porque solo verifica que el string `REQUIERE_GPS_PARA_ENTREGA` aparece en el archivo, no que la config se resuelva correctamente en runtime. `e2e/entrega-gps.spec.ts` es superficial (solo verifica que las coordenadas aparecen en el botón, no persistencia ni enforcement).

**Clasificación: PARCIAL — 1 bug de producción crítico (verificado, reproducible, no teórico), 2 brechas de integridad (anti-fraude/codigoVisita), 2 de robustez/alcance (foto/offline en repartidor), 1 de cobertura.**

---

## 5. Retorno / Recovery — nomenclatura confusa, 1 brecha limpia, resto YA EXISTE

**Aclaración de nomenclatura (importante para no reabrir algo distinto):** "retorno" y "recovery" son dos conceptos separados en este repo, no un microcopy pequeño:
- **Retorno de producto** (envases/producto defectuoso al cerrar embarque) — evento físico ya cubierto por `EmbarqueMovimiento{tipo:RETORNO}` + `EmbarqueProducto{devueltas,cambios,rotas}`.
- **"Recovery"** = `RecoveryDecision`/`CrearRecoveryDecisionUseCase` — mecanismo de negocio para reconciliar SOBRANTE/FALTANTE de producto físico detectado durante el embarque. **No** es recuperación técnica (no es retry de red ni recuperación de proceso caído) — la única semántica de "recovery ante fallo" es la idempotencia por `offlineId`, ya cubierta por el patrón `fetchResilient` genérico del resto de la app.

**Brecha real — el modelo `Retorno` es schema huérfano.** `prisma/schema.prisma:1235-1254` define `Retorno` con `motivo` (EMPAQUE_ROTO/PACA_FILTRADA/DEFECTUOSA/CLIENTE_RECHAZA, documentado en comentario) y relación a `movimientoId` — pero **ningún caso de uso, endpoint o UI lo escribe**. Búsqueda exhaustiva de `.retorno.create/.update/.findMany` en `src/`: el único resultado es un test que valida su CHECK constraint de forma aislada (`ledger-fisico-constraints.test.ts:75-78`), sin ejercitar ningún flujo de aplicación. El retorno real de producto ya ocurre (completo, capturado en el wizard de cierre — `cerrar-client/index.tsx:746-765`), pero vía `EmbarqueMovimiento`+`EmbarqueProducto`, nunca vía este modelo. O quedó reemplazado de facto sin eliminarse, o es una funcionalidad planeada (trazabilidad de motivo por unidad devuelta, enlazada al movimiento físico específico) que nunca se conectó.

**Lo que YA EXISTE, completo, sin brecha:** todo el flujo de `RecoveryDecision` (SOBRANTE/FALTANTE) — UI dedicada (`recovery-panel.tsx`, `recovery-form-modal.tsx`), API (`POST/GET /api/embarques/[id]/recovery`), use case con lock de concurrencia (`RECOVERY_SOURCE`/`EMBARQUE_CARGA`), idempotencia real por `offlineId`, y tests de concurrencia genuinos contra Postgres real (`recovery-concurrencia.test.ts` — 4 casos: SOBRANTE concurrente, FALTANTE concurrente, idempotencia de replay, FALTANTE sin `sourceEventId`).

**Clasificación: 1 brecha real y limpia (modelo `Retorno` sin ningún productor) — todo lo demás (retorno de producto en cierre, recovery de sobrante/faltante) YA EXISTE sin brecha.**

---

## Resumen ejecutivo — brechas reales priorizadas

| # | Punto | Brecha | Severidad |
|---|---|---|---|
| 1 | Entrega | GPS obligatorio nunca se activa server-side (mismatch de claves de config), verificado y reproducible | **CRÍTICA — bug de producción activo hoy** |
| 2 | Entrega | Anti-fraude de ubicación 100% client-side, ausente en `/repartidor`, servidor no revalida | Alta — control de integridad trivialmente evadible |
| 3 | Movimientos | CARGA/RECARGA nunca entran al ledger de movimientos (viven en modelo paralelo `EmbarqueCarga`) | Media-alta — ledger físico incompleto en el evento de entrada |
| 4 | Movimientos | Sin reconciliación cruzada ledger vs conciliación legacy (`EmbarqueProducto`) | Media-alta — dos fuentes de verdad sin validar entre sí |
| 5 | Entrega | `codigoVisita` inerte end-to-end (schema completo, cero uso real) | Media — feature fantasma, no bug activo |
| 6 | Custodia | Reasignar `trabajadorId` no genera registro de custodia en el ledger | Media |
| 7 | Retorno | Modelo `Retorno` huérfano, sin productor | Media — probable deuda de schema, no bug activo |
| 8 | Embarque | Cancelación duplicada en 2 rutas HTTP distintas | Baja-media — riesgo de divergencia futura, no bug hoy |
| 9 | Entrega | Offline-first de entrega no alcanza a `/repartidor` (solo oficina) | Baja-media — gap de alcance funcional |
| 10 | Custodia | `origen`/`destino` de movimientos son string libre sin validación server-side | Baja |
| 11 | Embarque | Asimetría de lock en el envío vs resto del ciclo de vida | Baja — inconsistencia de patrón, no bug |
| 12 | Varios | Cobertura de test débil o de "forma" (regex sobre source) en varios puntos (entrega/route, embarque enviar/cerrar, movimientos por tipo, custody) | Transversal |

**No incluido en esta lista (ya resuelto o fuera de alcance):** N2/ObligacionPendiente/reconexión I-11 (F4, cerrado); `pedidoId` ausente en `EmbarqueMovimiento` (ya registrado como brecha de modelo en F4, mismo criterio — no tocar sin evidencia de necesidad).

---

## Qué NO hace este documento

- No propone diseño técnico ni implementación — es mapa de brechas puro, igual que F1-F4.
- No decide si la Brecha #1 (GPS) se corrige como fix aislado antes de F5 formal o dentro de F5 — queda para que el equipo lo priorice, dado que es un bug de producción activo, no una brecha de alcance.
- No toca `EmbarqueMovimiento.pedidoId`, el Hub, ni rediseña nada ya congelado en ADRs.
- No asume que las 12 brechas listadas deban resolverse todas en F5 — el equipo decide alcance, igual que F4.
