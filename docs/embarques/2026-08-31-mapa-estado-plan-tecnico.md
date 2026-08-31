# Mapa de estado actual — "Plan técnico definitivo: Nuevo Embarque y control operativo"

- **Propósito:** antes de rediseñar nada, contrastar los ~23 puntos del plan técnico contra el código real y decir qué está hecho, qué a medias, qué no existe.
- **Fecha:** 2026-08-31
- **Base revisada:** `main` (Embarques Fases 2-7 mergeadas) + branch `docs/rutas-planificador-f0` (Planificador, PR #144) donde aplica.
- **Método:** lectura directa de `prisma/schema.prisma`, `src/modules/**`, `src/app/api/**`, `src/app/(app)/**` + grep dirigido. No se ejecutó nada.

---

## 0. Resumen ejecutivo

El plan técnico mezcla **tres cosas de madurez muy distinta**:

| Bloque | Qué es | Estado global |
|---|---|---|
| **A** — El formulario "Nuevo Embarque" (§1-7, §24, §31-45) | Rediseño de UI/UX del flujo manual de creación | ❌ **sin hacer** — es el trabajo real pendiente |
| **B** — Reglas de negocio del cierre y el dinero (§8, §10, §12, §16, §22-23) | Conciliación física, sobrantes, cobros, reversiones, tiempo | 🟢 **mayormente hecho** en el backend congelado (23 ADRs) + el wizard de cierre (Fase 7) |
| **C** — Control operativo / antifraude (§9, §11, §13-15, §17-21) | Ventas a empleados, promociones, reclamaciones, señales, patrones, colusión, segregación | 🟡 **parcial** — existe un módulo `/casos` + "plan antifraude" ya corriendo; hay gaps concretos |

**Conclusión:** el plan describe como "pendiente" mucho que **ya existe**. Lo genuinamente nuevo y acotado al formulario es el Bloque A. Los gaps del Bloque C son **epics separados**, cada uno con su propio ADR, y **no deben bloquear el rediseño del formulario**.

---

## 1. Tabla de contraste punto por punto

| § | Tema del plan | Estado | Dónde vive hoy |
|---|---|---|---|
| 3-5 | Flujo pedidos-primero, crear+asignar en un paso | ❌ sin hacer | `embarque-form-modal.tsx` (form viejo, 495 líneas) |
| 4 | Capacidad desde config, no hardcode | 🟢 hecho | `MAX_UNIDADES_EMBARQUE` en tabla `Config` (`getConfigInt`), `capacidadKg` por trabajador. El "70" del front es solo fallback mientras carga. |
| 4 | Taxonomía solicitado/asignado/pendiente/cargado/entregado/sobrante | 🟡 parcial | `CapacidadInfo` (cargado/capacidad), `conciliarProductos` (entregado/devuelto/roto/sobrante). **Falta:** "asignado vs pendiente" cuando un pedido de 80 no entra en capacidad 70 — hoy no se modela el parcial. |
| 6 | Concurrencia / doble asignación / 409 | 🟢 hecho | `PUT /api/embarques/[id]` → `updateMany` con `embarqueId: null` + 409 con lista de pedidos ya tomados (`route.ts:327-342`). ADR-CONCURRENCIA-001. |
| 7 | Offline / idempotencia / conflicto = revisión | 🟢 base hecha | `fetchResilient` + `requestQueue` + `offlineId` (ADR-OFFLINE-001, ADR-IDEMPOTENCIA-001). **Falta:** el paso create→assign encadenado con detección de conflicto en `syncWithServer()` (parte del Bloque A). |
| 8 | Conciliación física al cierre | 🟢 parcial | `cierre-embarque.service.ts::conciliarProductos`: `discrepancia = cargadas − entregadas − devueltas − cambios − rotas`. Wizard de cierre Fase 7. **Falta como bucket explícito:** vendido-a-empleado, retornado-al-almacén, merma/incidencia autorizada. Hoy todo lo no explicado cae en "discrepancia". |
| 9 | Ventas a empleados vinculadas al embarque | ❌ **no existe** | Grep sin resultados. No hay precio-empleado, no hay operación de venta a empleado, no hay vínculo con embarque. **Epic nuevo.** |
| 10 | Sobrantes siempre con destino | 🟡 parcial | `RecoveryDecision` (SOBRANTE/FALTANTE) + ledger físico (`EmbarqueMovimiento`) + el wizard de cierre exige justificar discrepancia. **Falta:** forzar un destino tipado para cada sobrante (retorno / venta-empleado / merma / otro) en vez de "justificación de texto libre". |
| 11 | Promociones/regalos identificables y derivados de regla | 🟡 parcial | Modelo `PromotionRule`, `EmbarqueMovimiento` tipo `PROMOCION`, `/api/promociones`, `promocion.service.ts::validarPromocion` (exige `autorizadoPorId`). ADR-PROMOCION-001 + ADR-AUTORIZACION-REGALOS-001. **Falta:** el flujo de aplicar una promoción durante entrega/cierre; hoy es solo el modelo + validación. |
| 12 | Cobros/fiados: saldo→abono→nuevo saldo, sin editar historia | 🟢 hecho | Arquitectura de 4 libros: `Pago` (append), `ReceivableEntry` (proyección por abono), lock `CARTERA:clienteId` FIFO. ADR-MONETARIO-001, ADR-CARTERA-001. |
| 13 | Reclamaciones / reposiciones / devoluciones como operaciones distintas | 🟡 parcial | `Sustitucion` (unidad defectuosa → unidad nueva, 2 movimientos, ADR-SUSTITUCION-001). Devoluciones = `devueltas` en conciliación. **Falta:** "reclamación" como entidad con estado (reportada → revisión → reposición/rechazo) y el vínculo reposición↔evento original. |
| 14 | Devoluciones fuera de plazo → a revisión | ❌ **no existe** | Grep sin resultados. No hay política de ventana de devolución (ej. "6 días"), no hay detección automática. **Epic nuevo** (chico). |
| 15 | Producto dañado / filtrado / mal sabor — clasificar el defecto | ❌ **no existe** como taxonomía | Solo hay `rotas` genérico en conciliación. No distingue defecto-Bambú / daño-posterior / mal-almacenamiento / sin-evidencia. **Epic nuevo.** |
| 16 | Reversiones (Original → Reversada/Corregida, nunca DELETE) | 🟢 mayormente | El backend es append-only en lo monetario y físico (`Pago`, `ReceivableEntry`, `EmbarqueMovimiento` no se borran; se corrige con movimiento inverso). Precedente: `nomina/[id]` hace "Reversión". **Falta:** verificar que TODO camino de corrección de un `Pago`/abono sea reversal y no update, y exponerlo en UI. |
| 17 | Antifraude = señales, nunca "fraude confirmado" | 🟢 base hecha | **Módulo `/casos` ya corriendo** con ~22 tipos (MONTO_ANOMALO, DEVOLUCIONES_ANORMALES, ROTURAS_ANORMALES, DESCUENTO_NO_JUSTIFICADO, NOTA_CREDITO_FRECUENTE, PRECIO_POR_DEBAJO_TABLA, REPARTIDOR_DEUDA_ALTA, CAMBIO_PRECIO_BRUSCO, …). `/reportes/salud-antifraude`. `cron/alertas-batch` los genera. `ResponsibilityCase` para el cierre. Todo en lenguaje "requiere revisión". |
| 18 | Segregación de funciones (requested/approved/executed) | 🟡 parcial | Varios modelos llevan `autorizadoPorId` (Sustitucion, PromotionRule, PedidoItem, Ajuste, ResponsibilityCase con `autorizadoPorId` + `resueltoPorId`). **Falta:** la tríada sistemática `requested_by / approved_by / executed_by` y decidir para qué operaciones aplica. |
| 19 | Auditoría qué/quién/cuándo/antes/después/por qué/quién aprobó | 🟢 mayormente | `logAudit` → `Historial {entidad, registroId, accion, datos(JSON), usuarioId, fecha}` + `_ip`/`_userAgent`/`_casoId`. 91 call sites en la API. `casos/[id]/auditoria`. **Falta:** consistencia de "antes/después" (depende de cada caller), y `approved_by` como campo aparte de `usuarioId`. |
| 20 | Detección de patrones (conjuntos, no eventos) | 🟡 parcial | `cron/alertas-batch` + tipos como `MULTIPLES_PEDIDOS_RAPIDO`, `NO_ENTREGADO_REPETIDO`, `RECLAMACIONES_MULTIPLES`, `FIADO_RECURRENTE`. **Falta:** los patrones específicos del plan (sobrantes recurrentes + venta-empleado + concentración en un repartidor). |
| 21 | Colusión (relaciones entre actores) | ❌ casi nada | No hay análisis cruzado cliente↔repartidor↔empleado↔quien-registra↔quien-aprueba. `RECLAMACIONES_MULTIPLES` roza el tema. **Epic de analítica, el más grande.** |
| 22 | Cancelación ≠ devolución física | 🟡 parcial | Hay dos use-cases distintos (`AnularPedidoUseCase` vs `CancelarPedidoUseCase`). **Falta verificar:** que anular NO devuelva stock automáticamente y que la devolución física quede como registro aparte. |
| 23 | Tiempo del servidor para reglas críticas | 🟢 hecho | `getTodayString()` / `startOfDayBogota()` usan `new Date()` server-side en TZ Bogotá. El backend nunca confía en la hora del cliente para reglas. |
| 24 | Máquina de estados del flujo (IDLE…CONFLICT…OFFLINE_PENDING) | ❌ sin hacer | El form viejo usa booleans dispersos. Parte del Bloque A. |
| 25 | No asumir cambios de backend | ✅ ya es la política | AGENTS.md: backend congelado, cambios vía ADR. |
| 26 | No sobreingeniería / no multitenant | ✅ ya es la política | El repo no tiene `tenant_id` ni multitenancy. |

---

## 2. Veredicto por bloque

### Bloque A — El formulario (lo único 100% pendiente y acotado)

§3-7, §24, §31-45. Es un rediseño de frontend, **sin cambios de backend**. El diseño ya empezado
(`docs/embarques/2026-08-30-nuevo-embarque-form-diseno.md`) es la base correcta pero **hay que
subirlo a la vara del §31-45**: reconceptualización real (no "agregar tabs"), arquitectura de
información, mapa de decisiones, máquina de estados explícita (§24), los 16 estados visuales
del §35, responsive como requisito (§34), y la evaluación técnica del §45 como entregable.

**Recomendación:** este bloque avanza ya. Es 1 spec + 1 plan + 1 implementación.

### Bloque B — Reglas del cierre y el dinero (ya está, no reabrir)

§8, §10, §12, §16, §22, §23. El backend congelado (23 ADRs) + el wizard de cierre de la Fase 7
ya cubren esto. Lo que el plan pide de más son **refinamientos de taxonomía**:
- §8/§10: que cada sobrante tenga un **destino tipado** (no justificación libre).
- §16/§22: verificar que no haya ningún `DELETE` de movimiento monetario/físico y que
  cancelar ≠ devolver stock.

**Recomendación:** una auditoría corta de 2-3 días confirma el estado real y lista micro-fixes.
No es un rediseño.

### Bloque C — Control operativo (parcial; gaps = epics separados)

Ya existe: módulo `/casos` (~22 tipos), `/reportes/salud-antifraude`, `cron/alertas-batch`,
`ResponsibilityCase`, auditoría con `logAudit`, promociones (modelo + validación).

Gaps reales, cada uno su propio ADR/spec:
1. **Ventas a empleados** (§9) — no existe. Feature nueva: precio-empleado, operación de venta,
   vínculo con el embarque de origen. Toca schema → ADR.
2. **Devoluciones fuera de plazo** (§14) — no existe. Chico: config de ventana + detección + a `/casos`.
3. **Taxonomía de producto dañado** (§15) — no existe. Extender el motivo de `rotas`/reclamación.
4. **Reclamación como entidad con ciclo de vida** (§13) — parcial. Modelar reportada→revisión→resolución.
5. **Aplicar promoción en el flujo de entrega/cierre** (§11) — el modelo está, falta el flujo.
6. **Patrones cruzados y colusión** (§20-21) — el más grande. Analítica sobre el histórico. Epic aparte.
7. **Tríada de segregación** (§18) — decidir alcance y estandarizar `requested/approved/executed`.

**Recomendación:** NO meter esto en el rediseño del formulario. Priorizar como backlog propio
después de que el form esté listo.

---

## 3. Secuencia propuesta

1. **Ahora:** expandir el diseño del formulario (Bloque A) a la vara del §31-45 → spec → plan → implementación. Sin tocar backend.
2. **En paralelo (corto):** auditoría del Bloque B (§8, §10, §16, §22) → lista de micro-fixes.
3. **Después del form:** priorizar los 7 gaps del Bloque C como epics independientes, cada uno con ADR.

El plan técnico es un buen **norte de principios** ("el humano declara hechos y resuelve
excepciones; el sistema calcula y propone"), pero como unidad de trabajo hay que partirlo:
el formulario no puede esperar a que se resuelva colusión.
