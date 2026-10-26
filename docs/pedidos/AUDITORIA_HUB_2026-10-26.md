# Auditoría del Hub de Pedidos — reportes de usuarios (2026-10-26)

Estado: **informe para aprobación del PO. No se implementó nada.** Método: lectura de código e historial git, consultas de solo lectura a producción, y una prueba de integración descartable contra Postgres real (escenarios de cobro y cierre). Lo no reproducido en navegador se marca como tal.

Contexto: el Hub (`NEXT_PUBLIC_PEDIDOS_V2`) está ON en producción desde 2026-10-26, con una ventana de observación de 3 días.

## Resumen

| # | Reporte | Resultado | Clasificación | Prioridad | Issue |
|---|---------|-----------|---------------|-----------|-------|
| 9 | Fallas al pagar fiados | Backend de abonos OK; el Hub no tiene entrada de cobro; el reparto FIFO puede caer en pedidos no entregados | Bug + regresión | P0 | #514, #515 |
| – | (nuevo) Cierre duplica cobros de pagar-fiado | Verificado con prueba de integración | Bug | P0 | #513 |
| 10 | Pagos mixtos | Existe al crear; falta en cobros posteriores | Bug / mejora | P1 | #498, #515 |
| 13 | Anulados con pago «Por confirmar» | Verdadero (ej. #469, #131 en producción) | Bug | P1 | #517 |
| 11 | Anulación sin motivo | Parcial: Anular pide motivo; Cancelar no | Bug | P1 | #517 |
| 12 | «Ver factura» no abre la factura | Verdadero: depende de la página cargada y del rol | Bug | P1 | #517 |
| 1 | Filtros avanzados desaparecieron | Verdadero: `hubMode` los oculta | Regresión | P1 | #515 |
| 3 | Pestaña Alertas desapareció | Verdadero | Regresión | P1 | #515 |
| 4 | Fiados desapareció | Verdadero | Regresión | P1 | #515 |
| 5 | Recurrentes inaccesibles | Verdadero (oculto con Hub) y el cron no está programado | Cambio intencional + deuda | P1 | #515 |
| 7 | Indicadores inconsistentes | Son globales junto a un filtro de fecha (15 / $567.000 vs 2 hoy) | UX / semántica | P1 | #516 |
| 8 | Ocultar anulados | No existe el filtro Activos/Todos/Anulados | Mejora | P1 | #516 |
| 2 | Filtro «Turno» confuso | Verdadero: no explica el rango | UX | P2 | #516 |
| 6 | Filtro por fecha y hora | Solo existe fecha (YYYY-MM-DD); factible ampliar | Mejora | P2 | #516 |

## Detalle por reporte

### 9 y 10 — Pagos de fiados y pagos mixtos
- **Previo / actual:** el flujo legado cobraba desde la pestaña Fiados. El Hub no tiene entrada de pago posterior, así que ASISTENTE no tiene camino.
- **Evidencia:** `POST /api/pedidos/pagar-fiado` y `/api/abonos` funcionan para abono parcial y varios días (prueba de integración). El reparto FIFO incluye pedidos `PENDIENTE` con saldo (6 en producción) y puede aplicarles el abono antes que a deuda ya entregada (escenario E6).
- **Causa raíz:** (a) paridad no completada antes de activar; (b) el reparto no distingue deuda exigible.
- **Solución propuesta:** cobro posterior en el Hub con varias líneas de pago y elección explícita del pedido; reparto solo sobre pedidos entregados.
- **Riesgos:** toca dinero; requiere pruebas que miren la base de datos, no solo HTTP.
- **Aceptación:** abono parcial, varios días y cancelación de deuda tras abonos dejan saldos correctos; verificador V1–V16 limpio.

### Nuevo (P0) — El cierre cuenta dos veces los cobros de fiado
- `pagar-fiado` crea un `Pago` y un `Abono` espejo; el cierre suma ambos (`cobroVentasHoy` por `createdAt` + `cobroCartera` por `fecha`). Verificado en la prueba de integración (K1).
- Producción tiene 0 `CierreDia`, así que aún no hay daño registrado: conviene corregirlo antes del primer cierre.

### 13 — Anulados con pagos «Por confirmar»
- `pedido-detalle.tsx` calcula `hayPorConfirmar` sin mirar si el pedido está anulado ni el flag. Ejemplos reales: #469 y #131.
- **Solución:** no mostrar ni ofrecer confirmar pagos de pedidos anulados; decidir qué pasa con los pagos `REPORTADO` existentes (decisión del PO).

### 11 — Anulación sin motivo
- Anular exige motivo (`AnularSchema`); Cancelar (`CancelarSchema`) no se pide en la interfaz. Corregir con motivo obligatorio y auditado.

### 12 — «Ver factura»
- El enlace va a `/facturas`, donde `openFactura` solo abre facturas ya cargadas en la página; la ruta es ADMIN/CONTADOR. Abrir por id y ocultar según el rol.

### 1, 3, 4, 5 — Paridad perdida (filtros, Alertas, Fiados, Recurrentes)
- `hubMode` en `pedidos-client/index.tsx` oculta lo que el blueprint y el plan #345 daban por conservado. Recurrentes se oculta en `nav-data.tsx` con el Hub y `vercel.json` solo programa `alertas-batch`.
- **Opciones para el PO:** (A) contener: `NEXT_PUBLIC_PEDIDOS_V2="false"` y redeploy según el runbook mientras se completa la paridad; (B) mantener el Hub y entregar la paridad por PRs pequeños.

### 7 y 8 — Indicadores y anulados
- Los focos son globales; mostrados junto al filtro de fecha parecen inconsistentes. Rotular como globales o hacerlos seguir los filtros. Añadir Activos / Todos / Anulados.

### 2 y 6 — «Turno» y hora
- Explicar el rango de «Turno» o renombrarlo; añadir hora a `buildDateRangeFilter` para Pedidos y Embarques.

## Plan priorizado (una fase = una rama = un PR; dinero primero)

1. #513 Cierre sin doble conteo.
2. #514 Reparto de pagar-fiado solo sobre deuda exigible.
3. #517 Anulados / Cancelar con motivo / Ver factura.
4. #515 Paridad del Hub: cobro posterior con pago mixto, Fiados, Alertas, búsqueda y filtros, Recurrentes.
5. #516 Indicadores, Activos/Todos/Anulados, «Turno», hora.

Cada PR con pruebas rojas antes del arreglo, E2E que mire la base de datos, y la migración (si hay) aplicada en producción antes del merge.

## Pendiente de decisión del PO
- ¿Contener el Hub (opción A) mientras se completa la paridad, o seguir con el Hub encendido (opción B)?
- ¿Qué hacer con los pagos `REPORTADO` de pedidos anulados ya existentes?
- Deferidos por esta auditoría: PR-C (pestaña «Hoy» de Nómina), #497, #498, #508.
