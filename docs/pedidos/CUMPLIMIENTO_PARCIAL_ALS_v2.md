# AGUA BAMBÚ — ARCHITECTURE LEVEL SPECIFICATION
## ALS — Cumplimiento parcial, prepago y replanificación PUNTO → DOMICILIO

**Versión:** v2.0  
**Fecha:** 2026-09-02  
**Estado:** ARCHITECTURE LEVEL SPECIFICATION — para análisis del equipo  
**Repositorio:** `casasleonj/bambu` / `main`  
**Baseline verificado:** `4fa5e4d631772f5e480f3354bb86a2d288266d70`

> Esta ALS reemplaza únicamente la propuesta arquitectónica anterior respecto a la creación de `Fulfillment`. No modifica silenciosamente el Contexto Maestro ni los ADR aceptados.

---

# 1. Objetivo arquitectónico

Garantizar que:

```text
obligación comercial
≠
cumplimiento físico
≠
misión logística
≠
evento de cobro
≠
documento fiscal
```

y que una entrega parcial no altere retrospectivamente el valor económico de la obligación.

Arquitectura objetivo:

```text
Pedido
  │
  │ obligación comercial / identidad / precio histórico / pagos
  ▼
ObligacionPendiente
  │
  │ cantidad pendiente / disponible
  ▼
Actividad
  │
  │ trabajo ejecutable + modo + cantidad
  ▼
Embarque
  │
  │ misión física
  ▼
Entrega
```

No crear `Fulfillment` paralelo.

---

# 2. Autoridad y compatibilidad

## Autoridad

- Producto: Contexto Maestro vigente.
- Arquitectura congelada: ADR aceptados.
- Estado técnico: `main`.
- Esta ALS: contrato técnico propuesto para la evolución.

## ADR relevantes

- `ADR-OBLIGACION-001`
- `ADR-ACTIVIDAD-001`
- `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`
- `ADR-IDEMPOTENCIA-001`
- `ADR-CONCURRENCIA-001`
- `ADR-PAGO-REPORTADO-CONFIRMADO-001`
- `ADR-CORRECCION-MONETARIA-001`

No invalidar estos ADR implícitamente.

---

# 3. Estado técnico verificado

## Existe

### Pedido

Es aggregate root del contexto de pedidos.

Actualmente contiene:

- total;
- totalPagado;
- saldo derivado;
- pagos;
- items;
- canal;
- origen;
- estadoEntrega;
- estadoPago;
- embarqueId;
- metadata de entrega.

### ObligacionPendiente

Existe en schema y tiene:

```text
cantidadOriginal
cantidadCumplida
cantidadAsignada
cantidadDisponible = derivada
```

con:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

### Actividad

Existe y representa trabajo ejecutable.

Puede existir sin embarque.

Tiene:

- tipo;
- cantidad;
- cantidadCumplida;
- estado;
- offlineId;
- obligación;
- embarque.

### PlanActividad

Existe en el planificador y representa otra capa de actividad.

La relación entre ambos conceptos todavía no está resuelta.

---

# 4. Anti-arquitectura

Queda explícitamente prohibido crear:

```text
Pedido
  ├── Fulfillment nuevo
  └── Actividad
```

si ambos representan la misma unidad conceptual.

La arquitectura debe evolucionar las piezas existentes.

---

# 5. Invariante de obligación

Para cada `ObligacionPendiente`:

```text
cumplida + asignada <= original
```

y:

```text
disponible = original - cumplida - asignada
```

Toda operación que cambie cantidades debe:

```text
LOCK(OBLIGACION:{id})
→ READ
→ CALCULATE
→ VALIDATE
→ UPDATE
→ CREATE/UPDATE ACTIVITY
→ COMMIT
```

No se permite:

```text
READ
→ calcular disponible
→ UPDATE
```

sin lock.

---

# 6. Invariante monetario

El Pedido representa la obligación económica original.

Durante una entrega parcial:

```text
Pedido.total
```

NO se reduce al valor de lo entregado.

El valor físico entregado se expresa mediante cantidades de cumplimiento.

Por tanto:

```text
saldo = total - totalPagado
```

continúa siendo válido aunque:

```text
cantidadEntregada < cantidadOriginal
```

---

# 7. Regla crítica de `Pedido.entregar()`

La implementación actual debe evolucionar desde:

```text
entrega parcial
→ nuevoTotal = valor entregado
→ totalPagado = min(totalPagado, nuevoTotal)
→ ENTREGADO
```

hacia:

```text
entrega parcial
→ actualizar cantidades cumplidas
→ conservar total
→ conservar totalPagado
→ conservar pagos
→ permanecer PENDIENTE
```

Solo:

```text
cantidadCumplida == cantidadOriginal
```

permite:

```text
estadoEntrega = ENTREGADO
```

## Nota

No basta con retirar `Math.min()`.

Debe corregirse la transición de estado.

---

# 8. Pedido hijo

Durante el nuevo flujo:

```text
entrega parcial
```

NO crea automáticamente:

```text
Pedido hijo
```

porque eso representa incorrectamente una nueva obligación comercial.

El método `crearPedidoHijo()` queda como compatibilidad legacy hasta completar migración.

No eliminarlo en el mismo cambio sin inventario de consumidores.

---

# 9. Modelo de dinero

## Fuente canónica

Para el Nivel 1:

```text
Pedido.total
Pedido.totalPagado
Pedido.saldo
Pago[]
```

## No usar

```text
Cliente.saldoFavor
```

como reserva.

Razón:

`saldoFavor` es crédito general y puede ser consumido por otro Pedido.

## Gate

No introducir `PaymentAllocation` hasta demostrar que el modelo actual no puede representar correctamente múltiples cumplimientos.

---

# 10. Prepago y cumplimiento parcial

Caso canónico:

```text
Pedido #1050
10 unidades
total = 10.000
pagado = 10.000

Actividad A
6 unidades
PUNTO
cumplida

Obligación pendiente
4 unidades
```

Resultado monetario:

```text
total = 10.000
totalPagado = 10.000
saldo = 0
```

Resultado físico:

```text
6 entregadas
4 pendientes
```

No crear deuda.

---

# 11. Estados

No crear un nuevo enum para representar parcialidad.

La parcialidad es una combinación de:

```text
cantidadOriginal
cantidadCumplida
cantidadDisponible
estadoEntrega
```

Mientras exista pendiente:

```text
estadoEntrega = PENDIENTE
```

o el estado operativo equivalente si existe una actividad actualmente en ruta.

El Pedido solo puede ser:

```text
ENTREGADO
```

cuando el cumplimiento total esté consolidado.

La UI puede derivar:

```text
6/10 entregadas
```

sin inventar un estado persistido nuevo.

---

# 12. Actividad como unidad ejecutable

Una `Actividad` debe representar:

```text
qué
cuánto
cómo
para qué obligación
dónde se ejecuta
en qué embarque
```

Por tanto, para el Caso C probablemente requiere:

```text
modo
```

con semántica explícita.

Candidato:

```text
PUNTO
DOMICILIO
```

No implementar el campo sin ADR si existen alternativas semánticas relevantes.

---

# 13. PUNTO → DOMICILIO

La transición debe ser un comando explícito.

Contrato conceptual:

```text
GestionarObligacionPendiente
    ↓
SeleccionarCantidad
    ↓
SeleccionarModo = DOMICILIO
    ↓
CalcularDiferencial
    ↓
MostrarImpacto
    ↓
Confirmar
    ↓
Crear/activar Actividad
    ↓
Asignar Embarque
```

No permitir:

```text
planner
→ ve Pedido PUNTO PENDIENTE
→ lo agrega automáticamente a domicilio
```

---

# 14. Elegibilidad para Embarque

La elegibilidad debe evaluarse sobre:

```text
Actividad / unidad de cumplimiento
```

no únicamente:

```text
Pedido.estadoEntrega == PENDIENTE
```

Una venta PUNTO pendiente puede convertirse en elegible únicamente después de la decisión explícita que cree/configure el cumplimiento logístico correspondiente.

---

# 15. Identidad

Mantener:

```text
Pedido.numero
```

como identidad comercial estable.

No crear nuevo número comercial por cada cumplimiento.

Un Pedido puede tener:

```text
Actividad 1
Actividad 2
Actividad 3
```

sin representar ventas diferentes.

---

# 16. Modo histórico vs modo actual

Para un caso:

```text
Pedido original = PUNTO
Actividad actual = DOMICILIO
```

ambos datos deben poder coexistir.

La UI debe mostrar:

```text
Venta original: PUNTO
Entrega actual: DOMICILIO
```

Nunca inferir el modo actual exclusivamente desde el Pedido.

---

# 17. Precio

`PedidoItem.precio` es snapshot histórico.

No recalcular el precio de las unidades pendientes como nueva compra.

La cantidad pendiente debe conservar el precio/condiciones originales.

Si cambia el modo a DOMICILIO:

```text
valor nuevo de cumplimiento
-
valor económico histórico de las unidades pendientes
=
diferencial
```

El diferencial no cambia el precio histórico.

---

# 18. Diferencial

El diferencial es una consecuencia económica del cambio de cumplimiento.

Ejemplo:

```text
valor histórico pendiente = 3.600
valor domicilio = 4.400
diferencial = 800
```

Resultado:

```text
prepago original = 3.600
saldo original = 0
nuevo saldo = 800
```

No:

```text
nuevo pedido = 4.400
```

No:

```text
saldo = 4.400
```

La fórmula final requiere aprobación del negocio.

---

# 19. Facturación

Nunca reescribir destructivamente la factura original.

El dominio debe poder representar:

```text
Factura original
+
ajuste comercial
+
mayor valor
+
documento fiscal correspondiente
```

El mecanismo fiscal exacto es un gate externo.

No implementar automáticamente una nota débito o nueva factura sin aprobación de contador/proveedor FE/DIAN.

---

# 20. Cierre de Embarque

Debe separar:

```text
Pago histórico
```

de:

```text
Pago realizado durante la misión
```

Para un pedido prepago:

```text
Pago histórico = 10.000
Cobro nuevo en misión = 0
```

El cierre no debe exigir:

```text
Pago = valor de mercancía entregada
```

si el dinero ya fue recibido antes.

El guard `PAGOS_EXCEDIDOS` debe operar sobre el concepto correcto de cobro de la misión, no sobre el total histórico del Pedido.

---

# 21. `embarqueId` vs `embarqueOrigenId`

Mantener la distinción existente:

```text
embarqueOrigenId
```

= contexto histórico/origen cuando corresponda.

```text
embarqueId
```

= asignación física actual.

No usar `embarqueOrigenId` como sustituto de una relación de cumplimiento.

A medida que Actividad gobierne el trabajo, el vínculo operativo debe residir en Actividad.

---

# 22. PlanActividad vs Actividad

Existe duplicación conceptual:

```text
PlanActividad
```

en planificación y:

```text
Actividad
```

en ejecución.

No asumir que son la misma entidad.

Debe definirse:

```text
PlanActividad = intención/plan
Actividad = trabajo ejecutable
```

o una semántica distinta si el código demuestra lo contrario.

Debe existir una relación explícita o un mecanismo de materialización que evite:

- doble trabajo;
- doble asignación;
- divergencia de cantidades;
- pérdida de auditoría.

Este punto es gate de Nivel 2.

---

# 23. Offline

Toda operación de:

- entrega;
- asignación;
- replanificación;
- creación de actividad;
- cobro;
- diferencial;

debe tener una estrategia idempotente.

`offlineId @unique` de Actividad debe mantenerse.

No aceptar reintentos como operaciones nuevas.

---

# 24. Concurrencia

La obligación es el lock de negocio.

Nunca confiar únicamente en:

```text
Actividad unique
```

para evitar sobreconsumo.

Debe mantenerse:

```text
LOCK obligación
+
CHECK DB
+
idempotency
```

y pruebas 34A/34B/34C.

---

# 25. Migración

Estrategia:

```text
EXPAND
  ↓
nuevos flujos escriben modelo correcto
  ↓
legacy sigue legible
  ↓
migrar datos históricos
  ↓
CONTRACT
  ↓
retirar Pedido hijo
```

No hacer migración destructiva.

Los pedidos-hijo históricos deben continuar siendo interpretables.

---

# 26. Observabilidad

Añadir/usar métricas para detectar:

- `obligacion_double_fulfillment_rejected_count`
- entregas parciales;
- retries deduplicados;
- asignaciones rechazadas;
- cierres con pagos históricos;
- discrepancias de cobro;
- conversiones PUNTO → DOMICILIO;
- diferenciales generados;
- errores fiscales.

Cada transición importante debe ser auditable.

---

# 27. Seguridad y autorización

La replanificación PUNTO → DOMICILIO modifica:

- logística;
- precio potencial;
- cartera;
- eventualmente fiscalidad.

Por tanto debe pasar por autorización de negocio equivalente a una modificación comercial.

Debe registrarse:

```text
quién
qué
cuándo
antes
después
motivo
```

No permitir que una simple carga automática offline cambie silenciosamente el modo.

---

# 28. Contrato UX

Pedido:

```text
10 pacas
6 entregadas
4 pendientes
```

Mostrar acción:

```text
Gestionar pendientes
```

Opciones:

```text
Recoger en punto
Enviar a domicilio
```

Para domicilio:

```text
Venta original: PUNTO
Entrega actual: DOMICILIO
Cantidad: 4
Precio histórico: X
Valor domicilio: Y
Diferencial: Z
```

Antes de confirmar:

```text
Nuevo valor a cobrar: Z
```

Embarque:

```text
Pedido #1050
Venta original: PUNTO
Entrega actual: DOMICILIO
4 pacas
Motivo: cliente solicitó envío
```

---

# 29. Tests arquitectónicos obligatorios

## Dominio

- parcial con prepago completo;
- parcial con pago parcial;
- parcial sin pago;
- entrega final;
- sobreentrega;
- transición inválida;
- pedido ya entregado.

## Dinero

- pago histórico no cambia;
- saldo no se vuelve artificial;
- factura no se reescribe;
- cierre no duplica prepago.

## Obligación

- 34A;
- 34B;
- 34C.

## Idempotencia

- entrega repetida;
- asignación repetida;
- actividad repetida;
- offline replay.

## Replanificación

- PUNTO → PUNTO;
- PUNTO → DOMICILIO;
- cantidad parcial;
- división 2 + 2;
- cancelación/reversión autorizada;
- retry.

## Precio

- volumen histórico;
- precio especial;
- recargo domicilio;
- diferencial.

## Fiscal

- bloqueo hasta documento fiscal definido;
- trazabilidad del mayor valor.

---

# 30. Gates de implementación

## GATE A — Nivel 1

No aprobar si:

- `total` disminuye durante parcial;
- `totalPagado` disminuye;
- se crea deuda artificial;
- se crea hijo para el nuevo flujo;
- el Pedido pasa a ENTREGADO con faltantes;
- cierre exige alterar pago histórico.

## GATE B — Nivel 2

No aprobar si:

- Actividad no representa cantidades concretas;
- puede sobreasignarse obligación;
- PUNTO entra automáticamente a domicilio;
- no existe modo actual de cumplimiento;
- PlanActividad y Actividad pueden duplicar trabajo.

## GATE C — Diferencial

No aprobar si:

- precio histórico se recalcula;
- se cobra el valor total nuevamente;
- no existe regla de diferencial;
- fiscalidad no está aprobada.

---

# 31. Orden de implementación recomendado

### PR-1 — Integridad del Pedido
- parcial no cierra;
- total no disminuye;
- totalPagado no disminuye;
- no pedido-hijo;
- tests.

### PR-2 — Cierre
- separar cobro de misión de pago histórico;
- corregir `PAGOS_EXCEDIDOS`;
- tests de integración.

### ADR-2 — Modelo de cumplimiento
- confirmar uso de Obligacion/Actividad;
- definir `Actividad.modo`;
- reconciliar PlanActividad.

### PR-3 — Wiring
- Pedido → Obligacion;
- Obligacion → Actividad;
- Actividad → Embarque.

### ADR-3 — Replanificación
- PUNTO → DOMICILIO;
- autorización;
- auditoría;
- estados.

### PR-4 — UX
- Gestionar pendientes;
- seleccionar modo;
- vista de contexto en Embarques.

### ADR-4 — Diferencial
- fórmula;
- snapshot;
- cartera;
- fiscalidad.

### PR-5 — Diferencial/fiscal
Solo después de GATE C.

### PR-6 — Migración
- expand/contract;
- compatibilidad con pedidos-hijo históricos.

---

# 32. Definition of Done arquitectónico

La arquitectura se considera implementable cuando:

- existe una única identidad comercial;
- el cumplimiento parcial no altera el total económico;
- pagos históricos son inmutables;
- la obligación controla cantidades;
- Actividad controla trabajo ejecutable;
- Embarque ejecuta actividad;
- no existe sobreconsumo;
- PUNTO → DOMICILIO requiere decisión explícita;
- modo original y actual son distinguibles;
- precio histórico permanece;
- diferencial es separado;
- fiscalidad está definida;
- cierre distingue cobro histórico/nuevo;
- offline e idempotencia están cubiertos;
- concurrencia está cubierta;
- migración legacy está definida;
- auditoría permite reconstruir la historia.

---

# 33. Decisiones y clasificación

## HECHO

- `ObligacionPendiente` existe.
- `Actividad` existe.
- Los ADR correspondientes están aceptados/congelados.
- `saldoFavor` es crédito general.
- Pedido-hijo existe en producción.
- `Pedido.entregar()` actualmente recalcula total y recorta pago.
- Existe una segunda capa `PlanActividad`.

## DECISIÓN VIGENTE

- No destruir pagos históricos.
- Venta Rápida/Venta Libre pueden tener entrega posterior.
- Obligación controla no sobreconsumo.
- Actividad puede existir sin embarque.

## PROPUESTA

- Pedido mantiene total durante parcial.
- Actividad se convierte en unidad operativa del cumplimiento.
- `Actividad.modo`.
- PUNTO → DOMICILIO explícito.
- Embarque trabaja sobre Actividad.

## DESCARTADO

- Nueva entidad Fulfillment paralela.
- `saldoFavor` como reserva.
- Modificar Pago histórico para cuadrar entrega.

## PENDIENTE

- PaymentAllocation si realmente resulta necesaria.
- Contrato definitivo de `Actividad.modo`.
- PlanActividad ↔ Actividad.
- Diferencial.
- Documento fiscal.

## BRECHA PLAN ↔ CÓDIGO

- La arquitectura Obligación/Actividad existe pero no gobierna todavía todo el ciclo productivo.
- El flujo activo todavía depende de `Pedido.embarqueId` y pedido-hijo.
