# AGUA BAMBÚ — F1: CIERRE Y VERIFICACIÓN

**Versión:** 1.0
**Fecha:** 2026-09-13
**Responde a:** implementación de F1 aprobada por el equipo (`docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md`), con el criterio de cierre pedido explícitamente: *"¿Preview, Commit y Venta Libre están utilizando efectivamente la misma autoridad de crédito y ya no contienen una segunda implementación de la consulta/decisión?"*
**Rama:** `fix/integridad-comercial-credito-gates-h0`, commits `8001ad8e`, `daeb52d2`, `d19d65c1`, `b0e1479f` (además de los commits previos de H0.x, sin mergear a `main`).

---

## 1. Respuesta directa a la pregunta de cierre

**Sí.** Los tres consumidores llaman a la misma clase (`GetFiadoStatusUseCase`) para la consulta de pedidos pendientes y la decisión de crédito. Ninguno de los tres contiene ya su propia reimplementación. Evidencia verificada con tests (no solo revisión manual):

`src/modules/pedidos/__tests__/f1-autoridad-credito-unica.test.ts` (6 tests, todos en verde) prueba, con lectura de código fuente:

- Los 3 invocan `GetFiadoStatusUseCase.execute()` — Preview y Commit vía dependencia inyectada, Venta Libre instanciándola directo (decisión explícita del equipo, ver diseño técnico §11.3).
- Ninguno de los 3 contiene ya un `findMany`/`findPendingByCliente` propio para pedidos pendientes.
- Ninguno de los 3 contiene ya una llamada a `puedeCrearPedido(` — solo existe dentro de la autoridad y en el dominio.
- Ninguno de los 3 resuelve el límite de fiados por su cuenta (`resolverLimiteFiados`) — solo la autoridad.
- La autoridad expone `outstandingAmount`/`projectedOutstandingAmount` (exposición monetaria, cumpliendo el objetivo #2 de F1).
- Ningún archivo (ni los 3 consumidores ni la autoridad) compara `outstandingAmount`/`projectedOutstandingAmount` contra un umbral — confirma que no se inventó una política de bloqueo monetaria.

Este test falla si alguien, en el futuro, reintroduce una reimplementación en cualquiera de los 3 lugares — es la garantía estructural que el equipo pidió, no una comprobación puntual.

---

## 2. Qué cambió, por consumidor

| Consumidor | Antes | Ahora |
|---|---|---|
| **Preview** (`PreviewPedidoUseCase.ts`) | Chequeo inline de `bloqueado` + `GetFiadoStatusUseCase.execute({clienteId})` usado solo para el conteo (sin `operacion`, sin exposición monetaria) | Una llamada a `getFiadoStatusUseCase.execute({clienteId, operacion:{total,totalPagado}})`; usa `errorDeuda` como única fuente de la decisión |
| **Commit** (`CrearPedidoUseCase.ts`) | `pedidoRepo.findPendingByCliente` + `puedeCrearPedido` inline, con `tx.config.findUnique` a mano | Misma llamada que Preview, con `tx` reenviado a la autoridad para correr dentro de la transacción con lock |
| **Venta Libre** (`venta-libre/route.ts`) | `tx.pedido.findMany` (query duplicada, no solo la decisión) + `resolverLimiteFiados`/`puedeCrearPedido` sueltos | Misma llamada que Preview/Commit, autoridad instanciada directo (fuera del composition root DDD, por decisión explícita del equipo) |

Lo que **no** cambió en ninguno de los 3 (verificado, no solo declarado):
- El criterio de bloqueo sigue siendo `pedidosPendientes.length >= limite` (conteo), sin ningún umbral monetario.
- `cliente.bloqueado` sigue bloqueando exactamente igual.
- El guard "solo bloquea si la operación deja saldo pendiente" (`totalPagado < total` / `operationOutstanding > 0`) — mismo comportamiento, ahora vive dentro de la autoridad en vez de repetido en cada consumidor.
- `puedeFiar` en Venta Libre (exige pago completo a clientes no verificados/anónimos) no se tocó — no era parte de la duplicación que F1 debía resolver.
- Nada de F2 (excepciones, permisos, SLA, notificaciones) se construyó.

---

## 3. Resultado de las pruebas

### Suite unitaria (`npx vitest run`)
```
Test Files  330 passed (330)
     Tests  3276 passed (3276)
```
Incluye: 10 tests nuevos de la autoridad (`GetFiadoStatusUseCase.test.ts` — exposición monetaria, proyección, `status` OK/AT_LIMIT/OVER_LIMIT/NOT_APPLICABLE, `errorDeuda` solo cuando corresponde, reenvío de `tx`), 6 tests nuevos de autoridad única (`f1-autoridad-credito-unica.test.ts`), y todos los tests preexistentes de Preview/Commit/venta-libre pasando sin cambiar su intención original (solo se actualizaron fixtures/mocks al nuevo contrato de `FiadoStatus`, y se reescribió `fiado-limite-solo-si-queda-saldo.test.ts` para verificar delegación en vez de un patrón de texto que ya no existe).

### Suite de integración contra Postgres real (`npm run test:integration`)
```
Test Files  50 passed (50)
     Tests  258 passed (258)
```
Incluye `preview-pedido-integridad.test.ts`, que compara campo por campo lo que Preview proyecta contra lo que Commit efectivamente persiste — pasa sin modificar su lógica de comparación, solo su construcción de dependencias (nueva dependencia inyectada). Este test corrió contra una base de datos real, no mocks — es la verificación más fuerte disponible de que Preview y Commit coinciden en la práctica, no solo en el mock.

### Type-check y lint
`npx tsc --noEmit` y `npx eslint` limpios sobre todos los archivos tocados.

---

## 4. Lo que quedó fuera, a propósito (no es pendiente olvidado)

- **`ActualizarPedidoUseCase`** (edición real vía `PUT /api/pedidos/[id]`) sigue sin validar crédito en absoluto — discrepancia preexistente, documentada desde el fix de Preview/Commit anterior a F1, no tocada acá porque no es parte de los 3 objetivos de F1 y no se pidió resolverla.
- **Instanciación directa en Venta Libre** en vez de una fábrica — decisión explícita del equipo ("no crear una factory solo por estética"), documentada en el diseño técnico §11.3 y repetida en el mensaje de aprobación.
- **Exponer los montos en la UI de Preview** (mostrar "exposición actual / nueva operación / exposición resultante / exceso / decisión" al usuario) — el contrato de datos ya lo permite (`outstandingAmount` etc. están en el resultado), pero la presentación visual es trabajo de UI/UX separado, tal como el equipo lo indicó explícitamente en su aprobación del diseño ("separar responsabilidad, pero no perder el dato").
- **Migración de B/C/D** (`cliente.bloqueado`, gates H0.5-H0.8) — trabajo distinto, ya cerrado como puente hacia F1 en su propio documento, no se reabre ni se mezcla acá.

---

## 5. Qué falta para que F1 esté en `main`

Nada de código — F1 está implementado, probado (unitario + integración real) y comiteado en la rama. Lo que falta es el mismo pendiente que arrastra toda esta serie de trabajo desde H0.7: **formalizar en git** (la rama existe, no se ha abierto PR ni se ha mergeado nada a `main` todavía). Antes de avanzar a F2, sugiero que el equipo confirme si este es el momento de abrir el PR de esta rama (que incluye H0.5-H0.8 + convergencia + F1 completo) o si prefieren separarlo en PRs más chicos ahora que F1 está cerrado y es un punto de corte natural.
