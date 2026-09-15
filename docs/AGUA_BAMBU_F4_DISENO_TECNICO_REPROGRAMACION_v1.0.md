# AGUA BAMBÚ — F4: DISEÑO TÉCNICO (REPROGRAMACIÓN DE REMANENTE)

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** decisiones finales del equipo sobre las 4 preguntas de `docs/AGUA_BAMBU_F4_MAPA_BRECHAS_CUMPLIMIENTO_v1.0.md` §3. Cierre de producto confirmado — "pueden cerrar el diseño de F4 y comenzar la implementación. No necesitamos crear otro gate previo."

**Alcance cerrado de F4**: 3 de 4 bullets (parcial, remanente, PUNTO/N2/DOMICILIO) ya existen — ver §1 para el cierre formal ESTADO TÉCNICO / VERIFICACIÓN / ACTIVACIÓN que pidió el equipo. Este documento cubre lo que sí se construye: **reprogramación** de una `ObligacionPendiente` (remanente) individual.

---

## 1. Cierre de los 3 bullets ya existentes — ESTADO TÉCNICO vs ACTIVACIÓN vs VERIFICACIÓN

El equipo pidió explícitamente no dar esto por "cerrado" solo porque el código existe. Evidencia fresca, no memoria:

| | Parcial | Remanente | PUNTO/N2/DOMICILIO |
|---|---|---|---|
| **ESTADO TÉCNICO** | `ObligacionPendiente`/`Actividad` (`schema.prisma:1264,1288`), `GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase`, `AjustarPedidoCantidadUseCase` | Mismo bloque — `cantidadDisponible` derivada, nunca crea Pedido nuevo | Enum `ModoActividad` (`schema.prisma:155-158`), escritura exclusiva vía los casos de uso de arriba |
| **VERIFICACIÓN** | `gestionar-pendiente-integridad.test.ts` — **corrido de nuevo hoy, 9/9 verde** contra Postgres real | `liberar-actividad-integridad.test.ts` — **corrido de nuevo hoy, 7/7 verde** | `cambiar-modo-actividad-integridad.test.ts` — **corrido de nuevo hoy, 5/5 verde** |
| **ACTIVACIÓN** | **BRECHA — pendiente.** `src/app/(app)/pedidos/page.tsx` no importa `pedido-hub/`; los únicos consumidores de estos endpoints (`use-gestion-pendiente.ts`, `actividad-acciones.tsx`, `pedido-exception-panel.tsx`) viven exclusivamente en el Hub V2. Depende del soak de Fase 10 — **no se toca el mecanismo de soak para cerrar F4**, tal como pidió el equipo. |

**Conclusión formal**: los 3 bullets están **implementados y verificados**; la única brecha real que queda es de **activación** (una condición externa, no una tarea de desarrollo). Se documenta así, no como "desarrollo pendiente".

---

## 2. Reprogramación — decisiones del equipo (verbatim, no reinterpretadas)

```text
PEDIDO ORIGINAL
     ↓
REMANENTE
     ↓
fecha prevista actual
     ↓
REPROGRAMAR
     ↓
nueva fecha prevista
```

- Reprogramar = cambiar la fecha objetivo del remanente. **Mismo Pedido, misma `ObligacionPendiente`** — nunca crea un Pedido nuevo, nunca crea otra `ObligacionPendiente`.
- No asigna automáticamente a una ruta/plan futuro — eso es responsabilidad posterior del Planificador (`REMANENTE → DEMANDA → PLANIFICADOR → PLAN/RUTA FUTURA`), fuera de este caso de uso.
- Permisos: reutilizar los mismos que ya gestionan pendientes (`ADMIN`/`ASISTENTE`, mismo rol que `CambiarModoActividadUseCase` — `src/app/api/actividades/[id]/cambiar-modo/route.ts:29`). No se crea un nivel de autorización nuevo.
- Auditoría obligatoria: quién, cuándo, fecha anterior, fecha nueva, motivo (cuando corresponda).
- Avisos: **señales, nunca bloqueos**. (a) fecha nueva ya vencida → visible, requiere revisión. (b) reprogramaciones repetidas → puede generar señal de revisión. Nunca una conclusión automática de fraude/responsabilidad.
- Sin límite de reprogramaciones — visibilidad creciente, no bloqueo.
- No modifica silenciosamente un plan ya confirmado (F3 ya estableció esta misma regla para cambios de ubicación — aquí aplica igual, por inacción: este caso de uso no toca `PlanDia`/`ReplanUseCase`/`OverridePlanUseCase` en absoluto).
- `Pedido` entregado no puede tratarse como remanente pendiente mediante una reprogramación normal.

## 3. Diseño técnico

### 3.1 Schema

```prisma
model ObligacionPendiente {
  // ...existente...
  fechaObjetivo DateTime? @db.Timestamptz() // NUEVO: fecha prevista de cumplimiento, mutable vía reprogramación
  reprogramaciones ObligacionPendienteReprogramacion[] // NUEVO
}

model ObligacionPendienteReprogramacion {
  id             String              @id @default(cuid())
  obligacionId   String
  obligacion     ObligacionPendiente @relation(fields: [obligacionId], references: [id], onDelete: Cascade)
  fechaAnterior  DateTime?           @db.Timestamptz() // null si es la primera vez que se fija una fecha objetivo
  fechaNueva     DateTime            @db.Timestamptz()
  motivo         String?
  reprogramadoPorId String
  reprogramadoPor   User             @relation(fields: [reprogramadoPorId], references: [id])
  reprogramadoAt    DateTime         @default(now()) @db.Timestamptz()

  offlineId String? @unique // idempotencia offline-first, mismo patrón del resto del sistema

  @@index([obligacionId])
}
```

Append-only, sin `revisadoAt`/estado de "atendida" — a diferencia de `PedidoImpactoUbicacion` (F3), acá no hace falta un flujo de "marcar como visto": la señal de revisión (§3.3) se deriva en vivo de `fechaObjetivo` y del conteo de filas, no de un estado persistido propio.

### 3.2 `ReprogramarObligacionPendienteUseCase` — autoridad única

```ts
interface ReprogramarObligacionPendienteInput {
  obligacionId: string
  fechaNueva: Date
  actorId: string
  motivo?: string
  offlineId?: string
}
interface ReprogramarObligacionPendienteResult {
  obligacionId: string
  fechaAnterior: Date | null
  fechaNueva: Date
  vecesReprogramada: number   // informativo — cuenta TOTAL tras esta reprogramación
  fechaVencida: boolean       // informativo — fechaNueva < ahora
  deduped: boolean
}
```

Lock `OBLIGACION:{obligacionId}` (mismo namespace y mismo agregado que `CambiarModoActividadUseCase` — reutilizado, no inventado; garantiza "primera transición gana" para la concurrencia, criterio de prueba 9).

1. Dedup por `offlineId` DENTRO del lock (mismo patrón que `GestionarPendienteUseCase`).
2. Leer `ObligacionPendiente`. Si no existe → `OBLIGACION_NOT_FOUND`.
3. **Guard de estado** (criterio de prueba 8): si `estado !== 'ABIERTA'` (es decir, `CUMPLIDA` o `ANULADA`) → `OBLIGACION_NO_REPROGRAMABLE`. Un remanente ya cumplido/anulado no es "pendiente".
4. Crear la fila de historial (`fechaAnterior` = `obligacion.fechaObjetivo` actual, `fechaNueva` = input).
5. Actualizar `ObligacionPendiente.fechaObjetivo = fechaNueva` — **única mutación sobre la obligación**; no toca `cantidadOriginal`/`cantidadCumplida`/`cantidadAsignada`/`estado`, no toca el `Pedido`, no toca ninguna `Actividad`.
6. `logAudit` con actor/fecha anterior/fecha nueva/motivo (criterio de auditoría del equipo).
7. Calcular `vecesReprogramada` (count de la relación) y `fechaVencida` (`fechaNueva < new Date()`) — **informativos, nunca bloquean la operación**.

Nunca importa ni llama nada de `src/modules/planificador/` — mismo criterio de scope ya verificado por test en F3.

### 3.3 Señales — computadas en vivo, no persistidas

- **Fecha vencida**: `ObligacionPendiente.fechaObjetivo < ahora` — se puede calcular en cualquier lectura (endpoint de detalle, peek futuro) sin tabla adicional.
- **Reprogramaciones repetidas**: `count(ObligacionPendienteReprogramacion WHERE obligacionId = X)` — mismo criterio, sin umbral numérico fijo (el equipo explícitamente no quiere un límite ni una regla "N reprogramaciones = X"). El **número crudo** se expone en la respuesta del endpoint; **la interpretación de "cuándo es anómalo" queda para una capa de presentación futura (UI), no se decide en este backend** — evita inventar un umbral que el equipo no pidió.

## 4. Endpoint

`POST /api/obligaciones/[id]/reprogramar` (mismo patrón thin-controller y mismo verbo que `POST /api/obligaciones/[id]/asignar`, `POST /api/actividades/[id]/cambiar-modo`, `POST /api/actividades/[id]/liberar`):
- `requireRole([ROLES.ADMIN, ROLES.ASISTENTE])` — mismos permisos que el resto de gestión de pendientes, sin nivel nuevo.
- Body: `{ fechaNueva: string (ISO), motivo?: string, offlineId?: string }`.
- Errores: `OBLIGACION_NOT_FOUND` → 404, `OBLIGACION_NO_REPROGRAMABLE` → 409.

## 5. Pruebas mínimas exigidas por el equipo (verbatim, mapeadas a tests concretos)

1. Reprogramar remanente → mismo Pedido, nueva fecha. — Integración: `ObligacionPendiente.pedidoId` sin cambios, `fechaObjetivo` actualizada.
2. No crea Pedido nuevo. — Integración: conteo de `Pedido` antes/después idéntico.
3. Conserva historial de fecha anterior. — Integración: `ObligacionPendienteReprogramacion` con `fechaAnterior`/`fechaNueva` correctos; dos reprogramaciones seguidas dejan dos filas, nunca se pisan.
4. No altera un snapshot histórico indebidamente. — Integración: `Pedido.direccionEntrega`/`barrioEntrega`/`total`/`totalPagado` sin cambios.
5. No modifica automáticamente una ruta/plan confirmado. — Test de ausencia (igual que F3 criterio 4): el use case no importa nada de `planificador/`.
6. Reprogramación repetida → señal (conteo), no bloqueo. — Integración: 3 reprogramaciones seguidas del mismo remanente, las 3 exitosas, `vecesReprogramada` sube 1/2/3.
7. Fecha reprogramada vencida → señal de revisión. — Integración/unit: `fechaNueva` en el pasado → `fechaVencida: true` en la respuesta, la operación igual se aplica (no bloquea).
8. Pedido entregado no puede tratarse como remanente pendiente vía reprogramación normal. — Integración: `ObligacionPendiente.estado = 'CUMPLIDA'` (o `'ANULADA'`) → `OBLIGACION_NO_REPROGRAMABLE`.
9. Concurrencia: dos reprogramaciones simultáneas → no producen dos estados finales inconsistentes. — Integración: dos llamadas paralelas con fechas distintas → ambas se serializan por el lock `OBLIGACION:{id}`, ambas se aplican en orden (dos filas de historial, `fechaObjetivo` final = la que ganó la carrera por el lock, sin corrupción de datos ni doble-conteo).

## 6. Qué NO hace F4 (explícito)

- No toca `PlanDia`/`ReplanUseCase`/`OverridePlanUseCase`.
- No inventa un umbral de "cuántas reprogramaciones son demasiadas" — expone el número, no interpreta.
- No inventa una jerarquía de autorización nueva — reutiliza `ADMIN`/`ASISTENTE`.
- No construye UI — backend + endpoint, mismo precedente que F1/F2/F3.
- No modifica el mecanismo de soak de Fase 10 para "cerrar" F4 antes de tiempo.
