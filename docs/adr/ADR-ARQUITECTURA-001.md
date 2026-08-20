# ADR-ARQUITECTURA-001 — Actualización, envío y listado de embarques viven en el controller

- Estado: Aceptado
- Fecha: 2026-08-20
- Fuente: plan de convergencia de embarques, A.3.1 (decisión Opción B)
- Fase de implementación: FASE 0 (auditoría) / pre-FASE 2

## Contexto

El módulo `src/modules/embarques/application/use-cases/` contenía tres use cases que ningún `route.ts` invocaba:

- `ActualizarEmbarqueUseCase` — la lógica real de `PUT /api/embarques/[id]` vive inline en el route, dentro de `withAdvisoryLock('EMBARQUE_CARGA')`, con dedup por `offlineId` y el fix de TOCTOU (F-N12).
- `EnviarEmbarqueUseCase` — la lógica real de `POST /api/embarques/[id]/enviar` vive inline, dentro de `executeSerializableWithRetry`, e incluye una regla que el use case no modelaba: "un trabajador no puede tener 2 embarques `EN_RUTA` simultáneos" (fix F-N1).
- `ListarEmbarquesUseCase` — el listado real (`GET /api/embarques`) usa Prisma directo con el enrich aplanado anti-N+1.

Los tres divergían de la lógica inline (el use case de envío era una versión más simple que el route real). Ofrecían un "mapa mental" falso: leer la estructura DDD sugería que estas operaciones delegaban en use cases cuando en producción no lo hacen.

## Decisión

Opción B: eliminar los tres use cases muertos (y sus DTO de entrada huérfanos `ActualizarEmbarqueInput`, `EnviarEmbarqueInput`, `ListarEmbarquesInput`). La actualización, el envío y el listado de embarques **viven en el controller por diseño**; el `route.ts` es la fuente de verdad para esas tres operaciones.

No se adopta la Opción A (mover la lógica inline a los use cases) porque implicaría reescribir comportamiento congelado y aprobado (Gate `PASS`) — los fixes F-N12 y F-N1 están validados contra la lógica inline, no contra los use cases — con riesgo de regresión sin beneficio para el objetivo del plan (convergencia de UX).

## Consecuencias

- `src/modules/embarques/application/use-cases/` queda con 6 use cases, todos cableados a un endpoint.
- El "mapa mental" DDD es honesto: `Crear`/`Cancelar`/`Cerrar`/`CrearRecoveryDecision`/`ResolverResponsibilityCase`/`AsignarActividad` delegan en use cases; `Actualizar`/`Enviar`/`Listar` viven en el controller.
- Si en el futuro se quiere migrar Actualizar/Enviar/Listar a use cases, hay que portar la lógica inline completa (incluida la regla "no 2 EN_RUTA" y los fixes de concurrencia) al dominio, sin perder comportamiento.
