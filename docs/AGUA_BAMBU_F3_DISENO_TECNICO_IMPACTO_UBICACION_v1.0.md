# AGUA BAMBÚ — F3: DISEÑO TÉCNICO (IMPACTO EN DEMANDA POR CAMBIO DE UBICACIÓN)

**Versión:** 1.0
**Fecha:** 2026-09-14
**Responde a:** decisiones finales del equipo sobre las 3 preguntas abiertas de `docs/AGUA_BAMBU_F3_MAPA_BRECHAS_DIRECCION_DEMANDA_v1.0.md` §2. Cierre de producto confirmado — el equipo pidió pasar directo a diseño técnico, sin otra ronda.

**Alcance cerrado de F3** (de los 4 bullets del §61): `dirección/link` y `snapshots` ya estaban completos (sin cambio). `Barrio canónico` queda explícitamente fuera de F3 (pertenece a Territorio/Zona). Este documento cubre lo que sí se construye: **impacto en demanda** + el fix mínimo del checkbox "actualizar cliente" (decisión 4 del equipo, mismo territorio).

---

## 1. Reglas de negocio ya decididas (verbatim del equipo, no reinterpretadas)

```text
CAMBIO DE UBICACIÓN MAESTRA
         ↓
¿EXISTEN PEDIDOS PENDIENTES AFECTADOS?
         ↓
       SÍ
         ↓
SEÑAL DE IMPACTO / REVISIÓN
         ↓
[Revisar cambios]
```

- La señal **no** modifica el Pedido, **no** modifica su snapshot, **no** cancela, **no** crea otro Pedido, **no** cambia una ruta confirmada, **no** bloquea al usuario.
- Pedidos ya entregados: sin acción, su snapshot es un hecho histórico y no se toca.
- Nuevo Pedido: usa datos maestros vigentes (ya es el comportamiento actual — sin cambio).
- Pedido existente: conserva su snapshot (ya es el comportamiento actual — sin cambio).
- Planificación (`PlanDia`): puede quedar desactualizada, debe hacerse visible, **no se modifica automáticamente** — la replanificación es una decisión explícita posterior, fuera de F3.
- El checkbox "actualizar cliente" del formulario de Pedido: el fix debe ser mínimo, sin inventar matching de barrios.

## 2. Qué pedidos "dependen todavía de la ubicación anterior" — regla técnica derivada

El equipo no especificó la regla exacta de "afectado"; se deriva de la arquitectura ya existente, no se inventa una nueva noción:

`CrearPedidoUseCase`/`ActualizarPedidoUseCase` solo persisten `Pedido.direccionEntrega`/`barrioEntrega` (snapshot) cuando el texto capturado **difiere** de la dirección resuelta en vivo (`entrega-suficiencia.service.ts`). Si esos campos son `null`, ese Pedido **sigue resolviendo su dirección en vivo contra el Cliente/Negocio** cada vez que se lee (`resolverEntrega`) — es decir, literalmente "depende todavía de la ubicación maestra actual". Si esos campos tienen un valor, el Pedido ya está congelado con su propia dirección puntual y **no depende** del dato maestro, sin importar cuál sea ese valor.

**Regla**: un Pedido está afectado por un cambio de dirección/barrio maestro si, y solo si:
- `clienteId` coincide con el Cliente que cambió (o `negocioId` coincide con el Negocio que cambió, cuando el cambio es de Negocio);
- `estadoEntrega` ∈ `{PENDIENTE, EN_RUTA}` (aún no entregado, no cancelado/anulado — `NO_ENTREGADO` queda fuera por ambigüedad, no se decide acá si un reintento cuenta como "pendiente"; el equipo puede pedir incluirlo después, es un cambio de una condición, no de arquitectura);
- `direccionEntrega IS NULL AND barrioEntrega IS NULL` (sin override propio — sigue la resolución en vivo).

## 3. Entidad — mismo patrón ya usado en F2/`ResponsibilityCase` (snapshot + revisión, no se inventa uno nuevo)

```prisma
model PedidoImpactoUbicacion {
  id                String   @id @default(cuid())
  pedidoId          String
  pedido            Pedido   @relation(fields: [pedidoId], references: [id], onDelete: Cascade)

  // Origen del cambio — trazabilidad de qué disparó la señal.
  origenTipo        String   // 'CLIENTE' | 'NEGOCIO'
  origenId          String

  direccionAnterior String?
  barrioAnterior    String?
  direccionNueva    String?
  barrioNueva       String?

  detectadoAt       DateTime @default(now())
  revisadoPorId     String?
  revisadoAt        DateTime?
  notaRevision      String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([pedidoId])
  @@index([revisadoAt])
}
```

Deliberadamente **sin** `pedidoId @unique`: si la dirección del cliente cambia dos veces mientras un pedido sigue pendiente, cada cambio es un hecho distinto y se registra aparte (Definition of Done §63: "hechos históricos conservados") — no se pisa ni se deduplica. `revisadoAt` es el único mecanismo de "resuelto"; la vista de UI (fuera de este backend) puede mostrar solo `WHERE revisadoAt IS NULL` como pendientes de revisión.

**Por qué no reutilizar `Caso`**: `Caso` es el vehículo de antifraude/disciplina con su propio flujo de resolución (`aplicarAccionCorrectiva`) — H0 ya retiró la mutación de `cliente.bloqueado` de ahí para que `Caso` no vuelva a ser una vía de autorización paralela. Una señal puramente informativa de "revisar, la dirección cambió" no es un caso de antifraude; forzarla dentro de `Caso` reabriría exactamente el problema que H0 cerró.

## 4. Autoridad única — `EvaluarImpactoUbicacionUseCase`

Un único punto de entrada, llamado desde los 3 lugares donde una dirección/barrio de Cliente o Negocio puede cambiar — ninguno de los 3 vuelve a implementar la detección por su cuenta:

```ts
interface EvaluarImpactoUbicacionInput {
  origenTipo: 'CLIENTE' | 'NEGOCIO'
  origenId: string
  direccionAnterior: string | null
  barrioAnterior: string | null
  direccionNueva: string | null
  barrioNueva: string | null
  tx: TransactionClient
}
```

Comportamiento:
1. Si `direccionNueva === direccionAnterior && barrioNueva === barrioAnterior` → no hace nada (sin cambio real, evita ruido).
2. Busca Pedidos afectados con la regla de §2 (filtro por `clienteId`/`negocioId` según `origenTipo`).
3. Si no hay ninguno → no hace nada (no crea filas vacías, no notifica).
4. Crea un `PedidoImpactoUbicacion` por Pedido afectado (misma tx que el update del Cliente/Negocio — si esa tx revierte, la señal revierte con ella, coherente con "no se inventa un hecho que el cambio maestro no confirmó").
5. Dispara **un solo** `notifyEvent('PEDIDO_UBICACION_DESACTUALIZADA', ...)` agregando el conteo, no uno por pedido (mismo criterio de "no generar ruido" que ya aplica en el resto del sistema).

Llamado desde:
- `PrismaClienteRepository.updateDireccion` (flujo "actualizar cliente" desde Pedidos) — ya tiene `tx`, ya lee `previo` antes de sobreescribir.
- `PUT /api/clientes/[id]/route.ts` — dentro del `prisma.$transaction` ya existente, después de `updateMany`, si `direccion`/`barrio` estaban en el diff.
- `PUT /api/negocios/route.ts` — mismo patrón.

**No se toca** `PUT /api/clientes/route.ts` (creación) ni `POST /api/negocios/route.ts` (creación) — un alta no tiene "dirección anterior", no hay impacto que evaluar.

## 5. Fix mínimo — checkbox "actualizar cliente" y `barrioId` desincronizado (decisión 4 del equipo)

El flujo de Pedido (`ActualizarPedidoInput.actualizarCliente`/`CrearPedidoInput.actualizarCliente`) **nunca** tuvo ni tiene `barrioId` — solo `{ direccion, barrio }` de texto libre (`IClienteRepository.updateDireccion`, sin ese parámetro). A diferencia de `PUT /api/clientes/[id]`, que si recibe un `barrioId` explícito lo resuelve y sincroniza el string legacy, esta vía **jamás** pudo enviar un `barrioId` — es una limitación de superficie de API/UI, no un bug de lógica de matching ausente.

Por eso, tal como pidió el equipo ("documenten la limitación, no inventen un matching propio"), el fix no intenta resolver un `barrioId` nuevo — evita el daño real: si el texto de `barrio` cambia por este camino y el Cliente ya tenía un `barrioId` vinculado, ese `barrioId` puede quedar apuntando a un Barrio que ya no corresponde al texto nuevo. El fix es poner `barrioId: null` cuando el texto de `barrio` cambia sin que venga acompañado de una resolución canónica — pasa de "vínculo posiblemente incorrecto y silencioso" a "sin vínculo, explícito", sin inventar ninguna heurística de coincidencia de nombres:

```ts
// PrismaClienteRepository.updateDireccion
const barrioCambio = (barrio || null) !== (previo?.barrio ?? null)
await client.cliente.update({
  where: { id },
  data: {
    direccion,
    barrio: barrio || null,
    ...(barrioCambio ? { barrioId: null } : {}),
  },
})
```

## 6. Notificación

Un solo evento nuevo — se reutiliza `NotificationEventType`/`NotificationRule`/`notifyEvent`, sin infraestructura nueva:

```prisma
enum NotificationEventType {
  // ...existentes...
  PEDIDO_UBICACION_DESACTUALIZADA
}
```

No se seedea una `NotificationRule` por defecto (mismo criterio ya aplicado en F2 — 8 de 12 eventos hoy no tienen regla default; el admin la configura si la quiere).

## 7. Endpoint mínimo de revisión (backend-only, sin UI — mismo precedente que F1/F2)

`PATCH /api/pedidos/impacto-ubicacion/[id]` — marca `revisadoAt`/`revisadoPorId`/`notaRevision` opcional. No reinterpreta nada, no dispara ninguna acción sobre el Pedido — es literalmente "marcar como visto". Sin permiso especial más allá de `requireAuth` (no es una autorización financiera ni una excepción — es una checklist operativa).

`GET /api/pedidos/impacto-ubicacion?pedidoId=X` — lista, para que una futura UI pueda mostrar el banner "la dirección del cliente cambió" en el detalle/peek de un Pedido. **No se extiende `PedidoPeekExtras` en este backend** — es trabajo de UI, fuera del alcance mínimo pedido ("mantengan el cambio mínimo"), señalado como próximo paso si el equipo lo pide.

## 8. Pruebas mínimas exigidas por el equipo (verbatim, mapeadas a tests concretos)

1. Cambio de dirección → Pedido pendiente (sin snapshot propio) → aparece señal de impacto. — Integración: `PUT /api/clientes/[id]` con pedido `PENDIENTE` sin `direccionEntrega` → `PedidoImpactoUbicacion` creado.
2. Cambio de dirección → Pedido entregado → no se modifica su snapshot. — Integración: mismo cambio, pedido `ENTREGADO` → cero filas de `PedidoImpactoUbicacion` para ese pedido, `direccionEntrega` sin tocar.
3. Cambio de dirección → nuevo Pedido → utiliza la nueva ubicación. — Ya cubierto por tests existentes de `resolverEntrega`/`CrearPedidoUseCase` (comportamiento sin cambios); se agrega un test explícito de regresión que lo deje documentado como criterio de F3.
4. Cambio de dirección → planificación confirmada → no se modifica automáticamente. — Se verifica por ausencia: ningún código de F3 toca `PlanDia`/el planificador; test de que `EvaluarImpactoUbicacionUseCase` no importa ni llama nada de `src/modules/.../planificador`.
5. Cambio temporal para un Pedido (`direccionEntrega` propio) → no modifica el dato maestro. — Ya es el comportamiento actual (`ActualizarPedidoUseCase` con snapshot puntual no toca `Cliente`); test de regresión.
6. Checkbox "actualizar cliente" → dirección y barrio quedan coherentes, sin nuevo matching. — Unit: `updateDireccion` con Cliente que tenía `barrioId` set, texto de barrio distinto → `barrioId` queda `null` tras el update; con el mismo texto → `barrioId` no se toca.

Más: test de concurrencia NO aplica acá (a diferencia de F2, esto no es una autorización de un solo uso con dos actores compitiendo — es una detección determinística dentro de una transacción ya serializada por el propio update del Cliente/Negocio).

## 9. Qué NO hace F3 (mismo criterio de scope que F1/F2)

- No construye `Pedido.barrioId` ni ningún matching de nombres de barrio.
- No modifica el planificador ni `PlanDia`.
- No construye UI (banner, badge, bandeja de revisión) — solo backend + endpoints.
- No reintenta resolver un `barrioId` "inteligente" en el fix del checkbox — lo desvincula explícitamente en vez de adivinar.
- No incluye `NO_ENTREGADO` en "pedidos afectados" — ambigüedad explícita, no decidida por el equipo, se deja fuera hasta que se pida.
