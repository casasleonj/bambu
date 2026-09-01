# FASE 0 — PEDIDOS + OPERACIÓN COMERCIAL

**Estado:** pendiente de aprobación del PO
**Baseline:** `230c896a9ab8acbfd2f8c7ccb78bb247b940aeed`
**Objetivo:** establecer autoridad, trazabilidad y backlog real antes de tocar dominio o UI.

---

## 1. Propósito

La Fase 0 no implementa funcionalidades.

Su misión es responder:

1. ¿Qué ya existe?
2. ¿Qué está decidido?
3. ¿Qué contradice una decisión existente?
4. ¿Qué realmente falta?
5. ¿Qué requiere una decisión nueva?
6. ¿Qué parte de la UI merece rework?

---

## 2. Entregables

### D0.1 — Inventario

`docs/pedidos/INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md`

Debe contener:

- ALS §1–§50;
- Plan Técnico §3–§83;
- estado PASS/FAIL/GAP;
- origen técnico;
- ADR relacionado;
- acción;
- fase.

### D0.2 — Mapa de autoridad

| Fuente | Autoridad |
|---|---|
| Contexto Maestro | Decisiones vigentes de producto |
| Plan Maestro congelado | Decisiones técnicas/producto ya convergidas |
| ADR aceptado | Contrato técnico/arquitectónico vigente |
| Código `main` | Estado técnico actual |
| Auditorías antiguas | Evidencia histórica |
| Investigación externa | Validación/contraste, no requisito automático |

### D0.3 — Matriz de discrepancias

Cada discrepancia debe clasificarse como:

- FAIL;
- GAP;
- histórico;
- obsoleto;
- pendiente.

---

# 3. Regla de no intervención

Hasta aprobar Gate 0:

**NO**

- modificar `schema.prisma`;
- crear enums;
- crear tablas;
- retirar campos legacy;
- modificar máquinas de estado;
- cambiar semántica de Venta Libre;
- rediseñar UI;
- crear nuevos endpoints de dominio.

Sí se permite:

- leer código;
- leer ADR;
- crear tests de caracterización si no cambian comportamiento;
- documentar contradicciones.

---

# 4. Procedimiento de contraste

Para cada cláusula:

```text
cláusula
↓
ADR relacionado
↓
código actual
↓
test existente
↓
clasificación
```

La clasificación debe usar evidencia verificable.

Nunca:

```text
"parece implementado"
```

sino:

```text
archivo
símbolo
línea/rango
ADR
test
```

---

# 5. Resultado conocido

## PASS principales

- separación origen/entrega/pago;
- offline-first;
- advisory locks;
- idempotencia de comandos ya cubiertos;
- cartera FIFO;
- Planificador → Embarque;
- replanificación explícita;
- responsabilidad;
- dinero en custodia;
- límite de fiados después del pago;
- timestamps offline.

## FAIL principales

- auditoría fuera de transacción en rutas críticas;
- transición duplicada;
- writes críticos crudos;
- Venta Libre fuerza entrega;
- Venta Rápida fuerza entrega;
- conflicto de asignación con HTTP inconsistente.

## GAP principales

- idempotencia de abonos;
- corrección/reversión/reaplicación;
- pago reportado/confirmado;
- estado canónico;
- origen/canal/tipo;
- semántica de estadoPago;
- embarque de origen persistente;
- specs desactualizadas;
- roles DB/app;
- semántica completa del faltante.

---

# 6. Gate 0 — criterios de aprobación

El PO aprueba cuando:

- no existe cláusula relevante sin clasificación;
- cada FAIL tiene acción y fase;
- cada GAP tiene dueño/ADR propuesto;
- ninguna decisión congelada se reescribe;
- no existe duplicación de arquitectura propuesta;
- el alcance de UI se mantiene abierto hasta concluir el contraste.

---

# 7. Después de Gate 0

## Fase 1

Correcciones backend pequeñas:

```text
F1 auditoría
↓
G1 idempotencia abonos
↓
F2 transiciones
↓
F3 writes críticos
↓
F6 409
↓
G10 roles
↓
G9 specs
```

## Fase 2

Decisiones nuevas:

```text
estado canónico
↓
origen/canal/tipo
↓
pago reportado/confirmado
↓
venta en ruta
↓
corrección abonos
↓
command/batch si demuestra necesidad
```

## Fase 3

UI/UX.

## Fase 4

E2E.

---

# 8. Definición de terminado de Fase 0

Fase 0 termina cuando:

- el inventario está aprobado;
- los PASS no generan trabajo redundante;
- los FAIL están separados de los GAP;
- los ADR existentes fueron reutilizados;
- los ADR nuevos están limitados a problemas genuinamente nuevos;
- no queda una decisión de producto escondida dentro de una tarea técnica;
- el alcance de UI está sustentado por evidencia;
- el roadmap siguiente puede ejecutarse sin volver a preguntar lo ya resuelto.

---

# 9. Principio rector

> **No reconstruir lo que el sistema ya resolvió. No convertir una contradicción de implementación en una nueva decisión de producto. No convertir una ausencia de código en una ausencia de decisión.**

La Fase 0 existe precisamente para mantener esas tres distinciones.
