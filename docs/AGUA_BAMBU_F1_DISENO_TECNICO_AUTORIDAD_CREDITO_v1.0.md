# AGUA BAMBÚ — F1: DISEÑO TÉCNICO DE LA AUTORIDAD DE CRÉDITO

**Versión:** 1.0
**Fecha:** 2026-09-13
**Responde a:** aprobación del mapa de brechas F1 con precisión del equipo — "resultado actual ≠ autoridad consolidada"; exposición monetaria SÍ entra en F1 pero sin inventar umbral de bloqueo; diseño técnico requerido antes de tocar código.
**Base:** `docs/AGUA_BAMBU_F1_MAPA_BRECHAS_AUTORIDAD_CREDITO_v1.0.md` (diagnóstico ya validado, no se reabre).
**Regla seguida:** diseño, **cero implementación todavía**. No se crea ningún archivo de código en este documento. No se inventa ningún umbral monetario. No se toca nada de F2 (excepciones/permisos/flujo/concurrencia/notificaciones).

---

## 0. Hallazgo adicional que refuerza la precisión del equipo

El mapa de brechas subestimó un punto: `venta-libre/route.ts` no solo reimplementa la *decisión* (`puedeCrearPedido`) — reimplementa también la **consulta** de pedidos pendientes:

```ts
// venta-libre/route.ts:185-194 — literalmente el mismo where/select/orderBy
// que PrismaPedidoRepository.findPendingByCliente(), escrito a mano por
// segunda vez dentro de la propia transacción de la ruta.
const pedidosPendientes = await tx.pedido.findMany({
  where: { clienteId: cliente.id, estadoEntrega: 'ENTREGADO', saldo: { gt: 0 },
           estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] } },
  orderBy: { numero: 'asc' },
  select: { id: true, numero: true, saldo: true },
})
```

Esto confirma exactamente el punto del equipo: no es solo que "tres implementaciones lleguen al mismo resultado" — es que **la consulta misma está copiada**, no solo la regla. Si mañana cambia qué cuenta como "pedido pendiente" (por ejemplo, agregar un nuevo estado), hay que recordar tocar este `findMany` a mano además de `PrismaPedidoRepository.findPendingByCliente`. Esto eleva la prioridad del diseño de abajo: la autoridad debe encapsular también la consulta, no solo la decisión.

---

## 1. Vista general: Entrada → Autoridad de Crédito → Resultado → Consumidores

```text
ENTRADA
  clienteId
  operación en evaluación (total, totalPagado) — opcional, ausente en modo "solo consultar estado"
  tx — opcional, para ejecutar dentro de una transacción del caller
        │
        ▼
AUTORIDAD DE CRÉDITO (componente único)
  1. Resuelve cliente (bloqueado, verificado, creadoPorRol, limitePedidosFiados)
  2. Resuelve límite efectivo (resolverLimiteFiados)
  3. Consulta pedidos pendientes (ÚNICA query, encapsulada acá)
  4. Aplica reglas existentes (puedeFiar, puedeCrearPedido) — SIN CAMBIOS
  5. Calcula exposición monetaria (suma de saldo) — NUEVO, informativo
  6. Si hay operación en evaluación: proyecta exposición resultante — NUEVO, informativo
        │
        ▼
RESULTADO (objeto único, mismo shape para los 3 consumidores)
  { count, limite, nivel, status, pedidos,
    outstandingAmount, operationOutstanding?, projectedOpenCount?,
    projectedOutstandingAmount?, canFiar, errorDeuda }
        │
        ▼
CONSUMIDORES (los 3 ya existentes, ninguno nuevo)
  Preview (PreviewPedidoUseCase) · Commit (CrearPedidoUseCase) · Venta Libre (venta-libre/route.ts)
```

---

## 2. Qué componente será la autoridad

**Propuesta: evolucionar `GetFiadoStatusUseCase` (ya existe, ya es la autoridad de facto de Preview) en vez de crear una clase nueva paralela** — es el cambio mínimo: mismo archivo, mismo lugar en el árbol de dependencias, se extiende su contrato sin romper a su único consumidor actual.

Se descarta crear una clase nueva (ej. `EvaluarCreditoUseCase`) como alternativa **de mayor costo**: obligaría a migrar Preview también, y dejaría `GetFiadoStatusUseCase` como código muerto o duplicado — exactamente el patrón que se busca evitar.

**Extensión de firma necesaria** (hoy `execute(input: GetFiadoStatusInput): Promise<FiadoStatus>`, sin `tx`):

```ts
interface GetFiadoStatusInput {
  clienteId: string
  operacion?: { total: number; totalPagado: number }  // NUEVO, opcional
  tx?: TransactionClient                                // NUEVO, opcional
}
```

El `tx` opcional es necesario porque **Commit y Venta Libre corren dentro de una transacción con lock** (`withAdvisoryLock`) — la autoridad debe poder leer dentro de esa misma transacción, no en una conexión aparte (si no, se pierde la garantía de que la lectura ve el estado bloqueado por el lock). Esto ya es un patrón existente: `PrismaPedidoRepository.findPendingByCliente(clienteId, tx?)` ya acepta `tx` por-llamada — la autoridad solo necesita empezar a recibirlo y reenviarlo, no se inventa nada nuevo en la capa de datos.

**Fricción a resolver, señalada explícitamente (no decidida acá):** `GetFiadoStatusUseCase` se construye hoy con `(pedidoRepo: IPedidoRepository, clienteRepo: IClienteRepository)` — abstracciones del módulo DDD `pedidos`. `venta-libre/route.ts` es una ruta que trabaja con `tx: Prisma.TransactionClient` crudo, sin el andamiaje de inyección de dependencias del módulo. Para que Venta Libre use la misma autoridad sin duplicar código, necesita instanciarla directamente: `new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository())` — factible porque ambos repos son *stateless* (no reciben `tx` en el constructor, solo por-llamada), pero es la primera vez que una ruta fuera del módulo `pedidos` instanciaría una clase de su capa de aplicación directamente. No es una decisión de arquitectura mayor, pero se señala para que no se asuma como "obvio" — es un cambio de patrón de consumo, aunque acotado.

---

## 3. Qué datos calculará (contrato de salida propuesto)

Extiende `FiadoStatus` (no lo reemplaza — los campos actuales se conservan para no romper a `fiados-table.tsx`, el otro consumidor de este tipo):

```ts
export interface FiadoStatus {
  // Campos existentes — SIN CAMBIOS
  count: number
  limite: number
  nivel: 'ok' | 'cerca' | 'limite'
  pedidos: Array<{ id: string; numero: number; saldo: number }>

  // NUEVOS — exposición monetaria (siempre presentes, informativos)
  outstandingAmount: number        // suma de pedidos[].saldo — exposición actual en $

  // NUEVOS — solo presentes si se pasó `operacion` en el input
  operationOutstanding?: number       // max(0, operacion.total - operacion.totalPagado)
  projectedOpenCount?: number         // count + (operationOutstanding > 0 ? 1 : 0)
  projectedOutstandingAmount?: number // outstandingAmount + (operationOutstanding ?? 0)

  // NUEVO — status enriquecido (deriva de count/limite ya calculados, no agrega regla)
  status: 'OK' | 'AT_LIMIT' | 'OVER_LIMIT' | 'NOT_APPLICABLE'
}
```

**Nota sobre `status` — es una traducción de vocabulario, no una regla nueva.** Hoy `nivel: 'limite'` cubre TANTO `count === limite` COMO `count > limite` (la condición es `count >= limite`) — no se distingue "justo en el límite" de "por encima". El ALS pide distinguir `AT_LIMIT` de `OVER_LIMIT` (ver `AGUA_BAMBU_ALS_INTEGRIDAD_COMERCIAL_v1.0.als` §8.2). Calcular `status = count > limite ? 'OVER_LIMIT' : count === limite ? 'AT_LIMIT' : 'OK'` (y `'NOT_APPLICABLE'` para `CONSUMIDOR_FINAL`) es **derivar más granularidad de datos que ya existen** — no cambia en ningún caso el criterio de bloqueo, que sigue siendo `count >= limite` sin modificación. Se señala explícitamente porque es el único punto de este diseño que agrega una distinción no presente hoy, aunque sea puramente de presentación.

**Qué NO se agrega, a propósito:** ningún campo de tipo `excessAmount` con significado de "dinero de exceso". El ejemplo del propio ALS §8.2 (`OVER_LIMIT`) muestra el exceso en **operaciones** ("Exceso: 1 operación"), no en pesos — no hay un "límite en pesos" contra el cual calcular un exceso monetario. `excessCount = max(0, projectedOpenCount - limite)` sí se puede derivar sin inventar nada (es aritmética sobre el conteo ya existente); un `excessAmount` monetario no tiene contra qué compararse sin inventar un umbral, así que no se incluye.

---

## 4. Cómo calculará exposición monetaria

`outstandingAmount = pedidos.reduce((sum, p) => sum + p.saldo, 0)` — sobre el mismo array que `findPendingByCliente` ya retorna. **Cero queries nuevas**: el dato (`saldo` por pedido) ya se trae hoy, simplemente nadie lo suma todavía.

## 5. Cómo proyectará la exposición después de la operación

Solo si el caller pasa `operacion: {total, totalPagado}` (Preview y Commit lo tienen siempre disponible en ese punto de su flujo; Venta Libre también):

```ts
operationOutstanding = Math.max(0, operacion.total - operacion.totalPagado)
projectedOutstandingAmount = outstandingAmount + operationOutstanding
projectedOpenCount = count + (operationOutstanding > 0 ? 1 : 0)
```

Esto reproduce exactamente la lógica de decisión que ya existe hoy (el guard `totalPagado < total` ya corregido) — no es una regla nueva, es la misma regla expresada como proyección numérica en vez de solo un booleano de paso/no-paso.

---

## 6. Qué reglas actuales conservará (sin cambios de comportamiento)

- `cliente.bloqueado` → rechazo, sin condición adicional más allá de la ya existente (`totalPagado < total`).
- `pedidosPendientes.length >= limite` → único criterio real de bloqueo por deuda. **No cambia.**
- `puedeFiar` (verificado / creadoPorRol ADMIN-ASISTENTE) → sin cambios.
- `resolverLimiteFiados` (personal > config global > default 2) → sin cambios.
- `CONSUMIDOR_FINAL` nunca se bloquea → sin cambios (`status: 'NOT_APPLICABLE'` en vez de calcular nada).
- El guard `totalPagado < total` (ya corregido en los 3 caminos) → se conserva idéntico; lo único que cambia es que pasa a vivir **dentro** de la autoridad en vez de que cada consumidor decida por su cuenta si invoca o no el chequeo de crédito.

## 7. Qué reglas NO se modificarán (explícito, para que no se confunda diseño técnico con nueva política)

- Ningún umbral monetario de bloqueo — la decisión de bloqueo sigue siendo 100% por conteo.
- Ninguna entidad ni flujo de `PedidoExcepcionCredito` — eso es F2.
- Ningún permiso nuevo (`AUTORIZAR_EXCEPCION_CREDITO` no existe, no se toca).
- El comportamiento de `esAnonimo` en `venta-libre` (exige pago completo) no cambia.
- Ningún cambio a `Caso`, `cliente.bloqueado` como campo, ni a los 3 escritores ya mapeados en H0.5-H0.8 (esos siguen siendo trabajo posterior, no de F1).

---

## 8. Cómo cada consumidor usará la autoridad

### Preview (`PreviewPedidoUseCase.ts`)

**Hoy:** reimplementa el check de `bloqueado` inline (líneas 133-149, ya con el guard corregido) + llama a `GetFiadoStatusUseCase.execute({clienteId})` solo para el conteo, ignorando lo monetario.

**Propuesto:** una sola llamada — `this.deps.getFiadoStatusUseCase.execute({ clienteId: input.clienteId, operacion: { total, totalPagado } })` — y usar `status`/`canFiar` del resultado para poblar `canCreate`/`warnings`, en vez del `if` inline actual. El objeto de crédito completo (con `outstandingAmount`/`projectedOutstandingAmount`) queda disponible para exponerlo en `calculation` si se quiere mostrar en UI (consistente con ALS §8.2/§9) — **eso es un cambio de UI, fuera del alcance mínimo de F1 backend**, se señala como posible extensión, no como parte obligatoria de este diseño.

### Commit (`CrearPedidoUseCase.ts`)

**Hoy:** `pedidoRepo.findPendingByCliente(clienteId, tx)` + `puedeCrearPedido(...)` inline (líneas ~277-292), código de orquestación propio.

**Propuesto:** reemplazar ese bloque por una llamada a la misma autoridad — `getFiadoStatusUseCase.execute({ clienteId, operacion: {total, totalPagado}, tx })` — y lanzar `CLIENTE_DEBE` a partir de su resultado (`status === 'AT_LIMIT' || 'OVER_LIMIT'`, o el mensaje de error que la autoridad determine). `CrearPedidoUseCase` necesitaría recibir `GetFiadoStatusUseCase` como dependencia inyectada (hoy no la tiene) — cambio de construcción, no de lógica de negocio.

### Venta Libre (`venta-libre/route.ts`)

**Hoy:** `tx.pedido.findMany(...)` inline (duplicado exacto de la query) + `resolverLimiteFiados`+`puedeCrearPedido` sueltos vía el facade.

**Propuesto:** instanciar la autoridad con los repos Prisma concretos (ver fricción señalada en §2) y llamarla igual que Commit: `new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository()).execute({ clienteId, operacion: {total, totalPagado}, tx })`. Elimina el `findMany` duplicado y las llamadas sueltas a `resolverLimiteFiados`/`puedeCrearPedido` en esta ruta.

---

## 9. Qué pruebas demostrarán que las tres rutas dependen de la misma autoridad

No basta con "mismo resultado" — hay que probar "mismo código ejecutado", que es justo la distinción que pidió el equipo:

1. **Test de fuente única (estilo `pedido-utils.test.ts`, lectura de código fuente):** verificar que `CrearPedidoUseCase.ts` y `venta-libre/route.ts` **no contienen** su propio `findMany`/`findPendingByCliente` inline para pedidos pendientes fuera de la llamada a la autoridad — un `expect(source).not.toMatch(...)` sobre el patrón de query duplicada, igual que ya se hizo para verificar que `pedido-utils.ts` no redefine tablas de transición.
2. **Test de invocación compartida (spy/mock):** en un test de integración con un mock de `GetFiadoStatusUseCase`, verificar que tanto el flujo de Preview como el de Commit (con el mismo fixture de cliente/pedidos) invocan `execute()` con los mismos argumentos relevantes (`clienteId`, `operacion` equivalente) — no solo que ambos "pasen", sino que ambos llamen al mismo mock.
3. **Test de paridad de resultado sobre los 3 caminos:** mismo cliente, mismos pedidos pendientes, misma operación nueva, ejecutado a través de Preview, Commit y Venta Libre (con sus respectivos mocks de infraestructura) → los 3 deben producir el mismo `status`/`outstandingAmount`/`projectedOutstandingAmount`. Esto ya existe parcialmente como filosofía (`fiado-limite-solo-si-queda-saldo.test.ts` ya compara el comportamiento esperado entre Commit y Venta Libre) — se extiende a los 3 caminos y a los campos monetarios nuevos.
4. **Test de exposición monetaria pura:** cliente con pedidos de montos conocidos → `outstandingAmount` exacto; con `operacion` → `projectedOutstandingAmount` exacto. Sin relación con ninguna decisión de bloqueo — solo aritmética.
5. **Test de no-regresión de las reglas conservadas (§6):** los tests ya existentes (`pedido-utils.test.ts`, `fiado-limite-solo-si-queda-saldo.test.ts`, `fiado-limite-no-bloquea-pago-completo.test.ts`, los 2 de `PreviewPedidoUseCase.test.ts` de esta rama) deben seguir pasando sin modificar sus aserciones de negocio — si alguno necesita cambiar, es señal de que el diseño alteró una regla que debía conservarse intacta.

---

## 10. Qué NO contiene este documento

- No crea ni modifica ningún archivo de código.
- No define la fórmula final de `status`/nombres exactos de campos como decisión cerrada — son propuesta técnica a validar.
- No resuelve la fricción de instanciación directa en `venta-libre` (§2) más allá de señalarla — si el equipo prefiere otra forma de exponer la autoridad a rutas fuera del módulo DDD (ej. una función de fábrica `createFiadoStatusUseCase()`), es una variante menor a decidir en implementación, no un cambio de diseño.
- No toca F2 en ningún punto.

## 11. Qué necesito confirmado antes de implementar

1. ¿Se aprueba evolucionar `GetFiadoStatusUseCase` en vez de crear una clase nueva? (§2)
2. ¿Los nombres de campo propuestos (`outstandingAmount`, `operationOutstanding`, `projectedOutstandingAmount`, `status`) son aceptables, o prefieren otra convención?
3. ¿La forma de instanciación directa en `venta-libre` (§2, fricción señalada) es aceptable, o prefieren que la exponga una función de fábrica en vez de instanciar la clase directamente?
4. Confirmar que exponer los campos monetarios en la UI de Preview (mencionado en §8 como "fuera del alcance mínimo de F1 backend") queda explícitamente fuera de este F1 o si debe incluirse — el Plan Maestro pide que la UI los muestre, pero el equipo puede preferir separar "backend calcula" de "UI muestra" en commits/PRs distintos.
