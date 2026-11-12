# Issue #795 · Plan técnico de implementación y verificación (JL completo)

Estado: INVESTIGACIÓN / DISEÑO DE CONTRATOS. **No implementado**. Rama: `feat/795-regalos-pedidos-ventas`.

## Decisiones confirmadas por PO (12 nov 2026)
- Tres entradas: Crear pedido, Venta rápida, Venta en ruta.
- No rediseñar las pantallas. Solo enlace contextual «+ Agregar pacas de regalo» que revela input de cantidad positiva por producto; oculto en pedidos sin regalo.
- 60 pacas cobradas × $2.300 = $138.000, 3 pacas regaladas, 63 unidades físicas. No prorratear el precio unitario.
- Para domicilio, comisión del repartidor por unidades efectivamente entregadas, incluidas las regaladas, con la tarifa existente; no devengar por pendientes.
- Autorización auditable en servidor para regalos según ADR-AUTORIZACION-REGALOS-001; no permitir que el repartidor se autorice unilateralmente.

## Estado técnico comprobado
- `src/components/pedido-form-unified/pedido-item-editor.tsx` es un componente reutilizado por `src/components/pedido-form-unified/index.tsx` y `src/components/pedido-workspace/index.tsx`.
- El contrato actual `PedidoUnifiedData.items` contiene `producto, cantidad, precioManual?`, sin campo de regalo.
- El editor calcula visualmente `cantidad * precio`; su input de precio manual no soporta la semántica de bonificación.
- El issue #795 documenta que `PedidoItem.precio` y `subtotal` son Decimal(10,2); el cociente periódico no es representable exactamente.
- **Pendiente comprobar** rutas de creación, preview, commit, persistencia, embarques, inventario, entregas y comisiones en main a SHA antes de modificar código.

## Tres ciclos obligatorios R1/R2 antes de código
1. R1: decisiones y UI existente; R2: rechazar prorrateo por decimales por falta de exactitud y trazabilidad.
2. R1: reutilización de editor y contrato de formulario; R2: distinguir cantidad cobrada y bonificada sin duplicar importes ni confundir producto con línea comercial.
3. R1: consumidores transversales y autorización; R2: exigir evidencia de cálculo de comisión sobre unidades entregadas y reversas antes de publicar cambios. **Pendiente completar inspección y refutación con código y pruebas**.

## Contrato objetivo, sujeto a validación contra modelo real
- Persistir por producto cantidad comercial cobrada, cantidad bonificada, precio comercial, valor cobrado y atribución de autorización; nunca inferir regalo de un precio cero sin motivo.
- Cantidad logística = cantidad cobrada + cantidad bonificada.
- Total monetario = suma de cantidad cobrada × precio efectivo, con dinero decimal exacto.
- Comisión por reparto = unidades físicas realmente entregadas × tarifa vigente, con reversión/ajuste auditable por devolución, anulación o entrega parcial.
- Separar autorización de creación: usuario operador puede solicitar regalo, solo rol habilitado puede aprobarlo, validado server-side.
- Los datos antiguos sin regalo se interpretan como regalo cero; migración aditiva y reversibilidad comprobadas.
- No introducir comisión en venta de mostrador sin reparto; verificar semántica real de venta en ruta.
- No introducir descuento general en este issue, salvo contratos mínimos necesarios para coexistir sin duplicidad.

## Mapa de escenarios ESC/XMOD
| ID | Evento | Esperado |
|---|---|---|
| ESC-01 | Pedido normal sin regalo | Interfaz, dinero y logística idénticos a main |
| ESC-02 | Pedido 60+3 | $138.000, 63 unidades, autorización auditable |
| ESC-03 | Venta rápida con regalo | Mismo contrato, sin alterar clasificación origen/canal |
| ESC-04 | Venta en ruta con regalo | Mismo contrato, autorización sin autoaprobación del repartidor |
| ESC-05 | Entrega parcial 60 de 63 | Comisión solo por unidades efectivamente entregadas, saldo físico 3 |
| ESC-06 | Devolución o anulación | Revertir inventario y comisión correspondiente sin doble conteo |
| ESC-07 | Reintento offline | Una sola venta, un solo regalo y un solo devengo |
| ESC-08 | Edición de pedido | No perder autorización ni cambiar retroactivamente cantidades entregadas |
| ESC-09 | Caja y fiados | $138.000 comercial, sin valor ficticio de regalo |
| ESC-10 | Factura y dashboard | Diferenciar unidades vendidas, bonificadas y entregadas |
| ESC-11 | Repartidores distintos | Atribuir comisión a quien entrega cada unidad real |
| ESC-12 | Roles no autorizados | Rechazo servidor y evento auditable |

## Plan de ejecución después de inspección
1. Contrato y esquema de datos aditivo con migración segura y pruebas.
2. Servicios de precio/autorización y proyección física/comercial; reuse y XMOD.
3. Adaptar formularios y el editor compartido mediante revelación progresiva mínima.
4. Adaptar preview, commit, persistencia, offline y reintentos.
5. Adaptar embarques, entregas parciales, inventario, comisiones y reversas.
6. Conciliar factura, fiados, caja, cierre y dashboard.
7. Unit, integración PostgreSQL, typecheck, lint, E2E Playwright por tres flujos y roles, QA navegador móvil/escritorio, comparación CI con main.
8. PR, review, CI y aprobación de merge independiente. Verificar postmerge.

## Gates pendientes
- Confirmar con código las tres rutas y sus adaptadores, el modelo de autorización y el cálculo de comisión.
- Maquetas finales móvil/escritorio y estados de error/carga: PO aprobó la **intención de UI mínima**, no un rediseño.
- Ninguna prueba ejecutada aún. No presentar esta documentación como implementación ni solicitar merge sin código y QA.
