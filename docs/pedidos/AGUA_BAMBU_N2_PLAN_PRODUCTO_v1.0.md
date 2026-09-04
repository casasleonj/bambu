# AGUA BAMBÚ — N2 PLAN DE PRODUCTO
## Convergencia Obligación → Actividad → Planificación → Embarque → Cumplimiento

**Estado:** PROPUESTA DE CONVERGENCIA
**Versión:** N2.0
**Fecha:** 2026-09-04
**Base técnica:** `main` `0b32015bddfe4e494936f1a41f78bc0cccc93b77`

## 1. Propósito

Cerrar la semántica del flujo:

`Pedido → Obligación → Actividad ↔ Planificación → Embarque → Cumplimiento`

antes de realizar cambios estructurales de implementación.

La prioridad es evitar que Pedido, Obligación, Actividad, PlanActividad o Embarque representen dos veces el mismo hecho.

## 2. Principio rector

Separar estrictamente:

- patrón histórico;
- demanda/oportunidad;
- recurrencia acordada;
- pedido concreto;
- obligación comercial;
- actividad ejecutable;
- planificación;
- ejecución;
- cumplimiento;
- cartera.

El historial nunca crea por sí mismo una obligación ni un Pedido ficticio.

## 3. Estado actual

### HECHOS

El repositorio actual contiene:

- `ObligacionPendiente`;
- `Actividad`;
- relación `Embarque.actividades`;
- `PedidoCantidadAjuste`;
- planificación/rutas existente;
- controles de integridad monetaria y física ya convergidos.

`ObligacionPendiente` deriva la cantidad disponible como:

`cantidadOriginal - cantidadCumplida - cantidadAsignada`

y mantiene el invariante:

`cantidadCumplida + cantidadAsignada <= cantidadOriginal`.

### BRECHA PLAN ↔ CÓDIGO

Existe una representación de planificación (`PlanActividad`) y una representación operativa (`Actividad`), pero no debe asumirse todavía que sean la misma entidad ni que su relación esté arquitectónicamente cerrada.

## 4. Modelo conceptual objetivo

```text
PATRÓN HISTÓRICO
       ↓
DEMANDA / OPORTUNIDAD
       ↓
RECURRENCIA / PROGRAMACIÓN
       ↓
PEDIDO CONCRETO
       ↓
OBLIGACIÓN PENDIENTE
       ↓
ACTIVIDAD
       ↕
PLANIFICACIÓN
       ↓
EMBARQUE
       ↓
EJECUCIÓN
       ↓
CUMPLIMIENTO
```

## 5. Obligación

Una Obligación representa lo que todavía debe cumplirse de una obligación comercial existente.

Ejemplo:

- Pedido original: 10 unidades.
- Cumplido: 6.
- Asignado: 0.
- Disponible: 4.

El Pedido original sigue siendo de 10.

No se crea automáticamente un segundo Pedido de 4.

## 6. Actividad

Una Actividad representa trabajo ejecutable.

Debe responder:

- qué se debe hacer;
- para qué obligación;
- qué cantidad;
- qué estado tiene;
- si está planificada/asignada;
- dónde se ejecuta;
- cómo se cumple.

No debe convertirse en una segunda fuente de verdad monetaria.

## 7. Planificación

La planificación representa una propuesta/decisión temporal y logística.

Debe poder distinguir:

- lo propuesto;
- lo confirmado;
- lo ejecutado;
- lo cambiado;
- lo cancelado.

Modificar una planificación no debe borrar la historia de una decisión anterior.

## 8. Actividad.modo

### HIPÓTESIS DE DISEÑO

El modo debe expresar el modo operativo de cumplimiento, no una preferencia visual de UI.

Candidatos iniciales:

- `PUNTO`;
- `DOMICILIO`.

No se congela todavía el enum definitivo.

Debe resolverse:

1. quién determina el modo;
2. cuándo nace;
3. diferencia entre modo solicitado, planificado y ejecutado;
4. quién puede cambiarlo;
5. cómo se audita;
6. impacto económico;
7. comportamiento offline/concurrente.

## 9. PUNTO → DOMICILIO

Debe ser una operación explícita.

No se permite una regla implícita del tipo:

`si no recogió → cambiar automáticamente a DOMICILIO`.

El cambio debe conservar:

- modo anterior;
- modo nuevo;
- actor;
- momento;
- motivo;
- decisión/autorización cuando corresponda;
- eventual diferencial.

## 10. Ownership

Antes de implementar N2 debe definirse:

| Concepto | Responsabilidad |
|---|---|
| Pedido | obligación comercial/económica |
| ObligaciónPendiente | cantidad aún exigible/cumplible |
| Actividad | trabajo ejecutable |
| PlanActividad | propuesta/decisión de planificación |
| Embarque | ejecución logística |
| Cumplimiento | hecho real ejecutado |

Regla: ninguna entidad puede duplicar la autoridad de otra.

## 11. No crear entidades paralelas

No crear un modelo `Fulfillment` adicional si su semántica duplica Actividad.

No crear nuevos Pedidos para representar faltantes físicos.

No usar `saldoFavor` como reserva de producto.

No usar pagos como mecanismo de asignación de trabajo.

## 12. Concurrencia

La obligación debe actuar como frontera de consistencia para el consumo de cantidades.

Dos dispositivos no pueden consumir simultáneamente la misma cantidad disponible.

Toda operación crítica debe ser:

- transaccional;
- idempotente;
- serializable respecto de la obligación;
- auditable.

## 13. Criterios de éxito

N2 se considera convergido cuando:

- `cumplida + asignada <= original` se mantiene bajo concurrencia;
- una cantidad no puede quedar asignada simultáneamente a dos actividades activas;
- pueda reconstruirse `Pedido → Obligación → Actividad → Planificación → Embarque → Cumplimiento`;
- una replanificación no destruya la decisión anterior;
- PUNTO → DOMICILIO sea explícito y auditable;
- los reintentos offline no dupliquen actividades, asignaciones, entregas o pagos;
- Actividad no se convierta en fuente independiente de total, pago o cartera.

## 14. Gates

1. Ownership definitivo de PlanActividad vs Actividad.
2. Semántica definitiva de `Actividad.modo`.
3. Contrato de materialización Planificación → Actividad.
4. Contrato Actividad → Embarque.
5. Flujo Gestionar pendiente.
6. Cambio PUNTO → DOMICILIO.
7. Replanificación.
8. Diferencial.
9. Fiscalidad.

Los gates fiscales requieren definición con contador/proveedor FE/DIAN antes de implementación comercial.

## 15. Clasificación

**DECISIÓN:** no implementar N2 directamente sin cerrar primero la arquitectura.

**HECHO:** existen ObligacionPendiente y Actividad en el código actual.

**BRECHA PLAN ↔ CÓDIGO:** la relación entre planificación y actividad todavía requiere convergencia.

**HIPÓTESIS:** `Actividad.modo` como modo operativo PUNTO/DOMICILIO.

**PENDIENTE:** materialización, replanificación, diferencial y fiscalidad.
