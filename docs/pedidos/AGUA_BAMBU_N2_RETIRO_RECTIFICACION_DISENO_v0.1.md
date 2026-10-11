# N2 · Retiro en punto · Rectificación de canal — diseño v0.1 (BORRADOR PARA APROBACIÓN)

> **DOCUMENTACIÓN NO APROBADA — FUERA DEL ALCANCE DE PR-1.** Borrador para revisión independiente. No autoriza migraciones ni implementación; PR-1 no depende de este documento.

- **Estado:** borrador. **No hay migraciones escritas ni código** de nada de lo que sigue. Es la Ronda 2 de la Iteración 3 del incidente "Pedidos: edición / modalidad de entrega / cierre" (ver `INCIDENTE_CANAL_EDICION_EVIDENCIA_v1.md`).
- **Fecha:** 2026-10-10. **No reabre** ninguna decisión aprobada (`ADR-PEDIDO-ORIGEN-CANAL-001`, `ADR-OBLIGACION-001`, `ADR-ACTIVIDAD-001`, N2 ALS v2.0, `ADR-PAGO-EMBARQUE-CAPTURA-001`, `ADR-COMUNICACIONES-001`).
- **Alcance:** resolver las contradicciones de cardinalidad, modo, cantidades y autorización **antes** de escribir migraciones; definir retiro y rectificación sobre ese terreno ya consistente.

## 0. Lo que este documento NO afirma

- **Texto de los casos KC-001, KC-002, KC-032, KC-034, KC-047, KC-048 (3-sep-2026): NO LO TENGO.** Búsqueda en el repositorio (`grep -rIn "KC-0(01|02|32|34|47|48)"`, 0 coincidencias en archivos y en el historial `git log -S`) y en Drive (0 resultados relevantes). El §5 diseña el código de confirmación **a partir de la intención antifraude indicada** (que el operador no pueda autorizarse solo un retiro) y de las reglas que el propio repositorio ya fija. **Debe contrastarse línea a línea con el texto de los KC antes de implementarse**; cada punto del §5 que dependa de ese texto está marcado `[KC?]`.
- Los valores numéricos de vigencia e intentos del §5 son **parámetros de Config**, no constantes: no hay fuente para fijarlos (regla del repo: no dar números sin fuente). Se proponen defaults solo como punto de partida.

## 1. Hechos verificados (con evidencia)

| # | Hecho | Evidencia |
|---|---|---|
| F1 | `ObligacionPendiente.pedidoId` es **UNIQUE** en schema y en producción. Un pedido admite **una sola** obligación en toda su vida, aunque esté `CUMPLIDA`. | `schema.prisma:1389` (`@unique`); migración `20260817_plan_maestro_ledgers:265`; producción (Supabase, solo lectura, 2026-10-10): índice `ObligacionPendiente_pedidoId_key` UNIQUE + `ObligacionPendiente_pedidoId_idx` redundante. **Reproducido en PostgreSQL local:** una 2.ª obligación del mismo pedido (otro producto, o el mismo producto tras quedar la 1.ª `CUMPLIDA`) ⇒ `duplicate key … ObligacionPendiente_pedidoId_key` |
| F2 | El código **asume** una obligación **por producto**. | `GestionarPendienteUseCase.ts:99-101` (`findFirst { pedidoId, producto, estado:'ABIERTA' }` → `OBLIGACION_YA_ACTIVA`); `obligacion-guard.ts:106-108` (`Map` por producto sobre `findMany`) |
| F3 | Un lector asume una sola obligación por pedido: el peek `pendienteN2`. | `api/pedidos/[id]/route.ts:70-71` (`findUnique({ where:{ pedidoId } })`) |
| F4 | `Actividad.modo` es **nullable** en schema ("ventana de migración"). | `schema.prisma:1455` |
| F5 | `AsignarActividadUseCase` **crea Actividades sin `modo`**; `CambiarModoActividadUseCase` las rechaza después con `ACTIVIDAD_SIN_MODO`. | `AsignarActividadUseCase.ts:72-79`; `CambiarModoActividadUseCase.ts:69-71` |
| F6 | Producción hoy: **0** `ObligacionPendiente`, **0** `Actividad`. | Supabase, solo lectura, 2026-10-10 |
| F7 | `aplicarEntregaConObligacion` es **ciego al modo**: toda entrega que supere la zona ordinaria se acredita a las Actividades abiertas **en orden de creación**, sin mirar `modo`. | `obligacion-guard.ts` (distribución sobre `actividadesAbiertas`, sin filtro) |
| F8 | N2 **no define cómo se cumple** una Actividad `PUNTO`: "Caso C" solo la crea. No existe un caso de uso de cumplimiento. | `N2_ESPECIFICACION:203`; `use-cases/`, `api/actividades/[id]/` (solo `cambiar-modo`, `liberar`) |
| F9 | N2 nace formalmente de una entrega **parcial**, pero `GestionarPendiente` solo exige `remanente > 0`. | `N2_ESPECIFICACION:84-100` vs `GestionarPendienteUseCase.ts:90-92` |
| F10 | El planificador **solo lee `Pedido`** (`canal ∈ {DOMICILIO}`); las `Actividad` N2 no entran a su propuesta. | `elegibilidad.service.ts:21,31`; `PrismaPlanificadorRepository.ts:29,260` |
| F11 | Hoy el único camino de un pedido PUNTO pendiente a `ENTREGADO` es **asignarlo a un embarque** (`PENDIENTE → EN_RUTA → ENTREGADO`). | `EstadoEntrega.ts:17-18`; `pedidos-client/index.tsx:1250-1262,2400-2410` |
| F12 | El stock disponible = último cierre/estimado + producción − cargas de embarque + devoluciones. **No hay ledger por pedido**: ni la venta rápida ni un retiro descuentan. | `lib/stock.ts:80-150` |
| F13 | La caja del día suma `Pago` por `createdAt` (no por fecha del pedido). Un pago sin embarque es "mostrador". | `api/cierre/route.ts:259-276`; `ADR-PAGO-EMBARQUE-CAPTURA-001` |
| F14 | WhatsApp es **opcional, nunca fuente de verdad, nunca bloquea** el flujo. | `ADR-COMUNICACIONES-001` |
| F15 | Todo `repo.update` de Pedido hacía `deleteMany`+`create` de ítems y perdía `autorizadoPorAdmin/Id/En`. Hoy **ningún escritor** de la app fija esas columnas (latente). Corregido en PR-1. | `PrismaPedidoRepository.update`; `grep autorizadoPorAdmin` (solo lecturas) |

## 2. Contradicciones y resolución propuesta

### C1 — Cardinalidad de la obligación (F1, F2, F3)

El índice único impide lo que el caso de uso permite (dos productos del mismo pedido) y, peor, impide una **segunda** gestión del mismo producto una vez cumplida o liberada la primera.

**Propuesta D-N2-1:** una obligación **ABIERTA por (pedido, producto)**:

1. Quitar `@unique` de `pedidoId`; conservar el índice no único.
2. Agregar índice único **parcial** `(pedidoId, producto) WHERE estado = 'ABIERTA'` (lo que `GestionarPendiente` ya valida a nivel de aplicación, ahora garantizado por la base).
3. El peek (`route.ts:71`) pasa de `findUnique` a `findMany` y `pendienteN2` a una lista (compat: el primer elemento sigue siendo el shape actual).
4. Migración idempotente (`IF EXISTS`/`IF NOT EXISTS`), SQL aplicado a mano en prod (Known Issues #12). **Datos: 0 filas (F6) → sin backfill.** Un test de integración reproduce el defecto actual (2.ª obligación del mismo pedido ⇒ violación de unicidad) y prueba el nuevo comportamiento.

Alternativa descartada: colapsar a una obligación por pedido con varias líneas — contradice `ObligacionPendiente.producto`/`cantidadOriginal` (una cantidad, un producto) y todo el guard.

### C2 — `Actividad.modo` (F4, F5)

**Propuesta D-N2-2:** `modo` obligatorio **y** coherente con `embarqueId`:

- Una Actividad con `embarqueId` es logística ⇒ `modo = DOMICILIO`. Una Actividad `PUNTO` no tiene embarque.
- `AsignarActividadUseCase` fija el modo explícitamente (`DOMICILIO` al asignar a un embarque) y **rechaza** (`MODO_INCOMPATIBLE`) asignar a un embarque una obligación cuya gestión vigente es `PUNTO` (el operador debe cambiar el modo antes, con `cambiar-modo`, que ya audita y calcula el diferencial).
- Expand-contract en 2 pasos: (a) código que escribe siempre `modo` + test; (b) migración `SET NOT NULL` + `CHECK ((embarqueId IS NULL) OR (modo = 'DOMICILIO'))`. Producción tiene 0 Actividades (F6): el paso (b) no falla; igualmente la migración verifica `COUNT(*) WHERE modo IS NULL = 0` antes.

### C3 — Cantidades: el guard no distingue modo (F7, F8)

Tres libros de cantidad deben seguir reconciliados (invariantes I-4 e I-11 ya aprobados): `PedidoItem.cantEntrega` (**autoridad**), `ObligacionPendiente.{cantidadOriginal, cantidadCumplida, cantidadAsignada}` y `Actividad.{cantidad, cantidadCumplida}`.

**Propuesta D-N2-3 — zonas por modo.** Por producto, con `R = cantPedido − cantEntrega`:

| Zona | Tamaño | Modo vigente | Cumple |
|---|---|---|---|
| Ordinaria | `cantPedido − cantidadOriginal(obligación ABIERTA)` (o `cantPedido` si no hay obligación) | `Pedido.canal` | `PUNTO` → **retiro**; `DOMICILIO` → **logística** |
| Reservada (N2) | `cantidadOriginal − cantidadCumplida` | `Actividad.modo` de cada Actividad abierta | la vía que corresponda a **su** modo |

Reglas:

1. `aplicarEntregaConObligacion` recibe un parámetro `modos: ('PUNTO'|'DOMICILIO')[]` y solo reparte entre Actividades abiertas de esos modos. Retiro pasa `['PUNTO']`; entrega logística pasa `['DOMICILIO']`.
2. La zona ordinaria solo la puede consumir la vía que corresponde a `canal`. Un retiro **no puede** consumir unidades de una Actividad `DOMICILIO`, ni la entrega logística unidades de una Actividad `PUNTO`.
3. Si lo pedido excede lo que esa vía puede consumir: `409 RETIRO_EXCEDE_PUNTO` (o `ENTREGA_EXCEDE_DOMICILIO`) con el desglose por zona (ordinaria / PUNTO / DOMICILIO), sin escribir nada.
4. Compat: sin Actividad con modo explícito (C2 aplicado) no hay ambigüedad; el cambio es aditivo para los casos hoy existentes (0 filas en prod).
5. **Simetría pendiente de decisión:** aplicar `['DOMICILIO']` a la entrega logística cambia el comportamiento actual del guard (hoy ciego). Es correcto por la misma razón que (2), pero toca el cierre de embarque: va en su propio slice con pruebas de cierre.

### C4 — Un pedido PUNTO sin camino de cumplimiento (F8, F11)

Se cierra con la **operación de retiro** (§4), que es a la vez la puerta de cumplimiento de las Actividades `PUNTO` de N2 que hoy no existe.

### C5 — `Enviar` de un pedido PUNTO (F11)

Hoy es el "atajo" operativo (crea un embarque solo para poder cerrar). **Decisión D-N2-4:** una vez exista el retiro, `enviar` de un pedido cuyo modo vigente es `PUNTO` responde `409 PEDIDO_DE_RETIRO` con el camino correcto, salvo excepción **ADMIN con motivo auditado**. Hasta entonces no se bloquea (quitaría el único camino).

### C6 — `Pedido` totalmente pendiente y N2 (F9)

El caso "la venta era Punto y ahora el cliente pide domicilio" es **cambio operativo**: corresponde a N2 (`gestionar-pendiente` con `modoDestino=DOMICILIO`, diferencial y auditoría ya aprobados), no a la rectificación. El código lo permite con `cantEntrega = 0`; el spec lo describe desde entrega parcial. **Decisión D-N2-5:** declarar en el ADR que N2 aplica a todo remanente (incluido el total) — y verificarlo con un test de integración antes de documentarlo. Sin esa declaración, ese cambio operativo no tiene hogar aprobado.

## 3. Elegibilidad operativa: una sola autoridad

Función de dominio `modoVigente(item, obligacionAbierta?, actividades[])` + dos predicados/constructores Prisma que **todos** comparten: `retiroPendiente` y `logisticaPendiente`.

- `retiroPendiente`: `PENDIENTE`, sin `embarqueId`, con remanente en modo `PUNTO`.
- `logisticaPendiente`: `PENDIENTE|NO_ENTREGADO`, con remanente en modo `DOMICILIO` **sin asignación** (`Pedido.embarqueId` nulo **y** sin `Actividad.embarqueId` activa).
- Consumidores a alinear (hoy cada uno mira `canal`/nada): `derive-operacion.ts:45,74,100`, `counts/route.ts:79`, `pedidos-sin-asignar.ts:44`, `elegibilidad.service.ts:31`, acción destacada del Hub.
- Un pedido puede estar a la vez en retiro y logística (modos mixtos por producto): aparece en **ambos** focos, con la cantidad de cada uno.
- Una venta `PUNTO` con Actividad `DOMICILIO` aprobada **no desaparece**: cuenta en `logisticaPendiente`. Que el planificador la proponga automáticamente (F10) es la decisión D-N2-6 (brecha preexistente).

## 4. Operación de retiro

`POST /api/pedidos/[id]/retiro` — `ADMIN` y `ASISTENTE` (propuesta; `REPARTIDOR` no). No cambia la máquina de estados global: se agrega un método de dominio `retirar()` que es la **única** vía `PENDIENTE → ENTREGADO` sin embarque.

**Precondiciones (todas en servidor, bajo el lock `PEDIDO:{id}`):**
estado `PENDIENTE`; sin `embarqueId` (si lo tiene ⇒ `409 RETIRO_CON_EMBARQUE`, primero se libera la asignación logística — no se crea ni se usa un embarque ficticio); modo vigente `PUNTO` para lo que se retira (C3); código de confirmación válido o excepción ADMIN (§5).

**Entrada:** `items[{producto, cantidad}]` (lo **realmente** retirado), `receptor{nombre, relacion, documento?}`, `pagos[]` opcional, `codigo`, `offlineId`.

**Efecto, en una transacción:**
1. Suma a `cantEntrega` (clamp al remanente, acumulativo; retiro parcial conserva el mismo pedido y su pendiente).
2. `aplicarEntregaConObligacion(..., modos:['PUNTO'])` (I-11 intacto).
3. `ENTREGADO` solo si el total queda cubierto; `estadoPago` por `EstadoPagoVO.proyectar`.
4. Pagos: misma lógica de confirmación que la entrega, **`Pago.embarqueId = null`** (mostrador; `ADR-PAGO-EMBARQUE-CAPTURA-001`) y factura recalculada.
5. Fila append-only `PedidoRetiro` (+ `PedidoRetiroItem`, 1FN): `pedidoId`, `operadorId`, `receptor*`, `fecha`, `codigoId?`, `excepcionMotivo?`, `offlineId @unique`. `logAudit`.

**Concurrencia:** lock `PEDIDO:{id}` (mismo que entrega, edición y ajuste) + `OBLIGACION:{id}` dentro del guard. Dos retiros simultáneos del mismo remanente: el segundo ve el `cantEntrega` actualizado y se clampa o falla con `RETIRO_EXCEDE_PUNTO`. Retiro vs entrega de embarque: ambos toman `PEDIDO:{id}`; con C3 no pueden consumir la misma zona. `offlineId` único ⇒ replay idempotente (`deduped:true`).

**Inventario (F12):** hoy no hay ledger por pedido; una venta en punto no descuenta stock y el cierre del día concilia por conteo (`stockFin*`). El retiro **no introduce** un descuento (coherente con `VENTA_RAPIDA`). Si el negocio quiere que el retiro descuente, es una decisión de inventario (D-N2-7), no de esta operación.

**Caja (F13):** el `Pago` del retiro cuenta en el cierre del día de su `createdAt`, sin embarque. Un pedido pagado por anticipado (`ANTICIPADO`) no genera pago nuevo: el retiro solo cumple cantidades.

## 5. Código de confirmación de retiro `[KC?]`

**Intención antifraude que se recupera:** quien registra un retiro **no debe poder autorizárselo solo**; la entrega de mercancía en mostrador debe quedar atada a algo que posee quien la recibe.

| Aspecto | Propuesta | `[KC?]` |
|---|---|---|
| **Generación** | Servidor, CSPRNG, al registrar la venta/pedido de retiro (o a pedido de un ADMIN). Se guarda **solo el hash** (HMAC-SHA-256 con secreto de entorno) en `RetiroCodigo{pedidoId, hash, estado, expiraAt, intentos, creadoPorId}`; el valor en claro se muestra una sola vez. Nunca en `Historial`/logs. | formato y longitud |
| **Entrega al cliente** | En el comprobante entregado al cliente al vender/cobrar (no depende de ningún canal externo). WhatsApp, si existe, es un **extra opcional**: `ADR-COMUNICACIONES-001` prohíbe que un control de negocio dependa de él (F14). | canal oficial |
| **Validación** | Servidor, comparación en tiempo constante, dentro del lock del pedido. El operador teclea lo que el cliente le dicta; la UI nunca lo recibe de vuelta. | — |
| **Vigencia** | `Config` (`retiroCodigoVigenciaHoras`), vence también al quedar el pedido cerrado/cancelado/anulado/rectificado. **Valor por defecto: pendiente de negocio** (sin fuente). | plazo |
| **Reutilización** | **Un solo uso por evento de retiro.** Un retiro parcial consume el código y emite uno nuevo para el pendiente. Un código usado, vencido o revocado responde `409 CODIGO_NO_VIGENTE` sin revelar cuál. | parcial vs total |
| **Fuerza bruta** | `Config` (`retiroCodigoMaxIntentos`); al agotarlos el código se revoca y se exige regenerarlo (ADMIN). Cada intento fallido se audita (actor, pedido, sin el valor). | tope |
| **Terceros** | Siempre se registra el **receptor** (nombre, relación, documento opcional), sea o no el cliente: el código es portador, el registro es la trazabilidad. | si el KC exige identificación |
| **Sin código** | Solo `ADMIN`, con motivo obligatorio, auditado (`excepcionMotivo`) (candidato a regla del verificador de integridad, `src/lib/integridad/`); `ASISTENTE` nunca lo omite. | — |

## 6. Rectificación de un error de captura (excepción formal al canal inmutable)

Es **distinta** del cambio operativo (C6): aquí el pedido **siempre fue** del otro canal; se registró mal.

- **Autoridad:** un addendum aprobado a `ADR-PEDIDO-ORIGEN-CANAL-001` ("excepción formal: rectificación de error de captura"). Sin él, `canal` sigue inmutable por todas las vías (PUT lo rechaza — PR-1).
- **Quién:** `ADMIN`, motivo obligatorio, `offlineId` único.
- **Hechos verificables que la permiten** (no "sin factura"): `PENDIENTE`, `cantEntrega = 0` en todas las líneas, sin `embarqueId`, sin `ObligacionPendiente`/`Actividad`, sin disputa abierta, y —si el destino es `DOMICILIO`— `resolverEntrega` suficiente (la dirección puede darse en la misma operación). **La factura interna y los pagos confirmados no bloquean** (Agua Bambú no usa facturación electrónica DIAN): no se modifican ni se borran; el historial se conserva.
- **Dos pasos obligatorios:**
  1. `POST …/rectificar-canal/preview` (solo lectura): líneas actuales, líneas recalculadas con la lista de precios vigente y el recargo de domicilio de `Producto`, diferencia por línea y total, efecto en saldo/`estadoPago`/factura/pagos, y los motivos de bloqueo si los hay. **Muestra el fundamento** (qué precio base, tier y recargo se aplicó y de qué fecha es la lista).
  2. `POST …/rectificar-canal`: revalida todo bajo el lock con datos frescos (nunca confía en el preview), y escribe.
- **Diferencia monetaria — sin política inventada (D-R1):** si `Δ = 0` se rectifica sin tocar importes. Si `Δ ≠ 0`, **el commit se rechaza** (`409 DIFERENCIA_REQUIERE_DECISION`) mostrando el impacto, hasta que el PO apruebe qué se hace (cobrar, absorber, devolver). Esto no es por la factura: es porque absorber o cobrar es una decisión comercial que nadie ha tomado.
- **Registro `PedidoRectificacion` (append-only):** `pedidoId`, `campo='canal'`, `valorAnterior`, `valorCorrecto`, `motivo`, `actorId`, `snapshotAntes/Despues` (líneas, total, saldo, estadoPago, factura), `diferencial`, `offlineId @unique`, `createdAt`. Más `logAudit`.
- **Efectos secundarios a cubrir:** `tipo` derivado, espejo legacy `c*Ped`/`precio*` (depende de `canal`), productos no válidos para el canal destino (bloqueo), realtime, y los consumidores de elegibilidad (§3).
- **Prueba de no-regresión del ADR:** un test enumera todas las rutas de escritura de `Pedido.canal` y exige que la única sea esta.

## 7. Pedido #331 (solo lectura; nada se modificó)

Hechos: PUNTO/PEDIDO, `PENDIENTE`, `ANTICIPADO`, 2 × BOTELLON a $7.500 (`precioOrigen=volumen`) = $15.000; `Pago` EFECTIVO $15.000 `CONFIRMADO` sin embarque; factura FAC-00335 `PAGADA`; la clienta no tiene dirección, coordenadas, link ni negocios ni precios especiales; sin `CierreDia` desde el 08-oct; sin cambios en `PrecioHistorial` desde el 09-oct.

Impacto **si** hubiera sido un domicilio desde el principio (aritmética con la lista de hoy, sin aplicar nada): `7.500 + 2.500 (sobreCostoDomicilio, aplicaDomicilio=true) = 10.000` por unidad ⇒ total `20.000` ⇒ **Δ = +5.000**. Por D-R1 esa diferencia **no se puede aplicar** hasta que haya política.

Protocolo (sin tocar el pedido, sin embarque, sin tocar pagos): 1) preguntar al personal cómo debía entregarse; 2) retiro real ⇒ operación de retiro (§4); domicilio registrado mal ⇒ rectificación (§6; falta además la dirección de la clienta y la política D-R1); el cliente cambió de idea después ⇒ N2 (C6, y también necesita dirección).

## 8. Plan de migraciones (no escritas)

| Orden | Slice | Migración | Riesgo |
|---|---|---|---|
| M1 | C1 cardinalidad | `DROP INDEX ObligacionPendiente_pedidoId_key`; `CREATE UNIQUE INDEX … (pedidoId, producto) WHERE estado='ABIERTA'` | 0 filas en prod; idempotente |
| M2a | C2 código | ninguna | — |
| M2b | C2 NOT NULL + CHECK | `ALTER … SET NOT NULL`, `CHECK` | verificación previa `COUNT(modo IS NULL)=0` |
| M3 | C3 guard por modo | ninguna | toca el cierre ⇒ slice propio con pruebas de cierre |
| M4 | Retiro | `PedidoRetiro`, `PedidoRetiroItem`, `RetiroCodigo` + `GRANT app_write` | tablas nuevas |
| M5 | Rectificación | `PedidoRectificacion` + `GRANT` | tabla nueva; requiere ADR |

## 9. Decisiones que necesito aprobadas

| ID | Decisión | Recomendación |
|---|---|---|
| D-N2-1 | Obligación abierta por (pedido, producto); quitar el único por pedido | Sí |
| D-N2-2 | `modo` NOT NULL + `embarqueId ⇒ DOMICILIO` | Sí |
| D-N2-3 | Guard por modo (retiro solo PUNTO; logística solo DOMICILIO) | Sí, en slices separados |
| D-N2-4 | `enviar` de pedido PUNTO bloqueado tras existir el retiro (excepción ADMIN) | Sí |
| D-N2-5 | N2 aplica a todo remanente, incluido el total | Sí (tras test) |
| D-N2-6 | ¿El planificador propone Actividades N2 `DOMICILIO`? | Decisión de producto |
| D-N2-7 | ¿El retiro descuenta stock? | Decisión de inventario |
| D-R1 | Política para `Δ ≠ 0` en rectificación | Decisión comercial del PO |
| KC | Contraste del §5 con el texto de los KC | Necesario antes de M4 |
