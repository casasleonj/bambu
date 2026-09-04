# AGUA BAMBÚ — N2 ARCHITECTURE LEVEL SPECIFICATION
## ALS-N2.0 — Obligación, Actividad y Planificación

**Estado:** PROPUESTA DE ARQUITECTURA
**Versión:** N2.0
**Fecha:** 2026-09-04
**Base técnica:** `main` `0b32015bddfe4e494936f1a41f78bc0cccc93b77`

## 1. Objetivo

Definir las fronteras arquitectónicas necesarias para evolucionar el dominio sin duplicar hechos entre Pedido, Obligación, Actividad, Planificación y Embarque.

Este documento no autoriza todavía migraciones de BD ni implementación productiva.

## 2. Fuentes de verdad

| Hecho | Autoridad |
|---|---|
| Decisión de producto | Contexto Maestro / Plan Maestro vigente |
| Estado técnico | `main` actual |
| Obligación comercial | Pedido |
| Cantidad pendiente | ObligacionPendiente |
| Trabajo ejecutable | Actividad |
| Propuesta/decisión logística | Planificación |
| Ejecución de misión | Embarque |
| Hecho monetario | Pago/Abono |
| Cumplimiento físico | hechos de ejecución/ledger |

## 3. Invariantes

### I-01 Cantidad

`cantidadCumplida + cantidadAsignada <= cantidadOriginal`

### I-02 Disponibilidad

`cantidadDisponible = cantidadOriginal - cantidadCumplida - cantidadAsignada`

No almacenar `cantidadDisponible` como autoridad independiente.

### I-03 No doble asignación

Una misma cantidad disponible no puede quedar comprometida simultáneamente por dos actividades activas.

### I-04 Pedido

La existencia de una Actividad no modifica por sí sola:

- `Pedido.total`;
- `Pedido.totalPagado`;
- `Pedido.saldo`.

### I-05 Historia

Una modificación de planificación no sobrescribe silenciosamente una decisión histórica.

### I-06 Idempotencia

Toda mutación offline crítica debe aceptar retry sin duplicar el hecho.

## 4. Modelo de relaciones

```text
Pedido
  │
  └── ObligacionPendiente
          │
          └── Actividad
                  │
                  ├── Planificación
                  │
                  └── Embarque
```

La implementación definitiva debe evitar que una misma actividad sea materializada dos veces por procesos concurrentes.

## 5. ObligacionPendiente

Estado actual observado:

- `pedidoId`;
- `clienteId`;
- `producto`;
- `cantidadOriginal`;
- `cantidadCumplida`;
- `cantidadAsignada`;
- `estado`;
- `actividades`;
- `ajustes`.

No agregar una columna `cantidadDisponible` salvo decisión posterior explícita.

La obligación es la frontera para reservar/consumir cantidad.

## 6. Actividad

Estado actual observado:

- `obligacionId`;
- `embarqueId` opcional;
- `tipo`;
- `cantidad`;
- `cantidadCumplida`;
- `estado`.

### Cambio pendiente

Agregar `modo` solamente después de cerrar su semántica.

## 7. Actividad.modo

Propuesta:

```text
PUNTO
DOMICILIO
```

El ALS no congela aún el enum.

Debe distinguirse conceptualmente:

```text
modo solicitado
modo planificado
modo ejecutado
```

Si se decide almacenar un solo modo, deberá justificarse qué momento representa y cómo se conserva el histórico de cambios.

## 8. Planificación

`PlanActividad` no debe convertirse automáticamente en Actividad sin contrato.

Debe existir una operación de materialización con:

- actor;
- timestamp;
- versión del plan;
- referencia de origen;
- estado;
- idempotency key.

Una propuesta de planificación rechazada no debe producir trabajo ejecutable.

## 9. Materialización

Flujo objetivo:

```text
PlanActividad
    │
    ├── RECHAZADA → no materializa
    │
    └── CONFIRMADA
           │
           ▼
       Actividad
           │
           ▼
       Embarque
```

La materialización debe ser transaccional.

Si dos procesos intentan materializar la misma propuesta, solamente uno puede producir la Actividad efectiva.

## 10. PUNTO → DOMICILIO

Debe existir un comando de dominio explícito.

Conceptualmente:

`CambiarModoActividad`

Entrada mínima:

- actividad;
- modo destino;
- actor;
- motivo;
- offlineId.

Salida:

- modo nuevo;
- registro auditable;
- diferencial calculado o pendiente de cálculo cuando corresponda.

Nunca debe inferirse solamente por un fallo de entrega.

## 11. Asignación

Al asignar cantidad a una Actividad:

1. adquirir lock de la Obligación;
2. recalcular disponibilidad;
3. verificar cantidad solicitada;
4. incrementar `cantidadAsignada`;
5. crear/actualizar Actividad;
6. confirmar en una única transacción.

Al cancelar/liberar una actividad:

1. lock de la Obligación;
2. disminuir `cantidadAsignada`;
3. actualizar Actividad;
4. commit único.

## 12. Cumplimiento

Al ejecutar una actividad:

- no incrementar dos veces `cantidadCumplida`;
- no superar `cantidad`;
- no superar la cantidad original de la obligación;
- mantener trazabilidad con Embarque;
- usar idempotencia offline.

El cumplimiento físico debe quedar respaldado por los hechos físicos canónicos correspondientes.

## 13. Embarque

Embarque es contexto de ejecución logística.

No debe convertirse en propietario de la obligación comercial.

Una Actividad puede estar sin Embarque antes de ser planificada/asignada.

Una vez ejecutada, la relación debe permitir reconstruir qué trabajo fue ejecutado en qué misión.

## 14. Monetario

No crear una segunda fuente monetaria en Actividad.

Los pagos continúan siendo hechos monetarios.

La caja se concilia por fecha de captura de Pago, conforme a la decisión F-B vigente.

Las ventas conservan su semántica propia.

## 15. Offline

Toda operación de:

- crear Actividad;
- asignar;
- liberar;
- cambiar modo;
- cumplir;

debe tener estrategia de idempotencia.

`offlineId` no debe reutilizarse para dos comandos semánticamente diferentes.

## 16. Seguridad

Las operaciones deben pasar por:

- autenticación;
- autorización por rol;
- ownership operativo cuando aplique;
- validación server-side.

Nunca confiar en un `modo`, cantidad o estado enviado por frontend.

## 17. Observabilidad

Registrar como mínimo:

- operación;
- entidad;
- actor;
- antes/después cuando haya cambio;
- offlineId;
- timestamp;
- motivo cuando aplique;
- error de dominio si falla.

## 18. Migraciones

No modificar el schema hasta cerrar:

1. ownership;
2. modo;
3. materialización;
4. estrategia de histórico.

Las migraciones deberán ser aditivas cuando sea posible.

No destruir columnas históricas para "limpiar" el modelo.

## 19. Tests obligatorios

### Unitarios

- invariantes de cantidad;
- transición de estados;
- cambio de modo;
- idempotencia.

### Integración Postgres real

- concurrencia de dos asignaciones;
- liberación concurrente;
- materialización duplicada;
- cumplimiento parcial;
- retry offline.

### E2E

- gestionar pendiente;
- planificar;
- asignar;
- ejecutar;
- completar;
- cambiar PUNTO → DOMICILIO;
- replanificar;
- recuperar tras offline.

## 20. Definition of Done N2

N2 no está listo para implementación completa hasta que:

- no exista ambigüedad PlanActividad ↔ Actividad;
- `Actividad.modo` tenga semántica cerrada;
- exista contrato de materialización;
- exista contrato de asignación/liberación;
- exista contrato de cumplimiento;
- exista estrategia de replanificación;
- PUNTO → DOMICILIO sea explícito;
- concurrencia esté cubierta;
- offline esté cubierto;
- monetario no se duplique;
- fiscalidad tenga gate independiente.

## 21. Estado

**PROPUESTA DE ARQUITECTURA.**

No autoriza todavía:

- `prisma migrate`;
- creación definitiva de `Actividad.modo`;
- reescritura de endpoints;
- cambio de UI;
- implementación del diferencial;
- implementación fiscal.

Primero debe producirse la convergencia N2.1–N2.4.
