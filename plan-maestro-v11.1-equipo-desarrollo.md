# PLAN MAESTRO DE EVOLUCIÓN — V11.1
## Embarques, distribución, cartera, ledgers, offline y conciliación

**Estado:** PLAN DE IMPLEMENTACIÓN PARA EL EQUIPO DE DESARROLLO  
**Versión:** V11.1  
**Base:** V9 auditada + correcciones de esta auditoría  
**Objetivo:** congelar un contrato técnico coherente antes de implementar las fases.

---

# 0. Propósito y regla de trabajo

Este documento es el **plan maestro operativo** para el equipo de desarrollo. Debe poder utilizarse sin consultar versiones anteriores.

La arquitectura se considera correcta solamente cuando los casos normales, excepcionales, offline, concurrentes, históricos, fraudulentos, parciales y de recuperación conservan la misma verdad del negocio sin destruir información ni crear hechos falsos.

### Regla de convergencia

Cada dato crítico tiene un único canónico; las proyecciones están identificadas explícitamente; cada comando reintentable tiene idempotencia; cada operación concurrente sobre un agregado compartido tiene lock/constraint explícito; los históricos no requieren inventar datos; los tests prueban comportamiento real y concurrencia real; cada fase tiene rollback; y no existen contradicciones entre prosa, schema, API, invariantes y pruebas.

**Si una implementación propuesta por un PR contradice este documento, el PR debe detenerse y actualizar el ADR correspondiente. No se resuelve la contradicción agregando un `if` local.**

---

# 1. Arquitectura objetivo

El sistema se organiza en cuatro ledgers separados:

```text
1. OBLIGACIONES COMERCIALES
   Pedido / Actividad / ObligacionPendiente / PedidoCantidadAjuste / PromotionRule

2. LEDGER FÍSICO
   EmbarqueCarga / EmbarqueMovimiento / Retorno / Sustitucion / RecoveryDecision

3. LEDGER MONETARIO
   Pago / Abono / Gasto
   ReceivableEntry = proyección de auditoría, no fuente primaria

4. LEDGER DE RESPONSABILIDAD
   ResponsibilityCase → DescuentoRepartidor / DeudaTrabajador
```

Encima de estos:

```text
Ruta          = planificación
Embarque      = contexto operacional / ejecución
Actividad     = trabajo ejecutable
Conciliación  = reconstrucción y validación
Cierre        = cierre formal
Auditoría     = evidencia
Comunicación  = transparencia externa
```

## Definiciones congeladas

### Pedido

`Pedido` es una obligación comercial.

No representa:

- carga;
- ruta;
- custodia física;
- pago físico;
- deuda completa de cartera;
- retorno;
- regalo;
- actividad posterior.

`Pedido.saldo` y `Pedido.totalPagado` son la fuente canónica del balance por pedido.

`ReceivableEntry` es una proyección de auditoría derivada y nunca una segunda fuente de verdad.

### PedidoCantidadAjuste

Modificación autorizada de la obligación original, serializada bajo lock del pedido.

### ObligacionPendiente

Obligación operativa persistente.

```text
cantidadOriginal
cantidadCumplida
cantidadAsignada
cantidadDisponible = cantidadOriginal - cantidadCumplida - cantidadAsignada
```

`cantidadDisponible` no se almacena.

### Actividad

Trabajo ejecutable. Puede existir sin embarque asignado.

Debe existir como máximo una asignación activa protegida por constraint de base de datos.

### Ruta

Planificación. No representa custodia física ni dinero.

### Embarque

Operación de distribución ejecutable. Puede contener múltiples cargas, vehículos, actividades, incidencias, movimientos y cobros.

---

# 2. Fuente de verdad por entidad

| Entidad | Rol |
|---|---|
| `Pedido.saldo` / `Pedido.totalPagado` | Canónico |
| `Pago` / `Abono` / `Gasto` | Hechos monetarios canónicos |
| `ReceivableEntry` | Proyección de auditoría |
| `EmbarqueMovimiento` | Ledger físico canónico |
| `EmbarqueCargaProducto` | Snapshot/detalle de carga, no ledger |
| `EmbarqueProducto` | Legacy mirror durante migración |
| `Trabajador.capacidadKg` | Legacy mirror hasta consolidación |
| `Cliente.saldoFavor` | Canónico |
| `ResponsibilityCase` | Caso de investigación/responsabilidad |
| `DescuentoRepartidor` / `DeudaTrabajador` | Hecho económico derivado de una resolución autorizada |

**No pueden existir dos fuentes de verdad competidoras para el mismo dato crítico.**

---

# 3. Correcciones obligatorias V11.1

Esta sección contiene las correcciones que deben incorporarse antes de congelar el plan.

## 3.1 `RecoveryDecision.cantidadDisponibleEnOrigen` es nullable

### Problema corregido

Un `SOBRANTE` puede tener un evento físico de origen.

Un `FALTANTE` no necesariamente tiene un evento físico que pueda consumirse.

Por tanto:

```prisma
cantidadDisponibleEnOrigen Int?
```

### Semántica

#### SOBRANTE

```text
sourceEventId                 = EmbarqueMovimiento.id
cantidadDisponibleEnOrigen   = cantidad disponible en el origen
cantidad                      = cantidad solicitada
cantidadAplicada              = cantidad realmente aplicada
```

#### FALTANTE

```text
sourceEventId                 = NULL
cantidadDisponibleEnOrigen   = NULL
cantidad                      = cantidad de faltante que se pretende resolver
cantidadAplicada              = cantidad efectivamente resuelta por esta decisión
```

No debe inventarse un evento físico de origen para representar un faltante.

### Invariante

```text
0 <= cantidadAplicada <= cantidad
```

Para `SOBRANTE`:

```text
sum(cantidadAplicada de decisiones del mismo sourceEventId)
<= cantidad físicamente disponible en el origen
```

Para `FALTANTE`, no se aplica la regla anterior porque no existe un origen físico consumible.

---

# 4. `RecoveryDecision`

Modelo conceptual:

```prisma
model RecoveryDecision {
  id                       String   @id @default(cuid())
  embarqueId               String
  sourceEventId            String?
  cantidadDisponibleEnOrigen Int?
  cantidad                 Int
  cantidadAplicada         Int
  tipo                     String
  producto                 String
  pedidoOrigenId           String?
  pedidoDestinoId          String?
  resultado                String
  actorId                  String
  authorizedById           String?
  reason                   String
  createdAt                DateTime @default(now()) @db.Timestamptz()
  offlineId                String?  @unique

  @@index([embarqueId])
  @@index([sourceEventId])
  @@index([pedidoDestinoId])
  @@index([resultado])
}
```

## Flujo obligatorio para SOBRANTE

```text
LOCK(sourceEventId)
    ↓
resolver EmbarqueMovimiento
    ↓
determinar disponibilidad física
    ↓
sumar cantidadAplicada de decisiones previas
    ↓
validar cantidad restante
    ↓
crear RecoveryDecision
    ↓
crear movimiento físico resultante
    ↓
COMMIT
```

## Flujo obligatorio para FALTANTE

```text
NO sourceEventId
    ↓
validar existencia de la discrepancia
    ↓
LOCK del agregado afectado
    ↓
determinar cuánto faltante sigue sin resolver
    ↓
crear RecoveryDecision
    ↓
registrar la consecuencia correspondiente
    ↓
COMMIT
```

---

# 5. Contrato definitivo de advisory locks

El sistema debe reutilizar un único mecanismo de advisory locks.

## Regla fundamental

`withAdvisoryLock()` es **dueño de la transacción** cuando el caso de uso requiere adquirir el lock.

No se permite:

```text
transaction externa
    ↓
withAdvisoryLock()
    ↓
transaction interna
```

ni:

```text
withAdvisoryLock()
    ↓
abrir otra transacción para modificar el mismo agregado
```

Todo el trabajo protegido debe ejecutarse dentro de la transacción que adquirió el lock.

## API recomendada

```ts
withAdvisoryLock(namespace, entityKey, async (tx) => {
  // read
  // validate
  // write
  // side effects transaccionales
  // commit
})
```

Si algún caso excepcional necesita recibir una transacción ya abierta, deberá existir una variante explícita:

```ts
withAdvisoryLockTx(tx, namespace, entityKey, ...)
```

No se debe abrir una segunda transacción.

## Clave del lock

La clave debe ser determinista a partir de:

```text
namespace + ":" + entityKey
```

Preferir un hash de 64 bits (`hashtextextended` o mecanismo equivalente) frente a un hash de 32 bits.

La posible colisión del hash no debe utilizarse como semántica de identidad; como máximo produciría contención adicional.

---

# 6. Agregado correcto de cada lock

El lock debe proteger el agregado cuya lectura y escritura puedan competir.

| Operación | Lock |
|---|---|
| Pago FIFO de cartera | `CARTERA:clienteId` |
| Ajuste de pedido | `PEDIDO:pedidoId` |
| Recovery de sobrante | `RECOVERY_SOURCE:sourceEventId` |
| Cumplimiento de obligación | `OBLIGACION:obligacionId` |
| Carga activa | `EMBARQUE_CARGA:embarqueId` o agregado equivalente |
| Cierre | `CIERRE:embarqueId` |
| Generación de secuencia | namespace de secuencia |

## Cartera

Este punto es obligatorio.

Como un pago puede distribuirse FIFO entre múltiples pedidos del mismo cliente, el agregado concurrentemente afectado es la cartera del cliente, no un único pedido.

Flujo:

```text
LOCK CARTERA(clienteId)
    ↓
leer pedidos con saldo > 0
    ↓
ordenar FIFO
    ↓
aplicar pago
    ↓
actualizar Pedido.saldo / totalPagado
    ↓
crear hechos monetarios
    ↓
generar ReceivableEntry como proyección
    ↓
COMMIT
```

---

# 7. `ObligacionPendiente`

Semántica congelada:

```text
cantidadOriginal
= cantidad original de la obligación

cantidadCumplida
= unidades ya consolidadas como cumplimiento real

cantidadAsignada
= unidades comprometidas a una Actividad pero todavía NO consolidadas como cumplimiento

cantidadDisponible
= cantidadOriginal - cantidadCumplida - cantidadAsignada
```

Invariante:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

Toda operación que incremente `cantidadAsignada` o `cantidadCumplida` debe:

```text
LOCK(obligacionId)
    ↓
leer cantidades actuales
    ↓
calcular disponible
    ↓
validar
    ↓
actualizar
    ↓
crear/actualizar Actividad
    ↓
COMMIT
```

### Tests obligatorios

No basta con comprobar que "solo una actividad gana".

Hay que demostrar que nunca se sobreconsume:

```text
34A — dos operaciones concurrentes
34B — múltiples operaciones concurrentes
34C — retry/concurrencia con offlineId
```

El resultado debe mantener siempre:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

---

# 8. Ledger físico: `EmbarqueMovimiento`

`cantidad` siempre es positiva.

El efecto nunca se interpreta por el signo de `cantidad`.

## Tabla obligatoria

| Tipo | Efecto |
|---|---|
| `CARGA` | + custodia del vehículo/carga |
| `RECARGA` | + custodia del vehículo/carga |
| `ENTREGA` | - custodia hacia cliente |
| `VENTA_RUTA` | - custodia hacia venta espontánea |
| `RETORNO` | - custodia del repartidor, + custodia de inspección |
| `REEMPAQUE` | neutro en cantidad total; puede reclasificar |
| `DESCARTE` | - salida definitiva |
| `CUSTODY_TRANSFER` | - origen / + destino |
| `PROMOCION` | consume inventario como una entrega, sin cobro |
| `AJUSTE_AUTORIZADO` | efecto explícito `INCREASE` o `DECREASE` |

## `AJUSTE_AUTORIZADO`

Debe contener:

```json
{
  "effect": "INCREASE"
}
```

o:

```json
{
  "effect": "DECREASE"
}
```

Además:

```text
authorization != NULL
userId != NULL
```

Sin `metadata.effect` válido, el movimiento se rechaza.

---

# 9. Sustitución: separar hechos físicos

No utilizar `SUSTITUCION` como un movimiento ambiguo que simultáneamente quite y agregue inventario.

Una sustitución es una operación de negocio que produce hechos físicos separados.

Ejemplo:

```text
Sustitución #123

Movimiento físico 1:
  tipo = RECEPCION_DEFECTUOSA
  cantidad = 1
  repartidor → inspección

Movimiento físico 2:
  tipo = ENTREGA
  cantidad = 1
  repartidor → cliente
```

La entidad `Sustitucion` vincula ambos hechos.

### Regla

Un `EmbarqueMovimiento` representa un hecho físico dirigido.

Si una operación tiene dos efectos físicos independientes, debe producir dos movimientos.

---

# 10. `availabilityBasis`

`availabilityBasis` es únicamente metadata de validación al crear una carga:

```text
CONFIRMED_STOCK
PRODUCTION_CONFIRMED
ESTIMATED
MIXED
```

No representa el hecho físico.

Nunca debe utilizarse para inferir cuánto se cargó.

El hecho físico es:

```text
EmbarqueCargaProducto.cantidad
```

y posteriormente el ledger físico.

---

# 11. `VentaLibre`

Cada venta espontánea individual debe distinguir:

```text
occurredAt
capturedAt
serverReceivedAt
offlineId
```

Semántica:

```text
occurredAt
= cuándo ocurrió la venta según el operador

capturedAt
= cuándo el dispositivo generó el registro local

serverReceivedAt
= cuándo llegó al servidor
```

El servidor puede clasificar:

```text
NORMAL
TARDIA
SOSPECHOSA
```

según la diferencia temporal.

Una venta tardía legítima **no se bloquea automáticamente**.

El objetivo es hacerla auditable y detectable, no destruir la operación offline.

Retry con el mismo `offlineId` no puede crear otra venta.

---

# 12. Cartera y `ReceivableEntry`

`Pedido.saldo` es la fuente canónica.

`ReceivableEntry.saldoResultante` es solamente un snapshot/proyección derivada.

Nunca debe calcularse como si fuera un ledger monetario independiente.

### Regla

```text
Pago/Abono
    ↓
actualiza Pedido.saldo
    ↓
en la misma transacción
    ↓
genera ReceivableEntry
```

Si existe divergencia entre una proyección y el canónico:

```text
NO autocorregir silenciosamente
NO inventar movimientos
NO alterar el histórico
```

Registrar:

```text
DUAL_WRITE_DIVERGENCE
```

Si la divergencia supera el umbral configurable:

```text
DETENER ROLLOUT DE LA FASE
```

---

# 13. Responsabilidad

La detección de una responsabilidad puede ser automática.

La transferencia económica de la deuda al trabajador/repartidor **nunca puede ser automática**.

Flujo:

```text
detección
   ↓
ResponsibilityCase
   ↓
investigación
   ↓
resolución
   ↓
si RESUELTA_CON_CARGO:
      autorizadoPorId obligatorio
      resueltoPorId obligatorio
   ↓
crear hecho económico
```

`resueltoPorId` por sí solo no autoriza un cargo.

`embarqueId` puede ser nullable porque una investigación puede ocurrir días después de la operación.

---

# 14. Idempotencia

Todo comando reintentable offline debe tener una clave idempotente.

Ejemplos:

```text
offlineId @unique
```

Cuando un comando puede generar múltiples hechos relacionados, distinguir:

```text
offlineId
batchId
```

No asumir que un `offlineId` compartido significa que todas las filas individuales deben tener semántica idéntica.

Retry:

```text
mismo comando + mismo offlineId
→ mismo resultado lógico
→ cero duplicación
```

Dos comandos diferentes:

```text
offlineId diferente
→ deben evaluarse como comandos distintos
```

---

# 15. Histórico

Nunca inventar:

- vehículo;
- cliente;
- precio;
- cobro;
- autorización;
- ruta;
- actividad;
- custodia.

Cuando un histórico no tiene información suficiente:

```text
NULL / UNKNOWN / contexto faltante
```

según la semántica del modelo.

No rellenar datos históricos con valores plausibles.

---

# 16. Botellones

Un botellón recogido sin entrega todavía es un estado válido y consultable.

Debe conservarse la diferencia entre:

```text
recogido
≠
entregado
```

No transformar automáticamente una recogida en una entrega.

---

# 17. Regalos y promociones

Un regalo autorizado:

```text
consume inventario exactamente una vez
```

Debe existir autorización auditable.

Una promoción no debe convertirse en un cobro ficticio.

El ledger físico debe reflejar el consumo aunque el precio comercial sea cero.

---

# 18. Guardrails obligatorios para todos los PR

El equipo NO debe:

- crear una segunda fuente de verdad para un dato crítico;
- calcular `ReceivableEntry.saldoResultante` como ledger independiente;
- transferir deuda a un trabajador sin workflow de resolución autorizada;
- permitir doble consumo de un mismo `RecoveryDecision` source;
- permitir sobreconsumo de `ObligacionPendiente`;
- interpretar el signo de `EmbarqueMovimiento.cantidad`;
- registrar sustituciones como un único movimiento con dos efectos ambiguos;
- abrir transacciones anidadas alrededor de `withAdvisoryLock`;
- inventar datos históricos;
- autocorregir divergencias silenciosamente;
- agregar tablas/columnas fuera de los hallazgos aprobados de esta ronda.

---

# 19. ADRs obligatorios

1. `ADR-FISICO-001`
2. `ADR-MONETARIO-001`
3. `ADR-CARTERA-001`
4. `ADR-OBLIGACION-001`
5. `ADR-ACTIVIDAD-001`
6. `ADR-PROMOCION-001`
7. `ADR-CUSTODIA-001`
8. `ADR-RESPONSABILIDAD-001`
9. `ADR-CIERRE-001`
10. `ADR-CAPACIDAD-001`
11. `ADR-STOCK-001`
12. `ADR-IDEMPOTENCIA-001`
13. `ADR-CONCURRENCIA-001`
14. `ADR-OFFLINE-001`
15. `ADR-REASIGNACION-001`
16. `ADR-BOTELLONES-001`
17. `ADR-RECUPERACION-001`
18. `ADR-COMUNICACIONES-001`
19. `ADR-MIGRACION-001`
20. `ADR-PRECIO-VOLUMEN-001`
21. `ADR-AUTORIZACION-REGALOS-001`

Los ADR deben reflejar exactamente este contrato.

---

# 20. Tests mínimos de aceptación

## Fuente de verdad

- `Pedido.saldo` sigue siendo canónico.
- `ReceivableEntry` no puede convertirse en ledger competidor.
- divergencia dual-write detectable.

## Concurrencia

- dos pagos concurrentes sobre la misma cartera;
- dos ajustes concurrentes del mismo pedido;
- dos `RecoveryDecision` sobre el mismo source;
- múltiples actividades intentando cumplir la misma obligación;
- retry concurrente del mismo `offlineId`.

## Físico

- carga;
- entrega;
- venta de ruta;
- retorno;
- reempaque;
- descarte;
- transferencia de custodia;
- promoción;
- ajuste autorizado;
- sustitución como dos hechos físicos.

## Histórico

- operación sin vehículo histórico disponible;
- responsabilidad sin embarque activo;
- venta offline tardía;
- recuperación posterior.

## Antifraude

- dos ventas libres distintas;
- retry de la misma venta;
- venta tardía;
- venta sospechosa;
- dos autorizaciones intentando cargar la misma responsabilidad;
- regalo aplicado dos veces.

---

# 21. Gate de aprobación final

Antes de comenzar la implementación de las fases, todos deben quedar en `PASS`.

### Gate 1 — Fuente de verdad

- [ ] Cada dato crítico tiene un único canónico.
- [ ] Las proyecciones están identificadas.
- [ ] Los legacy mirrors están identificados.
- [ ] No existen dos ledgers monetarios competidores.

### Gate 2 — Concurrencia

- [ ] `RecoveryDecision` protegido por lock.
- [ ] `ObligacionPendiente` protegido por lock.
- [ ] `PedidoCantidadAjuste` protegido por lock.
- [ ] Cartera protegida por `clienteId`.
- [ ] `Actividad` protegida.
- [ ] Carga activa protegida.
- [ ] El helper de locks no genera transacciones anidadas.

### Gate 3 — Histórico

- [ ] No se inventan vehículos.
- [ ] No se inventan clientes.
- [ ] No se inventan precios.
- [ ] No se inventan cobros.
- [ ] No se inventan autorizaciones.
- [ ] No se inventan rutas.

### Gate 4 — Antifraude

- [ ] `VentaLibre` distingue ocurrencia/captura/recepción.
- [ ] Retry no duplica.
- [ ] Ventas tardías son detectables.
- [ ] Regalos son auditables.
- [ ] Responsabilidad puede investigarse sin embarque activo.
- [ ] Cargo económico requiere autorización explícita.

### Gate 5 — Físico

- [ ] La semántica tipo→efecto está documentada.
- [ ] `cantidad` siempre es positiva.
- [ ] Entrada/salida es inequívoca.
- [ ] Custodia es inequívoca.
- [ ] Recovery no duplica unidades.
- [ ] Retorno no crea inventario disponible automáticamente.
- [ ] Sustitución no mezcla dos hechos físicos en una sola fila.
- [ ] Ajuste autorizado exige `metadata.effect`.

### Gate 6 — Contrato V11.1

- [ ] `RecoveryDecision.sourceEventId` es nullable para FALTANTE.
- [ ] `cantidadDisponibleEnOrigen` es nullable.
- [ ] `cantidadAplicada` tiene significado inequívoco.
- [ ] `cantidadOriginal/cumplida/asignada` tienen significado inequívoco.
- [ ] `cantidadDisponible` es derivada.
- [ ] `ResponsibilityCase.autorizadoPorId` es obligatorio para cargo.
- [ ] `VentaLibre` tiene los tres timestamps.
- [ ] `availabilityBasis` no representa stock físico.
- [ ] `withAdvisoryLock` tiene contrato transaccional explícito.
- [ ] El lock de cartera es por `clienteId`.

**Si algún punto es `NO`, el programa no ha convergido y no debe pasar a implementación de la fase correspondiente.**

---

# 22. Verificación técnica por fase

En cada fase:

```bash
npx tsc --noEmit
npm run test
npx prisma validate
```

Además, ejecutar los tests de comportamiento y concurrencia específicos de la fase antes de habilitarla.

Ninguna fase se considera terminada solamente porque compile.

Debe demostrar:

```text
schema
+
API
+
servicio
+
transacción
+
concurrencia
+
offline
+
auditoría
+
rollback
```

---

# 23. Estrategia de implementación

Orden recomendado:

```text
FASE 0
Congelar contratos + ADRs + locks

FASE 1
Infraestructura de concurrencia e idempotencia

FASE 2
Ledger físico

FASE 3
Obligaciones y actividades

FASE 4
Recovery

FASE 5
Cartera / conciliación

FASE 6
Responsabilidad

FASE 7
Offline / ventas libres

FASE 8
Migración y dual-write

FASE FINAL
Conciliación + retiro progresivo de legacy mirrors
```

Cada fase debe tener:

```text
entrada
criterios de aceptación
migración
tests
observabilidad
rollback
gate
```

---

# 24. Observabilidad

Métricas mínimas:

```text
dual_write_divergence_count
recovery_decision_double_consumption_rejected_count
obligacion_double_fulfillment_rejected_count
pedido_ajuste_concurrency_conflict_count
venta_libre_tardia_count
venta_libre_sospechosa_count
responsibility_case_without_embarque_count
```

Las métricas no sustituyen invariantes ni constraints.

---

# 25. Elementos deliberadamente fuera de alcance

No incorporar en esta convergencia:

```text
CarteraAsignacion
sourceType/sourceId como columnas estructuradas
lifecycle enum adicional para EmbarqueCarga
taxonomía nueva de cola de rutas
```

Estos elementos pueden entrar en fases futuras mediante ADR propio.

No deben introducirse solamente porque un PR encuentre un caso conveniente.

---

# 26. Regla final para el equipo

La arquitectura no se considera correcta porque:

> "funciona en el caso normal".

Se considera correcta cuando:

```text
normal
+ excepcional
+ offline
+ concurrente
+ histórico
+ fraudulento
+ parcial
+ recuperación
```

conservan la misma verdad del negocio.

Un PR que contradiga este documento debe detenerse.

La solución correcta no es esconder la contradicción detrás de un `if`.

La solución correcta es:

```text
detener
→ identificar contradicción
→ actualizar ADR
→ actualizar contrato
→ actualizar schema/API/tests
→ volver a ejecutar el gate
→ continuar
```

**V11.1 es el contrato que debe utilizar el equipo para implementar las siguientes fases.**
