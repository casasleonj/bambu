# ADR-RESPONSABILIDAD-001 — Responsabilidad y cargo económico

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §13
- Fase de implementación: FASE 6

## Contexto

Detectar una responsabilidad puede ser automático, pero transferir económicamente la deuda a un trabajador/repartidor es una acción con consecuencias que exige resolución autorizada.

## Decisión

- La **detección** de una responsabilidad puede ser automática.
- La **transferencia económica** de la deuda al trabajador **nunca puede ser automática**.

Flujo:

```
detección → ResponsibilityCase → investigación → resolución
  → si RESUELTA_CON_CARGO:
       autorizadoPorId obligatorio
       resueltoPorId   obligatorio
  → crear hecho económico (DescuentoRepartidor / DeudaTrabajador)
```

- `resueltoPorId` por sí solo **no autoriza** un cargo.
- `embarqueId` es **nullable**: una investigación puede ocurrir días después de la operación.

## Discrepancia con el código actual (registrada, §26)

`CerrarEmbarqueUseCase` actualmente crea `DescuentoRepartidor` (discrepancia) y `DeudaTrabajador` (faltante de caja) **automáticamente** al cerrar, sin `ResponsibilityCase` ni resolución autorizada. Esto contradice §13.

**Resolución**: en FASE 6 el cierre crea `ResponsibilityCase` pendiente de resolución en lugar del cargo; el cargo económico solo se materializa tras el workflow de resolución autorizada. No se resuelve con un `if` local.

## Estado de implementación (FASE 6)

- ✅ Modelo `ResponsibilityCase` (con `embarqueId` nullable, `tipo`, `montoEstimado`, `estado`, `autorizadoPorId`/`resueltoPorId`/`resueltoAt`, `hechoEconomicoId`/`hechoEconomicoTipo`).
- ✅ `CrearDescuentoDiscrepanciaService` y `CrearDeudaFaltanteCajaService` ahora **detectan y crean `ResponsibilityCase`** (DISCREPANCIA_INVENTARIO / FALTANTE_CAJA), ya NO crean el cargo económico.
- ✅ `CerrarEmbarqueUseCase` devuelve `responsibilityCases` (pendientes de resolución); `descuentoCreado`/`deudaCreada` eliminados del DTO.
- ✅ `ResolverResponsibilityCaseUseCase`: `RESUELTA_CON_CARGO` exige `autorizadoPorId` + `resueltoPorId` y materializa el hecho económico; `RESUELTA_SIN_CARGO` no; idempotente (un caso ya resuelto retorna deduped, previene doble cargo).
- ✅ Tests `responsibility.test.ts` (6): rechazo sin autorización, materialización de deuda/descuento, dos resoluciones concurrentes → 1 cargo, SIN_CARGO, caso sin embarque.

Nota: la resolución usa serialización global (`SECUENCIA:responsibility`); el lock granular por caso se define en un ADR futuro (no hay namespace RESPONSIBILITY en el contrato §6).

## Verificación

Tests §20 "Antifraude": dos autorizaciones intentando cargar la misma responsabilidad; investigación sin embarque activo. Métrica `responsibility_case_without_embarque_count`.
