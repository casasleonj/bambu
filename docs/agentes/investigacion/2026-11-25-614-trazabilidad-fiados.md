# #614 · Trazabilidad de fiados: quién creó, entregó y cobró · INVESTIGACIÓN (JL COMPLETO)

Estado: `INVESTIGADO · ESPERA_APROBACIÓN` (plan + maqueta). No hay código de producto. Base: rama `ccr-a29e4248-jxribc` sobre `8fb3a06`. Todo lo de abajo es **lectura de código**, no ejecución en navegador (NO VERIFICADO en UI).

## Limitaciones declaradas
- `codex` CLI no existe en este entorno: la investigación externa (R1/R2 vía ChatGPT, decisión #704) **no se ejecutó**. Las 3 iteraciones se hicieron internamente sobre código y decisiones del issue. Antes de R3 conviene correr `research-codex` sobre las preguntas P1–P3.
- Contexto Maestro no accesible: se usan solo las decisiones PO escritas en #614 (18/11 y 25/11) y #865.

## Hechos (código de main)
| ID | Hecho | Fuente |
|---|---|---|
| H1 | Fiados consume `GET /api/pedidos?scope=fiados` (todo, sin paginar), **no** la consulta Hub. Esa ruta devuelve `...p` + exigible + `corteOperativo` + factura; **no** emite `responsablesEntrega` ni cantidades por evento. | `api/pedidos/route.ts:117-240`, `pedidos-client/index.tsx:483` |
| H2 | `fiados-table.tsx` agrupa por cliente (`filasFiados`) y el detalle por pedido muestra número, fecha, importes y enlaces; nada de actores. Total/clientes/pedidos = `resumenFiados(filtrados)`. | `fiados-table.tsx:44-60,84,147` |
| H3 | El lector de hechos de entrega `leerEntregasConsulta` ya entrega `{fecha, repartidorId, cantidades[], fuente, incompleto, precisionDia}` por evento (auditoría v1, movimientos de embarque, histórico). `cantidades:null`/`incompleto` = sin detalle. `embarque` NO prueba quién entregó. | `entregas-consulta.ts:8-31,100-330` |
| H4 | La consulta Hub ya arma `responsablesEntrega` (ids→nombre, «Responsable histórico» si falta) y `entregasSinDetalle`, y `creadoPor`/`createdAt`. | `pedidos-consulta.repository.ts:1076-1090`, `consulta-datos.ts:146-175` |
| H5 | Campos de autor existentes: `Pedido.createdById` (User), `Pedido.entregadoPorId` (Trabajador), `Pago.recibidoPorId` (Trabajador), auditoría `Historial`. **No existe campo «autorizó el fiado»** (solo `PedidoItem.autorizadoPorId` para precio, que es otra cosa). | `schema.prisma:991,1055,1290` |
| H6 | Conversión actual en `fiados-table.tsx:101-110` crea `POST /api/deudas` con el **total del cliente** (`row.deuda`) sin pedido ni responsable verificado: es lo que #865 debe reemplazar. #614 no debe tocar esa lógica. | `fiados-table.tsx:101` |

## Brechas / decisiones
- **B1 (autorizador del fiado):** no hay dato. Decisión propuesta: mostrar «Autorización: sin registro» (declarado desconocido) hasta que exista un hecho; no usar `createdBy` como sustituto. Registrar issue aparte si el PO quiere capturarlo desde ahora. PENDIENTE-PO.
- **B2 (autor de pagos):** `Pago.recibidoPorId` apunta a `Trabajador`, `createdById` a `User`. Hay que listar pagos por pedido con fecha, importe, método y `recibidoPor`; pagos sin autor → «Sin registrar». Verificar en R3 si existe un pago FIFO por cliente que se reparte entre pedidos (ver P2).
- **B3 (venta en punto):** quien entrega en mostrador es administrativo; `entregadoPorId`/auditoría `ENTREGA_OFICINA` lo traen según H3, pero hay que probar con datos reales que el id es el de quien entregó y no el de quien registró (P1).

## Escenarios (ESC-2, resumen en lenguaje de trabajo)
| ID | Situación | Qué debe ocurrir / qué no | Certeza |
|---|---|---|---|
| E1 | Pedido #684 a domicilio, entregó Pedro, lo creó Lilia, cobró Ana | Detalle muestra cuatro filas separadas con persona y hora; no se atribuye todo a un usuario | CONFIRMADO (issue) |
| E2 | Venta en punto entregada por Lilia | «Entregó Lilia», sin ruta ni repartidor inventado | CONFIRMADO (25/11) |
| E3 | Entrega parcial en dos días por dos personas | Una línea por evento: fecha real, cantidades por producto, persona | CONFIRMADO |
| E4 | Pedido legado sin cantidades/autor | «Entrega registrada · detalle sin registrar»; nunca cantidades inventadas | CONFIRMADO |
| E5 | Filtro «Entregado por: Pedro» con pedidos A $30.000, B $20.000, A $40.000 (hipotético del issue) | Pedro → 1 cliente · 2 pedidos · $70.000; Todos → 1 · 3 · $90.000 | CONFIRMADO |
| E6 | Pedido entregado por Pedro y Ana | Aparece en ambos filtros una sola vez; rótulo «saldo del pedido, compartido»; no sumar filtros | CONFIRMADO |
| E7 | Repartidor inactivo / sin identificar | Aparece por nombre (id) y opción «Sin identificar» | CONFIRMADO |
| E8 | Cobro de un pago por persona distinta a quien entregó | Dos nombres distintos en la línea de tiempo | CONFIRMADO |
| E9 | Tras cobro, reversión o traslado #865 | Saldo/totales se recalculan; el filtro se conserva; #865 es dueño de la mutación | CONFIRMADO |
| E10 | Botón «Convertir» con filtro activo | Abre el flujo de #865 para **un pedido** elegido; el filtro no convierte nada | CONFIRMADO |
| E11 | Rol sin permiso de cobrar | No ve «Convertir»/«Registrar pago»; no se expone deuda salarial | PROPUESTO (hereda `puedeCobrar`) |
| E12 | Falla la carga de actores (red/error) | La lista de pedidos sigue visible; bloque de actores muestra error con «Reintentar» | PROPUESTO |

## Diseño propuesto (convergencia: CONDICIONADA)
1. **Servidor (sin tocar dinero):** en `GET /api/pedidos?scope=fiados` añadir, por lote (no N+1), `eventosEntrega[]` (de `leerEntregasConsulta({ids})`: fecha, repartidorId→nombre por ID sin condición de activo, cantidades por producto, `sinDetalle`), `responsablesEntrega`, `creadoPor/createdAt`, `pagosResumen[]` (fecha, monto, método, `recibidoPor`). Reutilizar `construir…` de la consulta Hub extrayéndolo a helper compartido (REUSE) en vez de duplicar. El saldo sigue siendo `leerFiadosVigentes`/`exigible`.
2. **Cliente:** nuevo filtro «Entregado por» (identidad por ID) que filtra **pedidos antes de agrupar** (`filasFiados`), reusa `resumenFiados` para total/clientes/pedidos; detalle del pedido pasa a línea de tiempo + desglose físico por producto. Parámetro de URL `fiadosEntrego` con `useParametroConsulta`.
3. **Convertir:** solo enlaza al contrato de #865 con el pedido concreto; mientras #865 no exista, no cambiar el botón actual (dependencia).
4. Cantidad física entregada ≠ unidades impagas: se rotula «entregado en el pedido» y el saldo exigible aparte; sin prorrateo.

## Refutación (adversariales abordados)
- *Agrupar antes de filtrar:* da deuda de A trasladada a B → el filtro corre antes de agrupar (E5).
- *Sumar totales por persona:* solapan por pedidos compartidos → no se muestra suma de personas (E6).
- *Inferir autor desde ruta/embarque:* H3 lo prohíbe → solo hechos con `repartidorId`.
- *Nombres homónimos:* filtro por ID.
- *Polling/carrera:* el filtro vive en la URL y sobrevive al refetch.
- *Rendimiento:* `scope=fiados` ya es `all:true`; un lote de `leerEntregasConsulta({ids})` + una consulta de pagos con `in`; medir en R3.

## Preguntas abiertas para el PO (decisiones materiales)
- **Q1:** ¿«Autorizó el fiado» se muestra hoy como «sin registro», o se pide capturarlo desde ahora (otro issue, cambia el flujo de crear fiado)? Recomendado: mostrar «sin registro» y abrir issue aparte.
- **Q2:** ¿La línea de tiempo vive en el detalle expandido de Fiados (propuesto) y también en el detalle Pedido/Factura? Recomendado: primero Fiados, y reutilizar el mismo componente en Pedido/Factura en una segunda fase.
- **P1–P3 (técnicas, a resolver en R3):** P1 id de «entregó» en venta en punto; P2 pagos FIFO por cliente vs. por pedido; P3 rendimiento.

## Fases propuestas (una fase = una rama = un PR)
F1 backend de lectura (campos + helper compartido + pruebas con Postgres); F2 UI línea de tiempo + desglose; F3 filtro «Entregado por» + totales; F4 integración con Convertir tras #865. UI solo tras aprobar la maqueta `docs/agentes/maquetas/614-fiados-trazabilidad/index.html`.

## Cierre del modo
`INVESTIGADO` · `ESPERA_APROBACIÓN` (plan y maqueta de escritorio y móvil, con estados). Nada implementado, nada probado en navegador, sin PR.
