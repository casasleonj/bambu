# AGUA BAMBÚ — N2 ARCHITECTURE LEVEL SPECIFICATION
## ALS-N2.1 — Gestión de pendiente, Actividad.modo y Diferencial

**Estado:** ESPECIFICACIÓN LISTA PARA IMPLEMENTAR (decisiones cerradas por el PO; contratos técnicos definidos abajo)
**Versión:** 2.0 (reemplaza `AGUA_BAMBU_N2_ALS_v1.0.als.md` en lo que este documento cubre explícitamente; lo no mencionado aquí sigue vigente del v1.0)
**Fecha:** 2026-09-05
**Base técnica:** `main` `c3822999`

Este ALS **no autoriza** todavía `prisma migrate` — describe el contrato que la migración/implementación debe cumplir. La migración en sí (aditiva) se ejecuta en un PR aparte, después de este documento ser aceptado.

---

## 1. Límites de dominio y ownership

| Concepto | Dominio | Ownership |
|---|---|---|
| `Pedido` | Pedidos | Obligación comercial/económica. Única fuente de `total`/`totalPagado`/`saldo`. |
| `PedidoItem` | Pedidos | Cantidad solicitada/entregada por producto. Única fuente del pendiente ordinario. |
| `PedidoCantidadAjuste` | Pedidos | Ajustes autorizados de cantidad y (extensión de este ALS) de diferencial monetario. |
| `ObligacionPendiente` | Embarques (dominio congelado, `ADR-OBLIGACION-001`) | Cantidad pendiente **bajo gestión activa**. Nunca dinero. |
| `Actividad` | Embarques (dominio congelado, `ADR-ACTIVIDAD-001`) | Trabajo ejecutable + modo operativo. Nunca dinero. |
| `PlanActividad` | Planificador | Propuesta/decisión logística. Sin relación con `Actividad` en el MVP (`ADR-PLANIFICADOR-006`, sin cambios). |
| `Embarque` | Embarques | Ejecución logística. No es dueño de la obligación comercial. |
| `Pago` / `Abono` / `ReceivableEntry` / `Cliente.saldoFavor` | Cartera | Única autoridad monetaria. |

**Regla de ownership:** ninguna entidad de este ALS puede duplicar la autoridad de otra. En particular, `ObligacionPendiente`/`Actividad` **no leen ni escriben** `Pedido.total`/`totalPagado`/`saldo` directamente — cualquier efecto económico (el diferencial) pasa por los mismos casos de uso que ya tocan esos campos (`ActualizarPedidoUseCase`, o uno nuevo equivalente bajo el mismo lock `PEDIDO:{id}`).

---

## 2. Entidades — cambios de schema (todos aditivos)

### 2.1 `Actividad.modo` (nuevo campo)

```prisma
enum ModoActividad {
  PUNTO
  DOMICILIO
}

model Actividad {
  // ...existente sin cambios...
  modo ModoActividad?   // null hasta que se asigna en la creación de la Actividad
}
```

- Nullable durante la ventana de migración (Actividades históricas, si las hubiera — hoy no hay ninguna en producción, verificado en la matriz Plan↔Código). Para Actividades nuevas, se exige `modo != null` a nivel de aplicación (el caso de uso de creación siempre lo recibe).
- Alternativa considerada y descartada: 3 campos (`modoSolicitado/Planificado/Ejecutado`) — sin evidencia de necesidad (ver Especificación Funcional §1.1). Descartada explícitamente por el PO.

### 2.2 `PedidoCantidadAjuste.montoDiferencial` (nuevo campo, propuesta técnica)

```prisma
model PedidoCantidadAjuste {
  // ...existente sin cambios...
  montoDiferencial Decimal? @db.Decimal(10, 2)   // null si el ajuste es puramente de cantidad, sin diferencial
}
```

Reutiliza la tabla existente en vez de crear una entidad paralela (`DiferencialCumplimiento`). El campo es opcional porque no todo `PedidoCantidadAjuste` histórico o futuro implica un diferencial (p.ej. una corrección administrativa de cantidad sin cambio de modo).

### 2.3 Sin cambios de enum en `ObligacionEstado`/`ActividadEstado`

Verificado: `ObligacionEstado { ABIERTA, CUMPLIDA, ANULADA }` y `ActividadEstado { ASIGNADA, EN_PROGRESO, CUMPLIDA, CANCELADA }` **ya cubren** el ciclo de vida completo, incluida la cancelación (Caso J). No se necesita ningún valor nuevo.

---

## 3. Casos de uso nuevos (contratos)

### 3.1 `GestionarPendienteUseCase`

**Entrada:** `{ pedidoId, itemsAGestionar: [{producto, cantidad}], modoInicial: 'PUNTO'|'DOMICILIO', usuarioId, offlineId }`

**Contrato:**
```
LOCK PEDIDO:{pedidoId}
  ↓
leer Pedido + PedidoItem (snapshot de cantPedido/cantEntrega)
  ↓
validar: cantidad solicitada <= (cantPedido - cantEntrega) por cada item
  ↓
si offlineId ya usado por este pedido → devolver resultado existente (dedup)
  ↓
crear ObligacionPendiente { pedidoId, clienteId, producto, cantidadOriginal: cantidad, cantidadCumplida: 0, cantidadAsignada: 0, estado: ABIERTA, offlineId }
  ↓
crear Actividad { obligacionId, tipo: ENTREGA, cantidad, modo: modoInicial, estado: ASIGNADA, offlineId }
  ↓
si modo != canal original del Pedido → calcular diferencial (ver 3.3) y devolverlo como PREVIEW (no confirmado)
  ↓
COMMIT
```

**Por qué el lock es `PEDIDO:{pedidoId}` y no `OBLIGACION:{id}`:** la `ObligacionPendiente` todavía no existe en el momento de leer/validar el remanente — el agregado que hay que proteger contra lectura concurrente es el propio `Pedido`/`PedidoItem` (mismo lock que ya usa `ActualizarPedidoUseCase`/`AjustarPedidoCantidad`, `ADR-CONCURRENCIA-001`). Una vez creada la `ObligacionPendiente`, las operaciones subsiguientes (asignar, liberar, cumplir) usan `OBLIGACION:{id}` (contrato ya congelado, `ADR-OBLIGACION-001`).

**Idempotencia:** `offlineId @unique` en `ObligacionPendiente` (ya existe en el schema) + `offlineId @unique` en `Actividad` (ya existe). Un replay con el mismo `offlineId` no duplica ninguna de las dos filas.

### 3.2 `CambiarModoActividadUseCase`

**Entrada:** `{ actividadId, modoDestino, actorId, motivo, offlineId }`

**Contrato:**
```
LOCK OBLIGACION:{actividad.obligacionId}
  ↓
leer Actividad (debe estar ASIGNADA o EN_PROGRESO — no CUMPLIDA ni CANCELADA)
  ↓
si actividad.modo == modoDestino → no-op idempotente
  ↓
calcular diferencial (3.3) con el modo destino
  ↓
registrar evento de auditoría: { actividadId, modoAnterior, modoNuevo, actorId, motivo, diferencialCalculado, timestamp, offlineId }
  ↓
actualizar Actividad.modo = modoDestino
  ↓
si diferencial != 0 → aplicar consecuencia económica (3.4), bajo el mismo commit o en una tx anidada
  correctamente delimitada (nunca dos transacciones separadas para el mismo hecho — Plan Maestro V11.1 §5)
  ↓
COMMIT
```

**Nunca inferido automáticamente**: este caso de uso solo se invoca desde una acción explícita del usuario (endpoint dedicado). Ningún job/cron/trigger lo llama por sí solo (regla dura de la decisión 1.1/Caso E).

### 3.3 Cálculo de diferencial (función de dominio, sin efectos secundarios)

```ts
async function calcularDiferencial(
  pedidoItem: { producto: string; precio: number },  // precio = snapshot histórico
  cantidadPendiente: number,
  modoDestino: 'PUNTO' | 'DOMICILIO',
  clienteId: string,
  negocioId: string | null,
): Promise<{ valorHistorico: number; valorActual: number; diferencial: number }> {
  const valorHistorico = cantidadPendiente * pedidoItem.precio
  const [precioResuelto] = await resolverPreciosPedido(
    [{ codigo: pedidoItem.producto, cantidad: cantidadPendiente }],
    modoDestino, // 'PUNTO' | 'DOMICILIO' es el mismo tipo que `Canal`
    clienteId, negocioId,
  )
  const valorActual = precioResuelto.subtotal
  return { valorHistorico, valorActual, diferencial: valorActual - valorHistorico }
}
```

Reutiliza `resolverPreciosPedido` (`src/lib/pricing.ts`) sin modificarlo — **cero cambios al motor de precios**.

### 3.4 Consecuencia económica del diferencial

```
si diferencial > 0:
  LOCK PEDIDO:{pedidoId}
  Pedido.total += diferencial   (totalPagado sin cambios → saldo += diferencial, chk_pedido_saldo_calc se satisface solo)
  Factura.total += diferencial, Factura.saldo += diferencial (misma tx)
  PedidoCantidadAjuste { pedidoId, obligacionId, producto, cantidadOriginal, cantidadNueva, delta: 0 (no cambia cantidad, solo precio), motivo: 'Diferencial DOMICILIO', autorizadoPorId, montoDiferencial: diferencial }
  COMMIT
  (el cobro del diferencial usa el flujo YA EXISTENTE de pagar-fiado/cartera —
   sin caso de uso de cobro nuevo)

si diferencial < 0:
  LOCK CARTERA:{clienteId}   (mismo lock que pagar-fiado, Plan Maestro V11.1 §6)
  Cliente.saldoFavor += abs(diferencial)
  PedidoCantidadAjuste { ...mismo registro..., montoDiferencial: diferencial }  (negativo, para que la suma en Caso I sea aritméticamente correcta)
  COMMIT

si diferencial == 0:
  PedidoCantidadAjuste { ...montoDiferencial: 0 }  (se registra igual, para trazabilidad — "se evaluó y no generó ajuste")
```

**No se emite ningún documento fiscal en este flujo** (nota débito/factura por diferencia) — eso queda bloqueado por el gate externo (§9 de la Especificación Funcional). El `Pedido.total`/`Factura.total` sí se actualizan porque son el ledger comercial interno, no un documento fiscal.

### 3.4bis Guard obligatorio en el flujo ORDINARIO de entrega (`I-11`, hallazgo adversarial)

`EntregarPedidoUseCase` (y la rama COMPLETO/PARCIAL de `procesar-pedido.service.ts` en el cierre de embarque) deben, antes de aceptar una cantidad de entrega para un producto de un `Pedido`, verificar si existe una `ObligacionPendiente` `ABIERTA` para ese `Pedido`+producto:

```
si existe ObligacionPendiente ABIERTA para (pedidoId, producto):
   limiteOrdinario = PedidoItem.cantPedido - ObligacionPendiente.cantidadOriginal
   si la cantidad de entrega ordinaria solicitada > (limiteOrdinario - PedidoItem.cantEntrega):
      rechazar con SOBREPOSICION_CON_OBLIGACION_ACTIVA
```

Esto evita que el mismo remanente físico se entregue dos veces: una vez por la vía ordinaria (`EntregarPedidoUseCase`), otra por el cumplimiento de la `Actividad` que lo tiene bajo gestión. **Es un cambio bloqueante** a un caso de uso ya existente (no es opcional ni "nice to have") — sin este guard, `GestionarPendienteUseCase` introduce un vector real de doble entrega.

### 3.5 `LiberarActividadUseCase` (Caso J)

**Entrada:** `{ actividadId, motivo, actorId, offlineId }`

**Contrato:**
```
LOCK OBLIGACION:{actividad.obligacionId}
  ↓
leer Actividad (debe estar ASIGNADA o EN_PROGRESO)
  ↓
Actividad.estado = CANCELADA, Actividad.embarqueId = null (si tenía)
  ↓
ObligacionPendiente.cantidadAsignada -= actividad.cantidad
  ↓
si ObligacionPendiente.cantidadCumplida == 0 y no quedan Actividades activas → ObligacionPendiente.estado = ANULADA
  ↓
si había un diferencial YA CONFIRMADO Y COBRADO (PedidoCantidadAjuste.montoDiferencial != 0 asociado):
   revertir vía registrarReversionPedido (patrón ya existente, ADR-CORRECCION-MONETARIA-001) +
   ReceivableEntry tipo REVERSION
  ↓
logAudit(entidad: 'ObligacionPendiente'/'Actividad', accion: 'CANCELADA', motivo, actorId)
  ↓
COMMIT
```

---

## 4. Estados y transiciones

### 4.1 `ObligacionPendiente.estado`

```
ABIERTA → CUMPLIDA   (cuando cantidadCumplida alcanza cantidadOriginal)
ABIERTA → ANULADA    (Caso J, vía LiberarActividadUseCase cuando no queda Actividad activa)
CUMPLIDA → (terminal)
ANULADA → (terminal)
```

### 4.2 `Actividad.estado`

Sin cambios respecto al contrato ya congelado (`ADR-ACTIVIDAD-001`): `ASIGNADA → EN_PROGRESO → CUMPLIDA`, o `ASIGNADA/EN_PROGRESO → CANCELADA`.

### 4.3 `Actividad.modo`

No es una máquina de estados con transiciones restringidas — es un valor mutable únicamente a través de `CambiarModoActividadUseCase` (nunca un `UPDATE` directo). La restricción no es "qué modo sigue a qué modo" (`PUNTO↔DOMICILIO` es simétrico) sino "quién y cómo puede cambiarlo" (§3.2).

---

## 5. Persistencia

Todas las tablas nuevas/campos son **aditivos**:
- `Actividad.modo` (columna nueva, nullable).
- `PedidoCantidadAjuste.montoDiferencial` (columna nueva, nullable).

Ninguna migración destructiva. Ninguna tabla nueva (se reutiliza `PedidoCantidadAjuste`).

---

## 6. Concurrencia

| Operación | Lock | Justificación |
|---|---|---|
| Crear `ObligacionPendiente`/`Actividad` (Gestionar pendiente) | `PEDIDO:{pedidoId}` | El agregado leído/validado es `Pedido`/`PedidoItem`, que todavía no tiene Obligación asociada en ese instante |
| Asignar/cumplir sobre una `ObligacionPendiente` existente | `OBLIGACION:{obligacionId}` | Ya congelado, `ADR-OBLIGACION-001` |
| Cambiar modo | `OBLIGACION:{obligacionId}` | Muta `Actividad.modo`, que cuelga de la Obligación |
| Liberar/cancelar Actividad | `OBLIGACION:{obligacionId}` | Simétrico a asignar |
| Aplicar diferencial positivo | `PEDIDO:{pedidoId}` (anidado dentro de la tx de `CambiarModoActividadUseCase` — nunca una tx externa separada, Plan Maestro V11.1 §5) | Muta `Pedido.total`/`Factura` |
| Aplicar diferencial negativo | `CARTERA:{clienteId}` | Muta `Cliente.saldoFavor`, mismo lock que `pagar-fiado` |

**Prueba obligatoria de concurrencia (nueva, no cubierta por 34A/B/C):** dos "Gestionar pendiente" concurrentes sobre el **mismo** `Pedido`/`PedidoItem` con cantidades que juntas exceden el remanente — el segundo debe rechazarse por el lock `PEDIDO:{pedidoId}` + la validación de cantidad, nunca crear una `ObligacionPendiente` con `cantidadOriginal` mayor al remanente real.

---

## 7. Idempotencia

| Comando | Clave |
|---|---|
| `GestionarPendienteUseCase` | `offlineId` en `ObligacionPendiente` y en `Actividad` (ambos ya `@unique` en el schema) |
| `CambiarModoActividadUseCase` | `offlineId` nuevo — requiere campo en el evento de auditoría o una tabla de eventos con `offlineId @unique` (ver §12) |
| `LiberarActividadUseCase` | `offlineId` nuevo, mismo mecanismo |
| Aplicación del diferencial | **Corrección (2026-09-05): `PedidoCantidadAjuste.offlineId String? @unique` YA EXISTE en el schema** (`schema.prisma:1231`, verificado antes de implementar). El error estaba en la verificación de este mismo documento — no hace falta migrarlo. Cada `PedidoCantidadAjuste` que aplica un diferencial usa ese campo para dedup, igual que `ObligacionPendiente`/`Actividad`. |

**Regla del Plan Maestro V11.1 §14 aplicada:** el `offlineId` de "Gestionar pendiente" NO se reutiliza para "cambiar modo" ni para "liberar" — son comandos semánticamente distintos, cada uno con su propia clave.

---

## 8. Auditoría

Todo cambio de modo, creación/liberación de Obligación/Actividad, y aplicación de diferencial pasa por `logAudit` (mecanismo ya existente, `src/lib/audit.ts`) con como mínimo: `entidad, registroId, accion, actorId, datos (antes/después), motivo (cuando aplique), offlineId, timestamp`.

Esto es lo que permite reconstruir, sin tocar el histórico:
```
Pedido original → unidades entregadas → unidades pendientes → decisión de
gestionar (evento de auditoría de GestionarPendienteUseCase) → ObligacionPendiente
→ Actividad → modo (evento de auditoría de cada CambiarModoActividadUseCase) →
Embarque → cumplimiento → consecuencia económica (PedidoCantidadAjuste con
montoDiferencial, trazable por su propio id + timestamp)
```

---

## 9. Seguridad

- Todas las operaciones (`GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase`) pasan por `requireAuth`/`requireRole` (patrón ya establecido en toda la app).
- Ownership operativo: un `REPARTIDOR` solo puede gestionar pendientes de pedidos en embarques donde está asignado (mismo patrón de `requireOwnership` ya existente); `ADMIN`/`ASISTENTE` sin restricción, auditados.
- Ningún `modo`, cantidad o estado enviado por el frontend se usa sin validación server-side (mismo principio que el resto de la app — nunca confiar en el cliente).

---

## 10. Errores (contratos de rechazo)

| Código | Cuándo |
|---|---|
| `PEDIDO_NOT_FOUND` | pedido inexistente |
| `CANTIDAD_EXCEDE_PENDIENTE` | `Gestionar pendiente` solicita más de `cantPedido − cantEntrega` |
| `OBLIGACION_NOT_FOUND` | actividad/liberación sobre obligación inexistente |
| `ACTIVIDAD_NO_MODIFICABLE` | cambiar modo o liberar una `Actividad` ya `CUMPLIDA`/`CANCELADA` |
| `SOBRECONSUMO_OBLIGACION` | violación de `cantidadCumplida + cantidadAsignada <= cantidadOriginal` (ya cubierto por constraint DB, el caso de uso debe mapearlo a un error de dominio legible) |
| `SOBREPOSICION_CON_OBLIGACION_ACTIVA` | (`I-11`) el flujo ordinario de entrega intenta entregar cantidad que ya está bajo gestión de una `ObligacionPendiente` `ABIERTA` |

---

## 11. Observabilidad

Métricas nuevas (mismo patrón que Plan Maestro V11.1 §24):
```
obligacion_pendiente_creada_count
obligacion_pendiente_bajo_demanda_ratio   (creadas / pendientes-detectados-mostrados — verifica que NO se crean automáticamente)
cambio_modo_actividad_count{modo_origen, modo_destino}
diferencial_positivo_total
diferencial_negativo_total
diferencial_cero_count
obligacion_liberada_count
```

---

## 12. UX necesaria (mínima, sin diseñar la pantalla completa)

- Vista "Pendientes" (derivada de `Pedido`/`PedidoItem`, **sin** materializar `ObligacionPendiente` para listarlos — I-4/decisión 1.3): lista de pedidos con `cantPedido > cantEntrega`, acción "Gestionar pendiente".
- Modal/flujo "Gestionar pendiente": selección de cantidad, selección de modo, **si el modo implica diferencial → mostrarlo antes de confirmar** (nunca cobrar/acreditar sin mostrarlo primero — mismo principio que cualquier cambio de precio en la app).
- Indicador "modo actual" en la vista de la `Actividad`/pedido en curso, distinto del "canal original" del pedido (ALS v1, §16 del `CUMPLIMIENTO_PARCIAL_ALS_v2.md`, ya decidido).

---

## 13. Pruebas

Ver `AGUA_BAMBU_N2_MATRIZ_PRUEBAS_v1.0.md` para el detalle caso-por-caso. Resumen de las categorías obligatorias (Plan Maestro V11.1 §20, extendido):

- Unitarias: invariantes de cantidad (reutilizan 34A/B/C), cálculo de diferencial (F/G/H), transición de modo, idempotencia de cada comando nuevo.
- Integración (Postgres real): concurrencia de dos "Gestionar pendiente" sobre el mismo pedido, liberación concurrente, cumplimiento parcial fraccionado (Caso I), cancelación (Caso J) con y sin diferencial ya cobrado.
- E2E: gestionar pendiente → PUNTO, gestionar pendiente → DOMICILIO con diferencial, cambiar modo antes de ejecutar, cancelar antes de ejecutar.

---

## 14. Migraciones

```sql
-- Aditiva, reversible. PedidoCantidadAjuste.offlineId YA EXISTE — no se migra.
CREATE TYPE "ModoActividad" AS ENUM ('PUNTO', 'DOMICILIO');
ALTER TABLE "Actividad" ADD COLUMN "modo" "ModoActividad";
ALTER TABLE "PedidoCantidadAjuste" ADD COLUMN "montoDiferencial" DECIMAL(10,2);
```

Aplicada en `prisma/migrations/20260905_add_actividad_modo_diferencial/migration.sql`.

Sin backfill: no hay `Actividad` en producción hoy (verificado, cero callers), así que no hay filas históricas que requieran un valor de `modo`.

---

## 15. Compatibilidad

- No se toca `Pedido.canal` (sigue inmutable, ADR-PEDIDO-ORIGEN-CANAL-001).
- No se toca el flujo ordinario de entrega parcial (PR-1) — el nuevo flujo es puramente aditivo, activado solo por "Gestionar pendiente".
- No se toca `ADR-PLANIFICADOR-003`/`006` — el planificador de rutas MVP sigue sin referenciar `Actividad`/`ObligacionPendiente`.

---

## 16. Definition of Done

- [ ] `Actividad.modo` migrado, con VO de dominio (mismo patrón que `CanalVO`).
- [ ] `GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase` implementados bajo los locks de §6, con dedup por `offlineId` (§7).
- [ ] Cálculo de diferencial reutiliza `resolverPreciosPedido` sin modificarlo.
- [ ] `Pedido.total`/`Factura` se actualizan correctamente en diferencial positivo; `Cliente.saldoFavor` en negativo; ninguno en cero.
- [ ] `PedidoCantidadAjuste.montoDiferencial` registra cada evento, incluso los de diferencial $0.
- [ ] Caso I (múltiples parciales) no duplica cobro ni atribución.
- [ ] Caso J (cancelación) revierte correctamente, incluido el diferencial ya cobrado.
- [ ] Cero cambios en `Pedido.canal`, en el flujo ordinario de PR-1, ni en el planificador MVP.
- [ ] `EntregarPedidoUseCase`/cierre de embarque respetan `I-11` — no se puede entregar por la vía ordinaria una cantidad ya bajo gestión de una `ObligacionPendiente` `ABIERTA` (hallazgo adversarial, bloqueante).
- [ ] El diferencial que se cobra/acredita es siempre el recalculado en la transacción de confirmación, nunca el valor de un preview stale.
- [ ] Ningún documento fiscal se emite (bloqueado hasta el gate externo).
- [ ] Matriz de pruebas de `AGUA_BAMBU_N2_MATRIZ_PRUEBAS_v1.0.md` en verde.
