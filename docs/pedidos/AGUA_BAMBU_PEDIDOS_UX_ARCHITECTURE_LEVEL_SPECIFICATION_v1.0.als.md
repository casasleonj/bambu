# AGUA BAMBÚ — PEDIDOS
## Architecture Level Specification (ALS) — Frontend / UX

**Versión:** 1.0 — 2026-09-06  
**Estado:** BASE DE IMPLEMENTACIÓN

## 1. Propósito

Definir cómo debe materializarse el rediseño integral de Pedidos en frontend y sus contratos de interacción con backend.

## 2. Invariantes

**A1 Backend authority:** precio, total, permisos, estados, propiedad, saldo, riesgo y autorización son responsabilidad del servidor.

**A2 Intent ≠ command ≠ mutation:** una intención prepara un comando; solo el commit ejecuta la mutación.

**A3 Draft ≠ entidad persistida:** el draft puede estar incompleto y no altera dominio.

**A4 Preview ≠ commit:** preview calcula; commit persiste.

**A5 Acción sensible ≠ acción normal:** requiere revisión/autorización cuando corresponda.

**A6 UI guidance ≠ security:** ocultar botones nunca sustituye autorización.

**A7 Acciones contextuales:** disponibles según estado, origen, canal, permisos y propiedad.

**A8 No silent mutation:** cambios financieros, identidad, estado crítico o relaciones operativas nunca se modifican silenciosamente.

---

## 3. Shell

```text
Pedidos
├── Header contextual
├── Search / Command
├── Queue / Views
└── Workspace
```

## 4. Workspace

```text
┌─────────────────────────────────────────┐
│ Contexto: cliente/origen/canal/estado   │
├─────────────────────────────────────────┤
│ Operación: items/cantidades/entrega     │
├─────────────────────────────────────────┤
│ Cálculo: subtotal/total/pago             │
├─────────────────────────────────────────┤
│ Señales: warnings/riesgo                │
├─────────────────────────────────────────┤
│ Commit: cancelar/guardar/confirmar      │
└─────────────────────────────────────────┘
```

La jerarquía semántica debe mantenerse aunque el layout cambie en móvil.

---

## 5. Componentes

- `PedidosWorkspace`: coordina contexto, draft y acciones; no contiene reglas de negocio.
- `PedidoIntentPicker`: intenciones filtradas por permisos/contexto.
- `PedidoContextPanel`: contexto del cliente y operación.
- `PedidoComposer`: edición del draft.
- `PedidoProposal`: propuesta calculada/inferida.
- `PedidoItemEditor`: cantidades/items.
- `PedidoPricingSummary`: muestra cálculo del backend.
- `PedidoRiskSignals`: señales no acusatorias.
- `PedidoReview`: revisión antes de commit.
- `PedidoCommitBar`: CTA contextual.
- `PedidoActivityTimeline`: actividad relevante.
- `PedidoCommandMenu`: acciones contextuales.
- `PedidoAuditDiff`: antes/después.
- `PedidoExceptionPanel`: recuperación.

---

## 6. State machine de UI

```text
EMPTY
 ↓
CONTEXT_READY
 ↓
DRAFTING
 ↓
PREVIEW_READY
 ↓
REVIEW_REQUIRED
 ↓
AUTHORIZATION_REQUIRED
 ↓
COMMITTING
 ↓
COMMITTED
```

Errores:

```text
ANY → VALIDATION_ERROR
ANY → CONFLICT_ERROR
ANY → NETWORK_ERROR
ANY → AUTHORIZATION_ERROR
```

Recovery:
- validation → drafting;
- conflict → refresh/review;
- network → retryable;
- authorization → review.

No crear estados visuales contradictorios con dominio.

---

## 7. Origen y canal

Representar independientemente:

```ts
origen:
  PEDIDO | VENTA_RAPIDA | VENTA_LIBRE | RECURRENTE

canal:
  PUNTO | DOMICILIO
```

Nunca:

```text
PUNTO = VENTA_RAPIDA
```

La UI debe permitir las cuatro combinaciones relevantes.

---

## 8. Inferencia

Los valores propuestos pueden llevar:

```ts
type ValueOrigin =
  | "USER"
  | "HISTORY"
  | "RULE"
  | "CALCULATION"
  | "DEFAULT";
```

Reglas:
- alta confianza + bajo impacto → aplicar/proponer;
- confianza media → proponer;
- alto impacto → confirmar.

La confianza nunca sustituye autorización.

---

## 9. Pricing

Frontend recibe:

```ts
type PricingPreview = {
  items: PricingItem[];
  subtotal: number;
  discounts: DiscountPreview[];
  deliverySurcharge: number;
  total: number;
  warnings: Warning[];
};
```

Frontend muestra; backend decide.

Si el usuario solicita precio excepcional:

```text
Autorizado: $X
Propuesto:  $Y
Diferencia: $Z
Motivo: ___
Autorización: requerida
```

---

## 10. Acción sensible

```ts
type SensitiveActionPreview = {
  action: string;
  impact: ImpactSummary;
  warnings: Warning[];
  requiresAuthorization: boolean;
  authorizationPolicy?: string;
};
```

Flujo obligatorio:

```text
INTENT
 ↓
PREVIEW
 ↓
IMPACT
 ↓
AUTHORIZATION
 ↓
COMMIT
 ↓
AUDIT RESULT
```

Nunca `click → mutation` para una operación sensible.

---

## 11. Command menu

Debe ser contextual y funcionar con mouse, touch y teclado.

Ejemplos:

```text
Nuevo pedido
Repetir pedido
Corregir
Cancelar
Entregar
Ver cartera
Ver historial
```

Las acciones visibles no sustituyen backend authorization.

---

## 12. Responsive

### Mobile
Prioridad:
1. contexto;
2. operación;
3. total;
4. CTA.

Evitar tablas anchas, sidebars permanentes y modales encadenados.

### Desktop
Puede existir panel contextual, workspace principal y panel lateral de actividad/riesgo.

La lógica de negocio no debe duplicarse por viewport.

---

## 13. Offline

El draft puede persistir localmente.

El commit:
- utiliza `offlineId`;
- es idempotente;
- muestra estado real:
  - pendiente;
  - sincronizando;
  - sincronizado;
  - conflicto;
  - intervención requerida.

Nunca mostrar “confirmado” sin confirmación server-side.

---

## 14. Anti-fraud UX

### Normal
Flujo inmediato.

### Warning
```text
El precio está por debajo del autorizado.
[Revisar] [Solicitar autorización]
```

### Alto impacto
```text
Esta corrección cambia el valor.

Antes: $X
Después: $Y
Motivo: ______

[Cancelar] [Solicitar autorización]
```

La UI debe explicar, no acusar.

---

## 15. Seguridad de frontend

El frontend debe asumir:
- campos hidden/disabled manipulables;
- respuestas stale;
- requests repetibles;
- concurrencia;
- manipulación HTTP.

Toda mutación sensible debe revalidarse en backend y usar transacción/lock/idempotencia cuando corresponda.

---

## 16. Observabilidad

Eventos:

```text
pedido.intent.started
pedido.preview.requested
pedido.preview.completed
pedido.warning.shown
pedido.risk_signal.shown
pedido.authorization.requested
pedido.authorization.completed
pedido.commit.started
pedido.commit.completed
pedido.commit.failed
pedido.conflict.detected
pedido.offline.queued
pedido.offline.synced
pedido.offline.conflict
```

No registrar secretos ni datos sensibles innecesarios.

---

## 17. Accesibilidad

Obligatorio:
- keyboard navigation;
- focus management;
- focus visible;
- labels semánticos;
- aria-live donde corresponda;
- no depender solo del color;
- targets táctiles adecuados;
- errores asociados a campos;
- orden lógico de lectura.

---

## 18. Testing

### Unit
State machine, derivaciones visuales, permisos, value origin y presentación de riesgo.

### Integration
Preview, commit, autorización, conflicto y offline.

### E2E happy
- nuevo pedido;
- repetir;
- venta rápida PUNTO;
- venta rápida DOMICILIO;
- pedido PUNTO;
- pedido DOMICILIO;
- corrección;
- nueva demanda.

### E2E abuse
- precio manipulado;
- cliente manipulado;
- origen/canal manipulado;
- descuento sin autorización;
- salto de estado;
- replay;
- concurrencia;
- pedido ajeno;
- cancelación/anulación inválida;
- corrección convertida en demanda;
- demanda convertida en corrección.

---

## 19. DoD

- [ ] No existe formulario monolítico como experiencia principal.
- [ ] Intenciones definidas.
- [ ] Workspace adaptativo implementado.
- [ ] Origen/canal visualmente independientes.
- [ ] Información conocida reutilizada.
- [ ] Cálculos autoritativos vienen del backend.
- [ ] Preview y commit separados.
- [ ] Acciones sensibles tienen revisión.
- [ ] Auditoría disponible.
- [ ] Recuperación de errores implementada.
- [ ] Offline muestra estado real.
- [ ] Responsive probado.
- [ ] Accesibilidad verificada.
- [ ] Playwright cubre happy + abuse paths.
- [ ] Ninguna regla crítica depende solo del frontend.
- [ ] Métricas comparables con baseline.

---

## 20. Gates

### Gate UX
Aprobados mapa de intenciones, arquitectura, flujos, errores y antifraude.

### Gate Contract
Definidos preview, allowedActions, warnings, riskSignals, authorization y audit result.

### Gate Security
Server-side enforcement, autorización contextual, concurrencia, replay/idempotencia y auditoría probados.

### Gate E2E
Happy paths, abuse paths, offline y responsive verificados.

---

## 21. Prohibiciones

No introducir sin nueva decisión:
- origen derivado de canal;
- consumidor final como tipo comercial;
- edición destructiva;
- precio confiado desde cliente;
- seguridad basada en UI;
- pedido-hijo como solución universal;
- chatbot obligatorio;
- ML antifraude como primera capa;
- dos modelos mentales coexistentes.

---

## 22. Criterio final

La arquitectura es correcta si el usuario piensa principalmente:

**“qué quiero hacer”**

y no:

**“qué campos tengo que llenar”.**

La interfaz debe ocultar complejidad operativa, pero nunca ocultar decisiones, consecuencias o controles.
