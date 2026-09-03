# AGUA BAMBÚ — PLAN DE PLANEAMIENTO
## Corrección de cumplimiento parcial, prepago y replanificación PUNTO → DOMICILIO
### Rebaseline técnico sobre `main`

**Versión:** v2.0  
**Fecha:** 2026-09-02  
**Estado:** PROPUESTA DE PLANEAMIENTO — para análisis y aprobación del equipo  
**Repositorio auditado:** `casasleonj/bambu` / `main`  
**Baseline técnico verificado:** `4fa5e4d631772f5e480f3354bb86a2d288266d70`  
**Naturaleza:** evolución trazable del planeamiento anterior; no modifica por sí sola el Contexto Maestro.

> **Regla de autoridad:** el código actual determina el estado técnico; el Contexto Maestro y ADR aceptados determinan las decisiones de producto/arquitectura ya congeladas. Esta versión corrige el planeamiento anterior a partir de nueva evidencia del repositorio.

---

# 1. Propósito

Resolver de forma segura el caso de negocio:

> Venta PUNTO de 10 unidades → pago total → entrega parcial de 6 → quedan 4 pendientes → posteriormente el cliente puede solicitar explícitamente que las 4 restantes se envíen por DOMICILIO.

El objetivo no es crear otra venta para las 4 unidades ni mover artificialmente dinero entre clientes/pedidos.

El objetivo es separar correctamente:

- obligación comercial;
- cumplimiento físico;
- misión logística;
- dinero recibido;
- facturación;
- replanificación;
- auditoría.

La prioridad es preservar la integridad económica y evitar que una corrección técnica cree una nueva deuda ficticia.

---

# 2. Rebaseline y clasificación

## 2.1 HECHO — Estado técnico actual

La auditoría sobre `main` confirma que:

1. `Pedido.entregar()` actualmente recalcula `total` a partir de cantidades entregadas.
2. `Pedido.entregar()` actualmente recorta `totalPagado` con `min(totalPagado, nuevoTotal)`.
3. `EntregarPedidoUseCase` crea un pedido hijo cuando existen faltantes.
4. El pedido hijo nace con `totalPagado = 0` y `pagos = []`.
5. El pago original permanece asociado al pedido original.
6. Existe `Cliente.saldoFavor`, pero representa crédito general reutilizable y no dinero reservado para una obligación concreta.
7. `ObligacionPendiente` y `Actividad` ya existen en el schema y tienen ADR aceptados.
8. `ObligacionPendiente` ya posee invariantes de no sobreconsumo y pruebas de concurrencia.
9. `Actividad` puede existir sin embarque asignado.
10. El flujo productivo todavía usa `Pedido.embarqueId` y pedido-hijo para parte del cumplimiento; el modelo de obligación/actividad no está conectado de extremo a extremo.
11. El cierre de embarque puede encontrar pagos históricos de una venta diferida; el código ya tiene una solución parcial para conciliación de ventas diferidas, pero la granularidad sigue siendo limitada.
12. El toggle de “Entregar después” existe detrás de `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR`.

## 2.2 HECHO — Decisiones/ADRs vigentes que deben preservarse

`ADR-OBLIGACION-001` y `ADR-ACTIVIDAD-001` están aceptados/congelados.

La arquitectura ya establece:

```text
ObligacionPendiente
    cantidadOriginal
    cantidadCumplida
    cantidadAsignada
    cantidadDisponible (derivada)

Actividad
    trabajo ejecutable
    puede existir sin embarque
```

El invariante de obligación es:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

y las operaciones de asignación/cumplimiento deben ejecutarse bajo lock de la obligación.

`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` también acepta que Venta Rápida y Venta Libre puedan tener entrega posterior.

## 2.3 HECHO — `saldoFavor` NO es reserva

No utilizar `Cliente.saldoFavor` como mecanismo de reserva de dinero para una obligación pendiente.

Se verificó que puede ser consumido por una compra posterior del mismo cliente.

Por tanto:

```text
saldoFavor != dinero comprometido a una obligación
```

Esta vía queda **DESCARTADA** para resolver el prepago parcial.

## 2.4 BRECHA PLAN ↔ CÓDIGO

El planeamiento anterior proponía evaluar/crear una abstracción `Fulfillment`.

La auditoría demuestra que ya existe una arquitectura congelada de:

```text
Pedido
  ↓
ObligacionPendiente
  ↓
Actividad
  ↓
Embarque
```

Por tanto:

**NO crear una entidad `Fulfillment` nueva.**

La pregunta correcta es cómo conectar la arquitectura existente al ciclo real.

---

# 3. Problema raíz

El problema no es simplemente el CHECK de base de datos.

El problema es una confusión entre:

> **valor económico de la obligación**

y

> **valor económico de lo físicamente entregado hasta el momento**.

Actualmente una entrega parcial hace que:

```text
10 unidades / $10.000 pagadas

↓ entrega 6

total = $6.000
totalPagado = $6.000
```

El sistema ha hecho desaparecer conceptualmente los $4.000 restantes.

Además crea:

```text
pedido hijo = $4.000
totalPagado = $0
```

produciendo:

```text
deuda artificial = $4.000
```

y puede producir `PAGOS_EXCEDIDOS` en el cierre.

---

# 4. Principio P1 — El Pedido conserva la obligación económica

Para el Nivel 1, el Pedido original sigue siendo la fuente canónica de la obligación comercial.

Ejemplo:

```text
Pedido #1050
10 pacas
Total histórico: $10.000
Pagado: $10.000

Entrega 1:
6 pacas

Pendiente:
4 pacas
```

El Pedido debe continuar representando:

```text
total       = $10.000
totalPagado = $10.000
saldo       = $0
```

mientras existan 4 unidades pendientes.

No se debe crear un pedido hijo para representar únicamente el faltante en este flujo.

---

# 5. Invariante económico correcto

La regla no debe ser:

```text
total = valor de lo entregado
```

durante una entrega parcial.

Debe ser:

```text
total económico de la obligación
=
valor histórico completo del Pedido
```

y:

```text
saldo = total - totalPagado
```

La entrega física se representa separadamente mediante cantidades de cumplimiento.

## Casos mínimos

### Prepago completo

```text
10 compradas
$10.000 pagados
6 entregadas
4 pendientes

total       = 10.000
totalPagado = 10.000
saldo       = 0
```

### Pago parcial

```text
10 compradas
$6.000 pagados
6 entregadas
4 pendientes

total       = 10.000
totalPagado = 6.000
saldo       = 4.000
```

### Sin pago

```text
10 compradas
$0 pagados
6 entregadas
4 pendientes

total       = 10.000
totalPagado = 0
saldo       = 10.000
```

Por tanto, el gate:

```text
padre.total == padre.totalPagado
```

solo aplica al caso de prepago completo. No debe convertirse en invariante universal de entrega parcial.

---

# 6. Nivel 1 — Corrección inmediata del Caso B

## Objetivo

Permitir:

```text
10 compradas
10 pagadas
6 entregadas
4 pendientes
```

sin:

- modificar pagos;
- modificar facturas históricas;
- mover dinero a `saldoFavor`;
- crear pedido hijo;
- crear deuda artificial.

## Cambio conceptual

`Pedido.entregar()` no debe cerrar el Pedido si todavía existen cantidades pendientes.

La operación debe:

1. validar cantidades;
2. registrar cantidades entregadas;
3. conservar `total`;
4. conservar `totalPagado`;
5. conservar pagos;
6. mantener `estadoEntrega = PENDIENTE` mientras falte cantidad;
7. cambiar a `ENTREGADO` solamente cuando el cumplimiento total sea 100%;
8. proyectar `estadoPago` sin confundir pago anticipado con deuda;
9. conservar metadata de entrega;
10. ser idempotente.

## IMPORTANTE

No basta con eliminar el `min()`.

También debe eliminarse la semántica de:

```text
entrega parcial => ENTREGADO
```

porque el Pedido no está completamente cumplido.

---

# 7. `crearPedidoHijo()` durante Nivel 1

No debe utilizarse para materializar el faltante del Caso B.

Debe permanecer temporalmente por compatibilidad mientras se auditan sus consumidores.

Clasificación:

**ESTADO TÉCNICO ACTUAL / LEGACY EN TRANSICIÓN**

No eliminarlo en el mismo PR sin comprobar:

- consumidores;
- datos existentes;
- recuperación offline;
- rutas históricas;
- embarques;
- reportes;
- cierres;
- migración.

El objetivo es que el nuevo flujo deje de depender de él, y posteriormente pueda retirarse mediante expand/contract.

---

# 8. Nivel 1 — Corrección del cierre de Embarque

El cierre debe distinguir:

```text
dinero recibido históricamente
```

de:

```text
dinero cobrado durante esta misión
```

Ejemplo:

```text
Pedido total              $10.000
Pago realizado antes      $10.000
Entrega actual              6/10
Cobro nuevo en embarque         $0
```

El cierre no puede interpretar los $10.000 históricos como un cobro nuevo del repartidor.

Tampoco debe obligar al operador a cambiar $10.000 por $6.000 para superar `PAGOS_EXCEDIDOS`.

## Criterio

El dinero debe seguir la regla ya adoptada en la arquitectura:

> **La custodia del dinero pertenece al evento de cobro, no al evento de entrega.**

La implementación debe preservar esta distinción sin duplicar el mismo Pago.

---

# 9. Nivel 2 — Conectar Obligación → Actividad → Embarque

Después de estabilizar Nivel 1:

```text
Pedido
  ↓
ObligacionPendiente
  ↓
Actividad
  ↓
Embarque
```

La Obligación debe representar las cantidades que todavía requieren cumplimiento.

La Actividad debe representar una ejecución concreta.

El Embarque debe ejecutar actividades, no reinterpretar el Pedido completo.

## Beneficios

Permite:

- 6 unidades PUNTO ahora;
- 4 unidades pendientes;
- posteriormente 4 DOMICILIO;
- eventualmente dividir 2 + 2;
- diferentes embarques;
- diferentes modos;
- sin crear ventas ficticias.

---

# 10. Caso C — PUNTO → DOMICILIO

Este caso requiere una acción explícita.

No debe existir:

```text
PUNTO pendiente
→ aparece automáticamente en Embarques
```

Debe existir:

```text
Gestionar pendiente
        ↓
Enviar a domicilio
        ↓
confirmar cantidad
        ↓
mostrar diferencial
        ↓
confirmar decisión
        ↓
crear/activar Actividad DOMICILIO
        ↓
asignar a Embarque
```

## Regla de producto

PUNTO no queda prohibido en logística.

Lo que se prohíbe es la **entrada automática o ambigua** a una misión logística.

La conversión requiere decisión explícita del usuario.

---

# 11. `Actividad.modo`

El equipo identifica `Actividad.modo` como gap.

Debe evaluarse como cambio aditivo:

```text
PUNTO
DOMICILIO
```

Pero antes de migrar debe comprobarse si `modo` es realmente el nombre/semántica correcta o si debe existir un value object más expresivo.

La decisión final debe documentarse en un ADR específico.

---

# 12. Precio histórico

La división del cumplimiento no crea una nueva compra.

Por tanto, las 4 unidades pendientes conservan:

- producto;
- cantidad original;
- precio histórico del Pedido;
- condiciones comerciales históricas.

No recalcular como una compra nueva de 4.

Ejemplo:

```text
10 unidades
tarifa por volumen = $900

6 entregadas
4 pendientes
```

Las 4 siguen teniendo snapshot de $900.

---

# 13. Diferencial DOMICILIO

Si el cambio de modo genera un mayor valor:

```text
valor histórico pendiente = $3.600
valor DOMICILIO = $4.400
diferencial = $800
```

el sistema NO debe cobrar nuevamente $4.400.

Debe conservar:

```text
obligación original = $3.600
prepago original = $3.600
deuda original = $0
```

y crear una nueva obligación económica únicamente por:

```text
diferencial = $800
```

La fórmula exacta debe considerar el precio histórico y las reglas vigentes de domicilio.

No implementar todavía hasta aprobar la regla de negocio y el gate fiscal.

---

# 14. Fiscalidad del diferencial

La factura original no se modifica destructivamente.

Antes de implementar el mayor valor se requiere definición externa de:

- contador;
- proveedor de facturación electrónica;
- normativa DIAN vigente.

Debe determinarse si corresponde:

- nota débito;
- nueva factura electrónica por diferencia;
- otro mecanismo fiscal permitido.

La arquitectura debe permitir registrar:

```text
operación original
→ modificación comercial
→ mayor valor
→ documento fiscal
→ pago del mayor valor
```

sin reescribir la historia.

---

# 15. Dinero — decisión pendiente de Nivel 2

No introducir `PaymentAllocation` todavía como decisión.

Primero evaluar si el modelo actual puede representar de manera suficiente:

```text
Pago
  ↓
Pedido original
  ↓
cumplimientos parciales
```

sin perder trazabilidad.

Si no puede, diseñar posteriormente una entidad de aplicación/asignación explícita.

Debe evitarse:

```text
Cliente.saldoFavor
```

como sustituto.

---

# 16. `Actividad` vs `PlanActividad`

Existe una segunda representación de actividad dentro del planificador:

```text
PlanDia
→ PlanGrupo
→ PlanParada
→ PlanActividad
```

y una representación operativa:

```text
ObligacionPendiente
→ Actividad
```

Actualmente no están reconciliadas.

Esto es una **BRECHA ARQUITECTÓNICA** y debe resolverse antes de convertir Actividad en la única fuente de trabajo logístico.

La decisión debe establecer:

- cuál es planificación;
- cuál es ejecución;
- cómo se materializa una actividad planificada;
- cómo se evita duplicación;
- cómo se maneja replanificación;
- cómo se audita la transición.

---

# 17. Offline, idempotencia y concurrencia

Todo nuevo caso debe conservar las protecciones existentes.

## Obligaciones

Debe mantenerse:

```text
LOCK(OBLIGACION:{id})
→ leer
→ calcular disponible
→ validar
→ actualizar
→ crear/actualizar Actividad
→ COMMIT
```

y:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

## Offline

Toda operación que pueda repetirse debe tener idempotency key.

No duplicar:

- entrega;
- actividad;
- asignación;
- pago;
- diferencial.

## Concurrencia

Probar dos dispositivos intentando:

```text
entregar 4
entregar 4
```

sobre una obligación de 4.

Resultado permitido:

```text
4 cumplidas
0 sobreconsumo
```

---

# 18. Matriz de alcance

| Nivel | Alcance | Estado |
|---|---|---|
| P0 | Contención del flag si la ruta actual expone el bug | Recomendado |
| P1 | Entrega parcial sin reducir total/pago | Atacable ahora |
| P1 | Cierre sin confundir prepago con cobro de misión | Atacable ahora |
| P1 | Tests económicos | Obligatorio |
| P2 | Wirear Obligación → Actividad | Diseño/implementación |
| P2 | `Actividad.modo` | Diseño |
| P2 | PUNTO → DOMICILIO explícito | Diseño/implementación |
| P2 | Diferencial de domicilio | Pendiente de regla |
| P2 | Fiscalidad del diferencial | Bloqueante externo |
| P2 | Reconciliar PlanActividad/Actividad | Diseño arquitectónico |
| P3 | Retiro de pedido-hijo | Migración expand/contract |
| P3 | E2E completo | Validación |

---

# 19. Criterios de éxito

## C1 — Prepago + parcial

10 unidades / $10.000 pagados / 6 entregadas:

```text
total = $10.000
totalPagado = $10.000
saldo = $0
pendiente = 4
```

## C2 — Pago parcial + parcial

10 / $6.000 pagados / 6 entregadas:

```text
total = $10.000
totalPagado = $6.000
saldo = $4.000
pendiente = 4
```

## C3 — Entrega final

Después de entregar las 4:

```text
10/10
estadoEntrega = ENTREGADO
saldo = 0
```

## C4 — No crear deuda artificial

Prepago completo nunca genera:

```text
saldo = valor pendiente físico
```

## C5 — No modificar Pago

El Pago original conserva:

```text
monto = $10.000
```

## C6 — No modificar factura histórica destructivamente

La factura original permanece trazable.

## C7 — Cierre

Prepago histórico de $10.000 no se convierte en $10.000 de cobro nuevo del embarque.

## C8 — Replanificación explícita

PUNTO → DOMICILIO requiere acción explícita.

## C9 — Precio

El precio histórico de las unidades pendientes no se recalcula como una nueva compra.

## C10 — Diferencial

Si existe diferencial, solo el diferencial queda pendiente.

## C11 — Concurrencia

Nunca se sobreconsume una obligación.

## C12 — Idempotencia

Retry no duplica entrega, actividad ni dinero.

---

# 20. Casos E2E obligatorios

### E2E-01
10 → paga 10 → entrega 6 → quedan 4 → entrega 4.

### E2E-02
10 → paga 6 → entrega 6 → quedan 4 fiados.

### E2E-03
10 → paga 10 → entrega 6 → cierre de embarque.

### E2E-04
10 → paga 10 → entrega 6 → gestionar pendientes → PUNTO → entregar 4.

### E2E-05
10 → paga 10 → entrega 6 → gestionar pendientes → DOMICILIO → crear actividad → embarque.

### E2E-06
E2E-05 con diferencial no pagado.

### E2E-07
E2E-05 con diferencial pagado.

### E2E-08
Dos dispositivos intentan asignar/entregar las mismas 4 unidades.

### E2E-09
Retry offline de la misma operación.

### E2E-10
Pedido histórico que todavía usa pedido-hijo.

---

# 21. Gates antes de implementar Nivel 1

El equipo debe demostrar:

1. Que eliminar el recálculo del total no rompe CHECKs ni proyecciones.
2. Que `EstadoPago` sigue siendo coherente para ANTICIPADO/PAGADO/PARCIAL.
3. Que la factura no se vuelve incorrecta al entregar parcialmente.
4. Que cartera no genera deuda artificial.
5. Que cierre no vuelve a cobrar dinero histórico.
6. Que reportes no interpretan 6/10 como pedido terminado.
7. Que offline/retry permanece idempotente.
8. Que el pedido no puede pasar a ENTREGADO con cantidades pendientes.
9. Que la transición final a 10/10 funciona.
10. Que el pedido-hijo queda fuera del nuevo flujo sin romper datos históricos.

---

# 22. Gates antes de Nivel 2

No comenzar PUNTO → DOMICILIO hasta aprobar:

- semántica de `ObligacionPendiente`;
- semántica de `Actividad`;
- `Actividad.modo`;
- relación con `PlanActividad`;
- elegibilidad para Embarque;
- precio histórico;
- diferencial;
- tratamiento fiscal;
- representación del dinero;
- UX;
- offline;
- concurrencia;
- auditoría.

---

# 23. No hacer

❌ No crear `Fulfillment` nuevo.  
❌ No usar `saldoFavor` como reserva.  
❌ No editar retrospectivamente `Pago`.  
❌ No editar destructivamente la factura original.  
❌ No crear un pedido comercial nuevo solo porque existe un cumplimiento adicional.  
❌ No recalcular precio histórico como compra nueva.  
❌ No permitir PUNTO → Embarque automáticamente.  
❌ No implementar diferencial antes del gate fiscal.  
❌ No resolver `PAGOS_EXCEDIDOS` bajando manualmente el pago histórico.  
❌ No convertir una entrega parcial en ENTREGADO.  
❌ No eliminar pedido-hijo sin migración/compatibilidad.

---

# 24. Decisiones que siguen abiertas

### D1
¿La arquitectura de `Pago` + Pedido es suficiente para múltiples cumplimientos?

### D2
¿Se necesita una entidad de aplicación de pago o basta el Pedido como fuente económica?

### D3
¿Cuál es exactamente el contrato de `Actividad.modo`?

### D4
¿Cómo se reconcilian `PlanActividad` y `Actividad`?

### D5
¿Cuál es la fórmula exacta del diferencial DOMICILIO?

### D6
¿Cuál es el documento fiscal exacto para el mayor valor?

Estas son decisiones reales pendientes. No deben resolverse por inferencia del código.

---

# 25. Decisión de planeamiento propuesta

**PROPUESTA — NO crear Fulfillment.**

Usar la arquitectura existente:

```text
PEDIDO
  ↓
OBLIGACIÓN PENDIENTE
  ↓
ACTIVIDAD
  ↓
EMBARQUE
```

Primero estabilizar el Pedido para que una entrega parcial no destruya el valor económico.

Después conectar cumplimiento.

Finalmente habilitar la replanificación explícita PUNTO → DOMICILIO.

---

# 26. Definition of Done

El trabajo solo se considera terminado cuando:

- los invariantes económicos pasan;
- los invariantes de cantidades pasan;
- no existe deuda artificial;
- no se modifica históricamente un Pago;
- el cierre funciona con prepago;
- entrega parcial permanece pendiente;
- entrega total cierra;
- PUNTO → DOMICILIO es explícito;
- el modo del cumplimiento es visible;
- precio histórico permanece;
- diferencial está correctamente calculado;
- fiscalidad está aprobada;
- offline/retry/concurrencia pasan;
- auditoría permite reconstruir qué ocurrió;
- los tests de regresión pasan;
- la implementación actual está reconciliada con los ADR.

---

## Clasificación final

**HECHO**
- El bug monetario existe.
- `saldoFavor` no es reserva.
- `ObligacionPendiente` y `Actividad` ya existen.
- Los ADR de obligación/actividad están congelados.
- Pedido-hijo es actualmente utilizado.
- El cierre puede encontrarse con pagos históricos.

**DECISIÓN VIGENTE**
- Pedido conserva identidad comercial.
- Venta Rápida/Venta Libre pueden tener entrega posterior.
- Obligación/Actividad tienen invariantes de concurrencia ya definidos.

**PROPUESTA**
- Pedido mantiene total económico durante entrega parcial.
- No crear pedido hijo para el nuevo flujo.
- Conectar Obligación → Actividad → Embarque.
- Replanificación explícita PUNTO → DOMICILIO.

**DESCARTADO**
- Usar `saldoFavor` como reserva.
- Crear `Fulfillment` paralelo.

**PENDIENTE**
- Aplicación/asignación monetaria para múltiples cumplimientos.
- `Actividad.modo`.
- Reconciliación `PlanActividad`/`Actividad`.
- Diferencial.
- Tratamiento fiscal.

**BRECHA PLAN ↔ CÓDIGO**
- Arquitectura de obligación/actividad existe pero todavía no gobierna de extremo a extremo el flujo productivo.
