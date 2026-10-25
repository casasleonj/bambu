# ADR-CIERRE-003 — «Cambios» del cierre = Σ sustituciones registradas

- Estado: **Aceptado** (PO 2026-10-25) — implementado en la Fase C del cierre V2
- Fecha: 2026-10-25
- Fuente: épica #447; hallazgo #446
- Complementa: ADR-CIERRE-002 (integridad del cierre), ADR-SUSTITUCION-001 (registro de sustituciones)

## Contexto

En el cierre, «Cambios» era un número que el asistente tecleaba por producto, sin cliente, sin pedido y sin evidencia. Ese número bajaba el faltante: con `cambios = 3` y ninguna sustitución registrada, la diferencia pasaba de 5 a 2 unidades y de $14.000 a $5.600. Un faltante se podía tapar con cambios inventados. Además, el cambio real (la sustitución del tab «Físico») se tenía que volver a digitar en el cierre.

## Decisión

1. **Una sola fuente.** `cambios` por producto = Σ de las unidades de reemplazo entregadas (movimiento `ENTREGA`) de las `Sustitucion` del embarque. El cierre solo lee.
2. **El número tecleado no manda.** Si el cliente V2 envía `cambiosDesdeSustituciones: true`, el servidor compara lo tecleado con la suma y, si no coinciden (incluido `0` con sustituciones registradas), rechaza con `409 CAMBIOS_NO_COINCIDEN`. No corrige en silencio: un número que no cuadra es justo la señal que interesa.
3. **Destino del cambio.** `Sustitucion.clienteId` (opcional) permite atribuir un cambio a un cliente que no tiene pedido en la ruta. El registro con solo cliente exige motivo.
4. **Señales, no bloqueos.** El cierre avisa («Para revisar») de `CAMBIO_A_CLIENTE_SIN_PEDIDO` y de `CAMBIO_SIN_DESTINO` (sustituciones anteriores sin cliente ni pedido).
5. **Sin flag → sin cambios.** El cierre V1 no envía la bandera y conserva el comportamiento anterior. La UI V2 (`NEXT_PUBLIC_CIERRE_V2`) muestra «Cambios» de solo lectura con la lista de sustituciones y un acceso a «Registrar cambio»; el modal de sustitución exige pedido o cliente solo con el flag ON.
6. **Sin migración de datos.** Los cambios que antes se tecleaban sin evidencia no se convierten en sustituciones.

## Implementación

| Pieza | Dónde |
|---|---|
| Lógica pura (suma, validación, desglose por destino) | `src/modules/embarques/domain/services/cambios-sustituciones.service.ts` |
| Lectura + aplicación en el cierre | `CerrarEmbarqueUseCase` (`resolverCambiosDelCierre`) |
| Señales | `senales-cierre.service.ts` |
| Columna `Sustitucion.clienteId` (aditiva, idempotente) | `prisma/migrations/20261025_sustitucion_cliente/` |
| Endpoint | `POST /api/embarques/[id]/sustituciones` (`clienteId`, motivo obligatorio sin pedido) |
| UI | `cerrar-client/cambios-registrados.tsx`, `sustitucion-form-modal.tsx` |
| Pruebas | `cierre-cambios-sustituciones.test.ts` (Postgres real), `cambios-sustituciones.service.test.ts`, `sustitucion-schema.test.ts`, `cambios-registrados.test.tsx`, `e2e/embarques-cierre-cambios.spec.ts` |

## Consecuencias

- La migración es solo aditiva: se aplica en producción **antes** del merge (AGENTS.md, paso 7).
- Sigue pendiente (#311): la disponibilidad en vivo no contempla las salidas de `Sustitucion`.
- La señal «pedido corregido a la baja» llega con la reducción comercial (#451).
