# Incidente "Pedidos: edición / modalidad de entrega / cierre" — ledger de evidencia y aprobaciones

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
