# AGUA BAMBÚ — F1: CIERRE Y VERIFICACIÓN

**Versión:** 1.1
**Fecha:** 2026-09-13 (revisión el mismo día: evidencia de ejecución + acoplamiento `unstable_cache`, pedidas por el equipo tras revisar v1.0)
**Responde a:** implementación de F1 aprobada por el equipo (`docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md`), con el criterio de cierre pedido explícitamente: *"¿Preview, Commit y Venta Libre están utilizando efectivamente la misma autoridad de crédito y ya no contienen una segunda implementación de la consulta/decisión?"*
**Rama:** `fix/integridad-comercial-credito-gates-h0`, commits `8001ad8e`, `daeb52d2`, `d19d65c1`, `b0e1479f`, `8ae1d040` + revisión de esta versión (además de los commits previos de H0.x, sin mergear a `main`).

**Precisión del equipo incorporada:** el test de lectura de código fuente (§1) es una buena protección contra regresiones, pero no debe ser la única evidencia. Este documento agrega §1bis con evidencia de **ejecución real** (mocks invocados con argumentos verificados, y — lo más fuerte — 258 tests de integración contra Postgres real) y §6 documentando el acoplamiento con `unstable_cache` de Next.js encontrado durante la implementación.

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

## 1bis. Evidencia de ejecución (no solo lectura de código), por consumidor

El equipo pidió explícitamente que el test de fuente **no sea la única evidencia**. Cada consumidor tiene una capa de prueba distinta que demuestra la dependencia real de la autoridad en tiempo de ejecución, no solo en el texto del archivo:

### Preview → Autoridad (mock invocado con los argumentos reales)

`PreviewPedidoUseCase.test.ts` mockea `deps.getFiadoStatusUseCase.execute` y controla su valor de retorno — el resultado de Preview (`canCreate`, `warnings`) depende **enteramente** de lo que ese mock devuelve, nunca de lógica propia de Preview. Ejemplo concreto (test `FIX preview-commit-credito: fiado sobre el límite pero pedido pagado de contado`):

```ts
expect(deps.getFiadoStatusUseCase.execute).toHaveBeenCalledWith(
  expect.objectContaining({ clienteId: 'c1', operacion: { total: 27000, totalPagado: 27000 } }),
)
```

Esto prueba, en ejecución, que Preview invoca la autoridad con la operación real evaluada — no una condición propia.

### Commit → Autoridad (ejecución real, sin mock — la autoridad completa corre de verdad)

`GetFiadoStatusUseCase.test.ts` (10 tests) ejecuta la lógica REAL de la autoridad (solo los repos están mockeados, no la clase). Y más fuerte todavía: los **50 archivos / 258 tests de integración contra Postgres real** (`npm run test:integration`) ejecutan `CrearPedidoUseCase` completo, incluyendo la llamada real a `GetFiadoStatusUseCase.execute()` dentro de la transacción real. Evidencia directa de que esto no es teórico: al implementar F1, 5 de esos archivos **fallaron con el stack trace exacto** mostrando la ejecución real atravesando la autoridad:

```text
❯ GetFiadoStatusUseCase.execute src/modules/pedidos/application/use-cases/GetFiadoStatusUseCase.ts:70:7
❯ src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts:276:27
```

Esa falla (que llevó al fix de `unstable_cache`, ver §6) es, en sí misma, la prueba de que Commit ejecuta la autoridad real — no se puede fallar dentro de código que nunca se ejecuta.

**Nuevo — caso de crédito real, no solo totales:** `preview-pedido-integridad.test.ts` comparaba antes solo totales/estados (test b), sin un escenario donde la autoridad realmente bloquee. Se agregó el test **(d)**, contra Postgres real: crea un cliente con `limitePedidosFiados: 1`, le crea un primer fiado real (vía `CrearPedidoUseCase`, venta rápida entregada sin pago), y luego verifica que **Preview y Commit coinciden en rechazar la misma segunda operación**:

```ts
const preview = await makePreviewUseCase().execute(inputSegundo)
expect(preview.permissions.canCreate).toBe(false)
expect(preview.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(true)

await expect(makeCrearUseCase().execute({ ...inputSegundo, offlineId: ... }))
  .rejects.toThrow(/CLIENTE_DEBE/)
```

Este test pasa contra una base de datos real — es la evidencia más fuerte disponible de que Preview y Commit no solo "coinciden hoy por casualidad", sino que ejecutan la misma decisión de crédito sobre el mismo estado real.

### Venta Libre → Autoridad (ejecución real, no mockeada, dentro del test unitario de la ruta)

A diferencia de lo que podría asumirse, `venta-libre/__tests__/route.test.ts` **no mockea `GetFiadoStatusUseCase`** — solo mockea la capa de datos (`@/lib/prisma`, `@/lib/locks`). La clase real se instancia y ejecuta su lógica real (incluyendo `puedeCrearPedido` real) en cada uno de los 16 tests de esa ruta. Esto es ejecución real de la autoridad, no un stub que finge el comportamiento.

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
     Tests  259 passed (259)
```
Incluye `preview-pedido-integridad.test.ts` (4 tests, antes 3): compara campo por campo lo que Preview proyecta contra lo que Commit efectivamente persiste (totales, estados, items — test b, sin cambios), y ahora además compara explícitamente la **decisión de crédito** en un escenario real de cliente en el límite (test d, nuevo — ver §1bis). Corre contra una base de datos real, no mocks — es la verificación más fuerte disponible de que Preview y Commit coinciden en la práctica, no solo en el mock.

### Type-check y lint
`npx tsc --noEmit` y `npx eslint` limpios sobre todos los archivos tocados.

---

## 4. Lo que quedó fuera, a propósito (no es pendiente olvidado)

- **`ActualizarPedidoUseCase`** (edición real vía `PUT /api/pedidos/[id]`) sigue sin validar crédito en absoluto — discrepancia preexistente, documentada desde el fix de Preview/Commit anterior a F1, no tocada acá porque no es parte de los 3 objetivos de F1 y no se pidió resolverla.
- **Instanciación directa en Venta Libre** en vez de una fábrica — decisión explícita del equipo ("no crear una factory solo por estética"), documentada en el diseño técnico §11.3 y repetida en el mensaje de aprobación.
- **Exponer los montos en la UI de Preview** (mostrar "exposición actual / nueva operación / exposición resultante / exceso / decisión" al usuario) — el contrato de datos ya lo permite (`outstandingAmount` etc. están en el resultado), pero la presentación visual es trabajo de UI/UX separado, tal como el equipo lo indicó explícitamente en su aprobación del diseño ("separar responsabilidad, pero no perder el dato").
- **Migración de B/C/D** (`cliente.bloqueado`, gates H0.5-H0.8) — trabajo distinto, ya cerrado como puente hacia F1 en su propio documento, no se reabre ni se mezcla acá.

---

## 5. `unstable_cache` — por qué la autoridad lo toca, y si eso es un acoplamiento con Next.js

El equipo pidió documentar esto explícitamente, sin convertirlo en un refactor.

### Por qué ocurre

`GetFiadoStatusUseCase` resuelve el límite de fiados global con `getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', ...)` (`src/lib/config.ts`). `getConfigInt` llama a `getConfigNumber`, que llama a `getConfig`, y `getConfig` está envuelto en `unstable_cache` (`next/cache`) para no golpear la tabla `Config` en cada request. `unstable_cache` exige un `incrementalCache` que Next.js solo provee dentro del ciclo de vida real de un request — fuera de eso (como en Vitest, sin servidor Next corriendo), lanza `Invariant: incrementalCache missing`.

### Qué es nuevo en F1 y qué no

- **Preview ya dependía de esto desde antes de F1** — siempre usó `GetFiadoStatusUseCase`, que siempre llamó `getConfigInt`. No es una dependencia nueva para Preview.
- **Commit y Venta Libre SÍ empiezan a depender de esto recién con F1.** Antes, ambos leían el límite con `tx.config.findUnique(...)` — Prisma crudo, dentro de su propia transacción, sin pasar por `unstable_cache` ni por Next.js en absoluto.
- Por eso 5 tests de integración que construían `CrearPedidoUseCase` (y no necesitaban el mock de `next/cache` hasta ahora) empezaron a fallar — es la consecuencia directa y esperable de centralizar la lectura del límite en la autoridad compartida.

### ¿Esto acopla la lógica de crédito a Next.js?

Sí, y ya estaba parcialmente acoplada — F1 solo lo extiende a dos consumidores más. Con precisión: `GetFiadoStatusUseCase` vive en la capa de aplicación del módulo `pedidos` (nominalmente independiente de framework), pero transitivamente, a través de `src/lib/config.ts`, depende de `next/cache`. Esto significa que **la autoridad de crédito no se puede invocar hoy fuera de un request real de Next.js** sin proveer el mismo mock que usan los tests (`unstable_cache: (fn) => fn`).

### Por qué esto no es un riesgo de producción hoy

Este patrón (`getConfigInt`/`getConfigBool` envueltos en `unstable_cache`) ya se usa en producción desde varias rutas reales (`/api/embarques`, `/api/pedidos/[id]/entrega`, `/api/alertas/descuentos-sin-justificar`, entre otras) sin problema, porque **todo caller de la autoridad hoy (Preview, Commit, Venta Libre) se invoca desde dentro de una API route real de Next.js**, que siempre tiene un `incrementalCache` disponible. El error solo aparece cuando el código corre **fuera** de ese ciclo de vida — exactamente el caso de los tests, no el de producción.

### Dónde sí sería un riesgo real (a futuro, no ahora)

Si en algún momento se quisiera invocar `GetFiadoStatusUseCase` desde algo que **no** sea una API route de Next.js — un script standalone, un worker fuera del runtime de Next, o un test que no lo mockee — fallaría con el mismo error. Hoy no existe ningún caller así, por lo que no es un riesgo actual, pero es una limitación arquitectónica real de la autoridad tal como quedó construida.

### Queda como observación técnica, no como acción de esta fase

Tal como pidió el equipo: esto no se refactoriza ahora. Una opción futura razonable (no decidida, no propuesta como plan) sería que la autoridad reciba el límite resuelto como parámetro en vez de leerlo ella misma, dejando la lectura de `Config` (y su cacheo) fuera de la autoridad — pero eso es una decisión de diseño posterior, fuera del alcance ya cerrado de F1.

---

## 6. Qué falta para que F1 esté en `main`

Nada de código — F1 está implementado, probado (unitario + integración real) y comiteado en la rama. Lo que falta es el mismo pendiente que arrastra toda esta serie de trabajo desde H0.7: **formalizar en git** (la rama existe, no se ha abierto PR ni se ha mergeado nada a `main` todavía). Antes de avanzar a F2, sugiero que el equipo confirme si este es el momento de abrir el PR de esta rama (que incluye H0.5-H0.8 + convergencia + F1 completo) o si prefieren separarlo en PRs más chicos ahora que F1 está cerrado y es un punto de corte natural.
