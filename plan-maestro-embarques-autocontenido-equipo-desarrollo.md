# PLAN MAESTRO DE EVOLUCIÓN — Contrato técnico
## Embarques, distribución, cartera, ledgers, offline y conciliación

**Estado:** PLAN DE IMPLEMENTACIÓN PARA EL EQUIPO DE DESARROLLO  
**Versión:** 1.0 — Documento autónomo de implementación
**Objetivo:** congelar un contrato técnico coherente antes de implementar las fases.

---

# 0. Propósito y regla de trabajo

# 0.1 Lectura autónoma

Este documento está diseñado para ser entregado al equipo como **primer y único documento de esta especificación**.

No requiere conocer ni recuperar otros planes, versiones, borradores, ADR históricos ni documentos previos para entender las decisiones aquí descritas.

Cuando se menciona “legacy”, significa únicamente **código o datos que ya existen en el repositorio actual y que todavía deben coexistir durante la migración**. No significa que el equipo deba buscar otro documento.

Cuando una regla describe el estado actual del sistema, el repositorio `main` auditado es la referencia técnica de implementación. Cuando una regla describe el estado objetivo, este documento es el contrato de diseño.


Este documento es el **plan maestro operativo** para el equipo de desarrollo. Debe poder utilizarse sin consultar versiones anteriores.

La arquitectura se considera correcta solamente cuando los casos normales, excepcionales, offline, concurrentes, históricos, fraudulentos, parciales y de recuperación conservan la misma verdad del negocio sin destruir información ni crear hechos falsos.

### Regla de convergencia

Cada dato crítico tiene un único canónico; las proyecciones están identificadas explícitamente; cada comando reintentable tiene idempotencia; cada operación concurrente sobre un agregado compartido tiene lock/constraint explícito; los históricos no requieren inventar datos; los tests prueban comportamiento real y concurrencia real; cada fase tiene rollback; y no existen contradicciones entre prosa, schema, API, invariantes y pruebas.

**Si una implementación propuesta por un PR contradice este documento, el PR debe detenerse y actualizar el ADR correspondiente. No se resuelve la contradicción agregando un `if` local.**

---

# 0.2 Alcance funcional cubierto

Este contrato cubre explícitamente los casos que deben poder reconstruirse y conciliarse:

- creación y gestión de embarques;
- múltiples cargas y recargas del mismo embarque;
- recarga antes de conciliar la carga anterior;
- cambio de vehículo/capacidad entre viajes;
- pedidos normales, parciales y no entregados;
- pedidos que quedan atrasados o atrapados en una ruta;
- reasignación por accidente/incidencia;
- cambios de cantidad solicitados por el cliente en el último momento;
- cliente que pide más unidades en ruta;
- cliente que pide menos unidades en ruta;
- redistribución de unidades liberadas;
- recuperación de sobrantes;
- recuperación de faltantes;
- venta libre/venta espontánea;
- ventas libres capturadas tardíamente;
- prevención y detección de ventas ficticias por volumen;
- regalos/promociones;
- retornos;
- pacas filtradas;
- pacas con empaque roto;
- pacas defectuosas;
- sustituciones parciales o completas;
- botellones recogidos en ruta;
- botellones cuyo servicio inicia en la empresa;
- botellones recogidos en domicilio y devueltos posteriormente;
- dinero cobrado por ventas del embarque;
- abonos de cartera recibidos durante la ruta;
- cobros de deudas que no pertenecen a los pedidos del embarque;
- deudas que vencen y requieren seguimiento;
- responsabilidad del repartidor cuando corresponde;
- comunicación opcional al cliente por WhatsApp;
- conciliación física, comercial y monetaria;
- trazabilidad de quién crea, gestiona, concilia y cierra;
- operación offline;
- reintentos e idempotencia;
- concurrencia entre usuarios;
- migración progresiva desde el modelo legacy;
- reconstrucción histórica sin inventar datos.

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

# 1.1 Actores y responsabilidades

## Repartidor

Puede registrar hechos operativos reales:

- entregas;
- cantidades realmente entregadas;
- diferencias reportadas por el cliente;
- ventas libres;
- cobros;
- abonos de cartera;
- retornos;
- recogidas de botellones;
- incidencias;
- solicitudes de recarga.

No puede autorizar por sí mismo:

- cambios retroactivos de precio;
- regalos no autorizados;
- ajustes administrativos;
- cargos de responsabilidad;
- descarte definitivo;
- modificaciones de auditoría.

## Oficina / administrador

Puede:

- crear y planificar embarques;
- asignar/reasignar pedidos y actividades;
- gestionar recargas;
- conciliar;
- resolver diferencias;
- revisar cartera;
- autorizar operaciones según permisos.

## Administrador/autorizador

Puede:

- autorizar excepciones;
- autorizar precios;
- autorizar promociones/regalos;
- resolver casos de responsabilidad;
- autorizar cargos económicos.

Todas las autorizaciones críticas deben validarse server-side.

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

# 3. Correcciones obligatorias Contrato técnico

Esta sección contiene reglas obligatorias del modelo y de su implementación.

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

# 9.1 Stock real, stock estimado y producción

El sistema distingue tres conceptos:

```text
PRODUCCIÓN
= unidades declaradas/producidas por el área de producción

STOCK FÍSICO
= unidades cuya existencia/custodia está respaldada por hechos físicos

DISPONIBILIDAD ESTIMADA
= proyección utilizada para no bloquear innecesariamente la planificación
```

La disponibilidad estimada **no es inventario físico**.

La operación diaria puede producir directamente hacia embarque sin pasar por almacenamiento ni registrar cada movimiento en tiempo real. Esto no debe obligar al personal de producción a alimentar un flujo administrativo imposible de ejecutar bajo presión.

El control operativo existente puede seguir usando la conciliación:

```text
stock inicial
+ producción
- ventas/consumos
= stock final esperado
```

pero esa ecuación es una **conciliación de control**, no una sustitución del ledger físico.

`availabilityBasis` debe indicar con qué base se validó la disponibilidad al crear la carga, pero nunca puede convertirse en una afirmación de que ese número fue físicamente contado.

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

### Gate 6 — Contrato Contrato técnico

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

**Contrato técnico es el contrato que debe utilizar el equipo para implementar las siguientes fases.**


---

# 27. Declaración de congelación

Este documento debe considerarse suficiente para que un desarrollador que **no haya visto ningún documento anterior** pueda entender:

1. el modelo de negocio;
2. las fuentes de verdad;
3. los casos excepcionales;
4. las reglas de concurrencia;
5. la semántica física;
6. la cartera;
7. la responsabilidad;
8. el funcionamiento offline;
9. la estrategia de migración;
10. los tests y gates requeridos.

No se debe pedir al equipo que busque documentos anteriores para completar una definición que falte aquí.

Si el código actual contiene una conducta que no coincide con este contrato, el equipo debe documentar la discrepancia y resolverla mediante el flujo de decisión descrito en este documento.

**No se autoriza revertir una regla de este contrato únicamente porque una versión legacy del código la implemente de otra manera.**
