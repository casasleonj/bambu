# Pedidos — Pendientes de Decisión PO (depuración final)

- Estado: entregable de depuración, por instrucción del equipo (2026-09-05)
- **Actualización 2026-09-06 (1ª ronda)**: el PO tomó dos decisiones de producto nuevas, fundamentadas en la evidencia de este mismo documento — `ventaRapida → origen` (§5.5) y G11 corrección-vs-nueva-demanda (§2). Ambas ya están implementadas y mergeadas (PR #205, PR #206). Se actualiza este documento en el lugar en vez de reabrir uno nuevo, siguiendo el mismo patrón ya usado para G6 (§5.1): la sección original se conserva como registro del estado en que se tomó la decisión, y se agrega la resolución explícitamente.
- **Actualización 2026-09-06 (2ª ronda)**: instrucción explícita del PO de resolver las decisiones restantes por inferencia razonada sobre el contexto real de Agua Bambú (ERP de reparto de agua/hielo, 6 usuarios totales, conectividad rural 2G/3G, offline-first no negociable, equipo pequeño sin capacidad de mantener dos UIs en paralelo). Se resuelven **dos de las tres**: Fase 3 (§3.5) y el descarte de los 19 IDs de OC (§1.5). La representación fiscal del diferencial (§4.5) **se decide NO resolver por inferencia** — es la única de las tres que depende de hechos verificables externos (normativa DIAN vigente, capacidad real de la API del proveedor de facturación electrónica) que esta sesión no tiene forma de confirmar; inventar una respuesta ahí sería fabricar un hecho regulatorio para un negocio real, lo cual el protocolo de este proyecto prohíbe explícitamente ("no fabricar opciones/números sin fuente"). Se documenta la razón en vez de forzar una respuesta.
- Regla aplicada: Contexto Maestro → Plan Maestro → ADR → decisiones posteriores → evidencia histórica → código actual. Ninguna decisión ya tomada se re-presenta como pendiente.
- Método de esta depuración: cada punto se contrastó contra ADRs `Aceptado`, el Plan Maestro V11.1, memoria del proyecto y el estado real del código/producción (verificado con `grep`/`tsc`/queries directas a Supabase donde aplica) — no se asume nada por inferencia.

---

## 1. OC-01…OC-24 — Recuperación documental

### 1.1 Búsqueda ejecutada (evidencia del proceso, no solo el resultado)

1. `grep` de `OC-01`…`OC-24`/`TC-OC` en todo `docs/`, `.claude/specs/`.
2. `git log --all --grep` (mensajes de commit) y `git log --all -S"OC-01"` (contenido, **todo el historial de blobs**, no solo el árbol actual) sobre las 165 ramas locales+remotas del repo.
3. Búsqueda del documento fuente citado por los ADRs ("ALS Operación Comercial", "Plan Técnico") por nombre de archivo en todo el árbol — **no existe en el repo**. Los ADRs lo citan por sección (`§5`, `§40`, `§50.3.A`) pero el archivo nunca se comiteó; solo llegaron a `docs/pedidos/` `FASE_0_PEDIDOS_OPERACION_COMERCIAL.md` e `INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md`, ninguno de los dos contiene las 24 definiciones (`FASE_0`: 0 menciones de `OC-`; `INVENTARIO`: solo la instrucción de mapear, sin el texto).

### 1.2 Resultado de la recuperación

**Evidencia parcial recuperada** en `docs/adr/ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:187-190` (sección "Tests obligatorios"), con una inconsistencia de nomenclatura ya presente en la fuente (prefijo `PED-OC-` en 3, `OC-` pelado en 2 — no es un error de esta depuración, así está en el ADR):

| ID (tal como aparece en la fuente) | Texto fuente | Fuente | Prueba equivalente actual | Cobertura | Estado |
|---|---|---|---|---|---|
| `PED-OC-01` | "Venta Libre + entrega posterior (pago completo → PENDIENTE + ANTICIPADO)" | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:187 | `cierre-venta-ruta-entrega-posterior.test.ts` (3 tests: caja por Pago capturado en el embarque, ANULADO neto $0, Pago en otro embarque no aporta), `pr2-matriz-captura-restante.test.ts` caso 3 | Cubierto por el flujo completo (creación diferida + cierre + caja), no por un test de un solo nombre | **CONVERGIDO** |
| `PED-OC-02` | "Venta Rápida + entrega posterior" | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:188 | `venta-rapida-entrega-posterior.test.ts` (3 tests) | Cubierto | **CONVERGIDO** |
| `PED-OC-03` | "Pago completo + entrega pendiente → ANTICIPADO; luego entrega → PAGADO" | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:189 | `EstadoPago.test.ts` (`EstadoPagoVO.proyectar`, 6 asserts de ANTICIPADO), `pedido-estadopago-check.test.ts` (8 tests, incluye la transición completa) | Cubierto — este es exactamente el caso que motivó G5.1/G5.5 | **CONVERGIDO** |
| `OC-05` | "venta ruta posterior" | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:190 | Mismo bloque que `PED-OC-01`/`02` | Cubierto (redundante con 01/02, probablemente el mismo escenario referenciado con otro ID en otra pasada de numeración) | **CONVERGIDO** |
| `OC-06` | "pago antes de entrega" | ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md:190 | Mismo bloque que `PED-OC-03` | Cubierto | **CONVERGIDO** |
| `OC-02, OC-03, OC-04, OC-07…OC-24` (19 IDs) | **Sin texto recuperable** | — | — | — | **PENDIENTE DE DESCARTE FORMAL** |

### 1.3 Contradicciones encontradas

Ninguna — donde hay texto recuperado, coincide con decisiones ya implementadas y probadas (ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001, ADR-PEDIDO-ESTADO-CANONICO-001). No hay caso "recuperado pero contradicho por decisión posterior" (`OBSOLETO`) ni "parcialmente recuperado" (`EVIDENCIA INCOMPLETA`) — cada ID recuperado tiene texto completo (una frase corta, pero completa y no ambigua) o no tiene nada.

### 1.4 Propuesta de descarte formal para los 19 IDs sin evidencia

**No se descartan por decisión unilateral de esta depuración** — eso violaría la regla "prohibido eliminarlo sin dejar trazabilidad". Se deja constancia:
- Los 19 IDs (`OC-02, OC-03, OC-04, OC-07` a `OC-24`) no tienen texto recuperable en ningún documento ni commit del repositorio, en ninguna rama, en ningún punto del historial.
- El documento que los definía (ALS Operación Comercial, citado por número de sección en múltiples ADRs) nunca fue comiteado — es un artefacto externo al repo (probablemente un upload de conversación que no se guardó como archivo en su momento).
- **Recomendación**: si alguien del equipo conserva el documento ALS original (fuera del repo, en el historial de la herramienta que lo generó), recuperarlo cerraría el gap sin necesidad de descarte. Si no existe copia recuperable, el descarte formal de estos 19 IDs como "contrato histórico sin evidencia" es una decisión del PO, no técnica — se eleva como tal en la matriz final (§6).

### 1.5 Resolución — 🟢 DESCARTE FORMAL (PO, 2026-09-06)

**Decisión**: los 19 IDs (`OC-02, OC-03, OC-04, OC-07` a `OC-24`) se descartan formalmente como referencias de un contrato histórico sin evidencia recuperable. No se inventa contenido para ellos, no se re-crean, no se vuelven a buscar en futuras sesiones salvo que aparezca el documento ALS original por una vía externa al repo.

**Razonamiento para el contexto de Agua Bambú**:
- El documento fuente nunca existió versionado en el repo — no hay ningún artefacto real que "recuperar", solo una numeración que quedó huérfana de su definición.
- El contrato de comportamiento que esos IDs pretendían fijar **ya está garantizado por otra vía**: los ADRs `Aceptado` (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`, `ADR-PEDIDO-ESTADO-CANONICO-001`, etc.) y sus tests de integración son la fuente de verdad operativa hoy, independientemente de si un ID `OC-XX` específico les corresponde. Los 5 IDs que sí se recuperaron (§1.2) confirman que, donde había contenido, ya estaba cubierto — no hay evidencia de que los 19 restantes describieran algo que el código NO haga hoy.
- Agua Bambú es un negocio de 6 usuarios sin auditoría externa que dependa de esa numeración específica; mantener 19 IDs "pendientes de descarte" indefinidamente en un documento de decisiones no aporta valor de negocio, solo ambigüedad de proceso.
- Si el documento ALS original aparece en el futuro (fuera del repo), reconciliar retroactivamente es trivial: se compara contra el código/ADRs ya existentes, no contra una implementación que haya que reconstruir.

**Acción**: cerrado. No queda ningún IDs de OC-01…OC-24 pendiente de descarte tras esta decisión (5 CONVERGIDOS + 19 DESCARTADOS = 24).

---

## 2. G11 — `PedidoCantidadAjuste` / pedido-hijo — 🟢 DECIDIDO (PO, 2026-09-06)

### 2.0 Resolución (PR #206, mergeado)

El PO tomó la decisión sobre la organización presentada en §2.1-2.4 (conservada abajo tal como se entregó, sin editar retroactivamente):

- **A. Corrección** (caso A de §2.2): exclusiva de `PedidoCantidadAjuste`/`AjustarPedidoCantidadUseCase`. Nunca destructiva, conserva `cantidadOriginal`. Se aplica en vivo (no solo auditoría) con 3 guards nuevos: `CORRECCION_PEDIDO_CERRADO`, `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`, `CORRECCION_GENERARIA_SOBREPAGO`.
- **B. Nueva demanda** (caso B de §2.2): SIEMPRE un `Pedido` nuevo e independiente (número, items, pagos, factura propios) — nunca `PedidoCantidadAjuste`. Se enlaza al pedido que originó la demanda vía `Pedido.pedidoOrigenId` (FK simple, self-referencial, `onDelete: Restrict`) exclusivamente para trazabilidad — no comparte ciclo de vida ni estado con el original. Esto corresponde a la alternativa 2 de §2.4, acotada: no crea un mecanismo de "pedido-hijo", crea una relación pedido↔pedido explícita y auditable.
- **C. Cantidad ya entregada** = histórico, nunca se toca retroactivamente (guard `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`).
- **D. Pedido cerrado** (`ENTREGADO`/`CANCELADO`/`ANULADO`) no se reabre silenciosamente vía corrección (guard `CORRECCION_PEDIDO_CERRADO`).
- **E. Pedido-hijo NO se reintroduce.** `crearPedidoHijo()` (`Pedido.ts:337`) permanece sin callers, sin redefinir, sin usar.

De los 9 "casos mixtos" de §2.2/C, quedan resueltos por la decisión: aumento/disminución de cantidad sobre lo pendiente (→ A si es corrección, → B si es demanda nueva), corrección post-entrega-parcial (→ siempre B, por el guard C), pedido pagado/parcialmente pagado (→ A recalcula `total`/`saldo`/`estadoPago` y rechaza si generaría sobrepago; B es una obligación nueva con su propio ciclo de pago), pedido facturado (→ A sincroniza la `Factura` existente; B crea su propia `Factura`), pedido en ejecución/cerrado (→ ver D).

**Implementación**: PR #206 (`feat/pedidos-g11-correccion-nueva-demanda`). Ver commit para el detalle completo de guards, migración (`prisma/migrations/20260906_add_pedido_origen_id`) y pruebas (`ajuste-pedido.test.ts` +4 tests, `pedido-nueva-demanda-relacionado.test.ts` nuevo, 3 tests).

### 2.1 El problema en sus propios términos (histórico, conservado tal como se entregó — no se re-presenta como pendiente)

Hoy, cuando la cantidad de un pedido cambia después de creado, el código tiene **dos mecanismos que ya existen y funcionan, pero nunca se decidió formalmente cuál aplica a cuál caso**:
- `PedidoCantidadAjuste` (tabla, usada hoy por N2 para registrar diferenciales de precio — `delta: 0` siempre en esos casos, el campo `delta` para cambio de CANTIDAD real está definido en el schema pero sin un caso de uso de dominio que lo escriba con valor != 0 fuera del ajuste manual de `ajuste-pedido.test.ts`/`FASE FINAL — ajuste de pedido §6`).
- pedido-hijo (mecanismo retirado por PR-1 del flujo de entrega parcial ordinario — hoy sin callers de producción, `crearPedidoHijo` existe en `Pedido.ts:337` pero nadie lo invoca).

### 2.2 Casos A/B/C — organizados, sin recomendación de implementación

**A. Corrección** — la cantidad cambia porque el dato original estaba mal (error de captura, no una decisión comercial nueva).
- ¿Se corrige el mismo pedido in place, o se registra como evento append-only (`PedidoCantidadAjuste` con `delta != 0`) preservando el valor original?
- Si preserva el original: ¿cómo se refleja en cartera/factura ya emitida?

**B. Nueva demanda** — el cliente pide unidades adicionales sobre un pedido que ya existe.
- ¿Es un ajuste del MISMO pedido (mismo número, cantidad total sube) o un pedido nuevo relacionado?
- Si es el mismo pedido: ¿qué pasa si ya tiene factura emitida por la cantidad original?

**C. Casos mixtos** (listados por el equipo, sin resolver ninguno):
- aumento de cantidad;
- disminución de cantidad;
- corrección posterior a entrega parcial (¿la corrección aplica sobre lo ya entregado, sobre lo pendiente, o sobre ambos?);
- nueva cantidad solicitada después de que ya hubo una entrega;
- pedido ya pagado (¿el ajuste de cantidad genera un diferencial de precio como el de N2, o es un concepto distinto?);
- pedido parcialmente pagado;
- pedido facturado (¿se re-emite factura, nota de ajuste, o queda descuadrada la relación pedido↔factura?);
- pedido en ejecución (asignado a un embarque en curso);
- pedido cerrado (¿se reabre, o el ajuste queda huérfano?).

### 2.3 D — Pedido-hijo: preguntas sin responder

- ¿Debe existir como mecanismo en absoluto, dado que PR-1 ya lo retiró del camino ordinario de entrega parcial y hoy cubre ese caso con acumulación implícita en el propio `Pedido`/`PedidoItem`?
- Si debe existir para ALGÚN caso: ¿cuál, específicamente, de los 9 casos mixtos de arriba?
- ¿Qué representa exactamente — una obligación nueva, o la misma obligación fragmentada?
- ¿Qué relación tiene con el pedido original (FK simple, o algo que la cartera/reportes deban tratar como "el mismo cliente debe esto en dos lados")?
- ¿Cómo afecta la cantidad pendiente que el planificador/N2 (`ObligacionPendiente`) ya calculan?
- ¿Cómo afecta cartera (¿es deuda nueva o la misma deuda repartida?) y facturación (¿factura nueva o nota sobre la existente?)?
- ¿Cómo se audita — un `PedidoCantidadAjuste` que apunta al pedido-hijo, o el pedido-hijo referencia al padre y punto?

### 2.4 Alternativas (presentadas, no recomendadas)

1. **Todo vía `PedidoCantidadAjuste.delta`** — un solo mecanismo, extender el que ya existe para diferenciales de precio a también cubrir diferenciales de cantidad. Ventaja: reusa infraestructura ya probada (offlineId, auditoría). Riesgo: mezclar "corrección de un hecho" con "nueva demanda" en la misma tabla puede volver ambigua la semántica de un reporte que sume `delta` (¿está sumando ventas nuevas o correcciones de error?).
2. **Pedido-hijo solo para "nueva demanda" post-cierre** — la corrección (caso A) nunca crea hijo, siempre es `PedidoCantidadAjuste`; la nueva demanda (caso B) si el pedido original ya se cerró/facturó, sí crea un pedido nuevo relacionado (no huérfano — con referencia al original). Ventaja: separa conceptualmente "arreglar un error" de "vender más". Riesgo: define un mecanismo nuevo (relación pedido↔pedido) que hoy no existe formalmente.
3. **Ninguno de los dos — todo cambio de cantidad post-creación es un pedido nuevo independiente**, sin relación formal, y el vínculo comercial (mismo cliente, mismo día) se resuelve por reporte, no por dato relacional. Ventaja: cero mecanismo nuevo. Riesgo: pierde trazabilidad de "esto era una corrección de aquello".

**No se recomienda ninguna de las tres** — es exactamente la decisión que el equipo pidió no tomar por inferencia técnica.

**Resolución (2026-09-06, ver §2.0)**: el PO eligió la alternativa 2, acotada — pedido-hijo como tal (compartiendo ciclo de vida/estado con el original) no se crea nunca; en su lugar, la nueva demanda es un `Pedido` genuinamente independiente con una FK de trazabilidad (`pedidoOrigenId`) hacia el original.

---

## 3. Fase 3 — UI/UX de Pedidos (matriz A vs B, no decisión)

### 3.1 Contexto de evidencia

Ya existe un precedente real en este mismo repo: el rework de Embarques (`docs/embarques/00-plan-frontend-completo.md`, flag `NEXT_PUBLIC_EMBARQUES_V2`, ejecutado en fases: Command Center → Preparation Flow → Mission Detail → Reconciliation). Y ya existe un precedente incremental en Pedidos: PR #171 (toggle "Entregar ahora / Entregar después" sobre `pedido-form-unified` existente, gated por flag, sin tocar el resto de la UI).

### 3.2 Matriz A vs B

| Dimensión | A — Nueva experiencia detrás de flag | B — Evolución incremental |
|---|---|---|
| Arquitectura de información | Se puede rediseñar completa alrededor del modelo N2 (Obligación/Actividad, modo, diferencial) desde cero | Hereda la estructura actual de `pedidos-client/` (lista + modal), cualquier concepto nuevo se inserta como sección adicional |
| Modelo mental del usuario | Riesgo de reentrenar a 6 usuarios en una interfaz nueva de golpe | Cambios incrementales, cada uno pequeño y ya validado en producción (como #171) |
| Creación de pedido | Rediseño posible del formulario completo | `pedido-form-unified` ya existe y ya absorbió N2-adyacente (`entregado:false`) sin romperse |
| Consulta / edición / seguimiento | Se puede repensar la tabla/detalle desde cero (p.ej. exponer `ObligacionPendiente`/`Actividad` como un panel nativo) | Requiere insertar el panel de gestión de pendiente (una vez se exponga endpoint/UI de N2) dentro de la tabla/detalle existente sin reestructurarlos |
| Entrega / pago / pendiente | Naturalmente unificable en una sola vista de "estado de cumplimiento" | Sigue siendo 3 badges/secciones separadas (estadoEntrega, estadoPago, pendiente-si-aplica) como hoy |
| Cancelación/anulación | Puede unificarse con el flujo de reversión de cartera (`/cartera`) en una sola experiencia | Sigue siendo 2 pantallas separadas (`/pedidos` para anular, `/cartera` para corrección de abono) |
| Recurrentes / venta rápida / venta libre | Se pueden fusionar conceptualmente si el nuevo modelo lo permite | Siguen siendo 3 flujos de entrada distintos, como hoy (ya funcionan, ya tienen sus propios ADRs) |
| Estados / errores | Diseño de badges desde cero, oportunidad de resolver la ambigüedad de "4 estados" (`ANTICIPADO`/`REPORTADO`/`DISCREPANTE`/`FIADO`) que hoy se resuelve en `visual-states.ts` con reglas de precedencia | Mantiene `visual-states.ts` como está, cualquier estado nuevo se agrega a la misma cascada de reglas (ya lo hizo #169 sin romper nada) |
| Offline | Debe reconstruirse contra `fetchResilient`/Dexie desde cero — riesgo real dado que offline-first es el requisito no negociable del proyecto (rural 2G/3G) | Ya funciona, cero riesgo adicional |
| Permisos / trazabilidad | Se rediseñan junto con la UI | Ya funcionan (`requireRole`, `logAudit`), sin tocar |
| Responsive / accesibilidad | Oportunidad de aplicar el patrón `data-testid` desktop/mobile (AGENTS.md #24) desde el diseño, no como parche | Ya se aplica parche por parche donde se detecta duplicación (como ya se hizo en `pedidos-client`) |
| Migración / coexistencia | Requiere mantener DOS UIs de Pedidos simultáneas mientras dura el rollout (como Embarques V2) — con 6 usuarios totales, el costo de soporte de dos UIs es proporcionalmente alto | No hay coexistencia que gestionar — cada cambio reemplaza directamente su pieza |
| Deuda temporal | Alta mientras el flag esté activo (dos code paths reales) | Ninguna — el código viejo simplemente deja de existir en cada PR |
| Complejidad de implementación | Alta — nuevo árbol de componentes completo | Baja por PR, pero el TOTAL acumulado de N incrementales puede superar el costo de un rediseño si N es grande |
| Reversibilidad | Alta durante el rollout (flag OFF = vuelve todo atrás) | Cada PR revierte individualmente con `git revert`, pero no hay "vuelta atrás total" a un estado anterior coherente una vez pasan varios PRs |
| Impacto técnico | Mayor — nuevo bundle, nuevas rutas, riesgo de duplicar lógica de negocio en frontend (prohibido por guardrail) | Menor — reusa componentes/hooks ya probados (`usePedidos`, `pedido-form-unified`) |

### 3.3 Punto explícitamente pedido por el equipo: ¿la reconceptualización de dominio hace que lo incremental produzca una UI híbrida/incoherente?

**Evidencia a favor de "sí, hay riesgo real de incoherencia"**: N2 introduce un concepto (`Actividad.modo` actual vs `Pedido.canal` histórico, diferencial, gestión de pendiente bajo demanda) que **no tiene ningún lugar hoy en la UI** — no hay endpoint ni componente para `GestionarPendienteUseCase`/`CambiarModoActividadUseCase`/`LiberarActividadUseCase` (deliberadamente, por diseño — ver `cumplimiento-parcial-obligacion-actividad`). El día que se exponga, insertarlo incrementalmente en la tabla/detalle actual de Pedidos significa agregar un cuarto concepto de estado (además de `estadoEntrega`/`estadoPago`/badges de confirmación) a una UI que ya muestra 3 y que además tiene una cascada de precedencia manual (`visual-states.ts`) para resolverlos cuando coinciden. Cada concepto nuevo incremental hace esa cascada más difícil de razonar.

**Evidencia en contra (a favor de que lo incremental SÍ alcanza)**: el precedente #171 (toggle entrega ahora/después) es exactamente un concepto nuevo de N2-adyacente insertado incrementalmente, y no produjo incoherencia — quedó como una opción binaria clara en el formulario existente, sin tocar el resto. Y el precedente #169 (chip REPORTADO/DISCREPANTE) agregó un 4º estado a la cascada de `visual-states.ts` sin romperla.

**Conclusión de esta evaluación (no una recomendación de A o B, una constatación de riesgo)**: el riesgo de incoherencia es real pero **específicamente concentrado en el momento en que se exponga la gestión de pendiente de N2 a la UI** (todavía no ha pasado). Para todo lo demás que ya se implementó, lo incremental demostró funcionar sin incoherencia (2 precedentes reales, no hipotéticos). La decisión A/B podría incluso NO ser binaria para todo Pedidos — podría ser "B para todo lo actual, revaluar A solo para el momento específico de exponer N2 a UI". Eso es una opción que la matriz de arriba no fuerza a descartar, y se señala explícitamente para que el PO la considere.

### 3.4 Recomendación de esta evaluación

Ninguna sobre A vs B en general — es la decisión que corresponde al PO. Sí se recomienda, como insumo para esa decisión: **cuando llegue el momento de exponer N2 a la UI, tratarlo como su propia mini-decisión A/B independiente** (dado el hallazgo del punto 3.3), en vez de asumir que la respuesta general a "Fase 3" aplica automáticamente a esa pieza específica.

### 3.5 Resolución — 🟢 B, evolución incremental (PO, 2026-09-06)

**Decisión**: Pedidos sigue el camino **B — evolución incremental** sobre `pedidos-client/` existente. No se abre un `NEXT_PUBLIC_PEDIDOS_V2` ni un rediseño completo detrás de flag.

**Razonamiento para el contexto de Agua Bambú** (aplicando la matriz de §3.2 a las dimensiones que de verdad importan para este negocio, no a las que importarían para un equipo más grande):
- **Offline-first es un requisito no negociable** (conectividad rural 2G/3G, ver AGENTS.md) y hoy YA funciona sobre la base incremental. La opción A obliga a reconstruir esa capa desde cero antes de poder confiar en la UI nueva — es el riesgo más caro de la matriz y el único con potencial de romper algo que hoy es sólido.
- **6 usuarios totales** hacen que el costo de mantener DOS UIs en paralelo durante un rollout (como exigió el precedente de Embarques V2) sea desproporcionado: no hay masa de usuarios que justifique amortizar esa complejidad, y el soporte de una migración a medio camino recae sobre el mismo equipo pequeño que opera el negocio.
- **Ya hay evidencia real, no hipotética, de que lo incremental funciona en este dominio**: PR #171 (toggle entrega ahora/después) y PR #169 (chip REPORTADO/DISCREPANTE) insertaron conceptos nuevos de N2-adyacente sin producir incoherencia, en producción, con usuarios reales.
- El único riesgo real identificado (§3.3) — que insertar la gestión de pendiente de N2 incrementalmente agregue un 4º concepto de estado a una cascada ya manual (`visual-states.ts`) — **no se resuelve descartándolo, se acota**: ver la excepción abajo.

**Excepción explícita (no se resuelve hoy, no se decide por inferencia todavía)**: cuando se exponga `GestionarPendienteUseCase`/`CambiarModoActividadUseCase`/`LiberarActividadUseCase` (N2) a la UI por primera vez, esa pieza específica se evalúa como su propia mini-decisión A/B (tal como recomendaba §3.4) **en el momento en que exista una necesidad concreta de exponerla** — no ahora, porque hoy no hay ningún trabajo de UI de N2 en curso ni solicitado, y decidir el formato de una UI que todavía no se ha empezado a diseñar sería inventar alcance, no resolver una decisión pendiente real.

**Acción**: ninguna implementación nueva se dispara por esta decisión — es una confirmación de que el patrón ya en uso (cambios incrementales sobre `pedido-form-unified`/`pedidos-client`, gated por flag cuando el cambio es sensible) sigue siendo la forma correcta de evolucionar Pedidos. Futuros PRs de UI de Pedidos no necesitan volver a plantear "A vs B" — ya está decidido.

---

## 4. Diferencial — bloqueo fiscal

### 4.1 Ya decidido conceptualmente (no se reabre)

```
diferencial = valor_nuevo_de_cumplimiento − valor_económico_histórico_de_las_unidades_pendientes
```

- No es una venta nueva (mismo `Pedido.numero`, misma factura).
- No reescribe destructivamente el pedido histórico (`PedidoItem.precio` original queda intacto — el diferencial es un registro adicional en `PedidoCantidadAjuste`, no una edición del precio histórico).
- No cobra de nuevo el valor original (positivo solo suma la DIFERENCIA a `Pedido.total`/`Factura.total`; negativo va a `Cliente.saldoFavor`, nunca resta de lo ya facturado).

Esto está implementado y probado (N2, PRs #195/#197/#198/#199) — **no es una decisión de producto pendiente, es una decisión ya tomada y ejecutada**.

### 4.2 Todavía bloqueado — mecanismo fiscal definitivo

El mecanismo actual (`Pedido.total += diferencial`, misma factura, cobrable por cartera existente) es una **implementación comercial/contable interna**, deliberadamente separada de su representación fiscal. Sin resolver:

1. ¿Corresponde nota débito por el mayor valor?
2. ¿Corresponde una factura nueva (por el diferencial únicamente)?
3. ¿Cómo debe documentarse el mayor valor ante la DIAN?
4. ¿Qué ocurre si la factura original ya fue emitida (siempre es el caso — el diferencial por definición ocurre después)?
5. ¿Qué ocurre si la factura original ya fue aceptada por el cliente/DIAN?
6. Tratamiento en cartera: ¿la cartera del cliente debe reflejar el diferencial como una línea fiscal separada, o basta con que `Pedido.saldo` suba (como hoy)?
7. Tratamiento de IVA/impuestos sobre el diferencial, si aplica.
8. Integración con el proveedor de facturación electrónica (¿puede emitir notas débito sobre una factura ya transmitida? ¿con qué API?).
9. Tratamiento contable (¿el diferencial se contabiliza como mayor valor de la venta original, o como un ingreso nuevo del período en que se detecta?).

### 4.3 Consulta externa exacta requerida

No es "consultar en general" — son 3 preguntas concretas a 3 partes concretas:

| A quién | Qué preguntar exactamente |
|---|---|
| Contador/asesor tributario de Agua Bambú | ¿Subir el total de una factura ya emitida (por un diferencial de cumplimiento posterior, sin cambiar la cantidad ni el precio unitario original) requiere nota débito bajo la normativa colombiana vigente, o puede tratarse como un ajuste interno sin efecto fiscal separado mientras no cambie la base gravable declarada? |
| Proveedor de facturación electrónica | Si la respuesta anterior es "sí requiere nota débito": ¿su API soporta emitir una nota débito sobre una factura ya transmitida y aceptada por la DIAN? ¿Qué payload/flujo específico? |
| Normativa/doctrina DIAN vigente | Confirmación documental (no interpretación) de la regla aplicable a "mayor valor de una venta ya facturada, cuando el mayor valor surge de un cambio posterior en la modalidad de cumplimiento (de recogida en punto a domicilio), no de un cambio en cantidad o precio unitario original". |

**Evidencia obtenida hasta ahora**: ninguna — esta consulta no se ha hecho todavía (fuera del alcance de cualquier PR de código; es una gestión externa del equipo/PO, no de este trabajo de desarrollo).

### 4.4 Regla que sigue vigente

`Pedido.total += diferencial` NO se convierte en la solución fiscal por defecto. Es la implementación comercial interna; la representación fiscal (nota débito / factura nueva / ninguna) se decide con la consulta de arriba y se implementa como una capa **adicional**, no como reemplazo del mecanismo actual.

### 4.5 Por qué esta decisión NO se resuelve por inferencia (2026-09-06)

A diferencia de Fase 3 (§3.5) y del descarte de OC (§1.5) — que son juicios de arquitectura/producto sobre un sistema y un equipo que esta sesión conoce en detalle —, esta pregunta depende de **hechos externos verificables que esta sesión no puede confirmar ni inferir de forma responsable**:

1. Si la normativa colombiana (DIAN) vigente exige nota débito para este caso específico es una cuestión de derecho tributario real, no de diseño de software. Una respuesta incorrecta aquí no es un bug — es una exposición fiscal real para un negocio real.
2. Si el proveedor de facturación electrónica de Agua Bambú soporta emitir una nota débito sobre una factura ya transmitida, y con qué API, es un hecho sobre un contrato/producto externo concreto que no está documentado en este repositorio ni es inferible desde el código.

Inventar una respuesta a cualquiera de las dos violaría la regla de este mismo proyecto de no fabricar hechos sin fuente (AGENTS.md, "Anti-patterns Prohibidos": no dar datos sin fuente, no asumir sin verificar). La decisión responsable para el contexto de Agua Bambú **no es adivinar la respuesta fiscal, es mantener el sistema en el estado seguro que ya tiene** mientras se consigue la respuesta real:

- El mecanismo comercial interno (`Pedido.total += diferencial`, §4.1) sigue siendo la única implementación — **no se construye especulativamente ninguna capa de nota débito/factura nueva** sin la confirmación de la consulta de §4.3. Construirla ahora, sin saber si la respuesta es "nota débito", "factura nueva" o "ninguna", garantizaría tener que deshacerla o reescribirla después.
- Esta consulta (§4.3) sigue siendo una gestión externa del equipo/PO con su contador y su proveedor de FE — no una tarea de este trabajo de desarrollo. Se mantiene en la matriz (§6) como bloqueo externo real, no como decisión pendiente de inferencia técnica.

**Acción**: ninguna. Se documenta explícitamente la razón de no decidir, en vez de dejarlo como un ítem sin explicación o de forzar una respuesta no verificable.

---

## 5. G6 — decisión YA APROBADA, no se eleva al PO

### 5.1 Corrección de clasificación

`ADR-PEDIDO-ORIGEN-CANAL-001` — **Estado: Aceptado, aprobado por el PO el 2026-09-01**. Fuente: ALS Operación Comercial §5/§50.3.A/§50.3.D, Plan Técnico §22, INVENTARIO §G6. Esto no es una decisión pendiente ni una decisión descartada — es una decisión vigente con un plan de ejecución ya definido por el propio ADR. Se corrige la clasificación previa de esta depuración ("cosmético, deprioritizado") — esa caracterización mezclaba dos cosas distintas: la decisión (ya tomada) y la secuencia de ejecución de su último paso (ya definida por el propio ADR, no indefinidamente pospuesta).

### 5.2 Lo ya decidido (verbatim del ADR, no reinterpretado)

- `Pedido.canal` es el concepto canónico.
- `Pedido.tipo` es 100% derivado de `canal` (`PedidoMapper.ts:152`: `tipo = canal === 'PUNTO' ? 'PUNTO' : 'ENVIO'`) y debe eliminarse.
- `PlantillaRecurrente.tipo` recibe el mismo tratamiento.
- `ventaRapida` como alias legacy en `PedidoCreateSchema` sale del contrato.
- La UI usa `canal`, no `tipo` (ya hecho en G6.1, PR #149).
- `canal` se queda como `String` con `CanalVO` — **el ADR mismo elige esta alternativa como la de menor riesgo, no es una decisión nueva a tomar** ("se toma la alternativa de menor riesgo... convertir a enum ahora aporta poco").

### 5.3 BRECHA PLAN ↔ CÓDIGO (verificado contra el código real, 2026-09-05)

El propio ADR secuencia el drop de columnas **deliberadamente junto con** la fase D de `ADR-PEDIDO-ESTADO-CANONICO-001` (drop de `Pedido.estado`), "para no tener dos migraciones de columna de Pedido en vuelo a la vez" — esto es una decisión técnica de secuenciación ya tomada por el ADR, no una decisión pendiente. Verificado contra el código actual:

**Ya hecho (G6.1):**
- Lectores de `pedidos-client`, `/api/pedidos`, `ListarPedidosUseCase`, `PrismaPedidoRepository` migrados a `canal`. ✅

**Ya hecho (2026-09-06, PR #201):**
- Escritores de `Pedido.tipo` (11 sitios) eliminados: `PedidoMapper.ts`, `PedidoDTOMapper.ts`, `venta-libre/route.ts`, `crear-ventas-libres.service.ts`, `src/lib/recurrentes.ts`, `validators.ts`, `openapi.json/route.ts` ya no derivan ni escriben `tipo`. Lectores residuales (`alertas-table.tsx`/`pedido-table.tsx` vía `p.estado`, `api/clientes/[id]/route.ts`) simplificados a `estadoEntrega` únicamente. Dual control de "Origen del pedido" (`tipo`) removido de la UI de recurrentes (`nuevo-client`/`editar-client`) — quedó solo "Entrega" (`canal`), cerrando además un bug real de doble captura redundante encontrado durante la implementación.

**Brecha real — todavía sin hacer:**
- **`Pedido.tipo`/`PlantillaRecurrente.tipo` (columnas)**: siguen en el schema, sin drop.
- **Dependencia declarada por el ADR**: el drop de columna real está bloqueado en el mismo lugar que `ADR-PEDIDO-ESTADO-CANONICO-001` fase D (`DROP COLUMN Pedido.estado`) — reevaluado y **desprioritizado en PR #153** por acoplamiento real de ~20 archivos (rutas de API, tipos de payload de embarques, scripts de `prisma/`, tests de integración), no por falta de decisión.

**`ventaRapida`**: no era parte de esta brecha de G6 — era un mecanismo activo sin relación con `Pedido.tipo` (confundido inicialmente con un alias legacy). Resuelto por separado, ver §5.5.

### 5.4 Acción

Conforme a la instrucción del equipo ("continuar la implementación conforme al ADR", no re-elevar al PO): esta brecha se resuelve como un PR de schema dedicado (expand-contract, `ADR-MIGRACION-001`), ejecutando **juntos** el drop de `Pedido.estado` + `Pedido.tipo` + `PlantillaRecurrente.tipo` + limpieza de `ventaRapida`, tal como el propio ADR lo secuenció. No se ejecuta dentro de este documento de depuración (es código, no decisión) — **queda como el siguiente PR concreto a abrir**, con su propia verificación (tsc + suite completa + `npx prisma validate` + auditoría de los ~20 archivos acoplados antes de tocar el primero).

---

## 5.5. `ventaRapida` → `origen` — 🟢 DECIDIDO (PO, 2026-09-06)

### 5.5.1 El problema

`ventaRapida: canal === 'PUNTO'` (`pedido-form-unified/index.tsx`, previo a la resolución) mezclaba dos ejes ortogonales: `canal` (PUNTO|DOMICILIO, forma de entrega) y el origen comercial de la venta (con/sin cliente real). El propio `ADR-PEDIDO-ORIGEN-CANAL-001` exige que `origen: 'VENTA_RAPIDA' + canal: 'DOMICILIO'` sea una combinación válida y creable — con la lógica vieja, esa combinación era **inalcanzable** desde el formulario principal (toda venta por domicilio se clasificaba como `origen: 'PEDIDO'` sin importar si tenía cliente real o no). Esto no era deuda técnica cosmética: era una contradicción directa entre el ADR ya aprobado y el código en producción.

### 5.5.2 Decisión

`origen` se deriva de si hay un cliente real, nunca de `canal`:
- Cliente real seleccionado (o cliente nuevo capturado en el formulario) → `origen: 'PEDIDO'`.
- Sin cliente real, usando el cliente canónico `CONSUMIDOR_FINAL` → `origen: 'VENTA_RAPIDA'`.
- `canal` (PUNTO|DOMICILIO) se envía y se decide de forma completamente independiente — las 4 combinaciones `origen × canal` son válidas y creables, incluyendo `VENTA_RAPIDA + DOMICILIO` (la que antes era inalcanzable).
- `ventaRapida: boolean` sale del contrato (`PedidoCreateSchema`, `CrearPedidoInput`, payloads de formulario/hook) — reemplazado por `origen: 'PEDIDO' | 'VENTA_RAPIDA'` explícito.

### 5.5.3 Implementación

PR #205 (`feat/pedidos-ventarapida-origen`, mergeado en `main` `85c37f6f`): `pedido-form-unified`, `use-crear-pedido`, `pedidos-client`, `CrearPedidoUseCase`, `validators.ts` (`PedidoCreateSchema`, `VentaLibreSchema`), `venta-rapida-form` (componente huérfano, actualizado por consistencia), `openapi.json`. Test nuevo `pedido-origen-canal-independientes.test.ts` (5 tests, Postgres real): las 4 combinaciones origen×canal explícitas + default cuando se omite `origen`.

### 5.5.4 Revisión de reportes/queries que asumían `canal === 'PUNTO'` ⇒ venta rápida

Verificado (grep + lectura) que ningún reporte/query de `src/app/api/reportes/**` ni `src/lib/embarque-stats.ts` deriva "venta rápida" a partir de `canal` — todos los que distinguen origen comercial ya leían `Pedido.origen` directamente (introducido junto con `OrigenPedidoVO`, antes de esta corrección). No se encontraron consumidores adicionales a corregir fuera de los listados en §5.5.3.

---

## 6. Matriz final de decisiones

| Punto | Estado | Autoridad | Acción |
|---|---|---|---|
| G6 — `canal` canónico, `tipo` eliminado | 🟢 **DECIDIDO** (ADR Aceptado 2026-09-01) | ADR vigente | Escritores/lectores de `tipo` ya migrados (PR #201, 2026-09-06) — pendiente solo el `DROP COLUMN` (§5.4), junto con `Pedido.estado` fase D |
| G6.1 (lectores → canal) | ✅ Implementado | — | Ninguna |
| Enum `CanalPedido` vs `String`+VO | 🟢 **DECIDIDO** (el ADR elige `String`+VO) | ADR vigente | Ninguna — no reabrir |
| `ventaRapida` → `origen` | 🟢 **DECIDIDO E IMPLEMENTADO** (PO 2026-09-06, PR #205) | — | Ninguna — ver §5.5 |
| G11 — semántica de `PedidoCantidadAjuste`/pedido-hijo | 🟢 **DECIDIDO E IMPLEMENTADO** (PO 2026-09-06, PR #206) | — | Ninguna — ver §2.0 |
| Fase 3 — UX/UI de Pedidos (A vs B) | 🟢 **DECIDIDO** (PO 2026-09-06, por inferencia sobre el contexto de Agua Bambú) | — | Ninguna — B (incremental) confirmado, ver §3.5. Excepción: exponer N2 a UI es su propia mini-decisión, cuando llegue ese trabajo (§3.5) |
| Diferencial — mecanismo comercial | 🟢 **DECIDIDO E IMPLEMENTADO** (N2, #195-199) | ADR/Plan Maestro | Ninguna |
| Diferencial — representación fiscal | 🔴 **BLOQUEO EXTERNO (deliberadamente NO resuelto por inferencia)** | Contador + FE + DIAN | Consulta exacta en §4.3. Ver §4.5: es la única de las 3 decisiones restantes que depende de hechos externos no verificables por esta sesión — no implementar mecanismo fiscal hasta respuesta real |
| OC-01…OC-24 recuperados (5: `PED-OC-01/02/03`, `OC-05/06`) | 🟢 **CONVERGIDO** | — | Ninguna — ya cubiertos |
| OC-01…OC-24 restantes (19 IDs) | 🟢 **DESCARTADOS FORMALMENTE** (PO 2026-09-06) | — | Ninguna — ver §1.5. Reconciliar retroactivamente solo si aparece el ALS original fuera del repo |
| Migraciones/CHECK de producción faltantes (hallazgo operativo de esta sesión, fuera del alcance original de este documento) | ✅ **Resuelto 2026-09-05** | — | 9 CHECK + 1 secuencia + 2 migraciones de N2/G5.5 aplicadas y verificadas en Supabase producción |

---

## 7. Revisión adversarial (regla de calidad, sección 10 de la instrucción)

Verificado explícitamente, uno por uno, contra el contenido de este documento:

- **¿Decisiones ya aprobadas presentadas como pendientes?** No — G6 se corrigió explícitamente a DECIDIDO (§5), la asignación pago↔cumplimiento y la fórmula del diferencial se mantienen como YA decididas (§4.1), no se re-preguntan.
- **¿Propuestas presentadas como decisiones?** No — §2.4 (alternativas de G11) y §3.2/3.4 (matriz Fase 3) están explícitamente marcadas "no se recomienda"/"ninguna recomendación sobre A vs B en general".
- **¿Hipótesis presentadas como hechos?** No — la inconsistencia de nomenclatura `PED-OC-` vs `OC-` en la fuente (§1.2) se señala como tal, no se resuelve inventando una unificación. El origen de `OC-05`/`OC-06` como "posiblemente el mismo escenario con otra numeración" se marca explícitamente como hipótesis no confirmada.
- **¿Escenarios inventados?** No — los 19 IDs sin evidencia (§1.4) se dejan sin contenido, no se les asigna un texto supuesto.
- **¿Contradicciones entre ADR y código?** Sí, encontrada y documentada: G6 tiene una brecha real de ~14 sitios de código (§5.3) que el ADR ya resolvió conceptualmente pero el código no ejecutó — señalada explícitamente como BRECHA, no como nueva decisión.
- **¿Contradicciones entre documentos?** Sí — `.claude/specs/pedidos.md:267` cita "ALS §40" como fuente de la matriz OC, mientras que `INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md:423` la referencia sin citar sección. Ambas apuntan al mismo documento no recuperable — no es una contradicción de contenido, es la misma laguna documentada dos veces.
- **¿Duplicación de fuentes de verdad?** No introducida por este documento — se señala la duplicación YA existente (`Pedido.tipo` como derivado de `canal`) como parte de la brecha a cerrar, no se crea una nueva.
- **¿Semántica ambigua de cantidades?** Es precisamente el contenido de G11 (§2) — señalada, no resuelta por inferencia.
- **¿Doble cobro / doble contabilización?** Revisado explícitamente en §4.1 — el diferencial nunca cobra de nuevo el valor original, verificado contra la implementación real (no solo el diseño).
- **¿Efectos fiscales no demostrados?** Señalados explícitamente como bloqueados en §4.2-4.3, con la consulta exacta pendiente, no se asume ningún tratamiento fiscal por defecto.
- **¿Estados imposibles?** Fuera del alcance directo de este documento, pero relacionado: el hallazgo operativo de producción (§6, última fila) encontró y cerró 9 CHECK constraints financieros faltantes en producción — un estado imposible real (`totalPagado > total`, etc.) que la app únicamente evitaba por disciplina de código, sin red de seguridad de DB, desde el 2026-06-23 hasta el 2026-09-05 de esta depuración.
- **¿Pérdida de trazabilidad?** No — cada clasificación en la matriz de OC (§1.2) referencia archivo:línea exacto, tanto de la fuente como de la prueba equivalente.
- **¿Errores de fechas/offline?** Fuera del alcance de este documento (no se tocó código de fechas/offline en esta depuración).
- **¿Dependencias ocultas entre Pedido, Pago, Entrega, Cartera y Facturación?** La única detectada durante esta depuración (hallazgo operativo, no parte del encargo original): el `estadoPago` de `Pedido` no se recalculaba en 3 sitios reales de producción al cambiar `Pedido.total`/`estadoEntrega` desde otro flujo (cierre de embarque, diferencial N2, importación histórica) — ya corregido y verificado (PR #199 + migraciones de producción aplicadas).

**Ambigüedad evitable remanente (al cierre de la 1ª ronda, 2026-09-06)**: cero. Toda incertidumbre que quedaba en ese momento (Fase 3 A/B, fiscalidad, los 19 IDs de OC) estaba explícitamente identificada, clasificada, y asignada a su autoridad (PO o externo) en la matriz de §6. Ver §7.2 para el cierre de Fase 3 y OC en la 2ª ronda.

### 7.1 Revisión adversarial de la actualización 2026-09-06

- **¿Se re-presentan G11 o `ventaRapida` como pendientes en algún lugar del documento?** No — ambos quedaron 🟢 en la matriz (§6), con la sección original conservada como registro histórico (§2.1-2.4) y la resolución explícita antepuesta (§2.0, §5.5), siguiendo el mismo patrón ya usado para G6.
- **¿Se resolvió alguna de las 4 decisiones restantes (Fase 3, OC-01-24, fiscal) por inferencia técnica, contradiciendo la instrucción de mantenerlas abiertas?** No — ninguna de las tres tiene cambios en esta actualización; siguen exactamente como en la versión anterior de este documento.
- **¿La implementación de G11/`ventaRapida` contradice algo que el propio documento ya había señalado?** No — G11 implementa la alternativa 2 de §2.4 tal como estaba descrita (acotada a "sin pedido-hijo"); `ventaRapida`→`origen` resuelve exactamente la contradicción con `ADR-PEDIDO-ORIGEN-CANAL-001` señalada en el propio ADR (combinación `VENTA_RAPIDA`+`DOMICILIO` antes inalcanzable).
- **¿Queda algo de la implementación sin verificar?** No — ambos PRs (#205, #206) verificados con `tsc --noEmit` limpio, suite unitaria completa (2820 tests) y suite de integración completa (229 tests) en verde, antes de mergear.

### 7.2 Revisión adversarial de la actualización 2026-09-06 (2ª ronda — decisiones por inferencia)

- **¿Se inventó un hecho externo no verificable?** No — es exactamente lo que esta ronda se negó a hacer con la representación fiscal (§4.5). Se explica por qué, en vez de fabricar una respuesta sobre normativa DIAN o la API de un proveedor externo que esta sesión no puede confirmar.
- **¿Se confundió "decisión de arquitectura/producto que la sesión puede juzgar con evidencia" con "hecho externo que requiere una fuente que la sesión no tiene"?** Es la distinción central de esta ronda: Fase 3 (§3.5) y el descarte de OC (§1.5) se decidieron porque toda la evidencia relevante (el propio código, sus precedentes, el tamaño real del equipo, el requisito offline-first) ya está en este repositorio y fue verificada en rondas anteriores. La representación fiscal no — depende de normativa y de un contrato con un tercero, ninguno de los dos verificable desde aquí.
- **¿La decisión de Fase 3 (B) contradice algo ya señalado en §3?** No — es la conclusión que la propia matriz de §3.2 y el hallazgo de §3.3 ya apuntaban, sin forzarla antes porque la instrucción vigente en ese momento era no resolverla por inferencia. Ahora que esa instrucción cambió explícitamente, se cierra con la misma evidencia ya reunida, no con evidencia nueva inventada.
- **¿El descarte de los 19 IDs de OC pierde trazabilidad?** No — se documenta el razonamiento completo (§1.5) y la posibilidad de reconciliación retroactiva si aparece el documento fuente. No se inventa contenido para esos IDs, solo se cierra la ambigüedad de "pendiente de descarte" indefinido.
- **¿Se tomó alguna decisión de código/implementación en esta ronda?** No — las tres resoluciones de esta ronda son puramente documentales (confirman el estado actual o cierran una pregunta), consistente con que Fase 3 = B significa "seguir haciendo lo que ya se hace" y el descarte de OC no tiene ningún artefacto de código que tocar.

**Ambigüedad evitable remanente tras esta ronda**: cero decisiones de arquitectura/producto pendientes. Queda exactamente un bloqueo, y es deliberado: la representación fiscal del diferencial (§4.5), que depende de una consulta externa real, no de una decisión que esta sesión pueda o deba tomar.
