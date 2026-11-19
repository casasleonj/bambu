# #795 · Regalos explícitos — implementación en curso

Base de desarrollo: `main` `1e1bf8e0` (18-11-2026). Rama `fix/795-regalos`.
Sincronización contra `main` posterior: pendiente de rebase y revalidación.
Estado: **dominio, persistencia, API y conexión inicial de UI implementados en la rama; QA integral pendiente**.
La migración de regalos se aplicó y repitió únicamente en PostgreSQL local aislado.
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

La evidencia de autorización del dominio **no concede permisos**. El servidor
comprueba ADMIN en creación/cambio de concesión y deriva actor/rol de la sesión.
Conservar la concesión previa no vuelve a autorizarla con el usuario que edita.
No se reutilizan permisos de crédito/precio. La persistencia incluye FK indexada,
constraints y campos aditivos con cero/null para registros anteriores.

La captura aprobada añade solamente cantidad. Si no se declara una razón adicional,
la evidencia dice literalmente «sin motivo adicional declarado»; no se inventa el
porqué ni se exige otro formulario. Un motivo explícito del comando se conserva.
Una cantidad nueva no hereda automáticamente la razón de una concesión anterior.

## Avance del 18-11 (posterior a la base de dominio)

- SQL `20261118_pedido_regalos` idempotente, timeout de lock 5 s, sin backfill
  inferido ni cambio de importes. Dos aplicaciones locales conservaron los hashes
  de datos anteriores de Pedido/PedidoItem/Factura/Pago. Lista SQL canónica de CI
  actualizada; esto no prueba permisos/esquema/locks productivos.
- Mapper y repositorio guardan cantidades y evidencia; actualizan la misma línea,
  conservando la autorización de precio independiente. DTO aditivo sin exponer la
  razón ni la identidad de autorización en el resumen general.
- Crear/preview/editar y adaptadores HTTP conservan el desglose. El servidor ignora
  autores, fechas y roles de autorización enviados por el cliente. Edición anterior
  sin campos nuevos preserva una concesión; no permite desaparecer su producto.
- Entrega explícita con ambas cantidades; exigible solo del componente con precio.
  Eventos físicos de vehículo: `ENTREGA` para lo comercial, `PROMOCION` para lo
  gratuito, con identidad común y claves distintas. Auditoría y lector físico
  reconocen el mismo hecho sin sumar dos veces el espejo.
- Comisiones de reparto, unidades del día, destacados y capacidad reconocen las
  gratuitas. Los campos legacy permanecen **comerciales**: no convertir 60 en 63
  donde otros consumidores todavía multiplican cantidad por precio.
- Reducir lo comercial no completa regalos pendientes. Corregir cantidades tras
  entregar solo regalos tampoco puede reescribir el cumplimiento histórico.
- El cuadre legado del embarque no captura el desglose: rechaza nuevas cantidades
  ambiguas en líneas con regalos y dirige a registrar la entrega desde Pedidos.
  Puede conciliar el hecho ya registrado con delta cero. Esta compatibilidad aún
  necesita QA de usuario y prueba completa del cierre con regalos.
- UI: enlace progresivo reutilizado en el editor de Hub/legacy; cantidad gratuita
  en borrador, preview, commit y edición. La oficina separa cantidades en parcial,
  valor comercial y base física; las vistas compactas/factura identifican regalos
  solo cuando existen. No se declara navegación real de esta implementación aún.


## Refutación adicional: viajes, flags y replanificación

- Caso descubierto: una parcial suelta el pedido del viaje. Usar su asignación
  o acumulado actuales al cerrar otro viaje puede perder o duplicar cantidades.
  Las capturas nuevas de pedidos con regalos guardan la misión declarada y el
  repartidor leído del servidor; el lector común conserva ese vínculo explícito.
- Modo anterior: no se convierte una misión histórica al modo vivo por añadir
  un regalo. La PROMOCION sale una vez y el cierre comercial usa los deltas
  atribuidos a esa misión, excluyendo el acumulado completo de ese pedido.
- Prueba real: 10 con precio + 1 gratuita en el primer viaje, luego 50 + 2 en el
  segundo. Cierres sin discrepancia; comisiones por 11 y 52, total 63. No vuelve
  a aparecer el mismo hecho como entrega «sin embarque» al soltarse el pedido.
- Una primera entrega solo gratuita mantiene el modo vivo después de apagar su
  flag, por su evento PROMOCION atribuido. Una captura sin desglose verificable
  exige conciliación: no adivina cantidades comerciales.
- Apagar la proyección de fiados no apaga la deduplicación de regalos. Se
  conserva el hecho con su clave/huella en EntregaExigible, sin introducir otra
  cola, ledger monetario ni importe a cobrar por la parte gratuita.
- Replanificar usa una proyección de lo pendiente (50 con precio + 2 gratuitas),
  sin cambiar cantidades originales ni la carga histórica del primer viaje.
  La proyección es idempotente; no descuenta otra vez al reutilizarla.
- Sin vehículo se conserva el modelo actual de inventario/estimación/cierre
  físico. No se inventa una misión ni un ledger adicional por pedido; la captura
  y las unidades del día distinguen las cantidades físicas del importe. Su
  conciliación en el recorrido completo de la app sigue pendiente de QA.

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

Evidencia adicional ejecutada (cada bloque corresponde al código de su momento;
no sumar como una sola suite final):

- 622 pruebas unitarias/contratos, 49 archivos: Pedidos, planificador, capacidad,
  comisiones y lista de migraciones; exit 0.
- 437 pruebas UI/validadores existentes, 44 archivos: exit 0 (con avisos `act`
  en fixtures existentes, no errores de aserción).
- 145 pruebas focalizadas, 10 archivos: captura de regalos, parcial y guardas de
  cierre, entre otras; exit 0. Nuevas ediciones posteriores se revalidarán.
- 77 pruebas PostgreSQL, 9 archivos: precisión, regalos, comisiones parciales,
  ledger vivo, reducción/stock, anulación y unidades por día; exit 0.
- Después, 9 pruebas PostgreSQL de creación/entrega: exit 0, incluidas reducción
  con regalo pendiente y anulación de venta pagada sin reembolso por regalos.
- 2 pruebas HTTP con PostgreSQL: creación mínima, editar, entregar parcial,
  procedencia de sesión y rechazo de rol falsificado; exit 0.
- Antes del rebase: 1060 pruebas, 100 archivos de las áreas afectadas, exit 0.
- Revisión posterior de misiones/regalos: 54 pruebas PostgreSQL, 4 archivos,
  exit 0; incluye 8 escenarios de regalo, 28 de entrega viva y los contratos
  existentes de comisión parcial y HTTP.
- TypeScript y ESLint pasaron antes del último ajuste de tipos/errores; la
  repetición y las comprobaciones post-rebase siguen pendientes.

Estos resultados aún no prueban el recorrido visual, offline real ni todos los
consumidores de la implementación final. Producción y merge siguen pendientes.

## Falta para resolver #795

1. Completar la revisión de productores/consumidores indirectos y el recorrido
   posterior: cierre de embarque, inventario por custodia, N2, correcciones y
   devoluciones. No declarar consistencia global solo por las pruebas locales.
2. Validar que los tres accesos reales (crear, venta rápida, venta en ruta),
   borradores/offline y parciales preservan el desglose, permisos y la clave del
   reintento; no hay campos/cantidades perdidos entre adaptadores.
3. QA móvil/escritorio, enlaces pedido/factura, casos de carga/error/reintento,
   CI y revisión independiente requeridas por el repositorio.
4. SQL concreto revisado y autorización específica antes de producción;
   compatibilidad previa al merge y verificación postmerge. No retirar las
   columnas al revertir código. Tras crear regalos no volver a una versión que
   ignore su desglose: restaurar una versión compatible y conciliar hechos,
   sin fabricar devoluciones ni reescribir cierres históricos.

Pendiente de producto fuera del ejemplo aprobado: pedidos compuestos únicamente
de regalos y ampliación de autorizadores. No introducir esas reglas sin fuente.

## Reconciliación del #783

Ya corregido en main por #832 (`8a4bd98b`), con alcance aprobado solo en Pedidos.
El #821 se retiró sin merge porque su versión global quedó superada. En build de
main `1e1bf8e0`, #828/#408 pasaron en escritorio/móvil y el QA autónomo pasó 4/4.
G9 tuvo un fallo inicial de sincronización en escritorio y pasó aislado después;
no hubo interceptación de avisos. No se afirma que esa intermitencia esté corregida.
