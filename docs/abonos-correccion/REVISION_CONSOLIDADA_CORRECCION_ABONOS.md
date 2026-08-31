# Revisión consolidada — Plan de corrección de abonos

> **Qué es esto:** revisión única de ingeniería del plan de "corrección segura de
> abonos / cartera". Consolida las revisiones de las tres versiones que circularon
> (V5, V7, V8 "convergente") en un solo documento para el equipo.
> **Versión de referencia:** V8 `AGUA_BAMBU_PLAN_TECNICO_DESARROLLO_CORRECCION_ABONOS_CONVERGENTE.md`
> (las secciones citadas como §N son de V8).
> **Código contrastado:** `main`, commit `48854569…` (2026-08-31).
> **Formato:** cada hallazgo = severidad + *sección del plan → qué cambiar → por qué (evidencia `archivo:línea`)*.

**Severidades:**
`[BLOQUEA]` resolver antes de implementar · `[CIERRA]` pregunta que el plan deja abierta y ya se puede responder ·
`[CONTRADICE]` choca con el código o con otra decisión del plan · `[CORRIGE]` afirmación imprecisa ·
`[AÑADIR]` restricción real que falta · `[OK]` alineado, no tocar.

---

## 0. Resumen ejecutivo

1. **El método del plan es correcto** y V8 ya incorporó casi todo lo señalado en las
   revisiones previas: no empezar por `Payment`/`DELETE`/botón "Revertir", preservar el
   histórico, centro de UX único en Cartera, decisiones de negocio cerradas (ventana 2
   días, roles, "pago no recibido" con investigación), split preview/ejecución con
   revalidación TOCTOU, y la regla de "detener y documentar la brecha" (§72).

2. **Quedan 3 tipos de problema:**
   - **(a)** preguntas que el plan deja abiertas y que ya se pueden **cerrar con
     evidencia** (identidad de pago: **no existe**);
   - **(b)** **restricciones del código y de la base de datos** que el plan sigue sin
     mencionar (CHECK constraints, `ReceivableTipo` cerrado, `/api/abonos` sin
     idempotencia, no hay sección "Cartera" en el nav);
   - **(c)** un **choque de roles nuevo** que introduce §2 (ADMIN/ASISTENTE vs. el
     ADMIN/CONTADOR real de `/api/abonos`).

3. **7 decisiones de producto** (§final) hay que cerrarlas antes de tocar el esquema.

---

## 1. Hechos verificados en `main` (para la Fase 0 del plan, §5)

| Pregunta del plan | Respuesta verificada | Evidencia |
|---|---|---|
| ¿Existe pago multi-factura? | **SÍ.** `pagar-fiado` reparte un monto FIFO sobre los pedidos con saldo del cliente, creando N `Pago` + N `Abono` + N `ReceivableEntry`. | `src/app/api/pedidos/pagar-fiado/route.ts:82-231`; `docs/adr/ADR-CARTERA-001.md` |
| ¿Algoritmo de distribución? | **FIFO por `Pedido.fecha` ascendente.** Congelado en ADR. | `pagar-fiado/route.ts:83-91`; `ADR-CARTERA-001` |
| ¿Existe una identidad que agrupe los abonos de un mismo pago? | **NO.** `Abono` no tiene `offlineId`, ni `pagoId`, ni `grupoId`, ni `operationId`. Correlación entre abonos = cero (sólo `clienteId` + `fecha` timestamp). | `prisma/schema.prisma:1518-1541` |
| Fuente canónica vs. proyección | `Pedido.saldo` / `Pedido.totalPagado` canónico; `ReceivableEntry` proyección, generada en la misma transacción; divergencias se registran, nunca se autocorrigen. | `src/lib/receivable-entry.ts:1-11`; `docs/adr/ADR-MONETARIO-001.md` |
| Lock | `withAdvisoryLock('CARTERA', clienteId)` en ambos productores de abono. | `src/app/api/abonos/route.ts:55`; `pagar-fiado/route.ts:46` |
| ¿Entidad `Payment` / `PaymentApplication`? | **No existe.** | — |
| ¿Endpoint de reversión / corrección? | **No existe.** `/api/abonos` sólo tiene `GET` + `POST`. | `src/app/api/abonos/route.ts` |
| Productores de `Abono` | **Dos:** `POST /api/abonos` (1 factura) y `POST /api/pedidos/pagar-fiado` (N facturas FIFO). | ambos routes |
| Idempotencia | `pagar-fiado` deduplica por `Pago.offlineId` dentro del lock. `/api/abonos` **no tiene ninguna**. | `pagar-fiado/route.ts:48-80` |
| Roles hoy | `/api/abonos` (GET y POST) = **ADMIN / CONTADOR**. `pagar-fiado` = **ADMIN / ASISTENTE**. | `abonos/route.ts:16,45`; `pagar-fiado/route.ts:23` |

→ **La Fase 0 del plan puede cerrar hoy mismo** las preguntas de identidad, multi-factura
y FIFO. Falta el barrido `rg` completo del §5 y el `FASE_0_AUDITORIA.md` formal con cada
línea referenciada.

---

## 2. Bloqueantes y decisiones a cerrar

### C-01 `[CIERRA]` — §4, §6, §67 (pasos 3-4), §69: "verificar si existe identidad de pago"

**Ya se puede responder: NO existe** (ver §1). Un pago FIFO multi-pedido crea N filas
`Abono` sin ningún campo común.

→ **PR-1 (§61) deja de ser "solo si Fase 0 lo demuestra": es obligatorio** si se quiere
corrección multi-factura o parcial (§15, §16). Dos caminos honestos:
- **(A) v1 sin multi-factura:** la corrección opera siempre sobre un `Abono` individual;
  §15 y §16 quedan fuera de v1. Es lo que el modelo soporta hoy sin cambios de esquema.
- **(B) agregar correlación:** columna `Abono.grupoCorrelacionId String? @index`, poblada
  a futuro en `pagar-fiado` y `abonos`, más backfill heurístico para lo histórico
  (patrón expand-contract ya usado en el repo). Es un PR de migración adicional.

Es **decisión de producto** (D.1).

### C-02 `[CONTRADICE]` — §2, §12, §27, §46: roles "ADMIN y ASISTENTE"

Hoy `/api/abonos` (GET y POST) exige **ADMIN / CONTADOR** (`abonos/route.ts:16,45`), no
`ASISTENTE`. Con la regla de §2:
- el **CONTADOR** —rol de finanzas, hoy el único (con ADMIN) que puede *registrar* abonos
  vía `/api/abonos` y *ver* la lista— **quedaría fuera** de la corrección;
- entraría **ASISTENTE**, que hoy ni siquiera puede hacer `GET /api/abonos`.

→ Confirmar con el PO la matriz correcta (ADMIN+CONTADOR / ADMIN+ASISTENTE / los tres) y
ajustar los permisos de `GET` en consecuencia — el centro de UX de §32 necesita leer la
lista. Decisión de producto (D.2).

### C-03 `[AÑADIR]` — §17, §21, §48: el "movimiento compensatorio" no puede ser un `Abono` negativo

La migración `20260610_add_check_constraints` aplicó **a nivel Postgres**
`chk_abono_monto_pos` (`monto > 0`) y `chk_pago_monto_pos` (`schema.prisma:1444-1452`).
§48 dice "generar una operación compensatoria/correctiva" sin aterrizar su forma, y §42
muestra "Reversión −$100.000".

→ Especificar que la corrección es **una de estas tres** (D.3):
- **(a)** modelo nuevo `CorreccionAbono` (numerado, enlazado al original);
- **(b)** estado en `Abono` (`ACTIVO | REVERTIDO`) + registro del motivo;
- **(c)** reutilizar `NotaCredito` (ya existe, `schema.prisma:1854`; la generan
  `AnularPedidoUseCase` / `CancelarPedidoUseCase`).

El abono de monto negativo está **descartado por la base de datos**.

### C-04 `[BLOQUEA]` — §29, §58: `ReceivableEntry.tipo` no admite un tipo de corrección

`ReceivableTipo = 'PAGO' | 'ABONO'` (`src/lib/receivable-entry.ts:17`);
`registrarReceivableEntry` no acepta otro valor. `detectarDivergencia` (umbral `0.01`)
corre tras cada Pago/Abono; si la corrección mueve `Pedido.saldo` sin registrar una
proyección con tipo reconocido, dispara `DUAL_WRITE_DIVERGENCE`, y `ADR-MONETARIO-001`
obliga a **"detener el rollout de la fase"**.

→ **PR nuevo antes de PR-3:** extender `ReceivableTipo` con `REVERSION` / `CORRECCION`,
actualizar `registrarReceivableEntry`, y definir cómo cuenta ese tipo en los agregados de
`/api/cierre` (`route.ts:263,533` suman `abono.monto` sin filtrar por tipo/estado) y de
`/reportes`.

### C-05 `[AÑADIR]` — §22, §23: la corrección necesita DOS locks, no sólo `CARTERA`

Si la corrección emite documento numerado (`CORR-00001`, `NC-00001`), necesita además
`SECUENCIA:{modelo}`. Precedente: la `NotaCredito` de `AnularPedidoUseCase` usa
`executeWithLock('SECUENCIA', 'notaCredito')`
(`src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts:29`) por la numeración
MAX+1. Los dos locks deben adquirirse en orden consistente en todo el código para no
generar deadlock. Ambos namespaces existen en `src/lib/locks.ts:30-38`.

---

## 3. Restricciones del código que el plan no menciona

### C-06 `[AÑADIR]` — §22, §64: invariantes de `Pedido` forzados por CHECK constraint

`chk_pedido_saldo_calc` (`saldo = total - totalPagado`), `chk_pedido_saldo_nonneg`,
`chk_pedido_montopagado_le_total` (`schema.prisma:1444-1452`). Una reversión que deje
`totalPagado > total` o `saldo` inconsistente **aborta en Postgres**, no en la app. §55
(test de atomicidad) debe cubrir explícitamente *"la corrección viola
`chk_pedido_saldo_calc` → ROLLBACK completo, sin cambios parciales"*.

### C-07 `[AÑADIR]` — §3.3, §24, §68: `/api/abonos` POST no tiene idempotencia

`AbonoCreateSchema` (`src/lib/validators.ts:312-318`) no incluye `offlineId` y `Abono` no
tiene la columna. Doble click = doble abono. §24 debe seguir el patrón congelado de
`ADR-IDEMPOTENCIA-001` (columna `@unique` dedicada por comando, dedup dentro del lock,
retorno `deduped: true`) y **cerrar de paso ese hueco** — es la puerta por la que entra el
doble-registro que motiva medio plan. Es su propio PR pequeño.

### C-08 `[AÑADIR]` — §10, §27, §57: ventana de 2 días + cierres = subsistema, no un check

`Abono` / `Pago` **no tienen** flag `cerrado` ni FK a `CierreDia` (`schema.prisma:1795`,
keyed por `fecha @unique`). `/api/cierre` (`route.ts:494-533`) suma abonos por rango de
fecha, sin marca de inmutabilidad; nada impide crear/mover un abono con `fecha` en un día
cerrado.

→ Implementar §10 ("backend impone la ventana") + §27 ("período cerrado → ADMIN, flujo
controlado") es un **PR propio**: relación `Abono ↔ CierreDia` (o comparación contra
`createdAt` + último cierre) + flujo administrativo de override. Leer `ADR-CIERRE-001`
primero. §61 no tiene un PR para esto — añadirlo.

### C-09 `[AÑADIR]` — §13, §14, §28, §40: el flujo de investigación puede montarse sobre `Caso`

El modelo `Caso` (`schema.prisma:1996`) ya tiene workflow: `status: CasoStatus`,
`asignadoA`, `creadoPor`, `notasResolucion`, `resueltoEn`, `cerradoEn`, links polimórficos
a `cliente`/`pedido`/`negocio`/`repartidor`, y `/casos` como UI. `logAudit` ya acepta
`casoId` y lo embebe en `datos._casoId` (`src/lib/audit.ts:27,50`).

→ §13/§40 deben **construir sobre `Caso`**, no inventar una entidad `Investigation`.
Faltantes a agregar: `evidence`, `participants` (hoy el sujeto es único por caso —
"mutuamente excluyentes"), y un link al `Abono`/`Pago` investigado (hoy sólo `pedidoId`).
Decisión de producto (D.7).

### C-10 `[CORRIGE]` — §26: el "saldo a favor" ya tiene mecanismo, pero los caminos de pago no lo usan

`Cliente.saldoFavor` **existe** (`schema.prisma:397`) y está cableado:
`PrismaClienteRepository` tiene `incrementSaldoFavor` / `getSaldoFavor` / `applySaldoFavor`,
usado por `CrearPedidoUseCase` (Fase 2 §3.4). **Pero:**
- `pagar-fiado` **no escribe** el sobrante a `saldoFavor` — sólo lo devuelve en un toast
  (`route.ts:281,287-289`, `montoSobrante` / `montoRestante`);
- `/api/abonos` **rechaza** el overpayment (`'Abono excede saldo de factura'` → 400,
  `route.ts:105-107,183`).

→ §26 es un hallazgo válido; corregir la redacción: el mecanismo existe
(`Cliente.saldoFavor`), lo que falta es **conectarlo a los dos caminos de pago**. Decidir
si eso entra en este plan o es un PR aparte — toca `pagar-fiado`, no la corrección (D.6).

### C-11 `[AÑADIR]` — §28: `Historial.datos` es un `String` JSON, sin columnas

`logAudit` escribe en `Historial` (`schema.prisma:1962`): `datos String` (JSON
serializado), sin columnas para `actor` / `monto` / `cliente` / `aprobador`. Los ~18
campos de §28 **caben** ahí (patrón ya usado con `_ip` / `_casoId`), pero no habrá
consulta estructurada (*"todas las correcciones con `approved_by = X` del mes"*). Si el
antifraude de §45/§63 necesita eso, hace falta un modelo `CorreccionAbono` con columnas —
que de paso resuelve C-03 (opción a) y C-01 (le cuelgas el `grupoCorrelacionId`).

### C-12 `[AÑADIR]` — inconsistencia pre-existente: anular un pedido pagado descuadra el ledger

`Pedido.anular()` (`src/modules/pedidos/domain/entities/Pedido.ts:313-329`) hace
`totalPagado → 0` y crea una `NotaCredito`, pero **no toca** los `Abono`, `Pago` ni
`ReceivableEntry` del pedido. Resultado: tras anular un pedido pagado,
`Pedido.totalPagado = 0` mientras sus `Abono` / `ReceivableEntry` siguen mostrando el
dinero.

→ §19 ("error de factura/pedido") y §9 (elegibilidad: "operaciones posteriores") chocan
con esto. Decisión explícita (D.4): la corrección **bloquea** si el pedido/factura está
`ANULADO`, y la Fase 0 decide si reconcilia esa deuda previa o la declara fuera de alcance.

---

## 4. UX / UI

### C-13 `[AÑADIR]` — §32: "Cartera → Abonos/Pagos" no existe en la navegación

`src/app/(app)/nav-data.tsx` — la sección "Finanzas" tiene Facturación / Gastos / Nómina /
Reportes. **No hay "Cartera".** §32 es una **sección + ruta nuevas**. Decidir (D.5):
sección propia en el sidebar vs. sub-item de "Facturación"; ícono (`wallet` está libre);
permiso (`view:cartera` nuevo o reutilizar `view:facturas`); roles (ver C-02). §61 PR-6
debe incluir esto.

### C-14 `[AÑADIR]` — §33: no hay lista de abonos y `GET /api/abonos` no sirve para serlo

`GET /api/abonos` (`route.ts:13-40`) filtra sólo por `facturaId` o `clienteId`, **sin
paginación** (`findMany` sin `take` / `skip` → devuelve todos), sin búsqueda de texto, sin
filtro por estado / fecha / método, sin traer factura/pedido para el contador "N
facturas". §33 requiere **reescribir el endpoint** con el patrón de paginación
server-side + búsqueda ya usado en `/clientes` y `/pedidos` (ver `AGENTS.md` → Known
Issues #15, #22, #23, incluido el anti-patrón de sincronizar el input de búsqueda y el uso
de `loading.tsx` para prefetch parcial).

### C-15 `[CORRIGE]` — §42: el "historial visual" ya existe — extenderlo, no reinventarlo

`src/app/(app)/clientes/clientes-client/cliente-historial.tsx` ya es una línea temporal
con `TimelineEvent[]`, filtros (`PEDIDO / PAGO / FACTURA / ABONO / EMBARQUE / CASO /
NOTA_CREDITO / AUDITORIA`), `TIPO_CONFIG` (ícono + color por tipo), paginación y prefetch.
§42 se implementa **añadiendo eventos `CORRECCION` / `REVERSION` / `INVESTIGACION`** a
`TimelineEvent` y a `GET /api/clientes/[id]/historial` (`route.ts:94-215`). No crear
componente nuevo.

### C-16 `[AJUSTE]` — §36-§39, §43, §44: mapear los wireframes al design system existente

| Elemento del plan | Componente / helper a reutilizar |
|---|---|
| Modales (§36-§40) | `src/components/modal.tsx` — ya trae focus-trap (Tab/Shift-Tab), Escape con stack de modales, `role="dialog"`, `aria-modal`, focus-on-open, scroll-lock del body. **Bug a arreglar primero:** `modal.tsx:114,125-126` hardcodea `id="modal-title"` / `id="modal-description"` en vez de derivarlos de `useId()` → el flujo multi-paso de §36 con modales anidados tendría IDs duplicados (rompe `aria-labelledby`). |
| Botones (§39 "nunca `¿Seguro?`") | `Button` con `variant` |
| Montos (§34, §38) | `formatCurrency` (`@/lib/utils`) |
| Fechas (§34 "31 ago · 10:32") | `formatDate` (TZ Bogotá, `src/lib/dates.ts`) |
| Toasts (§39, resultado) | Sonner — **contrato del repo**: `toast.success` (online OK), `toast.info` (offline encolado), `toast.error` (error lógico) |
| Estados de carga (§44) | patrón `loading.tsx` + skeletons |

### C-17 `[AJUSTE]` — §30, §31: el preview NO debe usar `fetchResilient`

El preview (§30) es lectura, no mutación → `fetch` plano, nunca `fetchResilient` (que
encolaría offline). Mismo criterio que `panel-prefetch.ts` en el repo. Un preview offline
no tiene sentido: sin red, no hay corrección. La revalidación TOCTOU de §31 sí debe
ocurrir dentro de la transacción con lock.

### C-18 `[CORRIGE]` — §45, §63: antifraude ya tiene dónde vivir

Integrar en `/casos` (nav "Incidencias", `view:casos`), `/reportes/salud-antifraude`
(`view:reportes`) y `src/lib/metrics.ts` + `GET /api/metrics` (ADMIN). Las señales de §45
crean un `Caso` o alimentan el reporte; las métricas de §62 usan el módulo existente. No un
panel nuevo (que §46/§26-del-plan-embarques correctamente prohibirían).

---

## 5. Menores

### C-19 `[CORRIGE]` — encabezado: commit desactualizado
"Último commit verificado: `1e97468a`" → `main` está en `48854569`. Re-contrastar. §72 ya
lo exige en espíritu; aplicarlo también al encabezado.

### C-20 `[AJUSTE]` — §25: offline de correcciones
V8 ya dice "sólo habilitar cuando la semántica de sync sea demostrablemente segura; si no,
requiere online". Correcto y suficiente. Añadir: si se habilita, seguir el patrón de
`ADR-IDEMPOTENCIA-001` (columna `@unique` dedicada), no inventar otro mecanismo.

---

## 6. Plan de PRs ajustado (§61)

| §61 | Ajuste |
|---|---|
| **PR-0** Auditoría | Mantener. §1 de este doc ya cierra identidad (NO) / multi-factura (SÍ) / FIFO. Falta el barrido `rg` completo y el `FASE_0_AUDITORIA.md` formal. |
| **PR-1** Modelo | **Reclasificar:** obligatorio si v1 = multi-factura/parcial (C-01). Si no, documentar la limitación y §15/§16 quedan fuera de v1. |
| ➕ **PR nuevo** (antes de PR-3) | Extender `ReceivableTipo` (`REVERSION`/`CORRECCION`) + impacto en `/api/cierre` y `/reportes` (C-04). |
| ➕ **PR nuevo** (o alcance "fuera") | Reconciliar la inconsistencia previa anular-pedido ↔ ledger (C-12). |
| **PR-2 / PR-3** Dominio + persistencia | Precondiciones: locks `CARTERA` + `SECUENCIA` anidados (C-05); respetar los CHECK de `Pedido` / `Factura` (C-06); corrección como entidad/estado, **nunca** `Abono` negativo (C-03); preview read-only sin `fetchResilient` (C-17). |
| ➕ **PR nuevo** | Ventana de 2 días + bloqueo por cierre como subsistema (C-08). |
| **PR-4** Idempotencia / concurrencia | Atado a `ADR-IDEMPOTENCIA-001` + `ADR-CARTERA-001`. Cerrar de paso el hueco de `/api/abonos` POST (C-07). |
| **PR-5** Auditoría / antifraude | Sobre `/casos` + `/reportes/salud-antifraude` + `src/lib/metrics.ts`, no panel nuevo (C-18). |
| ➕ **PR nuevo** (o dentro de PR-6) | Flujo de investigación sobre `Caso` (C-09). |
| **PR-6** UX/UI | Ampliar: crear sección "Cartera" en `nav-data.tsx` (C-13); reescribir `GET /api/abonos` con paginación (C-14); extender `cliente-historial.tsx` (C-15); arreglar el bug de IDs de `Modal` (C-16). |
| **PR-7** E2E / regresión | Mantener. `responsiveContainer` para ambos viewports (Known Issue #24). |
| ➕ **PR aparte** (¿fuera de este plan?) | Conectar el sobrante de `pagar-fiado` a `Cliente.saldoFavor` (C-10). |

---

## 7. Decisiones de producto a cerrar antes de tocar el esquema

| # | Decisión | Bloquea | Hallazgo |
|---|---|---|---|
| **D.1** | ¿v1 soporta corrección **multi-factura / parcial** o sólo **abono individual**? | PR-1, §15, §16 | C-01 |
| **D.2** | Matriz de roles real: ADMIN+CONTADOR / ADMIN+ASISTENTE / los tres. Ajustar permisos de `GET /api/abonos`. | §2, PR-6 | C-02 |
| **D.3** | Forma del movimiento correctivo: `CorreccionAbono` nuevo / estado en `Abono` / reutilizar `NotaCredito`. | PR-2, PR-3 | C-03 |
| **D.4** | ¿La corrección reconcilia la inconsistencia previa de anular-pedido-pagado, o queda fuera de alcance? | §19, §9 | C-12 |
| **D.5** | Ubicación de "Cartera" en el sidebar, permiso y roles. | PR-6 | C-13 |
| **D.6** | ¿El fix del sobrante de `pagar-fiado` (→ `saldoFavor`) entra en este plan o es PR aparte? | §26 | C-10 |
| **D.7** | Flujo de investigación: ¿extensión de `Caso` (recomendado) o entidad nueva? | §13, §40 | C-09 |

---

## 8. Lo que el plan hace bien (no tocar)

- No empezar por `Payment` / `PaymentApplication` / `DELETE` / botón "Revertir"
  (§48, §71, §67).
- Preservar el original; corrección como operación nueva append-only (§21).
- Backend como autoridad del preview; la UI no recalcula saldos (§30, §31, §47) —
  coincide con el patrón de Server Components del repo.
- Un solo centro de corrección + enlaces contextuales desde factura/pedido/cliente
  (§32) — sólo hay que construirlo (C-13).
- Split preview (read-only) / ejecución (revalida) + protección TOCTOU dentro de la
  transacción (§30, §31).
- "Pago no recibido" → investigación, no reversión ciega; sin consecuencia universal
  codificada (§13, §14).
- Estados de elegibilidad explícitos calculados por backend (§9, §35).
- No editar `ReceivableEntry` para "cuadrar"; registrar `DUAL_WRITE_DIVERGENCE` (§29).
- No migrar históricos por heurística cliente+fecha+monto (§7).
- No-regresión: conservar guard `ENTREGADO` para abonos, lock, auditoría, detección de
  divergencias (§68).
- "Detener y documentar la brecha, no arreglar el plan en silencio en el código" (§72).

---

## Recomendación técnica del modelo (sujeta a D.1–D.7)

Entidad nueva *append-only* enlazada al original. **No** `Payment`, **no** `Abono`
negativo, **no** `DELETE`.

```prisma
model CorreccionAbono {
  id                  String   @id @default(cuid())
  numero              String   @unique              // CORR-00001 — getNextNumero + lock SECUENCIA
  abonoOriginalId     String
  abonoOriginal       Abono    @relation(...)
  tipo                String                        // MONTO | CLIENTE | FACTURA_PEDIDO | DUPLICADO | NO_RECIBIDO | OTRO
  motivo              String
  montoOriginal       Decimal  @db.Decimal(10, 2)
  montoCorregido      Decimal? @db.Decimal(10, 2)   // null = reversión total
  correccionOfflineId String?  @unique              // ADR-IDEMPOTENCIA-001
  usuarioId           String?
  aprobadorId         String?                       // si REQUIRES_ADMIN
  casoId              String?                       // si nace de una investigación (C-09)
  createdAt           DateTime @default(now()) @db.Timestamptz()

  @@index([abonoOriginalId])
}
```

Si D.1 = "multi-factura": además `Abono.grupoCorrelacionId String? @index` + backfill.

**Flujo de ejecución** (§22), dentro de `withAdvisoryLock('CARTERA', clienteId)` + lock
`SECUENCIA:correccionAbono`:

1. revalidar elegibilidad (`canCorrectPayment`: actor, estado pedido/factura, ventana 2
   días, cierre, correcciones previas, operaciones posteriores — §9, §31);
2. leer el estado canónico actual desde la DB (nunca confiar en el cliente — §47);
3. calcular el delta;
4. crear `CorreccionAbono` (numerada);
5. actualizar `Factura.saldo/montoPagado/estado` y `Pedido.saldo/totalPagado/estadoPago`
   respetando los CHECK (C-06);
6. `registrarReceivableEntry(tx, { tipo: 'REVERSION', ... })` (previo PR que extiende el
   enum — C-04);
7. `detectarDivergencia` → si divergencia: `DUAL_WRITE_DIVERGENCE` + abortar;
8. `logAudit(entry, tx)` en la misma transacción, con `casoId` si aplica;
9. COMMIT / ROLLBACK atómico.

**Reutiliza:** lock `CARTERA` (`ADR-CARTERA-001`); `getNextNumero` + lock `SECUENCIA`
(patrón `NotaCredito`); `registrarReceivableEntry` + detector de divergencia
(`ADR-MONETARIO-001`); idempotencia por columna `@unique` (`ADR-IDEMPOTENCIA-001`);
`logAudit(entry, tx)`; `Modal` / `Button` / `formatCurrency` / Sonner;
`cliente-historial.tsx` + `/api/clientes/[id]/historial` para el timeline; patrón de
paginación server-side de `/clientes` para la lista; `Caso` + `/casos` +
`/reportes/salud-antifraude` para investigación y antifraude.

**No inventa:** ningún ledger nuevo, ningún segundo mecanismo de locking, ningún
`offlineId` fuera del patrón existente, ningún timeline ni panel antifraude nuevos.

---

## Anexo — archivos y ADR citados

| Tema | Ruta |
|---|---|
| API abono individual | `src/app/api/abonos/route.ts` |
| API pago de fiado (multi-factura, FIFO) | `src/app/api/pedidos/pagar-fiado/route.ts` |
| Validadores | `src/lib/validators.ts` (`AbonoCreateSchema` :312, `PagarFiadoSchema` :700) |
| Proyección de cartera | `src/lib/receivable-entry.ts` |
| Auditoría | `src/lib/audit.ts` · modelo `Historial` en `prisma/schema.prisma:1962` |
| Locks | `src/lib/locks.ts` (namespaces :30-38) |
| Movimiento compensatorio existente (NotaCredito) | `src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts` · `CancelarPedidoUseCase.ts` |
| Dominio `Pedido` (anular / cancelar / saldoFavor) | `src/modules/pedidos/domain/entities/Pedido.ts` · `src/modules/pedidos/infrastructure/repositories/PrismaClienteRepository.ts` |
| Cierre de caja | `src/app/api/cierre/route.ts` · modelo `CierreDia` (`schema.prisma:1795`) |
| Modelos financieros | `prisma/schema.prisma` — `Pago` :837, `Factura` :1389, `Abono` :1518, `ReceivableEntry` :1230, `NotaCredito` :1854, `Cliente.saldoFavor` :397 |
| CHECK constraints | `prisma/migrations/20260610_add_check_constraints/` (lista en `schema.prisma:1444-1452`) |
| Navegación / sidebar | `src/app/(app)/nav-data.tsx` |
| UI registrar abono | `src/app/(app)/facturas/facturas-client/index.tsx` (:174, :774) |
| UI pago fiado | `src/app/(app)/pedidos/pedidos-client/fiados-table.tsx` |
| Timeline de cliente | `src/app/(app)/clientes/clientes-client/cliente-historial.tsx` · `src/app/api/clientes/[id]/historial/route.ts` |
| Componente Modal | `src/components/modal.tsx` |
| Permisos | `src/lib/permissions.ts` |
| Investigación / antifraude | modelo `Caso` (`schema.prisma:1996`) · `/casos` · `/reportes/salud-antifraude` · `src/lib/metrics.ts` |
| ADR — ledger monetario y divergencia | `docs/adr/ADR-MONETARIO-001.md` |
| ADR — cartera y FIFO | `docs/adr/ADR-CARTERA-001.md` |
| ADR — idempotencia y claves offline | `docs/adr/ADR-IDEMPOTENCIA-001.md` |
| ADR — concurrencia / locks | `docs/adr/ADR-CONCURRENCIA-001.md` |
| ADR — cierre | `docs/adr/ADR-CIERRE-001.md` |
| Patrones de paginación / búsqueda / responsive | `AGENTS.md` → "Known Issues" #15, #22, #23, #24 |

---

*Este documento reemplaza las revisiones intermedias de V5 y V7. Historial de versiones
del plan: V5 → V7 (agregó UX/UI y antifraude) → V8 "convergente" (agregó decisiones de
negocio cerradas, estados de elegibilidad, split preview/ejecución, flujo de investigación).*
