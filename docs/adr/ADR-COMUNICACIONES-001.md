# ADR-COMUNICACIONES-001 — Comunicación con el cliente

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §0.2
- Fase de implementación: FASE 8

## Contexto

La comunicación opcional al cliente (WhatsApp) es una capa de transparencia externa, no una fuente de verdad.

## Decisión

- La comunicación al cliente por WhatsApp es **opcional**.
- Nunca es fuente de verdad de ningún dato crítico (pedido, pago, embarque, custodia).
- No bloquea ni modifica el flujo de negocio si falla.

## Invariantes

- La comunicación nunca altera el estado de los ledgers.

## Verificación

El envío de mensajes es best-effort y no participa de transacciones de negocio.
