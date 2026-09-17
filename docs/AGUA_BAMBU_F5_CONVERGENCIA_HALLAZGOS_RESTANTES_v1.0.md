# AGUA BAMBÚ — F5: CONVERGENCIA DE LOS 9 HALLAZGOS RESTANTES

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** instrucción del equipo tras aprobar #259/#261/#262 — continuar la convergencia documental (sin código) de los 9 hallazgos restantes del mapa de brechas de F5, con el estándar exacto: hallazgo → evidencia → autoridad → impacto → decisión existente → clasificación → brecha → criterio de éxito → cambio mínimo → **decisión de alcance F5**. Cada uno debe cerrar con una etiqueta única de esta lista: **bug activo / decisión aprobada no implementada / brecha de integridad / feature pendiente / deuda documental / modelo huérfano / decisión de producto pendiente / no es brecha**.

**Regla seguida en todo el documento**: no convertir una anomalía técnica en una decisión de producto nueva, no convertir una decisión ya aprobada en una propuesta, no proponer refactors preventivos solo porque sean técnicamente fáciles. **Cero implementación.**

Los 9 hallazgos (del mapa de brechas v1.0, excluyendo GPS/#259 y CARGA-RECARGA/#261-#262 y la reconciliación cruzada ya corregida como "no es brecha"):

---

## 1. Anti-fraude de ubicación — 100% client-side, ausente en `/repartidor`

**Evidencia**: `isWithinDeliveryRadius`/`haversineKm` (`src/lib/gps.ts:30-61`) solo se invocan dentro de `GpsCaptureModal` (`src/components/gps-capture-modal.tsx:56-69`), usado únicamente por el flujo de oficina (`pedidos-client/index.tsx:2606-2626`). `/repartidor` (`repartidor-client.tsx`) captura GPS crudo sin comparar contra `clienteCoords` (cero referencias, verificado por grep). El servidor (`entrega/route.ts`) nunca recalcula distancia — solo exige presencia de coordenadas o justificación (ya corregido en #259).

**Autoridad**: hoy, ninguna. La única validación de "¿esta ubicación tiene sentido?" es una sugerencia de UX en un solo flujo, nunca una autoridad server-side.

**Impacto**: un caller de API directo (o el flujo `/repartidor`) puede reportar `gpsLat`/`gpsLng` arbitrarios sin ningún control de plausibilidad. No es un bug del fix de #259 — #259 corrigió "¿se exige GPS?", esto es una pregunta distinta: "¿el GPS reportado es creíble?".

**Decisión existente**: ninguna. Ningún ADR ni el Plan Maestro exige validación de distancia server-side. `umbralGpsEntregaMetros` existe como config, pero solo lo lee el cliente para su propia UX — no hay contrato que diga "el servidor debe aplicar este umbral".

**Clasificación: DECISIÓN DE PRODUCTO PENDIENTE.** No hay una decisión previa que esta implementación esté incumpliendo — hay una pregunta de producto sin responder: ¿debe el servidor validar la distancia GPS como control de integridad (antifraude), o el control actual (sugerencia de UX en oficina) es suficiente para el riesgo real del negocio? Y, si se decide que sí, ¿aplica también a `/repartidor`?

**Brecha**: condicional a la decisión de arriba — hoy no hay brecha respecto a nada decidido.

**Criterio de éxito** (si el equipo decide que se necesita validación server-side): el servidor recalcula distancia contra la ubicación efectiva del pedido (`pickCoords`, ya existente) usando el mismo `umbralGpsEntregaMetros`; fuera de rango sin justificación → mismo 400 que ya usa el gate de GPS obligatorio. Aplicaría igual sin importar el flujo de origen (oficina o `/repartidor`).

**Cambio mínimo propuesto**: ninguno — no hay nada que implementar sin la decisión de producto primero.

**Decisión de alcance F5**: **no entra a F5 sin que el equipo responda la pregunta de producto.** No es una brecha técnica ejecutable hoy.

---

## 2. `codigoVisita` — infraestructura completa, cero activación

**Evidencia**: campo presente en `Embarque`/`Pedido` (schema), propagado por mappers/DTOs/entidades/use cases (`EmbarqueMapper.ts`, `Pedido.ts`, `EntregarPedidoUseCase.ts`, `PedidoMapper.ts`). Pero: `EmbarqueCreateSchema` no lo acepta como input al crear un embarque, no existe ningún generador en `src/` (grep exhaustivo sin resultados), ninguna UI lo captura como campo de entrada, y `EntregarPedidoUseCase` lo persiste sin comparar contra ningún valor de referencia.

**Autoridad**: ninguna — no hay ningún flujo que produzca un valor real para este campo.

**Impacto**: ninguno hoy — siempre `null`/`undefined` en producción, no bloquea ni distorsiona nada.

**Decisión existente**: no encontrada en ningún ADR ni documento del repo. No hay evidencia de qué se pretendía lograr con este campo (¿verificación de identidad del repartidor? ¿código de acceso a una zona? ¿confirmación del cliente?) — ninguna fuente lo explica.

**Clasificación: MODELO HUÉRFANO.** Mismo patrón que el modelo `Retorno` (hallazgo #5 de este documento) — infraestructura construida (schema + propagación end-to-end) para un concepto cuyo propósito y activación nunca se completaron ni se documentaron.

**Brecha**: ninguna operativa — es superficie de código sin uso, no un comportamiento incorrecto.

**Criterio de éxito**: no aplica sin que el equipo defina primero QUÉ debía ser `codigoVisita` (pregunta de producto, no de este documento).

**Cambio mínimo propuesto**: ninguno.

**Decisión de alcance F5**: **no entra a F5.** Si el equipo confirma que el concepto ya no aplica, es candidato a limpieza de schema en un momento aparte (fuera de F5, que es sobre brechas funcionales, no limpieza).

---

## 3. Custodia — reasignar `trabajadorId` de un Embarque no genera ningún registro de custodia

**Evidencia**: `PUT /api/embarques/[id]` permite cambiar el trabajador asignado (`[id]/route.ts:210-255,301`, valida capacidad/moto) sin crear ningún `EmbarqueMovimiento{tipo:CUSTODY_TRANSFER}` ni otro registro.

**Autoridad**: `Embarque.trabajadorId` es la autoridad de "quién está administrativamente asignado"; `EmbarqueMovimiento` es la autoridad de "qué dice el ledger sobre custodia física" — hoy desconectadas.

**Impacto**: divergencia POSIBLE entre asignación administrativa y trazabilidad física — pero solo si reasignar `trabajadorId` implica, en la realidad operativa, una transferencia física real de mercancía de una persona a otra. Eso es exactamente lo que no está decidido.

**Decisión existente**: `ADR-CUSTODIA-001` exige que "toda transferencia de custodia tenga origen y destino" — pero no define si un cambio administrativo de `trabajadorId` CONSTITUYE una transferencia de custodia en el sentido del ADR. Podría ser (a) un evento físico real que debería generar un movimiento, o (b) un cambio de registro puramente administrativo (ej. corrección de un error de asignación antes de que el embarque salga) sin ningún movimiento físico real detrás.

**Clasificación: DECISIÓN DE PRODUCTO PENDIENTE.** No es que la implementación incumpla el ADR — es que el ADR no cubre este caso específico, y las dos lecturas posibles (evento físico vs. cambio administrativo) llevan a comportamientos opuestos. No lo decido yo.

**Brecha**: condicional. Si la respuesta es "sí, siempre implica transferencia física", hay una brecha de implementación real (falta el movimiento). Si es "no, es solo administrativo", no hay brecha — el comportamiento actual es correcto.

**Criterio de éxito**: si se decide que sí, cada reasignación exitosa de `trabajadorId` en un Embarque con carga ya registrada genera un `EmbarqueMovimiento{tipo:CUSTODY_TRANSFER}` (origen/destino aún por definir según el vocabulario de custodia).

**Cambio mínimo propuesto**: ninguno — depende enteramente de la respuesta de producto.

**Decisión de alcance F5**: **no entra a F5 sin la decisión.**

---

## 4. Custodia — `origen`/`destino` de `EmbarqueMovimiento` son texto libre sin validación server-side

**Evidencia**: `EmbarqueMovimiento.origen`/`.destino` (`schema.prisma:1181-1184`) son `String?` con una convención documentada SOLO en comentario (`VEHICULO, ALMACEN, INSPECCION, CLIENTE, PRODUCCION, DESCARTE, EXTERNO`). El Zod de `POST .../movimientos` (`movimientos/route.ts:52-53`) acepta cualquier string, sin validar contra esa lista.

**Autoridad**: el comentario del schema ES la única fuente de la convención — no hay ninguna validación de código que la haga cumplir.

**Impacto**: hoy, bajo — el único caller manual es `ADMIN`/`ASISTENTE` (rol restringido), y todos los callers de producción (cierre, recovery) ya usan valores del vocabulario documentado consistentemente (verificado: `'VEHICULO'`, `'CLIENTE'`, `'INSPECCION'`, `'ALMACEN'` en todos los `create` reales). El riesgo es de "typo humano futuro" (ej. un `ADMIN` escribe `"Almacen"` en vez de `"ALMACEN"` vía el endpoint manual), no una divergencia activa hoy.

**Decisión existente**: la convención SÍ está documentada (en el schema, con una lista cerrada de 7 valores) — es una decisión implícita de vocabulario, aunque nunca se formalizó como constraint. Es más débil que un ADR formal, pero no es ambigüedad de producto — el vocabulario ya está definido, solo falta hacerlo cumplir.

**Clasificación: BRECHA DE INTEGRIDAD (menor).** A diferencia de los hallazgos #1 y #3 de este documento, aquí SÍ hay algo ya definido (el vocabulario cerrado) que la implementación no hace cumplir — es una brecha real, de severidad baja porque el único escritor manual está restringido por rol y todos los escritores automáticos ya son consistentes.

**Criterio de éxito**: `MovimientoSchema` (Zod) valida `origen`/`destino` contra `CUSTODIAS` (ya exportado como constante tipada en `ledger-fisico.service.ts:16-24`) cuando vienen presentes.

**Cambio mínimo propuesto (NO implementado)**: `origen: z.enum(CUSTODIAS).optional()`, `destino: z.enum(CUSTODIAS).optional()` en `MovimientoSchema` — un cambio de 2 líneas, sin tocar ningún caller existente (todos ya usan valores válidos).

**Decisión de alcance F5**: **candidata a entrar a F5** — es la única de las 9 con cambio mínimo genuinamente listo (vocabulario ya decidido, solo falta el enforcement), sujeta a que el equipo confirme prioridad.

---

## 5. `Retorno` — modelo huérfano, sin ningún productor

**Evidencia**: `prisma/schema.prisma:1235-1254` — `Retorno` con `motivo` (EMPAQUE_ROTO/PACA_FILTRADA/DEFECTUOSA/CLIENTE_RECHAZA) y relación a `movimientoId`. Búsqueda exhaustiva de `.retorno.create/.update/.findMany`: el único resultado es un test que valida su CHECK constraint de forma aislada (`ledger-fisico-constraints.test.ts:75-78`). El retorno real de producto (captura en el wizard de cierre, `cerrar-client/index.tsx:746-765`) ya ocurre completo vía `EmbarqueMovimiento{tipo:RETORNO}` + `EmbarqueProducto`.

**Autoridad**: ninguna — el modelo no tiene ningún escritor.

**Impacto**: ninguno — el retorno de producto YA está resuelto por otra vía, funcionando en producción.

**Decisión existente**: no encontrada. `ADR-FISICO-001` menciona `Retorno` en su lista de modelos creados (línea 53, "✅ Modelos... `Retorno`") pero nunca documenta un caso de uso que lo escriba — parece haber sido creado como parte del scaffolding de FASE 2 y luego reemplazado de facto por el mecanismo `EmbarqueMovimiento`+`EmbarqueProducto`, sin retirarlo.

**Clasificación: MODELO HUÉRFANO.**

**Brecha**: ninguna operativa.

**Criterio de éxito**: no aplica — no hay comportamiento que corregir.

**Cambio mínimo propuesto**: ninguno. (Retirar el modelo sería limpieza de schema, no cierre de brecha — explícitamente fuera del alcance de F5 según la instrucción del equipo de no hacer refactors preventivos.)

**Decisión de alcance F5**: **no entra a F5.**

---

## 6. Embarque — cancelación implementada dos veces (rutas HTTP distintas)

**Evidencia**: `CancelarEmbarqueUseCase.ts:23-51` (usado por `DELETE /api/embarques?id=`) vs. lógica inline separada en `DELETE /api/embarques/[id]` (`[id]/route.ts:483-560`, su propio lock/dedup/reasignación de pedidos). Mismo caso de uso de negocio, código escrito dos veces.

**Autoridad**: ninguna única — dos implementaciones paralelas.

**Impacto**: ninguno observado hoy (ambas funcionan correctamente, cada una con su propia cobertura). El riesgo es prospectivo: que diverjan silenciosamente si alguna se modifica sin actualizar la otra.

**Decisión existente**: ninguna que exija consolidar — es una observación de estructura de código, no el incumplimiento de una decisión de dominio.

**Clasificación: NO ES BRECHA DE F5.** Es una observación de mantenibilidad de ingeniería (duplicación de lógica), no una brecha funcional del dominio "Ejecución física". F5 trata sobre qué pasa físicamente con el inventario/embarques, no sobre la arquitectura interna del código que ya funciona correctamente en ambos caminos.

**Brecha**: n/a (no es brecha de este alcance).

**Criterio de éxito / cambio mínimo**: no aplica en F5. Si el equipo quiere consolidarlo en algún momento, es una tarea de mantenibilidad general, no de F5.

**Decisión de alcance F5**: **no entra a F5** — se registra aquí solo para que quede documentado, no como pendiente de F5.

---

## 7. Embarque — asimetría de mecanismo de concurrencia en el envío

**Evidencia**: crear/cerrar/cancelar usan advisory lock (`EMBARQUE_CARGA`/`CIERRE`); envío usa `executeSerializableWithRetry` (aislamiento Postgres Serializable + retry), documentado como decisión deliberada del fix F-N1 (`enviar-concurrencia.test.ts:1-11`).

**Autoridad**: el propio código y su test documentan la decisión — ya fue tomada y está funcionando.

**Impacto**: ninguno — es una asimetría de PATRÓN (dos mecanismos de concurrencia distintos en el mismo dominio), no de corrección. Ambos previenen condiciones de carrera correctamente, cada uno a su manera.

**Decisión existente**: sí — el fix F-N1 decidió explícitamente usar este mecanismo para el envío, documentado en el propio código y test.

**Clasificación: NO ES BRECHA.** Decisión ya tomada, correcta, funcionando. La inconsistencia de patrón (dos formas distintas de lograr lo mismo) es una observación de estilo, no una brecha — y explícitamente no debe convertirse en un refactor "porque sería más consistente", que es justo lo que el equipo pidió evitar.

**Criterio de éxito / cambio mínimo / decisión de alcance F5**: no aplica — nada que decidir ni implementar.

---

## 8. Entrega — offline-first no alcanza `/repartidor` (solo vista de oficina)

**Evidencia**: el wiring `fetchResilient`+`offlineId` para `.../entrega` es sólido (`use-entregar-pedido.ts:45-55`), pero su único caller es `pedidos-client/index.tsx` (oficina). `/repartidor` (`repartidor-client.tsx`) no tiene ninguna acción de "entregar pedido pendiente" — solo venta libre, que sí maneja offline explícitamente por su cuenta.

**Autoridad**: n/a.

**Impacto**: un repartidor en campo, sin conectividad, no puede marcar una entrega de un pedido ya asignado desde su propia pantalla — necesitaría intervención de oficina. Dado que el proyecto está explícitamente diseñado para "6 usuarios concurrentes, conectividad rural 2G/3G" (contexto del propio proyecto) y repartidores operando en campo, esto es una limitación funcional real del flujo que más debería necesitarlo.

**Decisión existente**: ninguna decisión formal exige esta acción específica en `/repartidor` — pero el propósito general del producto (repartidores en campo, offline-first) apunta con fuerza a que debería existir.

**Clasificación: FEATURE PENDIENTE.** No es un bug (nada roto), no es una decisión de producto ambigua (el propósito del producto es claro), no es integridad (no hay riesgo de datos incorrectos) — es una funcionalidad que falta para que el flujo principal del producto (repartidor entrega en campo) esté completo.

**Brecha**: real, de alcance de producto, no de corrección técnica.

**Criterio de éxito**: `/repartidor` tiene una acción de "marcar entregado" para pedidos asignados al trabajador autenticado, reutilizando `useEntregarPedido`/`EntregarPedidoUseCase` sin cambios (la lógica de negocio y el offline-first ya existen — solo falta la superficie de UI en esta vista).

**Cambio mínimo propuesto**: no propuesto en detalle aquí — agregar una superficie de UI nueva (aunque reutilice lógica existente) es más que un "cambio mínimo de una línea" y merece su propio diseño técnico si el equipo confirma que quiere cerrarlo en F5.

**Decisión de alcance F5**: **el equipo decide si esto entra a F5** (es feature, no brecha de integridad urgente) — dado que reutiliza infraestructura 100% existente, es de bajo riesgo técnico si se prioriza, pero no es pequeño en superficie de UI.

---

## 9. Cobertura de test débil / "de forma" en varios puntos del dominio de ejecución física

**Evidencia**: patrón repetido en varios archivos de test de este dominio — verifican que un string aparezca en el código fuente (`readFileSync`+regex) en vez de ejecutar comportamiento real: `enviar/__tests__/route.test.ts`, `CerrarEmbarqueUseCase.test.ts`, y (antes de #259) `entrega/__tests__/route.test.ts`. Ya demostrado en #259 que este patrón no detecta regresiones reales (el bug de GPS pasó desapercibido pese a que ese mismo archivo "probaba" el string correcto).

**Autoridad**: n/a.

**Impacto**: cobertura aparente sin verificación real de comportamiento — un cambio que rompe la lógica pero conserva las palabras clave en el código pasa estos tests sin detección, como ya ocurrió.

**Decisión existente**: ninguna que prohíba este patrón de test, pero tampoco ninguna que lo autorice como suficiente — es una práctica heredada, no una decisión.

**Clasificación: DEUDA DOCUMENTAL.** Los tests de forma "documentan" que cierto texto debe existir en el código, dando una falsa sensación de cobertura de comportamiento — es deuda de aseguramiento/verificación, no una brecha funcional del dominio.

**Brecha**: transversal, no específica de un caso de uso — afecta la confianza en varios archivos de este dominio, no el comportamiento de producción en sí.

**Criterio de éxito**: reemplazar tests de forma por tests de comportamiento real (patrón ya usado en #259: mockear dependencias y ejecutar el handler) — caso por caso, no en bloque.

**Cambio mínimo propuesto**: ninguno global — sería trabajo de testing puro, no una corrección de producto, y el equipo pidió explícitamente no hacer refactors preventivos. Si se decide abordar, debería hacerse puntualmente cada vez que se toque uno de esos archivos por otra razón (como ya ocurrió naturalmente en #259), no como iniciativa aislada.

**Decisión de alcance F5**: **no entra a F5 como iniciativa propia.** Queda registrado como antecedente/justificación para no confiar en esos tests como señal de corrección en futuras rondas de F5.

---

## Resumen para decisión del equipo

| # | Hallazgo | Clasificación | ¿Entra a F5? |
|---|---|---|---|
| 1 | Anti-fraude GPS client-side / ausente en `/repartidor` | Decisión de producto pendiente | No, sin decisión previa |
| 2 | `codigoVisita` inerte | Modelo huérfano | No |
| 3 | Custodia: reasignar trabajador sin registro | Decisión de producto pendiente | No, sin decisión previa |
| 4 | Custodia: `origen`/`destino` sin enforcement | **Brecha de integridad (menor)** | **Candidata — cambio mínimo listo** |
| 5 | `Retorno` modelo huérfano | Modelo huérfano | No |
| 6 | Embarque: cancelación duplicada | No es brecha (mantenibilidad, fuera de alcance funcional) | No |
| 7 | Embarque: asimetría de lock en envío | No es brecha (decisión ya tomada, funcionando) | No |
| 8 | Entrega: offline-first no alcanza `/repartidor` | **Feature pendiente** | **A decisión del equipo — reutiliza infra existente** |
| 9 | Cobertura de test "de forma" | Deuda documental | No, como iniciativa propia |

**Solo el #4 tiene un cambio mínimo genuinamente listo para implementación** (vocabulario ya decidido, solo falta el `z.enum`). El #8 es la única "feature pendiente" real, de mayor superficie, sujeta a priorización del equipo. El resto (1, 2, 3, 5, 6, 7, 9) **no requiere ninguna acción de código** — quedan documentados como su clasificación real, sin inventar decisiones de producto que no se han tomado ni degradar decisiones que ya están tomadas.

**Ningún cambio de este documento se implementa sin instrucción explícita adicional del equipo.**
