# ADR-CORRECCION-MONETARIA-002 — Corregir un `Pago` que no tiene `Abono` (incremento de ADR-CORRECCION-MONETARIA-001)

- Estado: **PROPUESTO — NO ACEPTADO.** Requiere aprobación del PO antes de implementar. No autoriza migración en producción.
- Fecha: 2026-11-17
- Origen: issue #796 (auditoría `docs/agentes/investigacion/2026-11-17-796-auditoria-pago-abono-als.md`, hallazgos F1–F8).
- Incrementa (no reemplaza): `ADR-CORRECCION-MONETARIA-001` (D.1, D.3), `ADR-PAGO-REPORTADO-CONFIRMADO-001` (§4).
- Decisión de diseño delegada por el PO el 17-nov-2026 («decide tú»); los gates de migración, maquetas y merge **siguen siendo del PO**.

## Contexto
1. Hoy toda reversión de dinero es un `CorreccionAbono` con `abonoId` **obligatorio** (ADR-001 D.3).
2. `pagar-fiado` crea siempre un `Abono` espejo por cada `Pago`; el cobro al entregar desde Pedidos crea un `Pago` **sin** abono.
3. `DISCREPANTE` (ADR-PAGO §4) marca el pago y abre un caso, pero «la reversión real va por ADR-CORRECCION», es decir, por un abono. Un pago sin abono queda sin camino de reversión (F1).
4. El PO decidió que el cobro del día de la entrega no pertenece a Cartera: el espejo de ese pago no debería existir. Eso solo es seguro si el `Pago` puede corregirse por sí mismo.

## Decisión
Un **único mecanismo de reversión** (ADR-001) con dos anclas posibles. No se crea una tabla ni un modelo paralelo.

### D2.1 — Ancla: `CorreccionAbono.pagoId` opcional
```prisma
model CorreccionAbono {
  abonoId String?   // antes obligatorio; ahora uno de los dos
  pagoId  String?   // NUEVO
  pago    Pago?     @relation(fields: [pagoId], references: [id], onDelete: Restrict)
  @@index([pagoId])
}
```
- `CHECK ((abonoId IS NULL) <> (pagoId IS NULL))`: exactamente una ancla.
- Nombre de la tabla sin cambios (compatibilidad). Cambia solo la restricción de nulidad de `abonoId`.

### D2.2 — Un pago con abono se corrige **por su abono**
Si el `Pago` tiene un abono espejo, la corrección por `pagoId` se **rechaza** (409) y se indica corregir el abono. Así no existen dos caminos sobre el mismo dinero.
Invariante: `Σ revertido(pagoId) + Σ revertido(abonoId espejo) ≤ pago.monto`.

### D2.3 — Tipos y alcance (condición del PO: no rediseñar)
`MONTO`, `CLIENTE`, `FACTURA`, `NO_RECIBIDO` se conservan con el comportamiento actual (revierten; no reaplican). Se separan **conceptualmente**:
| Concepto | Mecanismo | Nota |
|---|---|---|
| Registro erróneo | `MONTO`/`CLIENTE`/`FACTURA` | Sin cambios |
| Rechazo de un pago | `NO_RECIBIDO` (o resolución de un caso `DISCREPANTE`) | La reversión nace del caso; `DISCREPANTE` por sí solo sigue sin revertir |
| Devolución efectiva del dinero | **Fuera de alcance** | No existe para pagos; **no** se mezcla con `devolver-saldo-favor` (#560) |

### D2.4 — Permisos (sin ampliar privilegios)
- Corregir un pago: **ADMIN + CONTADOR**, igual que corregir un abono. `roles-309.test.ts` se extiende al nuevo camino.
- Cobrar (ADMIN + ASISTENTE) y confirmar (usuario configurado) no cambian. ASISTENTE no obtiene acceso a corregir.

### D2.5 — Concurrencia e idempotencia
Lock `CARTERA:{cliente}` y luego `PEDIDO:{pedido}` (mismo orden que `pagar-fiado`; **ya aplicado a `corregir` por abono en #796**, con prueba), más `SECUENCIA:correccionAbono`. Idempotente por `correccionOfflineId @unique`.

### D2.6 — Auditoría (condición 3 del PO)
Cada corrección conserva motivo, responsable, fecha, importe y valores **anteriores y posteriores** de `Pedido.totalPagado/saldo/estadoPago` y `Factura.montoPagado/saldo/estado`, además del vínculo al movimiento original. Se registran en `logAudit` y en la `ReceivableEntry REVERSION` (que ya guarda el posterior). *Esto también se aplicaría al camino por abono (hoy no guarda el anterior).*

## Consumidores a revisar (XMOD)
Una ancla opcional rompe cualquier lectura que asuma `abonoId` presente:
| Consumidor | Riesgo | Acción |
|---|---|---|
| `src/lib/cobro-cartera.ts` (reversión por abono y `leerCorreccionesDeAbonos`, `JOIN "Abono"`) | Una corrección por `pagoId` **no restaría** del Cierre ni aparecería en su lista | Añadir la rama por `pagoId` (resta en el día del **Pago**, como el espejo) |
| `src/lib/cobros-periodo.ts` | Idem (consume lo anterior) | Idem |
| `src/app/api/cartera/abonos/route.ts` | Sin riesgo (parte del abono) | — |
| `src/app/api/clientes/[id]/historial/route.ts` | `abono: { select }` nulo | Tolerar `abono = null` y mostrar el pago |
| `src/lib/integridad/reglas.ts` (V17 y reglas de `CorreccionAbono`) | Reglas que asumen `abonoId` | Revisar y extender |
| Factura (pantalla e impresión) | Historial de pagos hoy sale de `factura.abonos` | **Paso 1**: leerlo desde `Pago` (maqueta) |
| `ReceivableEntry` | Sin cambio de tipo | — |
| Cierre guardado (`CierreDia`) | No se reescribe; existe la señal #712 | Probar caso 28 |

## Compatibilidad y despliegue (expand/contract, reversible)
1. **EXPAND (código):** lectores tolerantes a `abonoId` nulo y a `pagoId`; **sin** escribir aún `pagoId`. Desplegable sin migración.
2. **EXPAND (esquema, aditivo e idempotente):** `ALTER TABLE ... ADD COLUMN "pagoId"`, `DROP NOT NULL` en `abonoId`, el `CHECK`, el índice. Verificación previa en producción **solo con autorización del PO**; ensayo en PostgreSQL desechable dos veces.
3. **Escritura:** habilitar la ruta de corrección por `pagoId` detrás de una **bandera apagada por defecto**.
4. **Solo entonces** (paso 3 del plan) dejar de crear espejos del cobro del día, también detrás de bandera.
- **Rollback de comportamiento:** apagar las banderas. Las correcciones por `pagoId` ya creadas quedan y siguen siendo legibles (los lectores del punto 1 las toleran). `git revert` no revierte datos.

## Fuera de alcance
Corrección multi-factura como una sola operación (ADR-001); devolución de dinero al cliente; cambio del catálogo de tipos; confirmación de `Abono`; reclasificar o borrar los 97 espejos o los 21 abonos sin procedencia.

## Pruebas obligatorias (mínimo)
- Corregir un `Pago` sin abono: reversión total y parcial; recálculo de pedido y factura; `ReceivableEntry REVERSION`; `Pago` intacto.
- Corregir por `pagoId` un pago que **sí** tiene espejo → 409; el tope conjunto `pago` + `abono` no se excede.
- `NO_RECIBIDO` por `pagoId` abre el `ResponsibilityCase`; `DISCREPANTE` solo no revierte.
- Permisos: ASISTENTE y REPARTIDOR → 403; CONTADOR → OK; confirmar sigue siendo del usuario configurado.
- Concurrencia: dos correcciones del mismo pago (una gana); corrección vs cobro/entrega del mismo pedido (espera al lock).
- Idempotencia: replay con el mismo `correccionOfflineId`.
- Cierre: la corrección resta en el día del pago; un cierre ya guardado no cambia; señal #712.
- Lectores con `abonoId` nulo: historial del cliente, Cierre, integridad, factura.
- E2E y navegación real con maqueta aprobada.

## Plan por fases (una fase = una rama = un PR)
| Fase | Contenido | Gate |
|---|---|---|
| 0 ✔ | Clasificador con `asignarPagoFIFO`; Cartera suma solo deuda anterior; lock `PEDIDO` en `corregir` | Hecho en la rama; PR pendiente |
| 1 | Historial de pagos de la **factura** (pantalla e impresa) desde `Pago` | **Maqueta digital e impresa aprobada** |
| 2a | Lectores tolerantes (código, sin migración) | Plan aprobado |
| 2b | Migración aditiva `pagoId` + ruta de corrección por pago (bandera apagada) | **Autorización de migración** + ADR aceptado + maqueta del punto de entrada |
| 3 | Dejar de crear espejos del cobro del día (bandera) | 1, 2a y 2b verificados; conciliación antes/después |
| 4 | Investigar los 22 candidatos (solo lectura) | Ya autorizado; informe hecho |
| 5 | Fase 2 del issue: foto del fiado al corte | Backfill decidido |

## Preguntas abiertas para el PO
1. ¿Se acepta el ADR propuesto (D2.1–D2.6)?
2. ¿Dónde se inicia la corrección de un pago sin abono? Propuesta: desde el **detalle de la factura** (fila del pago) para ADMIN y CONTADOR; requiere maqueta.
3. ¿Se aplica también al camino por abono el registro de valores anteriores y posteriores (D2.6)?
