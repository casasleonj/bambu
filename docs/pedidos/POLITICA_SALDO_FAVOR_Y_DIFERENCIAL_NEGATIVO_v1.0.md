# Política de dominio — Saldo a favor y diferencial negativo

**Qué es este documento.** La **regla económica de dominio** para el saldo a favor (`Cliente.saldoFavor`) generado por un diferencial negativo, y para qué ocurre cuando la operación que lo generó cambia después. Definida por el equipo el **2026-09-08** para cerrar el punto que en Fase 5 quedaba como "decisión abierta".

**Autoridad.** Este documento es autoridad de **política económica de dominio**. Aplica a **N2 (cumplimiento parcial), Cartera, notas de crédito, correcciones y cualquier proceso que produzca o ajuste `Cliente.saldoFavor`**. No es autoridad de UX ni de alcance de fases.

**No reabre el rediseño.** No amplía el alcance de Pedidos. No pide que Fase 5 invente lógica adicional fuera de esta política. La regla queda definida a nivel de dominio y **debe ser respetada** por los flujos existentes y futuros.

**Fuente del patrón.** Cómo lo resuelven ERPs maduros (SAP, Oracle, Dynamics): ante un cambio posterior de la operación **no se borra ni se sobrescribe** el efecto financiero previo — se **conserva** y se genera una **reversión/compensación trazable** vinculada a la operación original.

---

## 1. Principio general

> **No borrar historia financiera. Compensar mediante nuevas operaciones trazables.**

Un saldo a favor generado por un diferencial negativo es un **efecto económico real y trazable**, no un valor provisional que pueda desaparecer en silencio.

---

## 2. Regla cuando cambia la operación que generó el saldo

1. **No** se modifica ni se borra retroactivamente el saldo histórico.
2. Se genera un **nuevo ajuste compensatorio** vinculado a la operación original.
3. Si el saldo a favor **todavía está disponible**, el ajuste lo compensa **hasta el importe disponible**.
4. Si el cliente **ya utilizó** parte o todo ese saldo, el sistema **conserva** tanto el crédito original como su utilización. No se borra el consumo ni se reconstruye artificialmente el estado anterior.
5. Si tras la corrección queda una **diferencia económica** porque el cliente usó un crédito que después dejó de corresponder, esa diferencia queda **identificada como pendiente**. **No** se convierte automáticamente en una cuenta por cobrar al cliente.

---

## 3. De "diferencia pendiente" a "obligación de cobro"

6. Para convertir esa diferencia en una obligación de cobro debe **determinarse la causa**:
   - error de Agua Bambú;
   - modificación legítima;
   - error atribuible al cliente;
   - operación irregular / fraudulenta;
   - u otra causa definida.
7. Un **error atribuible a Agua Bambú** no se convierte automáticamente en deuda del cliente.
8. Cuando exista una causa que justifique una obligación de cobro, debe pasar por el **flujo de revisión / autorización** correspondiente **antes** de generar esa obligación.

> **Regla transversal (coincide con `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §12bis VL-A15):** una **señal** de diferencia o de fraude **no equivale automáticamente a una deuda del cliente**.

---

## 4. Trazabilidad obligatoria de toda reversión / ajuste

9. Todo ajuste compensatorio conserva:

   | Campo | Qué |
   |---|---|
   | operación origen | la operación que generó el saldo |
   | operación que genera el ajuste | la que motiva la compensación |
   | motivo | causa del ajuste |
   | usuario | quién lo genera / autoriza |
   | fecha | cuándo |
   | importe original | crédito acreditado inicialmente |
   | importe ajustado | monto de la compensación |
   | saldo disponible | parte del crédito aún no usada |
   | saldo utilizado | parte ya consumida por el cliente |
   | efecto final | resultado neto (compensado / diferencia pendiente) |

10. La autoridad económica permanece en **backend**. Toda modificación es **transaccional, auditable e idempotente**.

---

## 5. Estado en `main` — BRECHA PLAN ↔ CÓDIGO

El comportamiento hoy documentado en Fase 5:

> «un diferencial negativo ya acreditado a `Cliente.saldoFavor` no se revierte automáticamente»

**deja de ser una política definitiva del producto.** Es una **BRECHA PLAN ↔ CÓDIGO**: la implementación actual no realiza la compensación trazable que esta política define.

| Área | Política (este doc) | `main` actual | Evidencia | Estado |
|---|---|---|---|---|
| Diferencial negativo → saldo a favor | Efecto real y trazable | `aplicar-diferencial-economico.service.ts`: `diferencial < 0` → `Cliente.saldoFavor += \|dif\|`; se registra `PedidoCantidadAjuste` con `montoDiferencial < 0` | `GestionarPendienteUseCase` | **HECHO** (se acredita y se registra) |
| Cambio posterior de la operación (liberar / cambiar-modo) | Ajuste compensatorio nuevo, hasta el disponible; conserva consumo | `revertirDiferencialEnPedido()` revierte **solo** `Σ montoDiferencial > 0` (`montoRevertible`). El negativo ya acreditado a `saldoFavor` **no** se compensa | `CambiarModoActividadUseCase` ("límite conocido"); `ProyectarGestionPendienteUseCase` (`saldoFavorNoRevertido`) | **BRECHA PLAN↔CÓDIGO** |
| Diferencia tras consumo del crédito | Queda "pendiente"; no se vuelve CxC automática | No existe el concepto de "diferencia pendiente por crédito ya consumido" | — | **BRECHA PLAN↔CÓDIGO** |
| Causa + autorización antes de CxC | Flujo de revisión obligatorio | No existe | — | **PENDIENTE de implementación** (política ya definida) |

**Alcance del arreglo:** es trabajo de **dominio / Cartera**, no de Fase 5. Fase 5 (N2 en el Hub) **solo** debe:
- mostrar el efecto real y actual sin mentir ("el crédito ya acreditado permanece");
- **no** presentar una reversión total falsa;
- referir a esta política como la definición vigente (no como "límite conocido aceptado").

Ver `docs/pedidos/fase5-n2-flujo-plan.md` (P3) y el componente `n2-impacto.tsx` (`n2-impacto-no-revertido`).

---

## 6. Qué NO hacer

1. **No** borrar ni sobrescribir `PedidoCantidadAjuste` ni `Cliente.saldoFavor` históricos.
2. **No** reconstruir el estado anterior "restando" un crédito ya consumido.
3. **No** convertir una diferencia pendiente en `Deuda` / cuenta por cobrar sin causa determinada y sin flujo de autorización.
4. **No** tratar un error de Agua Bambú como deuda del cliente.
5. **No** implementar esta compensación dentro de Fase 5 / Pedidos como lógica ad hoc. Es dominio compartido (N2 + Cartera).
6. **No** dejar el ajuste sin los 10 campos de trazabilidad de §4.
