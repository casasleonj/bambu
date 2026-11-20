# #795 · Regalos explícitos — implementación en curso

Base original: `main` `1e1bf8e0` (18-11-2026). Rama `fix/795-regalos`.
Rebase del 19-11 completado sobre `main` `7636480e`; conservados programación
de entrega y presentación responsive de facturas. Commits posteriores al rebase:
`77b003b4` (dominio) y `910e82bd` (persistencia y flujos).
Estado: **implementado y validado localmente; QA del Hub y de la interfaz anterior ejecutados; CI, revisión y liberación pendientes**.
La migración de regalos se aplicó y repitió únicamente en PostgreSQL local aislado.
No hay migración de regalos aplicada ni escrituras de prueba en producción.

## Reanudación del 20-11

Rebase adicional sobre `main` `608478be`: preservados los cambios recientes de
Fiados, filtros por barrio, comprador precargado y protección de previews por
revisión. El cuerpo de preview ahora se construye en `preview-request.ts`; allí
se conserva el regalo, de modo que una respuesta anterior no habilite confirmar
una cantidad nueva. Se probaron la identidad del comprador/destino y la respuesta
atrasada después de cambiar de 3 a 4 gratuitas.

Después del rebase: 300 pruebas / 28 archivos de los cruces, 47 pruebas focalizadas
(reductor/preview), 37 PostgreSQL de regalos y comisiones, y 6 PostgreSQL de
asignación individual/en bloque pasaron, exit 0. Son lotes solapados y momentos
distintos; no sumar como una única suite. Typecheck y ESLint del diff: exit 0.
Sobre el candidato `6c45fd7f`, la suite amplia pasó **1735/1735 en 178 archivos**;
la compilación Hub terminó exit 0. La suite de navegador actualizada está en curso,
incluyendo la entrega/cobro real del repartidor; todavía no se declara aprobada.
El reinicio del entorno eliminó los builds temporales; las capturas y resultados
del 19-11 se conservan como evidencia histórica, no como prueba del nuevo main.

La asignación en bloque reutiliza cantidades físicas pendientes y no vuelve a
sumar una selección ya asignada a esa misión. Consultas de embarques conservan
los componentes gratuitos para los consumidores físicos; los registros reales
de carga y retorno siguen siendo su fuente propia, sin inferir otra custodia.

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
  Puede conciliar el hecho ya registrado con delta cero. Los dos viajes fueron
  verificados con PostgreSQL; la revisión visual sigue pendiente.
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

## Comprobaciones posteriores al rebase (19-11)

- PostgreSQL: 34 pruebas / 5 archivos y 61 pruebas / 6 archivos, exit 0.
  Son lotes independientes, con limpieza y seed en base local exclusiva.
- Nueva refutación de N2: tras 10 con precio + 1 gratuita, gestionar 50 con
  precio y entregarlas cierra esa obligación por 50, pero mantiene el pedido
  pendiente por 2 gratuitas. Entregarlas después no incrementa el exigible de
  138000. Archivo de regalos ampliado: 9 pruebas, exit 0.
- Suite amplia: 1640 aprobadas y 1 fallo estático por tamaño de archivo de
  cierre (482 frente al límite menor de 480). Compactado el orquestador sin
  cambiar lógica ni aserciones: 49 pruebas de cierre, exit 0. Repetición de
  la suite amplia en curso; no se presenta el primer lote como verde.
- TypeScript sin caché, `tsc --noEmit --incremental false`: exit 0.
  La primera preparación local del nuevo paquete PDF de main dejó una
  resolución de tipos incorrecta en caché; no requirió cambiar código PDF,
  package.json ni package-lock.json. ESLint de cambios posteriores: exit 0.
- Compilación y recorridos de navegador de regalos: en curso, todavía no
  acreditados. E2E añadido para tres entradas, permisos y sincronización.

Límite verificado del inventario: `getStockDisponible` sigue calculando una
estimación desde cierre anterior/estimado, producción y cargas/devoluciones
vehiculares. No es un ledger de ventas directas; no se le resta otra vez una
venta sobre un estimado cuyo momento de conteo no se conoce. En vehículo se
verificaron movimientos ENTREGA/PROMOCION y dos cierres sin discrepancia; sin
vehículo la evidencia está en Pedido, capturas de entrega y unidades del día.
No declarar probado un ledger global PROMOCION de ventas directas: no existe
esa custodia en el modelo actual. Esta limitación ya está en main y no se
resuelve inventando embarques para ventas de mostrador.

## Capturas directas y QA del Hub (19-11)

Las ventas con regalos que nacen entregadas guardan una captura `consultaEntrega`
en la auditoría transaccional ya existente: fecha del servidor, responsable cuando
está acreditado y cantidades comercial/gratuita/física. Su reintento conserva un
solo hecho y un solo pago. No depende de reconstruir ese desglose desde un precio
promedio ni de asignar una misión ficticia.

Después de este ajuste, 462 pruebas / 36 archivos unitarios y 34 PostgreSQL / 4
archivos pasaron. El archivo de creación ampliado pasó 5/5, incluyendo Venta en ruta
por 63 unidades de comisión, un solo pago y un hecho atribuido. El archivo de
entregas ampliado pasó 10/10, incluyendo N2 y retorno de 52 tras entregar 10+1.
La compilación Hub terminó con TypeScript, exit 0; la primera comprobación detectó
una referencia a un campo de fecha inexistente en el comando. Se corrigió para
usar el instante que ya genera el servidor; no se añadió otra fecha de negocio.

Playwright Hub: 20/20 (regalos, permisos, offline, precio preciso y regresiones de
sincronización), escritorio y móvil. Tras precisar la reapertura de enlaces de
un solo uso, el archivo nuevo pasó otra vez 10/10. Son lotes solapados.

QA exploratorio autónomo: Chromium real, formulario de login ADMIN, datos
sintéticos locales, escritorio 1280×800 y móvil 390×844. **6/6 recorridos**, sin
excepciones JavaScript: crear, error/reintento, plegar sin perder regalo, guardar,
reabrir después de recargar, parcial con exceso rechazado, factura y vuelta al
pedido. Prueba adicional de enlaces: **4/4** entre pedido y factura, validando el
número del documento que realmente se abrió. Capturas del editor, parcial y
factura inspeccionadas visualmente; no es QA humano ni producción.

Puente ejecutado en los seis recorridos, con el mismo día y contexto:

| Caso | Entregadas físicas, Dashboard y Cierre | Venta, Dashboard y Cierre | Efectivo recibido |
| --- | ---: | ---: | ---: |
| Parcial 10 con precio + 1 gratuita, sin cobro | 11 | 23000 | 0 |
| Venta rápida 60 con precio + 3 gratuitas, cobrada | 63 | 138000 | 138000 |
| Venta en ruta 60 con precio + 3 gratuitas, cobrada | 63 | 138000 | 138000 |

Preservación verificada en `main` `7636480e`: Venta en ruta solo se ofrece en el
Hub (`hubMode && ADMIN && gestión directa activa`). La primera matriz E2E de la
interfaz anterior asumía erróneamente ese acceso y falló al buscarlo. Se corrige
la matriz para probar sus dos entradas reales y una aserción negativa del acceso
de ruta; no se omite un test existente ni se habilita otra UI sin aprobación.

Los enlaces `openPedido` se consumen al abrir por diseño (#377). La comprobación
de persistencia recarga y vuelve a abrir el recurso, en vez de exigir que sobreviva
el estado del modal. La factura se identifica por «No. FAC-…», no por un nodo de
texto que contenga únicamente el número. Se ajustaron los guiones a esos contratos,
sin modificar navegación de producto.

## Contraste adicional: envío individual al embarque

Se encontró un consumidor que seguía usando una multiplicación local de las
cantidades comerciales: `POST /api/pedidos/[id]/enviar`. Se reutilizan
`pedidoParaCargaPendiente` y `calcularPesoEmbarque`, con items canónicos, tanto
para el pedido nuevo como para los compromisos de esa misión. No modifica
cantidades, precios, importes ni hechos de entrega anteriores.

La asignación individual toma `EMBARQUE_CARGA`, el mismo lock de la asignación
en bloque. Conserva el dedup por `envioOfflineId` y la guarda de fila para que
un pedido no se asigne a dos misiones.

Verificación posterior de este consumidor: **115/115 pruebas**, 5 archivos,
y **4/4 PostgreSQL** con handler real:

- 60 con precio + 3 gratuitas pesan 630 kg y no caben en capacidad de 620.
- Las gratuitas de pedidos ya asignados también ocupan capacidad.
- Después de 10+1, una nueva asignación considera 50+2: 520 kg.
- Dos operadores que intentan asignar 30 kg cada uno a 50 kg de capacidad
  consiguen una sola asignación; la otra se rechaza.

Se añadió también el recorrido E2E del REPARTIDOR: foto sintética, GPS simulado
y entrega/cobro desde su pantalla. Pendiente de ejecución sobre el build final;
ningún archivo se sube al Storage productivo durante la prueba local.

## Preparación de liberación

Consulta de metadatos de la base conectada, solo lectura (19-11): los cinco campos
de regalos todavía no existen. RLS de PedidoItem sigue activa y sin políticas de
acceso para los roles de Data API. No se ejecutó DDL/DML ni se modificaron permisos.
Estos metadatos no demuestran ausencia de locks en el momento futuro de aplicar.

SQL concreto: `prisma/migrations/20261118_pedido_regalos/migration.sql` (aditivo,
idempotente, timeout de espera de lock de 5 s). Debe aprobarse expresamente su
aplicación a producción antes del merge. Conserva los importes y el significado de
las cantidades antiguas. Verificar columnas, FK, índice, CHECK y acceso Prisma tras
aplicar; no retirar columnas para revertir código. La versión anterior de código
solo es compatible antes de empezar a guardar regalos; después se requiere una
versión que conserve el desglose, sin reescribir históricos.

## Validación de la interfaz anterior y cierre local

- Build con `NEXT_PUBLIC_PEDIDOS_V2=false`: exit 0, incluido TypeScript.
- Matriz corregida: 16/16 Playwright en escritorio/móvil (regalos, permisos,
  offline, precio preciso, error/reintento y preservación de accesos). Sin skips.
- QA autónomo: 4/4 recorridos de Crear pedido/Venta rápida; 0 excepciones JS;
  puente de unidades/venta/efectivo con Dashboard y Cierre correcto en los cuatro.
- Enlaces reales pedido → factura → pedido: 4/4 en esta interfaz también.
- Capturas del editor escritorio/móvil, factura y confirmación parcial inspeccionadas.
- Typecheck final `npm run typecheck`: exit 0. ESLint del diff: exit 0.
  YAML de CI cargado con el parser instalado `js-yaml` y comprobada la inclusión
  del nuevo spec en el job Hub: exit 0. Se corrigió el tipado contextual de un
  comando de prueba de Venta en ruta; no altera el comportamiento de producto.

El job Hub de CI incorpora el spec nuevo; la matriz general conserva su cobertura
legacy. Se mantienen los tests existentes y las verificaciones negativas de roles
sin permiso. Ningún fallo del fixture se convierte en un skip para conseguir verde.

## Falta para resolver #795

1. PR contra main actualizado, CI completo y revisión. Base actual verificada:
   `608478be2b22003b065dd6aac993d93bfb2e727e` (20-11). Comparar las firmas
   de cualquier fallo con el CI de ese main; el resultado del main anterior
   `7636480e` ([44455893970](https://github.com/casasleonj/bambu/actions/runs/44455893970))
   queda como evidencia histórica y no sustituye esa comparación.
2. Autorización específica del SQL productivo y comprobación de compatibilidad
   antes de mergear. No escribir pedidos, pagos ni cierres sintéticos en producción.
3. Merge autorizado y verificación posterior del SHA real. Las pruebas locales
   y el QA no equivalen a una liberación ni prueban una migración aún no ejecutada.

Pendiente de producto fuera del ejemplo aprobado: pedidos compuestos únicamente
de regalos y ampliación de autorizadores. No introducir esas reglas sin fuente.

## Reconciliación del #783

Ya corregido en main por #832 (`8a4bd98b`), con alcance aprobado solo en Pedidos.
El #821 se retiró sin merge porque su versión global quedó superada. En build de
main `1e1bf8e0`, #828/#408 pasaron en escritorio/móvil y el QA autónomo pasó 4/4.
G9 tuvo un fallo inicial de sincronización en escritorio y pasó aislado después;
no hubo interceptación de avisos. No se afirma que esa intermitencia esté corregida.
