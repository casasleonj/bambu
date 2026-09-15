# AGUA BAMBÚ — F4: MAPA DE BRECHAS (CUMPLIMIENTO)

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** "Continúa" — inicio de F4 sobre el baseline de `main` (`3a1d3155`, F3 ya mergeado).
**Alcance de F4 (verbatim, Plan Maestro v1.0 §61 — único texto usado):** *"F4 — Cumplimiento: parcial; remanente; PUNTO/N2/DOMICILIO; reprogramación."*
**Regla seguida:** solo mapeo y evidencia (archivo:línea). **Cero implementación en este documento.** No se inventa ningún alcance donde el Plan Maestro no lo define.

**No se reabre F1/F2/F3.**

---

## 1. Mapa de brechas

| Bullet de F4 | Estado en `main` (HEAD `3a1d3155`) | Clasificación |
|---|---|---|
| Cumplimiento parcial | `ObligacionPendiente` (`schema.prisma:1264`), `Actividad` (`:1288`), casos de uso completos: `GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase`, `AjustarPedidoCantidadUseCase`. | **YA EXISTE — no reconstruir** |
| Remanente | Mismo bloque de arriba — `cantidadDisponible` derivada, comentario explícito en `schema.prisma:1257`: nunca crea un Pedido nuevo. | **YA EXISTE — no reconstruir** |
| PUNTO/N2/DOMICILIO | Enum `ModoActividad` (`schema.prisma:155-158`), comentario explícito (`:150-154`): "nunca inferido automáticamente" — solo vía `GestionarPendienteUseCase` (creación) o `CambiarModoActividadUseCase` (cambio explícito, auditado). | **YA EXISTE — no reconstruir** |
| Reprogramación | Ver §2 — **BRECHA REAL**, con matiz: existe a nivel `PlanDia` completo, no existe a nivel de una `ObligacionPendiente`/`Actividad` individual. | **BRECHA REAL (parcial)** |

**Advertencia de activación (heredada de la convergencia de F0→F3, sigue vigente)**: los 3 primeros bullets viven exclusivamente dentro de `pedido-hub/` (Hub V2). La página legacy `src/app/(app)/pedidos/page.tsx` no referencia ninguno de esos hooks/endpoints — sigue sin haber camino de acceso desde la UI que usan hoy los 6 usuarios reales. Esto es **100% un tema de activación** (depende del soak de Fase 10), no de desarrollo — no se re-implementa nada acá.

---

## 2. "Reprogramación" — lo que existe y lo que falta

El propio código ya distingue dos niveles distintos, con vocabulario propio:

- **Nivel `PlanDia` (el día completo)**: `ReplanUseCase` (`src/modules/planificador/application/use-cases/ReplanUseCase.ts`) recalcula una versión N+1 del plan y la deja en estado `REVIEW` — **nunca se auto-aplica**, coincide exactamente con la regla que el equipo ya fijó en F3 ("la planificación puede quedar desactualizada, debe hacerse visible, no se modifica automáticamente"). `OverridePlanUseCase.moverPedido`/`moverParada` (líneas 96-131) mueve un Pedido entre grupos, pero **solo dentro de la misma fecha/mismo `planId`** (el grupo destino se valida con `planDiaId: planId`, línea 107) — no reprograma a otro día.
- **Nivel `ObligacionPendiente`/`Actividad` individual (el remanente de un Pedido)**: **no existe ningún mecanismo**. Búsqueda exhaustiva de `aplazar`/`posponer`/`diferir` en `src/` no encuentra ningún caso de uso real. El texto "Reprogramar para otro día" (`src/modules/planificador/domain/services/excepciones.service.ts:83,110`) es solo un **label de sugerencia** dentro de `PlanExcepcionDraft` — una opción que se le muestra al humano — pero la única acción realmente conectada (`resolverExcepcion`, `OverridePlanUseCase.ts:64-70`) solo cambia `PlanExcepcion.estado` a `RESUELTA`/`IGNORADA`; no toca `Pedido.fecha`, no crea una `Actividad`/`ObligacionPendiente` con fecha distinta.

Confirmado además por auditoría previa del equipo, `docs/pedidos/AGUA_BAMBU_N2_AUDITORIA_CONVERGENCIA_RESULTADO_v1.0.md:89`: *"Replanificación (nivel Pedido↔Plan): DECISIÓN (cerrada, implementada) ... Falta el equivalente a nivel Actividad/Obligación."* — mismo hallazgo, ya señalado antes, no es un descubrimiento nuevo de este documento.

---

## 3. Qué necesito confirmado antes de diseñar (no elijo por mi cuenta)

El bullet "reprogramación" no trae una regla implícita en ningún ADR/doc existente para el caso de la `ObligacionPendiente`/`Actividad` individual — a diferencia de "parcial"/"remanente"/"PUNTO-DOMICILIO", que ya tenían implementación completa para reutilizar.

1. **¿Qué significa "reprogramar" un remanente, exactamente?** Candidatos, sin elegir por mi cuenta:
   - (a) Cambiar la fecha de entrega esperada de la `ObligacionPendiente` (un campo tipo `fechaProgramada`), sin tocar el `Pedido` original ni el `PlanDia`.
   - (b) Vincular la obligación pendiente a un `PlanDia` futuro específico (una fecha concreta ya planificada), reutilizando el mismo mecanismo de asignación que usa `OverridePlanUseCase` pero cruzando fechas.
   - (c) Ninguna estructura nueva — solo una señal/nota operativa ("para cuándo se espera resolver esto") sin integración real con el planificador, dejando la reprogramación real como una decisión manual fuera de sistema.
2. **¿Quién puede reprogramar?** ¿Mismos roles que ya gestionan pendientes (`GestionarPendienteUseCase`), o requiere una autorización distinta?
3. **¿La reprogramación de un remanente debe generar algún tipo de señal/notificación** (mismo patrón ya usado en F3 para cambios de ubicación — "señal, no bloqueo") **cuando la fecha nueva ya pasó, o cuando se acumulan reprogramaciones repetidas del mismo pendiente**? El Plan Maestro no lo especifica; no se inventa sin decisión del equipo.
4. **¿Aplica un límite** a cuántas veces se puede reprogramar el mismo remanente, o queda abierto (como el resto del sistema, que prefiere señal sobre bloqueo)?

---

## 4. Qué NO hace F4 (explícito, mismo criterio de scope que F1/F2/F3)

- No reconstruye `ObligacionPendiente`/`Actividad`/`ModoActividad`/G11 — ya existen y funcionan, solo falta activación (fuera de alcance de desarrollo).
- No modifica `ReplanUseCase` ni `OverridePlanUseCase` a nivel `PlanDia` — ya cumplen la regla de "decisión explícita, nunca automática".
- No inventa un campo/mecanismo de reprogramación de `ObligacionPendiente` sin que el equipo defina qué significa exactamente (§3).
- No mezcla la reprogramación de un remanente individual con la replanificación del `PlanDia` completo — son dos niveles distintos ya diferenciados por el propio código, no se fusionan sin decisión explícita.
