# AGUA BAMBÚ — F3: MAPA DE BRECHAS (DIRECCIÓN Y DEMANDA)

**Versión:** 1.0
**Fecha:** 2026-09-14
**Responde a:** "Continúa con la siguiente fase" — inicio de F3 sobre el baseline de `main` (`fcbed5bd`, F2 ya mergeado).
**Alcance de F3 (verbatim, Plan Maestro v1.0 §61 — único texto usado):** *"F3 — Dirección y demanda: dirección/link; barrio canónico; snapshots; impacto en demanda."*
**Regla seguida:** solo mapeo y evidencia (archivo:línea). **Cero implementación en este documento.** No se inventa ningún alcance donde el Plan Maestro no lo define — se marca como PENDIENTE de decisión, igual que se hizo en F1/F2.

**No se reabre F1 ni F2.** No se toca `GetFiadoStatusUseCase` ni `PedidoExcepcionCredito`.

**Advertencia de nombres:** existe una iniciativa **distinta y no relacionada** con este Plan Maestro llamada "ALS Barrio/Zona", cuya Fase 1 también se llama "F1" (commit `22fcfdb5`, PR #248, "Barrio canónico F1 — identidad territorial para Cliente/Negocio"). Es una coincidencia de nombre — esa F1 no es la F1 de Integridad Comercial (Autoridad de Crédito). Este documento usa su resultado como insumo (ya existe un catálogo `Barrio`), pero no asume que esa iniciativa "cierra" el bullet "barrio canónico" de F3 sin verificar el alcance real, ver §2.

---

## 1. Mapa de brechas — qué ya existe y qué no

| Bullet de F3 | Estado en `main` | Clasificación |
|---|---|---|
| Dirección/link | `resolverEntrega()` (`src/modules/pedidos/domain/services/entrega-suficiencia.service.ts:99-159`) es la autoridad única (Preview y Commit comparten la misma llamada) para dirección/barrio/referencia/link/coords — texto vía override→negocio→cliente, `linkUbicacion` con prioridad negocio>cliente, coords vía `pickCoords` (`src/lib/geo/pedido-coords.ts:46-48`). La expansión de links cortos de Maps (`maps.app.goo.gl`) vive en `src/lib/geo/resolver-coords-de-link.ts:21-42` (allowlist SSRF, tope de redirects, timeout), invocada server-side antes del lock y pasada como dato ya resuelto a la función pura. | **YA EXISTE — no reconstruir** |
| Barrio canónico | `Cliente.barrioId`/`Negocio.barrioId` (`schema.prisma:372-374`, `509-514`) ya vinculan al catálogo `Barrio`, con dual-write al string legacy `barrio` en `src/app/api/clientes/route.ts:74-83,120-123`. **Pero `Pedido` no tiene `barrioId` ni relación al catálogo** (`schema.prisma` solo lo menciona como fase futura en un comentario, línea 568) — el Pedido solo persiste `barrioEntrega String?` (texto libre, línea 824), sin ningún vínculo al catálogo canónico. | **BRECHA REAL** (parcial: existe para Cliente/Negocio, no para Pedido) |
| Snapshots | `direccionEntrega`/`barrioEntrega` (`schema.prisma:823-824`) cubren los 3 casos relevantes: creación normal (`CrearPedidoUseCase.ts:163-187`, solo snapshotea si difiere de la resolución en vivo), pedido hijo de entrega parcial (`Pedido.crearPedidoHijo()`, `entities/Pedido.ts:337-361`, hereda explícitamente del padre — fix histórico BAMBU-LOG-004), y edición (`ActualizarPedidoUseCase.ts:199-224`, preserva por defecto, recalcula solo si el body lo pide explícitamente). | **YA EXISTE — no reconstruir** |
| Impacto en demanda | Sin resultados: no existe ninguna lógica que reaccione a un cambio de dirección/barrio de Cliente/Negocio sobre los pedidos **pendientes** que ya tienen esa dirección snapshoteada. `updateDireccion` (`PrismaClienteRepository.ts:92-115`, disparado desde el checkbox "actualizar cliente" del formulario de Pedido) audita el cambio (`logAudit`) pero no dispara recálculo ni señal sobre pedidos existentes. `pedidoOrigenId`/G11 ("Nueva Demanda", `schema.prisma:765-766`) es un concepto ortogonal — trata corrección-vs-nueva-demanda de **cantidades**, `docs/pedidos/fase6-g11-flujo-plan.md` no menciona dirección en ningún punto. | **BRECHA REAL — vacío total, no parcial** |

### Hallazgo adyacente (no es uno de los 4 bullets, pero es parte del mismo territorio de "barrio canónico")

`updateDireccion` (`PrismaClienteRepository.ts:92-115`) — el único punto de edición de dirección que se dispara **desde Pedidos** (checkbox "actualizar cliente" del form) — escribe `direccion`/`barrio` (string legacy) pero **no** `barrioId`, a diferencia del `PUT /api/clientes/[id]` dedicado, que sí resuelve/sincroniza el catálogo. Esto significa que el catálogo canónico de un Cliente puede desincronizarse silenciosamente del string legacy si la dirección se edita desde el flujo de Pedidos en vez del formulario de Cliente. Es una brecha de integridad real dentro del territorio que F3 ya toca — se señala acá para no perderla, no se resuelve en este documento sin decisión del equipo (ver §2).

---

## 2. Qué necesito confirmado antes de implementar (no elijo por mi cuenta)

**(1) "Barrio canónico" en el Pedido — ¿qué significa exactamente para F3?**
Dos caminos de costo distinto, ninguno inventado por mí — ambos legítimos:
- **(a) Solo integridad de sincronización**: arreglar `updateDireccion` para que también resuelva/sincronice `barrioId` del Cliente (mismo patrón que ya usa `/api/clientes/route.ts`), sin tocar `Pedido` en absoluto. Cambio pequeño, cierra el hallazgo adyacente.
- **(b) Vínculo directo Pedido→Barrio**: agregar `Pedido.barrioId` (FK opcional al catálogo, junto al snapshot de texto existente), resuelto al momento de crear el Pedido — permitiría reportería/planificador consistentes por barrio canónico en vez de string libre. Es lo que el commit `22fcfdb5` marcó explícitamente como "fase futura", así que F3 podría ser exactamente esa fase futura — pero es una pieza de infraestructura real (migración + wiring en `CrearPedidoUseCase`/`ActualizarPedidoUseCase`), no una casilla de config.

No elijo (a), (b), o ambas por mi cuenta — igual que F2 con el permiso, dejo la decisión al equipo.

**(2) "Impacto en demanda" — ¿qué impacto, exactamente?**
El bullet no especifica una regla concreta y no hay ningún prior en el código para inferirla (a diferencia de F1/F2, donde la "revalidación" y la "concurrencia" ya tenían un patrón implementado en otro dominio para reutilizar). Necesito que el equipo defina, con al menos una de estas preguntas resuelta, antes de diseñar:
- ¿Cuándo el Cliente/Negocio de un pedido **pendiente** (no entregado) cambia de dirección/barrio, se espera una **señal** (patrón ya usado: RiskSignals/GUIA_ALERTAS, "señal ≠ bloqueo ≠ autorización") de que el snapshot del pedido quedó desactualizado? ¿O se espera algo más fuerte (bloqueo, re-confirmación obligatoria)?
- ¿Aplica solo a pedidos en estado `PENDIENTE`/`EN_RUTA` (con entrega física todavía por ocurrir), o también a pedidos ya `ENTREGADO` (donde el snapshot es histórico, no operativo, y "actualizarlo" violaría el principio de auditoría de F1-F8 §63: "hechos históricos conservados")?
- ¿"Demanda" acá se refiere a pedidos individuales, o a la proyección de recurrentes (`PlantillaRecurrente`) — es decir, si el barrio/dirección de un cliente con recurrentes activos cambia, ¿debería afectar cómo se genera la próxima instancia recurrente?

**(3) El hallazgo adyacente de `updateDireccion` sin `barrioId`** — ¿se corrige como parte de F3, o se trata como un bug fuera de fase (corrección de bajo riesgo, sin esperar el resto de F3)? Dado que es un fix acotado y no requiere ninguna de las decisiones de producto de arriba, podría entrar como su propio PR pequeño independientemente de cuándo se cierren (1) y (2).

---

## 3. Qué NO hace F3 (explícito, mismo criterio de scope que F1/F2)

- No modifica `resolverEntrega()`, `pickCoords`, ni la resolución de links — ya están correctos, se consumen tal cual.
- No modifica los snapshots `direccionEntrega`/`barrioEntrega` existentes — ya cubren los 3 casos relevantes.
- No toca `GetFiadoStatusUseCase`, `PedidoExcepcionCredito`, ni nada de F1/F2.
- No inventa una regla de "impacto en demanda" sin que el equipo la defina — el bullet no trae una regla implícita en ningún ADR o doc existente, a diferencia de F1/F2.
- No decide entre (a)/(b) del punto 1 de §2 por su cuenta.

---

## 4. Con esto validado

Sigo el mismo ciclo de F1/F2: cambio mínimo, pruebas (unitarias + integración real), y cierre con evidencia antes de PR — una vez el equipo resuelva las 3 preguntas de §2.
