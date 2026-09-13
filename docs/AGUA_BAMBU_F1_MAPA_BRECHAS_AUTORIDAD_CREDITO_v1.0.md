# AGUA BAMBÚ — F1: MAPA DE BRECHAS (AUTORIDAD DE CRÉDITO)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Responde a:** instrucción del equipo — antes de tocar código de F1, entregar el mapa de brechas contra el Plan Maestro v1.0 §61 (F1: consolidar cálculo de crédito, incorporar exposición monetaria, eliminar divergencia Preview/Commit).
**Base técnica:** rama `fix/integridad-comercial-credito-gates-h0` (H0 cerrado), `main` `232ab216`.
**Regla seguida:** solo mapeo y evidencia. **Cero implementación en este documento.** No se crea `PedidoExcepcionCredito`, no se toca permisos/flujo/concurrencia de excepciones (eso es F2, explícitamente fuera de alcance por instrucción del equipo). No se inventa ningún umbral ni regla de negocio nueva — donde el Plan Maestro no define un valor concreto, se marca como PENDIENTE de decisión, no se asume.

**Alcance de F1 (verbatim del Plan Maestro v1.0 §61, único texto usado):**
> F1 — Autoridad de crédito: consolidar cálculo; exposición monetaria; paridad Preview/Commit.

---

## 1. ¿Dónde se calcula actualmente el crédito?

**HECHO**, verificado línea por línea:

- **Autoridad de dominio (ya consolidada, sin duplicación):** `src/modules/pedidos/domain/services/pedido-validation.service.ts`
  - `puedeCrearPedido(cliente, pedidosPendientes, limite)` — `cliente.bloqueado` → rechazo; `pedidosPendientes.length >= limite` → rechazo. Único criterio: **conteo** de pedidos pendientes, nunca monto.
  - `puedeFiar(cliente, esAnonimo)` — determina si un cliente puede fiar (verificado / creado por ADMIN-ASISTENTE).
  - `getEstadoFiados(pedidosPendientes, limite)` — deriva `{count, limite, porcentaje, nivel}` para UI. Sin monto.
  - `resolverLimiteFiados(cliente, configValor)` — resuelve el límite efectivo (personal > config global > default 2).
- **Facade legacy** `src/lib/pedido-utils.ts` — re-exporta directo del dominio (consolidado en la fase de preparación, commit `b1938b44`). No hay ya cálculo duplicado acá.
- **`GetFiadoStatusUseCase.ts`** — usado **solo por Preview**: llama `pedidoRepo.findPendingByCliente(clienteId)` + `resolverLimiteFiados` + `getEstadoFiados`. Devuelve `FiadoStatus = {count, limite, nivel, pedidos: [{id, numero, saldo}]}`.
- **`CrearPedidoUseCase.ts`** (Commit): llama `pedidoRepo.findPendingByCliente(clienteId, tx)` **directamente** (mismo método de repositorio que `GetFiadoStatusUseCase`, pero invocado en un segundo punto independiente) + `puedeCrearPedido()` directo del dominio.
- **`venta-libre/route.ts`**: usa `puedeFiar`/`puedeCrearPedido` vía el facade (ya consolidado, mismo camino que el dominio).

**Conclusión:** el *cálculo* en sí (qué cuenta como "fiado abierto", cuál es el límite efectivo) ya es una única fuente (`pedido-validation.service.ts`) tras el trabajo de preparación. La fragmentación que queda no es de cálculo — es de **orquestación**: 3 puntos de entrada (`GetFiadoStatusUseCase`, `CrearPedidoUseCase`, `venta-libre`) que llegan al mismo cálculo por rutas de código independientes, no a través de una única función/autoridad compartida.

---

## 2. ¿Dónde se calcula actualmente la exposición monetaria?

**HECHO, y esta es la brecha más concreta de las tres:**

**En la decisión de crédito: en ningún lado.** `puedeCrearPedido`/`getEstadoFiados`/`FiadoStatus` nunca suman `saldo` — el único criterio es `pedidosPendientes.length >= limite` (conteo). El tipo `FiadoStatus` (`src/modules/pedidos/domain/types/index.ts:140-145`) expone `pedidos: Array<{id, numero, saldo}>` — el dato *está disponible* por pedido, pero **nadie lo suma** para producir un monto de exposición.

**Fuera de la decisión de crédito, sí existen sumas de `saldo`, pero son 8+ cálculos independientes, cada uno para un propósito de reporte distinto, ninguno conectado a la autoridad de crédito:**

| Archivo:línea | Para qué suma `saldo` |
|---|---|
| `src/app/api/clientes/[id]/stats/route.ts:35` | Estadísticas de detalle de cliente |
| `src/app/api/clientes/[id]/route.ts:178` | Detalle de cliente (GET) |
| `src/lib/clientes-repo.ts:157` | Listado de clientes (`saldoPendiente`) |
| `src/app/api/search/clientes/route.ts:88` | Buscador de clientes |
| `src/modules/dashboard/domain/ventas.service.ts:33` | Dashboard |
| `src/app/api/reportes/cartera/route.ts:42` | Reporte de cartera |
| `src/app/api/cierre/route.ts:299,419,421,613` | Cierre del día |
| `src/lib/recurrentes.ts:223,282` | Vista previa de recurrentes |
| `src/app/(app)/pedidos/pedidos-client/index.tsx:1099` | UI cliente (panel) |

Ninguno de estos alimenta `puedeCrearPedido`, `PreviewPedidoUseCase` ni `CrearPedidoUseCase`. Son cálculos de reporte, no de autoridad.

**Pregunta que el Plan Maestro no resuelve y que este documento NO decide por su cuenta:** el ALS §8.1 define un contrato `CreditPreview` con campos monetarios (`outstandingAmount`, `operationOutstanding`, `excessAmount`, etc.) junto al conteo (`openCount`, `limit`). Eso admite **dos interpretaciones distintas de alcance**, y el Plan Maestro v1.0 no dice explícitamente cuál:

- **(a) Exposición monetaria como información**: calcular y exponer los montos (para que Preview/UI los muestren, tal como pide ALS §8.2/§9 "vista mínima de crédito" con cifras en pesos), **sin cambiar el criterio de bloqueo**, que seguiría siendo por conteo (`count >= limite`) como hoy.
- **(b) Exposición monetaria como criterio**: que el bloqueo mismo empiece a considerar el monto acumulado, no solo el conteo — esto sería una regla de negocio nueva (¿cuál sería el umbral en pesos?) que el Plan Maestro explícitamente no fija y que este documento no puede inventar.

**Este documento asume (a) como el alcance mínimo justificable de F1** — es aditivo, no cambia ninguna decisión de bloqueo existente, y es exactamente lo que el ALS pide mostrar en UI. **(b) queda marcado como PENDIENTE de decisión del equipo**, fuera de alcance salvo que se apruebe explícitamente.

---

## 3. ¿Qué diferencia existe entre Preview y Commit?

**HECHO:**

- **Ya corregida (commit `64ca24d6`, en esta misma rama, sin mergear todavía):** `PreviewPedidoUseCase` ahora aplica el mismo guard `totalPagado < total` que `CrearPedidoUseCase`/`venta-libre` ya aplicaban — un pedido pagado de contado no se bloquea por límite/bloqueo histórico, en los tres caminos.
- **Diferencia que persiste, y es la que el objetivo #3 de F1 pide cerrar de raíz:** Preview y Commit **no ejecutan la misma función** — ejecutan dos implementaciones distintas que, hoy, casualmente producen el mismo resultado porque ambas llaman al mismo repo (`findPendingByCliente`) y a las mismas funciones de dominio, pero por *rutas de código separadas* (`GetFiadoStatusUseCase` vs. llamada directa en `CrearPedidoUseCase`). "Paridad de resultado hoy" no es lo mismo que "misma autoridad" — un cambio futuro a la regla de crédito tendría que aplicarse en los dos lugares otra vez, exactamente el patrón de riesgo que ya se corrigió una vez para `pedido-utils.ts` (commit `b1938b44`).
- **No cubierto por ningún test hoy:** no existe un test que verifique que Preview y Commit, sobre el mismo fixture, ejecutan la *misma* función (solo hay tests que verifican que cada uno, por separado, da el resultado esperado).

---

## 4. ¿Qué componentes actúan hoy como autoridad?

**HECHO:**

| Componente | Rol actual | ¿Es "la" autoridad? |
|---|---|---|
| `pedido-validation.service.ts` | Reglas puras (bloqueado, límite, verificado) | Es la fuente de verdad del *cálculo*, pero no expone un contrato único de crédito (no existe un `evaluarCredito()` que devuelva un objeto estructurado) |
| `GetFiadoStatusUseCase.ts` | Orquesta el cálculo para Preview | Autoridad *de facto* solo para Preview |
| `CrearPedidoUseCase.ts` | Orquesta el cálculo inline para Commit | Autoridad *de facto* solo para Commit — no reutiliza `GetFiadoStatusUseCase` |
| `venta-libre/route.ts` | Vía facade, llega al mismo dominio | Tercer punto de entrada, ya alineado con el dominio tras la consolidación previa |

**Conclusión:** no existe ninguna "Autoridad de Crédito" como componente único hoy — existen 3 orquestadores independientes que convergen en las mismas funciones de dominio. El objetivo de F1 es convertir esto en un componente único que Preview y Commit **llamen**, no en cambiar las reglas que ese componente aplica.

---

## 5. Cambio mínimo necesario (propuesta a validar, no implementada)

Siguiendo el criterio explícito del equipo de **cambio mínimo, no rediseño**:

| Plan Maestro (§61 F1) | Decisión/regla | Brecha actual | Cambio mínimo propuesto | Riesgo si no se hace |
|---|---|---|---|---|
| Consolidar cálculo de crédito | El cálculo debe tener una única autoridad | El cálculo YA está consolidado en `pedido-validation.service.ts` (hecho en la preparación); lo que falta es la **orquestación** única | Crear una función de aplicación (ej. `evaluarCredito(clienteId, operación, tx?)`) que envuelva `findPendingByCliente` + `puedeCrearPedido`/`puedeFiar`/`resolverLimiteFiados`, y hacer que `GetFiadoStatusUseCase` y `CrearPedidoUseCase` la llamen a ella en vez de reimplementar la orquestación cada uno | Sin esto, cualquier cambio futuro a la regla de crédito debe replicarse en 2+ lugares — riesgo ya materializado una vez con `pedido-utils.ts` |
| Incorporar exposición monetaria | (Alcance (a), ver §2 — informativa, no criterio de bloqueo, pendiente de confirmar con el equipo) | No existe suma de `saldo` dentro de la autoridad de crédito | La misma función `evaluarCredito()` suma `pedidos.saldo` (dato ya disponible en `findPendingByCliente`, sin nueva query) y expone `outstandingAmount`/`operationOutstanding`/`projectedOutstandingAmount` — puramente aditivo, sin nueva llamada a DB | Sin esto, Preview/UI no puede mostrar el "Ahora / Esta operación / Después" en pesos que pide ALS §8.2/§9 |
| Eliminar divergencia Preview/Commit | Preview y Commit deben usar la misma autoridad | Ya dan el mismo resultado (guard ya corregido), pero por caminos de código separados | `PreviewPedidoUseCase` y `CrearPedidoUseCase` llaman a la misma `evaluarCredito()` en vez de que cada uno arme su propia orquestación | Sin esto, "paridad" queda como coincidencia mantenida a mano, no como garantía estructural |

**Explícitamente fuera de este cambio mínimo (pertenece a F2, no se toca):** `PedidoExcepcionCredito`, permiso `AUTORIZAR_EXCEPCION_CREDITO`, flujo de solicitud/autorización, concurrencia de autorización, notificaciones. El campo `requiresException`/`status` del contrato tipo `CreditPreview` del ALS puede calcularse como booleano/enum informativo (ej. `status: 'OK'|'AT_LIMIT'|'OVER_LIMIT'`) sin que exista todavía la entidad de excepción — es una proyección de estado, no un flujo de autorización.

---

## 6. Pruebas existentes que cubren este comportamiento

- `src/__tests__/pedido-utils.test.ts` — `puedeCrearPedido`, `getEstadoFiados`, `puedeFiar`, `resolverLimiteFiados` (unit, por conteo).
- `src/modules/pedidos/application/use-cases/__tests__/fiado-limite-solo-si-queda-saldo.test.ts` — anti-regresión: el guard `totalPagado < total` corre antes de persistir en `CrearPedidoUseCase`.
- `src/components/pedido-form-unified/__tests__/fiado-limite-no-bloquea-pago-completo.test.ts` — anti-regresión de UI (disabled del submit).
- `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts` — incluye los 2 tests de esta rama que reproducen el guard ya corregido en Preview.
- `src/components/pedido-form-unified/__tests__/fiado-status-no-regression.test.ts`.

Ninguno de estos verifica exposición monetaria (no existe todavía qué probar) ni verifica que Preview/Commit ejecuten la *misma* función (verifican que cada uno, por separado, da el resultado correcto).

---

## 7. Pruebas nuevas que harían falta (cuando se implemente, no antes)

1. **Test de autoridad compartida**: mismo fixture de cliente/pedidos, invocar `PreviewPedidoUseCase` y `CrearPedidoUseCase`, verificar que ambos producen el mismo `CreditStatus` Y que internamente pasan por la misma función `evaluarCredito()` (spy/mock compartido, no solo comparar el resultado final).
2. **Test de exposición monetaria**: cliente con N pedidos pendientes de montos conocidos → `outstandingAmount` debe ser la suma exacta; con una operación nueva → `operationOutstanding`/`projectedOutstandingAmount` deben reflejar el "antes/después" que pide ALS §9.
3. **Test de que la exposición monetaria es informativa, no bloqueante** (si se confirma el alcance (a) de §2): un cliente bajo el límite de conteo pero con `outstandingAmount` alto no debe bloquearse — para dejar explícito, con un test, que no se coló un criterio de bloqueo nuevo no aprobado.
4. **Regresión de los 3 puntos de entrada** (Preview, Commit, venta-libre) contra el mismo fixture, verificando que los tres reflejan el mismo estado de crédito.

---

## 8. Qué NO contiene este documento

- No crea `evaluarCredito()` ni ninguna función nueva — es mapeo, no implementación.
- No decide el alcance de "exposición monetaria" ((a) vs (b) en §2) — lo marca como punto a confirmar antes de implementar.
- No toca nada de F2 (excepciones, permisos, flujo, concurrencia, notificaciones).
- No propone ningún umbral monetario nuevo.

## 9. Qué necesito confirmado antes de tocar código

1. **Alcance de "exposición monetaria"**: ¿(a) informativa (propuesta de este documento) o (b) también criterio de bloqueo? Si es (b), ¿cuál es el monto — el equipo debe decidirlo, este documento no lo inventa.
2. Si el nombre/forma de la función de autoridad (`evaluarCredito` es un nombre de trabajo, no una decisión) les parece razonable o prefieren otra convención de nombres del proyecto.
3. Confirmación de que el commit `64ca24d6` (ya en esta rama) cuenta como parte de F1 ya ejecutado (ver `AGUA_BAMBU_CIERRE_H0_PUENTE_HACIA_F1_v1.0.md`, nota sobre este mismo punto) — para no reportarlo dos veces ni re-implementarlo.
