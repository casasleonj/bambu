# Incidente "Pedidos: edición / modalidad de entrega / cierre" — ledger de evidencia y aprobaciones

> **DOCUMENTACIÓN NO APROBADA — FUERA DEL ALCANCE DE PR-1.** Borrador para revisión independiente. No autoriza migraciones ni implementación; PR-1 no depende de este documento.

Registro por etapa del Protocolo de Investigación (`.opencode/prompts/protocolo.txt`). Su propósito es que cada ciclo tenga **evidencia propia y aprobación propia**; una tabla resumen no acredita un ciclo.

**Estado honesto del protocolo (2026-10-10):** el protocolo exige 3 iteraciones R1→R2→R3, con aprobación tras cada R2. Hasta hoy hubo **dos presentaciones de R2** (con aprobación parcial cada una) y **un R3 parcial** (PR-1). La **Iteración 3** se completa solo cuando el equipo apruebe la entrega de esta fecha (PR-1 + diseño N2/retiro) y se verifique en navegador, PostgreSQL y producción tras el merge. **El incidente NO está cerrado.**

## Iteración 1 — Diagnóstico

**R1 · Descubrimiento (solo lectura).**
- Código: `pedidos-client/index.tsx` (`handlePedidoSubmit`, `cambiarEstado`, `handleHubAccion`), `api/pedidos/[id]/route.ts` (PUT), `ActualizarPedidoUseCase`, `CrearPedidoUseCase`, `EstadoEntrega.ts`, `derive-operacion.ts`, `counts/route.ts`, `elegibilidad.service.ts`, `pedidos-sin-asignar.ts`, `EntregarPedidoUseCase`, `validators.ts`.
- Decisiones: `ADR-PEDIDO-ORIGEN-CANAL-001`, `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`, `ADR-PAGO-EMBARQUE-CAPTURA-001`, N2 ALS v2.0 y especificación funcional.
- Producción (Supabase, **solo lectura**): pedido #331 (pedido, ítems, pago, factura, historial), distribución de pedidos abiertos, domicilios anónimos sin dirección.
- Fuentes externas: Context7 `/colinhacks/zod` v4.3.6 (versión pineada) para `z.object`/`strictObject`/`looseObject`; búsqueda web sobre HTTP 422 (el texto normativo de RFC 9110 §9.3.4 **no se obtuvo → NO VERIFICADO**, no se usa como autoridad).
- **Salida:** hallazgos H1–H7 (bug / brecha / decisión).

**R2 · Plan presentado** (4 PR). **Respuesta del equipo:** *diagnóstico válido; plan no aprobado como paquete*; correcciones sobre PR-1 (contrato completo del PUT), PR-2 (retiro sin habilitar `PENDIENTE→ENTREGADO` global), elegibilidad (autoridad única, N2), PR-3 (dirección), PR-4 (rectificación sin la condición "sin factura"), #331 y protocolo.

## Iteración 2 — Plan corregido

**R1 · Descubrimiento ampliado (solo lectura).**
- Auditoría campo a campo del PUT (esquema, ruta, caso de uso, persistencia, auditoría) → ver §"Contrato PUT" abajo.
- N2: `Actividad.modo`, `CambiarModoActividadUseCase`, `GestionarPendienteUseCase`, `AsignarActividadUseCase`; búsqueda del "código de autorización de retiro" en `docs/`, `.opencode/`, `.claude/`, historial git y Drive → **sin coincidencias**.
- #331: factura FAC-00335 `PAGADA`, pago EFECTIVO `CONFIRMADO` sin embarque, `User.rol` de los autores (ambos ADMIN), `CierreDia` (ninguno desde el 08-oct).
- **Corrección de mi propia ronda anterior:** retiré la condición "sin factura" y la lectura "coherente con H1" sobre los 3 UPDATE (el historial no guarda diff; ver abajo).

**R2 · Plan corregido presentado. Respuesta del equipo (aprobación parcial):**
- Pueden continuar con **PR-1** y con la **corrección de suficiencia de domicilios** (siguiendo aprobaciones y pruebas del protocolo).
- **No** aprueban los cinco PR como paquete.
- Exigen: demostrar que cada campo persistente se conserva (incl. claves de idempotencia); prohibir cambios involuntarios de precios históricos; distinguir edición / ajuste de cantidades / modificación económica; resolver contradicciones de N2 (cardinalidad, modo) antes de construir la autoridad de elegibilidad; recuperar el código de confirmación de retiro (KC-001, 002, 032, 034, 047, 048); retiro sin consumir actividades de domicilio ni saltarse N2; rectificación con excepción formal, sin bloquear por factura interna (no hay DIAN) y sin inventar política de diferencias; #331 sin tocar.

## Iteración 3 — En curso

**R1 · Descubrimiento (solo lectura) de esta entrega.**
- `ObligacionPendiente.pedidoId` UNIQUE en schema (`schema.prisma:1389`), migración (`20260817…:265`) **y producción**; 0 obligaciones y 0 actividades en producción.
- `AsignarActividadUseCase` crea Actividades sin `modo` (`:72-79`).
- `aplicarEntregaConObligacion` ciego al modo.
- `cloneProps` omitía `entregaOfflineId`/`anulacionOfflineId`/`cancelacionOfflineId` y `repo.update` regeneraba los ítems perdiendo `autorizadoPor*`.
- Inventario (`lib/stock.ts`) sin ledger por pedido; caja por `Pago.createdAt`.
- `ADR-COMUNICACIONES-001`: un control de negocio no puede depender de WhatsApp.
- #331: lista de precios (BOTELLON base $7.500, recargo domicilio $2.500) y sin cambios en `PrecioHistorial` desde el 09-oct.

**R2 · Esta entrega** = PR-1 (código + pruebas) + `AGUA_BAMBU_N2_RETIRO_RECTIFICACION_DISENO_v0.1.md`. **Pendiente de aprobación del equipo.**

**R3 · Verificación.** PR-1: pruebas locales (abajo). **Pendiente:** CI del PR (incluida la comparación de línea base E2E del paso 5 del Flujo de Entrega), la verificación del PR en el despliegue de Vercel y la verificación en producción tras el merge (paso 8 del Flujo de Entrega). No se declara cerrado hasta entonces.

---

## Contrato PUT `/api/pedidos/[id]` — auditoría (código previo a PR-1)

| Campo | Esquema | Ruta | Caso de uso | Persistido | Auditado | Defecto |
|---|---|---|---|---|---|---|
| `estado` | sí | `estadoEntrega: estado` | sí | sí | genérico | — |
| `estadoEntrega` | sí | **no se reenvía** | — | no | no | 200 sin efecto |
| `embarqueId`, `cPaca*Ent`×6, `estadoPago`, `promesaPagoFecha` | sí | no | — | no | no | 200 sin efecto |
| `offlineId` | sí | no | — | no | no | aceptado, sin dedup |
| `obs` | sí | `obs \|\| undefined` | sí | sí | genérico | **`''`/`null` no pueden borrar** |
| `direccionEntrega`, `barrioEntrega`, `actualizarCliente` | sí | sí | **solo con `items`** | solo con `items` | genérico | sin `items`: 200 sin efecto |
| `items` | sí | sí | reemplazo completo | sí | genérico | re-precifica **todas** las líneas con la lista de hoy |
| `canal`/`tipo`/desconocidos | **no** | descartados por Zod | — | no | no | 200 sin efecto |
| Persistencia | — | — | rebuild parcial | **nulaba** `entregaOfflineId`, `anulacionOfflineId`, `cancelacionOfflineId`, `adminOverride*`, GPS | — | pérdida silenciosa |
| Ítems | — | — | — | `deleteMany`+`create` | — | perdía `autorizadoPorAdmin/Id/En` (latente: ningún escritor) |
| Auditoría | — | — | `{ numero, estado }` | — | sin antes/después | no reconstruible |

## Contrato PUT — PR-1 (resultado)

- **Información** (`obs`, `direccionEntrega`, `barrioEntrega`, `actualizarCliente`): aplica sin tocar dinero; la dirección no se edita en pedidos cerrados (`409 PEDIDO_CERRADO`); `obs: null|''` limpia; edición parcial conserva lo no enviado; suficiencia de entrega intacta (`422 ENTREGA_INSUFICIENTE`).
- **Económica** (`items`): una línea idéntica **no se re-precifica**; solo líneas nuevas o con cantidad/precio manual cambiado; marca de autorización retirada solo si cambió el precio/origen de esa línea; `409 TOTAL_MENOR_A_PAGADO` (con `impacto`) si el nuevo total quedaría por debajo de lo cobrado — **no se decide devolución/absorción**.
- **Ajuste de cantidades** de un pedido con entrega o cerrado: **no es edición** (`ajustar-cantidad`), sin cambios.
- **Estado:** misma máquina de estados; `estado` y `estadoEntrega` son alias (conflicto ⇒ `422`).
- **Rechazo explícito** (`422 CAMPO_NO_SOPORTADO`, por campo, sin cambiar nada) de `canal`, `tipo`, `embarqueId`, `estadoPago`, `promesaPagoFecha`, `c*Ent` y claves desconocidas. Metadatos permitidos: `casoId`, `offlineId`. Body sin cambios solicitados ⇒ `422 SIN_CAMBIOS_SOLICITADOS`.
- **Respuesta:** `aplicado: { campos, sinCambios }`. La UI solo confirma lo que el servidor confirma.
- **Auditoría:** `campos`, `antes`, `despues` (+ `numero`, `estado` por compatibilidad), una fila por llamada, dentro del lock.
- **Compatibilidad con clientes y offline:** los únicos llamadores (`handlePedidoSubmit`, `cambiarEstado`) usan `fetch` directo (no `fetchResilient`), no se encolan offline y solo envían campos procesados. No se usó `.strict()` global: el rechazo es por clave antes del esquema. `offlineId` se acepta como metadato (el PUT es declarativo).

## Evidencia de PR-1 (local)

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `npx eslint` (archivos tocados) | sin hallazgos |
| `npx vitest run` (unitarias) | 374 archivos, **3616** pruebas OK |
| `integration/pedido-put-contrato.test.ts` (Postgres real, handler real) | **29/29** (27 de las 28 pruebas iniciales fallaban antes del cambio) |
| `npm run test:integration` completo (PostgreSQL local, migraciones SQL del CI aplicadas) | 64 archivos, **368** pruebas OK |
| E2E Playwright, Chromium real, servidor `next dev`, PostgreSQL local: `e2e/pedidos-edicion-contrato.spec.ts` | **5/5** OK; la prueba «editar un PUNTO: sin toggle de canal» **falla** con el formulario anterior (`canal-fijo-edicion` no existe) |
| Mutación | se reintrodujo el defecto original (borrar las 3 claves de idempotencia en el caso de uso): la prueba falla con `Pedido.entregaOfflineId cambió…` |
| Clasificación exhaustiva de columnas (DMMF) | una columna nueva en `Pedido`/`PedidoItem` sin clasificar rompe la prueba |

## Pedido #331 — hechos (solo lectura)

PUNTO/PEDIDO, `PENDIENTE`, `ANTICIPADO`; 2 × BOTELLON × $7.500; `Pago` EFECTIVO $15.000 `CONFIRMADO`, `embarqueId` nulo; factura FAC-00335 `PAGADA`; creado por un ADMIN el 09-oct 21:38 UTC; tres `UPDATE` del 10-oct (20:15, 20:25:45, 20:25:53) de otro ADMIN, todos con `{estado:"PENDIENTE"}`. **El historial previo a PR-1 no guarda antes/después**, por lo que de esos tres `UPDATE` solo se puede afirmar que el estado de entrega era `PENDIENTE`; no que ningún otro campo permaneciera igual. Estado actual y coherencia: total = pagado = factura.

**No se modificó ni se modificará nada de #331 hasta confirmar con el personal cómo debía entregarse.** No se crean embarques ni se tocan pagos.

---

## Revisión de PR-1 — cinco bloqueos (2026-10-11)

Cada bloqueo se reprodujo con una prueba **antes** de corregir (`integration/pedido-put-bloqueos-pr1.test.ts`: 19 de 27 fallaban contra el código de `ca96137`).

| # | Hallazgo del revisor | Reproducción (código anterior) | Causa raíz | Corrección | Prueba |
|---|---|---|---|---|---|
| 1 | `ENTREGADO` + `obs`/dirección declaraba campos aplicados sin persistirlos | `PUT {estado:'ENTREGADO', obs}` → 200, `aplicado.campos=['estadoEntrega','obs']`, `obs` nulo en BD | La entidad que se guardaba se construía **antes** de procesar obs/dirección | Una sola construcción al final con todo ya aplicado + guardia final (`EdicionNoPersistidaError`) que revierte si lo guardado difiere de lo declarado; y se elimina la rama ENTREGADO del caso de uso | `Bloqueo 1` (invariante «declarado == persistido» sobre 4 combinaciones) + unitaria de la guardia |
| 2 | El PUT ejecutaba entrega/cancelación/anulación/envío/no-entrega/volver a pendiente | `PUT {estado:'CANCELADO'}` → 200 sin nota de crédito ni anulación de factura; ídem `EN_RUTA`, `NO_ENTREGADO`, `ENTREGADO` | `estadoEntrega` se aplicaba por la ruta genérica | **Todo** cambio de estado → 409 `OPERACION_ESPECIALIZADA` con la vía correcta. «Volver a pendiente» pasa a `DELETE /api/embarques/[id]/pedidos/[pedidoId]` (ya existía: libera, audita, notifica al repartidor); «Marcar entregado» de la UI pasa por `POST /entrega` (cantidades, GPS, N2, factura) | `Bloqueo 2` (5 destinos × origen, obligación N2 abierta, vía especializada operativa) + E2E Hub ON/OFF |
| 3 | La edición informativa enviaba `items` y el servidor la rechazaba con entregas/cierre | PUT con ítems idénticos sobre pedido parcial → 409 `CANTIDAD_YA_ENTREGADA` | Guardas evaluadas por presencia de `items`, no por cambio real | Regla única `lib/pedido-edicion-items.ts` usada por cliente **y** servidor: el formulario solo envía `items` si cambiaron; el servidor solo aplica guardas ante un cambio real; sin nada que pedir no hay llamada («Sin cambios») | `Bloqueo 3` + unitarias + E2E parcial Hub ON/OFF |
| 4 | Sin unicidad de `(pedido, producto)` | `POST` con producto repetido → 201 con dos líneas | Nada lo impedía en borde ni caso de uso | Rechazo en `PedidoCreateSchema`, esquema de preview y `PedidoUpdateSchema` (400) y en el caso de uso (`LineasDuplicadasError`); un pedido que **ya** tuviera duplicados falla cerrado al editar ítems (409 `LINEAS_DUPLICADAS`); `repo.update` empareja por coincidencia exacta y luego por producto: cada línea conserva id y autorización. **Producción: 0 pedidos con líneas duplicadas** (consulta de solo lectura 2026-10-10). El índice único en BD **no** se agrega aquí (migración: queda como follow-up aprobable) | `Bloqueo 4` (crear, editar, duplicado preexistente, cancelar con duplicados) |
| 5 | Diferencial N2 perdido/recalculado al editar | Pedido PUNTO + gestión DOMICILIO (total sube por el diferencial); PUT de cantidades → 200 y el total vuelve a Σ ítems | `total = Σ ítems` ignora los diferenciales que N2 suma sobre `Pedido.total` | Si el pedido tiene obligación N2 o un ajuste con diferencial ≠ 0 y se piden cambios de cantidad → 409 `PEDIDO_CON_N2_USE_AJUSTAR_CANTIDAD`; información sigue permitida; reenviar lo mismo no bloquea | `Bloqueo 5` (precondición, bloqueo, información permitida, sin cambio) |

### Auditoría de rutas alternativas (escritores de `Pedido`, `PedidoItem` y `Factura`)

Búsqueda: `grep -rnE "(pedido|pedidoItem|factura)\.(update|updateMany|create|createMany|delete|deleteMany|upsert)" src` excluyendo pruebas.

| Escritor | Qué toca | Consecuencias que cubre |
|---|---|---|
| `EntregarPedidoUseCase` (`POST /entrega`) | cantidades, estado, pagos | factura, N2 (I-11), GPS/foto |
| `Cancelar`/`AnularPedidoUseCase` | estado, pagos | factura anulada, nota de crédito, reversión |
| `AjustarPedidoCantidadUseCase` (`ajustar-cantidad`) | ítem, total | N2, diferencial, factura |
| `procesar-pedido.service` (cierre de embarque) | ítems, estado, factura | trazabilidad física, caja |
| `aplicar-diferencial-economico` (N2) | total, saldo, factura | `PedidoCantidadAjuste` |
| `pedidos/[id]/enviar`, `embarques/[id]/enviar`, `embarques` POST/PUT, `embarques/[id]/pedidos/[pedidoId]`, `MaterializarPlan` | asignación y estado logístico | capacidad, notificación, auditoría |
| `abonos`, `pagar-fiado`, `cartera/abonos/[id]/corregir`, cron `vencimiento-promesas`, `casos/[id]`, `resolver-disputa` | pago/estadoPago/disputa | factura, receivable, auditoría |
| `lib/recurrentes.ts` (consolidación) | cancela pedidos viejos | rama `APLICAR_CREDITO` con NC + saldo a favor + factura anulada; **observación fuera de PR-1:** la rama `CON_PENDIENTES` solo marca `CANCELADO` y crea la NC (no anula la factura ni pone `estadoPago=ANULADO`) — no se modificó, queda para revisión |
| **`PUT /api/pedidos/[id]` (PR-1)** | `obs`, dirección, líneas | **ya no cambia estado**; líneas: total + factura alineados, no baja de lo cobrado, bloqueado con N2/duplicados |

Los únicos escritores de `PedidoItem` son el repositorio (entrega/cancelación/anulación/edición), el cierre de embarque y `ajustar-cantidad`; los de `Factura`, los de la tabla anterior. No hay otra ruta que edite líneas o importes sin pasar por una de esas operaciones.
