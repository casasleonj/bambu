# AGUA BAMBÚ — AUDITORÍA DE CONVERGENCIA N2
## Instrucción para el equipo — recuperar decisiones antes de reabrir gates

**Versión:** 1.0
**Fecha:** 2026-09-04
**Estado:** INSTRUCCIÓN DE ANÁLISIS
**Repositorio:** `casasleonj/bambu`
**Base técnica conocida:** `main` posterior a PR #188

---

## 1. OBJETIVO

Antes de proponer nuevas decisiones, migraciones o wiring para N2, realizar una auditoría de convergencia.

El objetivo NO es volver a diseñar N2 desde cero.

El objetivo es determinar, para cada supuesto "gate" del N2 ALS/Plan de Producto:

1. qué ya fue decidido/convergido históricamente;
2. qué está decidido conceptualmente pero requiere contrato técnico;
3. qué es realmente una decisión de producto todavía abierta;
4. qué es una brecha entre Plan Maestro y código actual;
5. qué depende de un bloqueo externo.

### Regla principal

> **No preguntar al PO algo que ya haya sido suficientemente resuelto en Contexto Maestro, Planes Maestros, ADRs o conversaciones históricas.**

El código sirve para verificar el estado técnico actual. No debe utilizarse para inventar decisiones de producto.

---

# 2. FUENTES DE VERDAD

Usar esta jerarquía:

1. Contexto Maestro vigente.
2. Planes Maestros aprobados/vigentes.
3. ADRs y decisiones posteriores.
4. Conversaciones históricas como evidencia primaria del proceso de diseño.
5. Código actual de `main`.
6. Investigación externa solamente cuando sea necesaria.

Cuando existan contradicciones:

- identificar la contradicción;
- determinar cuál decisión es posterior y tiene autoridad;
- no resolverla silenciosamente.

---

# 3. CLASIFICACIÓN OBLIGATORIA

Cada hallazgo debe clasificarse exactamente como corresponda:

- **HECHO**
- **DECISIÓN**
- **PROPUESTA**
- **HIPÓTESIS**
- **PENDIENTE**
- **DESCARTADO**
- **OBSOLETO**
- **EVIDENCIA HISTÓRICA**
- **ESTADO TÉCNICO ACTUAL**
- **BRECHA PLAN ↔ CÓDIGO**
- **BLOQUEO EXTERNO**

No utilizar "pendiente" simplemente porque todavía no exista implementación.

---

# 4. CONVERGENCIAS QUE DEBEN VERIFICARSE PRIMERO

El análisis debe comprobar, contra las fuentes históricas, al menos las siguientes convergencias ya alcanzadas.

## 4.1 Modelo conceptual

Verificar la separación:

```text
PATRÓN HISTÓRICO
≠
RECURRENCIA ACORDADA
≠
PEDIDO CONCRETO
≠
PROGRAMACIÓN
≠
PLANIFICACIÓN
≠
ACTIVIDAD
≠
EJECUCIÓN
≠
CUMPLIMIENTO
≠
CARTERA
```

No volver a diseñar esta separación si la evidencia histórica confirma que ya fue decidida.

---

## 4.2 Historial y demanda

Verificar que:

```text
historial
→ demanda probable / oportunidad
→ contacto / preventa
→ confirmación
→ Pedido real
```

y que el historial por sí solo NO crea pedidos ficticios ni obligaciones ficticias.

---

## 4.3 Recurrencia

Verificar la distinción:

- patrón histórico;
- recurrencia acordada;
- pedido concreto.

La existencia de `PlantillaRecurrente` en el código no debe interpretarse automáticamente como la definición conceptual definitiva.

---

## 4.4 Pedido, programación y planificación

Verificar que:

- Pedido representa demanda/obligación comercial;
- programación representa cuándo se espera/acuerda atender;
- planificación determina cómo organizar la demanda;
- el sistema propone/calcula;
- el humano supervisa y decide excepciones.

---

## 4.5 Planificación

Verificar que `RutaHabitual` no es una lista obligatoria de pedidos y que el Plan del Día es una propuesta/decisión específica para una fecha.

---

## 4.6 Preferencias y fechas

Verificar la separación:

```text
disponibilidad del cliente
≠
preferencia habitual
≠
solicitud concreta
≠
fecha confirmada
≠
fecha planificada
≠
hora real
```

No reducir toda esta semántica a `horaPreferida`.

---

## 4.7 Entrega parcial

Verificar como decisión ya resuelta:

- no crear Pedido hijo para representar el pendiente;
- conservar Pedido original;
- conservar total y totalPagado;
- representar el pendiente mediante ObligacionPendiente;
- cumplir progresivamente la obligación.

---

## 4.8 Obligación

Verificar:

```text
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

y que `ObligacionPendiente` funciona como frontera de integridad/concurrencia de cantidad física.

No crear un Fulfillment paralelo sin evidencia de que el modelo actual sea insuficiente.

---

## 4.9 Dinero

Verificar:

- `saldoFavor` representa dinero a favor;
- no es reserva física de producto;
- Actividad no se convierte en segunda fuente monetaria;
- Pago/Abono continúa siendo autoridad monetaria.

---

## 4.10 Caja

Verificar la decisión F-B ya implementada:

- caja física conciliada por fecha de captura del Pago;
- ventas, pedidos, cartera y demás hechos conservan sus fechas semánticas propias.

No reabrir esta decisión salvo evidencia posterior.

---

# 5. N2: AUDITAR LOS "9 GATES"

No asumir que los nueve gates siguen siendo decisiones abiertas.

Para cada gate responder:

### Gate 1 — PlanActividad ↔ Actividad

Determinar:

- ownership conceptual ya decidido;
- responsabilidades de cada entidad;
- qué parte es decisión;
- qué parte es contrato técnico;
- qué existe actualmente en código;
- qué falta para reconciliar ambas capas.

Hipótesis de trabajo a verificar:

```text
PlanActividad = planificación
Actividad = trabajo ejecutable
```

No aceptar esta hipótesis sin verificar las fuentes, pero tampoco reabrirla si ya está decidida.

---

### Gate 2 — Actividad.modo

Determinar qué estaba realmente convergido respecto a:

```text
PUNTO
DOMICILIO
```

Verificar si ya se decidió:

- que el modo de cumplimiento puede diferir del origen comercial;
- que PUNTO → DOMICILIO es explícito;
- que no debe inferirse automáticamente;
- que debe conservarse historial.

Separar:

**decisión conceptual**

de

**contrato técnico del campo/estructura**.

---

### Gate 3 — Planificación → Actividad

Determinar qué ya estaba decidido sobre:

```text
Planificación
→ confirmación
→ materialización
→ Actividad
```

Separar:

- semántica ya decidida;
- contrato técnico pendiente;
- idempotencia;
- versionado;
- auditoría.

---

### Gate 4 — Actividad → Embarque

Verificar si ya estaba decidido que:

```text
Actividad
→ asignación
→ Embarque
→ ejecución
```

y que Embarque no se convierte en propietario de la obligación comercial.

Determinar únicamente qué contrato técnico falta.

---

### Gate 5 — Gestionar pendiente

Verificar la convergencia histórica del flujo:

```text
Gestionar pendiente
→ Enviar a domicilio
→ confirmar
→ calcular diferencial
→ materializar cumplimiento
→ planificación / Embarque
```

Verificar que NO se crea una nueva venta para el pendiente.

---

### Gate 6 — PUNTO → DOMICILIO

Verificar la decisión ya existente:

- cambio explícito;
- actor;
- motivo;
- trazabilidad;
- eventual diferencial;
- no inferencia automática por fallo de entrega.

Determinar qué falta únicamente a nivel técnico.

---

### Gate 7 — Replanificación

Verificar que ya estaba decidido que una planificación puede cambiar ante:

- nuevo pedido;
- cancelación;
- cambio de cantidad;
- recurso no disponible;
- capacidad;
- restricciones;
- reprogramación.

Determinar el contrato técnico pendiente sin convertirlo en una nueva decisión de producto.

---

### Gate 8 — Diferencial

Verificar la semántica ya convergida:

```text
valor histórico pendiente
+
cambio de modalidad
=
diferencial
```

El diferencial NO es:

- una nueva venta;
- una nueva venta ficticia;
- una reescritura del pedido histórico.

Determinar qué sigue abierto:

- fórmula comercial;
- promociones/descuentos;
- reglas de precio;
- fiscalidad.

---

### Gate 9 — Fiscalidad

Mantener como posible bloqueo externo.

Determinar exactamente qué preguntas requieren:

- contador;
- proveedor de facturación electrónica;
- DIAN.

No inventar tratamiento fiscal.

---

# 6. PUNTO CRÍTICO: PAGOS Y CUMPLIMIENTO

Auditar también el punto que puede quedar fuera de los nueve gates:

```text
Pago
↓
Pedido
↓
cumplimientos parciales
```

Determinar si el modelo actual permite representar correctamente el vínculo monetario cuando un pago cubre distintos hechos de cumplimiento.

Verificar la decisión histórica sobre NO crear `PaymentAllocation` prematuramente.

Clasificar si actualmente es:

- resuelto;
- suficiente con el modelo actual;
- contrato pendiente;
- o decisión arquitectónica realmente abierta.

---

# 7. AUDITORÍA DEL CÓDIGO

Inspeccionar `main` actual, sin modificarlo.

Como mínimo revisar:

- `prisma/schema.prisma`;
- `ObligacionPendiente`;
- `Actividad`;
- `PlanActividad`;
- `Embarque`;
- `Pedido`;
- `PedidoCantidadAjuste`;
- planificación;
- rutas;
- recurrentes;
- endpoints relacionados;
- casos de uso;
- tests;
- offline/idempotencia;
- asignación/liberación;
- cumplimiento.

Buscar también todos los callers reales.

La pregunta no es:

> "¿Existe ya la funcionalidad?"

La pregunta correcta es:

> "¿Qué arquitectura fue decidida y cuánto de ella está implementado actualmente?"

---

# 8. MATRIZ OBLIGATORIA DE RESULTADO

Entregar una matriz como esta:

| Tema | Clasificación | Decisión histórica | Evidencia | Estado código | Brecha | ¿Requiere PO? |
|---|---|---|---|---|---|---|
| PlanActividad ↔ Actividad | | | | | | |
| Actividad.modo | | | | | | |
| Materialización | | | | | | |
| Actividad ↔ Embarque | | | | | | |
| Gestionar pendiente | | | | | | |
| PUNTO → DOMICILIO | | | | | | |
| Replanificación | | | | | | |
| Diferencial | | | | | | |
| Fiscalidad | | | | | | |
| Pago ↔ cumplimiento | | | | | | |

---

# 9. REGLA PARA DECISIONES

No presentar al PO una lista de nueve preguntas.

Presentar únicamente:

### A. Decisiones ya cerradas

No requieren nueva aprobación.

### B. Decisiones cerradas pero no implementadas

No requieren rediseño; requieren ejecución técnica.

### C. Contratos técnicos pendientes

No son decisiones de producto salvo que impliquen cambiar la semántica.

### D. Decisiones realmente abiertas

Solo estas deben llegar al PO.

### E. Bloqueos externos

Separarlos de las decisiones internas.

---

# 10. REVISIÓN ADVERSARIAL

Antes de entregar el análisis:

Buscar explícitamente:

- decisiones históricas omitidas;
- gates falsamente abiertos;
- propuestas convertidas en decisiones;
- hipótesis convertidas en requisitos;
- contradicciones entre Plan Maestro y ALS;
- código usado como autoridad de producto;
- arquitectura histórica ignorada;
- duplicación de entidades;
- nueva deuda monetaria accidental;
- pérdida de histórico;
- problemas de concurrencia;
- problemas offline;
- decisiones fiscales inventadas.

---

# 11. RESULTADO ESPERADO

El resultado NO debe ser otro documento de diseño completo.

Debe responder con precisión:

> **¿Qué de N2 ya estaba decidido y qué realmente falta decidir?**

Y producir tres listas:

### LISTA 1 — CONVERGIDO

Decisiones que no deben reabrirse.

### LISTA 2 — CONTRATO / IMPLEMENTACIÓN

Decisiones conceptualmente cerradas pero cuyo contrato técnico debe definirse o implementarse.

### LISTA 3 — DECISIÓN REALMENTE ABIERTA

Solo asuntos que legítimamente requieren nueva decisión del PO o validación externa.

---

# 12. REGLA FINAL

**NO modificar schema.**

**NO crear migraciones.**

**NO implementar `Actividad.modo`.**

**NO reescribir endpoints.**

**NO modificar UI.**

**NO implementar diferencial fiscal.**

**NO crear nuevas entidades paralelas.**

Primero completar esta auditoría.

Después, si se demuestra que un punto ya estaba convergido, corregir el N2 ALS/Plan de Producto para reflejarlo.

Solo entonces preparar el wiring técnico.

---

## Criterio de éxito

La auditoría será correcta si, al terminar, el PO puede leerla y saber:

1. qué ya decidió anteriormente;
2. qué el equipo está obligado a respetar;
3. qué simplemente falta implementar;
4. qué contratos técnicos deben definirse;
5. qué decisiones realmente requieren su intervención;
6. qué depende de terceros.

El objetivo es **reducir decisiones abiertas, no multiplicarlas**.
