# #795 · Regalos explícitos — implementación en curso

Base: `main` `1e1bf8e0` (18-11-2026). Rama `fix/795-regalos`.
Estado: **base de dominio implementada; funcionalidad aún no habilitada**.
No hay migración de regalos aplicada ni escrituras de prueba en producción.

## Autoridad recuperada

- [Decisión de captura mínima](https://github.com/casasleonj/bambu/issues/795#issuecomment-6837993978): enlace por producto, conservar tarjetas; sin regalos el flujo ordinario no cambia.
- [Regla de importe y comisión](https://github.com/casasleonj/bambu/issues/795#issuecomment-6838445245): 60 con precio × 2300 + 3 gratuitas son 63 físicas y 138000 comerciales. El reparto comisiona las gratuitas efectivamente entregadas.
- [Tres entradas](https://github.com/casasleonj/bambu/issues/795#issuecomment-6838474349): Crear pedido, Venta rápida y Venta en ruta.
- ADR-AUTORIZACION-REGALOS-001 y ADR-PROMOCION-001: autorización auditable del servidor, el repartidor no se autoriza, salida física identificable exactamente una vez y sin cobro ficticio.
- Maqueta adicional de entrega parcial presentada con escritorio/móvil y confirmación/carga/error; PO respondió «Ok» en esta conversación. Se registran por separado unidades con precio y gratuitas, sin inferir qué se entregó primero.
- El PO autorizó continuar la investigación aquí ante el fallo de autenticación de Codex CLI. No se atribuye la investigación a una respuesta exitosa de ese CLI. Los originales privados del Contexto Maestro no están disponibles; no se reconstruyen.

## Contraste previo a código: R1/R2 × 3

1. **Contrato y precedentes.** Precio preciso (#801) ya resuelve el redondeo,
   pero no identifica regalos. Líneas repetidas del mismo producto chocan con
   identificación/edición/entrega actuales. Se contrastó separación comercial y
   física en documentación oficial de [Shopify](https://help.shopify.com/en/manual/discounts/discount-types/buy-x-get-y),
   [Odoo 19](https://www.odoo.com/documentation/19.0/applications/sales/sales/products_prices/loyalty_discount.html)
   y [ERPNext](https://docs.frappe.io/erpnext/user/manual/en/product-bundle), abiertas
   con HTTP 200 el 15-11. No se importan sus reglas de elegibilidad o fidelidad.
2. **Refutación transversal.** Hacer físicas todas las cantidades existentes
   obligaría a reinterpretar precios/deudas. Se conservan cantidades con precio
   y se añaden gratuitas; productores y consumidores físicos deben sumar ambas.
   No usar permiso de crédito/precio como autorización de regalo ni llamar a
   promociones además de descontar toda la entrega: duplicaría la salida.
3. **Parciales e históricos.** 10 con precio + 1 gratuita son 11 físicas y 23000;
   11 con precio serían 25300. La captura explícita evita esa ambigüedad.
   Completar lo facturable no completa el pedido si faltan regalos. Los datos
   anteriores conservan cero regalos; no se deducen de precios rebajados.
   Al retomar se contrastó el dominio actual con los cambios de main hasta
   `1e1bf8e0`, preservando fecha real de entrega y las correcciones posteriores.

## Implementado en esta base

`PedidoItem` admite, opcionalmente, cantidad gratuita pedida/entregada y evidencia
específica de autorización. Su precio/subtotales siguen usando solo cantidades
con precio. Expone cantidades físicas y pendientes de cada componente.

- Una entrega solo de regalos tiene valor comercial entregado cero.
- Validación de enteros, límites de columnas Int, cantidades pendientes y evidencia
  completa; copias defensivas de la fecha de autorización.
- Rechazar un exceso gratuito no aplica antes las unidades con precio.
- Corregir precio conserva desglose y evidencia del regalo.
- El camino legado de pedido hijo rechaza trasladar regalos pendientes; PR-1
  mantiene el cumplimiento en el pedido original.
- `Pedido.entregar` valida todas las líneas antes de aplicarlas, incluyendo
  deltas repetidos, y evalúa cumplimiento con cantidades físicas.

La evidencia de autorización del dominio **no concede permisos**. Aún falta la
comprobación de actor/rol y su persistencia en los casos de uso. Los callers
existentes no construyen regalos: esta base sola no habilita la función.

## Verificado

- `npx vitest run src/modules/pedidos/domain/entities/__tests__ --reporter=dot`:
  42 pruebas, 2 archivos, exit 0.
- `npx vitest run src/modules/pedidos --reporter=dot`: 434 pruebas, 35 archivos,
  exit 0, incluyendo los contratos existentes del módulo.
- `npx tsc --noEmit`: exit 0. ESLint de los archivos de dominio: exit 0.
- Casos nuevos: 60+3; parcial 10+1; solo regalo; cantidades inválidas; evidencia
  incompleta; mutación externa de fecha; exceso sin mutación parcial; corrección
  de precio; pedido hijo; redondeo existente 63×2190.47619; regalo pendiente tras
  completar lo facturable; rechazo de una segunda línea sin aplicar la primera.

Estos resultados no prueban todavía DB, API, stock, comisiones ni UI de regalos.

## Falta para resolver #795

1. Esquema aditivo, constraints y mapper/repositorio: guardar y recuperar
   desglose y autorización, con ceros compatibles en registros anteriores.
2. Validación de servidor y actor de sesión en preview/create/update/entrega;
   autorización específica según los ADR. Mantener ADMIN como autorizador según
   el endpoint existente; no ampliar otros permisos por analogía.
3. DTO, borradores y tres entradas; bloque parcial aprobado. Proteger clientes
   antiguos contra pérdida silenciosa del desglose al editar o entregar.
4. Inventario/capacidad/ledger, entrega directa/embarque y comisiones por evento:
   la cantidad física incluye regalos; nunca doble salida ni doble comisión.
5. Factura, exigible, FIFO, dashboard/cierre y operaciones de corrección,
   reducción, devolución/anulación: sin deuda o reembolso inventado y sin
   reescribir cierres históricos. Revisar cada consumidor legado por semántica.
6. Integración PostgreSQL, persistencia, permisos, concurrencia/reintentos/offline,
   E2E por entrada/rol, QA de escritorio/móvil, CI y revisión independiente.
7. SQL revisable y autorización específica antes de producción; compatibilidad
   previa al merge y verificación postmerge. El solo permiso de implementación
   no autoriza aplicar una migración productiva.

Pendiente de producto fuera del ejemplo aprobado: pedidos compuestos únicamente
de regalos y ampliación de autorizadores. No introducir esas reglas sin fuente.

## Reconciliación del #783

Ya corregido en main por #832 (`8a4bd98b`), con alcance aprobado solo en Pedidos.
El #821 se retiró sin merge porque su versión global quedó superada. En build de
main `1e1bf8e0`, #828/#408 pasaron en escritorio/móvil y el QA autónomo pasó 4/4.
G9 tuvo un fallo inicial de sincronización en escritorio y pasó aislado después;
no hubo interceptación de avisos. No se afirma que esa intermitencia esté corregida.
