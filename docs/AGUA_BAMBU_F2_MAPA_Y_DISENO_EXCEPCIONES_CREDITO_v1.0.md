# AGUA BAMBÚ — F2: MAPA DE BRECHAS + DISEÑO TÉCNICO (EXCEPCIONES DE CRÉDITO)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Responde a:** "Arranca" — inicio de F2 sobre el baseline de `main` (`a53a03de`, F1 ya mergeado).
**Alcance de F2 (verbatim, Plan Maestro v1.0 §61):** *"F2 — Excepciones: entidad; permisos; flujo; concurrencia; revalidación; notificación."*
**Regla seguida:** consolidado en un solo documento (mapa + diseño) por eficiencia, siguiendo la preferencia explícita del equipo tras el cierre de F1 de no multiplicar gates. **Cero implementación todavía** — se presenta para aprobación antes de tocar código, mismo criterio usado en F1.

**No se reabre F1.** La Autoridad de Crédito (`GetFiadoStatusUseCase`) no se modifica — F2 la consume para revalidar, no la rediseña.

---

## 1. Mapa de brechas — qué ya existe y qué no

| Necesidad de F2 | Estado en `main` | Clasificación |
|---|---|---|
| Entidad `PedidoExcepcionCredito` | No existe. `PlanExcepcion` existe pero es del planificador de rutas — sin relación, no reutilizar por nombre. | BRECHA real |
| Permiso `AUTORIZAR_EXCEPCION_CREDITO` | `Permission` (`src/lib/permissions.ts`) es cerrado a `view:*` — no existe ningún permiso de acción. `User.rol` es el único campo de autorización hoy (un enum, sin grants por usuario). | BRECHA real |
| Actores (quién solicita, quién autoriza) | **Ya modelado** — `ADR-AUTORIZACION-REGALOS-001` (aceptado, congelado) define 3 niveles: Repartidor (registra hechos, no autoriza) / Oficina-administrador (crea, concilia) / Administrador-autorizador (autoriza excepciones, precios, cargos). No incluye hoy "excepción de crédito" en su lista de acciones críticas — es una extensión legítima de ese ADR, no una decisión nueva. | Extiende una DECISIÓN ya tomada |
| `Caso` no debe ser autorización financiera | **Ya resuelto en H0.x** (retiro de `FIADO_REcurrente`). F2 no debe reabrir esto ni construir la excepción como un tipo de `Caso`. | DECISIÓN previa, no se reabre |
| Concurrencia (dos autorizadores, primera transición gana) | **Patrón ya existe y está probado**: `ResolverResponsibilityCaseUseCase` (`ADR-RESPONSABILIDAD-001`) usa `withAdvisoryLock('SECUENCIA', 'responsibility', ...)` + idempotencia por estado (`deduped: true` si ya estaba resuelto) — mismo problema (autorización financiera infrecuente, de bajo volumen, no puede resolverse dos veces), misma solución ya validada con tests de concurrencia real. | Patrón reutilizable, no inventar uno nuevo |
| Revalidación antes de decidir | **La Autoridad de Crédito de F1 ya lo soporta**: `GetFiadoStatusUseCase.execute({clienteId, operacion, tx})` recalcula el estado actual (no un snapshot) cada vez que se llama. F2 la reutiliza para comparar "situación al solicitar" vs. "situación actual" (ALS §12, §15). | Ya disponible, sin cambios a F1 |
| Notificaciones (solicitud pendiente, resuelta) | **Sistema completo ya existe**: `NotificationEventType` (enum Prisma) → `NotificationRule` (roles/usuarios destinatarios, configurable) → `notifyEvent()` (fan-out fire-and-forget vía push). Faltan los 2 valores de enum nuevos (aditivo). | Infraestructura ya existe, falta el enum |
| Snapshot antes/después (ALS §10.1, §12) | Patrón ya usado en el codebase (`Caso`, `ResponsibilityCase`: `autorizadoPorId`/`autorizadoAt`, `resueltoPorId`/`resueltoAt`) — mismos nombres de campo que el propio ALS ya pide para `PedidoExcepcionCredito`. | Convención ya establecida, reutilizar nombres |

---

## 2. Entidad `PedidoExcepcionCredito` — campos (ya definidos por el ALS, no se inventan)

El ALS §10.1 ya especifica los campos mínimos — se usan tal cual, sin agregar ni quitar:

```text
id, pedidoId, clienteId, estado

motivoSolicitud, notaSolicitud, solicitadoPor, solicitadoAt

limiteSnapshot, fiadosAbiertosSnapshot, saldoFiadoSnapshot,
operacionSaldoSnapshot, fiadosDespuesSnapshot, saldoDespuesSnapshot

autorizadoPor, autorizadoAt, notaAutorizacion
rechazadoPor, rechazadoAt, notaRechazo

createdAt, updatedAt
```

`estado`: `PENDIENTE → AUTORIZADA` o `PENDIENTE → RECHAZADA` (ALS §13) — dos transiciones válidas únicas, nunca reversibles, nunca reutilizable (ALS §10.2).

**Nota sobre los snapshots monetarios**: con F1 ya implementado, `limiteSnapshot`/`fiadosAbiertosSnapshot`/`saldoFiadoSnapshot`/`operacionSaldoSnapshot` se llenan directamente desde el resultado de `GetFiadoStatusUseCase.execute()` en el momento de la solicitud (`limite`, `count`, `outstandingAmount`, `operationOutstanding`) — no hay que calcular nada nuevo, solo persistir el snapshot de lo que la autoridad ya devuelve. `fiadosDespuesSnapshot`/`saldoDespuesSnapshot` = `projectedOpenCount`/`projectedOutstandingAmount`, también ya calculados por la autoridad.

---

## 3. Permiso `AUTORIZAR_EXCEPCION_CREDITO` — decisión abierta, no resuelta por este documento

El Plan Maestro es explícito: *"Ser ADMIN no debe ser la única definición conceptual de autoridad"* (§11) — y el mockup del ALS muestra un checkbox **por usuario** en su ficha, no un toggle de rol. Esto apunta a granularidad por usuario, pero es una decisión real con dos caminos de costo distinto:

- **(a) Basado en rol** — extender `Permission` con `'action:autorizar_excepcion_credito'` y asignarlo en `ROLE_PERMISSIONS` a los roles que correspondan (ej. ADMIN, quizás CONTADOR). Cambio mínimo: cero schema, solo código. Contradice parcialmente el espíritu de "ADMIN no es la única definición" si se limita a ADMIN, pero es compatible si se asigna a más de un rol.
- **(b) Grant por usuario** — agregar `puedeAutorizarExcepcionCredito Boolean @default(false)` a `User` (una columna, migración aditiva mínima — no un sistema de permisos genérico nuevo). Coincide exactamente con el mockup del ALS (checkbox individual). Requiere UI en la ficha de usuario para activarlo/desactivarlo.

**No elijo por mi cuenta.** Propongo (b) por ser lo que el ALS muestra literalmente y lo que el Plan Maestro pide en espíritu, pero es una pieza de infraestructura real (columna nueva + UI de gestión) que corresponde confirmar antes de tocar el schema. Si el equipo prefiere (a) para F2 y deja (b) para una iteración posterior, es una opción igualmente válida y más barata.

**No se inventa nada más allá de esto** — sin montos máximos por autorizador, sin jerarquías monetarias (Plan Maestro §1, "PENDIENTES" explícito).

---

## 4. Flujo — reutilizando lo ya construido

```text
Sobre límite (Preview/Commit ya lo detectan hoy vía F1: status AT_LIMIT/OVER_LIMIT)
 ↓
[ Cobrar ahora ]  [ Solicitar excepción ]
 ↓
Crear PedidoExcepcionCredito(estado=PENDIENTE), snapshot desde GetFiadoStatusUseCase
 ↓
notifyEvent(EXCEPCION_CREDITO_SOLICITADA) → autorizadores elegibles (§3)
 ↓
Autorizador ve: snapshot al solicitar vs. GetFiadoStatusUseCase.execute() AHORA (revalidado, ALS §12/§15)
 ↓
[ Rechazar ]  [ Autorizar ]  ← primera transición válida gana (advisory lock, §5)
 ↓
notifyEvent(EXCEPCION_CREDITO_RESUELTA) → solicitante
```

**Qué hace la excepción autorizada, exactamente:** permite que ESA operación puntual (el `pedidoId` asociado) se cree/complete aunque `GetFiadoStatusUseCase` diga `errorDeuda` truthy — es un bypass de una sola vez, con auditoría completa, nunca un cambio a `limite`/`bloqueado` del cliente (ALS §10.2, principios #4/#5 del ALS: "excepción ≠ aumento de límite", "excepción ≠ permiso permanente"). Técnicamente: `CrearPedidoUseCase`/`venta-libre` necesitan un punto de entrada para decir "esta operación ya tiene una excepción autorizada, no vuelvas a bloquear por `errorDeuda`" — probablemente pasando el `excepcionId` como parte del input, que la autoridad o el caller verifican antes de lanzar `CLIENTE_DEBE`. Diseño exacto de ese enganche queda para la validación de este documento, no lo resuelvo en detalle acá para no invadir la implementación antes de la aprobación.

---

## 5. Concurrencia — mismo patrón de `ResolverResponsibilityCaseUseCase`, sin inventar uno nuevo

```ts
withAdvisoryLock('SECUENCIA', 'excepcion-credito', async (tx) => {
  const excepcion = await tx.pedidoExcepcionCredito.findUnique({ where: { id } })
  if (!excepcion) throw new Error('EXCEPCION_NOT_FOUND')

  // Idempotencia: ya resuelta → no reprocesar (ALS §13, "primera transición gana")
  if (excepcion.estado !== 'PENDIENTE') {
    return { deduped: true, estado: excepcion.estado, resueltoPor: excepcion.autorizadoPor ?? excepcion.rechazadoPor }
  }

  // ... aplicar AUTORIZADA o RECHAZADA, con revalidación de GetFiadoStatusUseCase antes de decidir
})
```

Mismo namespace de lock que `responsibility` (serialización global, bajo volumen, ya aceptado como suficiente para este tipo de decisión infrecuente en `ADR-RESPONSABILIDAD-001`). El mensaje de "segundo actor" (ALS §13: *"Solicitud ya resuelta por María"*) se arma con el `autorizadoPor`/`rechazadoPor` ya persistido — mismo patrón que `ResponsibilityCase`.

---

## 6. Notificaciones — 2 valores de enum nuevos, aditivo

```prisma
enum NotificationEventType {
  // ...existentes, sin tocar...
  EXCEPCION_CREDITO_SOLICITADA
  EXCEPCION_CREDITO_RESUELTA
}
```

Requiere migración (aditiva, sin downtime — agregar valores a un enum de Postgres). El resto del pipeline (`NotificationRule`, `resolveRecipients`, `notifyEvent`) no cambia — F2 solo necesita configurar la regla de destinatarios para estos 2 eventos (quién recibe `EXCEPCION_CREDITO_SOLICITADA` depende de §3, los autorizadores elegibles).

---

## 7. Qué NO hace F2 (explícito, para no repetir el patrón de scope creep que ya se evitó en F1)

- No modifica `GetFiadoStatusUseCase` ni ninguna regla de F1 — la consume tal cual.
- No fija SLA de demora concreto (Plan Maestro: "PENDIENTE de negocio", no se inventa).
- No fija montos máximos por autorizador ni jerarquías monetarias (Plan Maestro: explícitamente "no inventar").
- No construye escalamiento por demora todavía si el SLA no está definido (ALS §14 depende de un SLA que no existe).
- No toca `Caso`, `ResponsibilityCase`, ni el trabajo de H0.x sobre `cliente.bloqueado`.
- No decide el permiso por su cuenta (§3) — queda explícito como pregunta.

---

## 8. Qué necesito confirmado antes de implementar

1. **Permiso**: ¿(a) basado en rol o (b) grant por usuario (columna nueva en `User`)? (§3)
2. **Enganche del bypass**: ¿el `excepcionId` autorizado se pasa como parte del input de `CrearPedidoUseCase`/`venta-libre`/`PreviewPedidoUseCase`, o se resuelve de otra forma? Quiero validar el approach antes de tocar los 3 consumidores de F1 otra vez.
3. **Autorizadores elegibles para notificación**: ¿todos los que tengan el permiso reciben `EXCEPCION_CREDITO_SOLICITADA`, o hay alguna regla de asignación (como `asignadoAId` en `Caso`)?
4. **¿Migración de schema ahora o en un commit separado dentro de la misma fase?** (entidad + enum de notificación) — dado que "no se toca el schema sin necesidad" es un criterio que se ha respetado en toda la sesión.

Con esto validado, sigo con el mismo ciclo de F1: cambio mínimo, pruebas (unitarias + integración real, incluyendo concurrencia de dos autorizadores), y cierre con evidencia antes de PR.
