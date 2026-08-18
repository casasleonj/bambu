# ADR-CAPACIDAD-001 — Capacidad de vehículo

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §2, §9.1
- Fase de implementación: FASE 8 (consolidación)

## Contexto

La capacidad de carga del vehículo se valida en creación/asignación de embarques. El dato vive en `Trabajador.capacidadKg`.

## Decisión

- `Trabajador.capacidadKg` es un **legacy mirror** hasta su consolidación.
- Niveles de capacidad: `ideal` (≤75%), `pesado` (≤87%), `maximo` (≤100%), `excedido` (>100%).
- La validación de peso usa `capacidadMotoKg ?? capacidadKg ?? 500`, con tolerancia ×1.1 y límite de unidades (`MAX_UNIDADES`).

## Invariantes

- No se asigna/crea un embarque que exceda la capacidad en peso y unidades.

## Verificación

Validación en creación/update + `lib/embarque-capacidad.ts`.
