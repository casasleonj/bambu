# ADR-AUTORIZACION-REGALOS-001 — Autorizaciones críticas

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §1.1, §17
- Fase de implementación: FASE 8

## Contexto

Ciertas acciones críticas (cambios retroactivos de precio, regalos, ajustes administrativos, cargos de responsabilidad, descartes) no pueden ser ejecutadas unilateralmente por el repartidor.

## Decisión

- Todas las autorizaciones críticas se validan **server-side**.
- `AJUSTE_AUTORIZADO` exige `authorization != NULL` + `userId != NULL`.
- Los regalos/promociones exigen autorización auditable (`authorizedById`).
- El repartidor no puede autorizar por sí mismo: cambios retroactivos de precio, regalos no autorizados, ajustes administrativos, cargos de responsabilidad, descarte definitivo ni modificaciones de auditoría.

## Actores (§1.1)

- **Repartidor**: registra hechos operativos reales; no autoriza excepciones.
- **Oficina/administrador**: crea, planifica, concilia, resuelve diferencias.
- **Administrador/autorizador**: autoriza excepciones, precios, promociones, cargos.

## Verificación

Validación server-side en cada endpoint crítico; `authorizedById` obligatorio en regalos y `AJUSTE_AUTORIZADO`.
