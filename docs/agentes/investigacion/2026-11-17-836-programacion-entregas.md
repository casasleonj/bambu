# #836 · Programación de entregas, horario de negocio y agrupación por barrio

**Estado:** `INVESTIGADO` (iteración R1+R2 con Claude, sobre `main` `2e3bad2`). `PLAN_APROBADO`: **no**. Código de producto: **ninguno**.
**Desviación declarada de #704:** `codex` no está instalado en el entorno; el PO autorizó investigar con Claude en su lugar («A usa Claude y sigue tu recomendación»). No hubo consulta web ni a ChatGPT: lo no verificado en código queda como `NO VERIFICADO`.
**Acceso:** Contexto Maestro no accesible; lo que dependa de él es `BRECHA`.

## 1. Hechos verificados en código (HECHO)

| # | Hecho | Fuente |
|---|---|---|
| H1 | `Pedido.fechaEntrega` (`Timestamptz?`, indexado) existe. Lo aceptan `POST /api/pedidos`, la importación y la sincronización offline. **Ningún formulario de la UI lo captura.** | `schema.prisma:1012,1173`, `api/pedidos/route.ts:275,358`, `lib/import/commit.ts:287`, `lib/db/sync.ts:178`, `hooks/use-crear-pedido.ts:25` |
| H2 | **Semántica doble:** Embarques lo usa como fecha prevista (`vencido/hoy/futuro`); la línea de tiempo del detalle lo usa como respaldo de la fecha **física** (`entregadoAt ?? fechaEntrega`). | `nuevo-embarque/filtrar-pedidos.ts:32-37`, `pedido-detalle/derive-detalle.ts:98` |
| H3 | `horaPreferida` es texto libre en `Pedido` y `PlantillaRecurrente`; solo se muestra y ancla filas. No expresa «no antes de» ni ventana. | `schema.prisma:765,1116`, `pedido-table.tsx:282,502` |
| H4 | Horario de negocio: solo `Negocio.horaApertura String?`. No hay cierre, turnos, días ni festivos. `Ruta.horarioInicio/Fin` es de ruta, no del cliente. | `schema.prisma:560,372` |
| H5 | La consulta de Pedidos admite `fechaBase` = `pedido` (`Pedido.fecha`), `creacion` (`createdAt`), `entrega` (hechos físicos) y `cobro`. **No hay base «comprometida».** | `pedidos-consulta.repository.ts:95,230,242` |
| H6 | Ya existe patrón de reprogramación auditable, pero solo para el **remanente**: `ObligacionPendiente.fechaObjetivo` + `ObligacionPendienteReprogramacion` (append-only, motivo, responsable, `offlineId` idempotente, sin límite de reprogramaciones, señales no bloqueos). | `schema.prisma:1595-1647`, `docs/AGUA_BAMBU_F4_DISENO_TECNICO_REPROGRAMACION_v1.0.md` |
| H7 | Barrio efectivo centralizado: override del pedido > negocio > cliente. Existe `barrioId` canónico en Negocio. | `lib/geo/pedido-direccion.ts`, `schema.prisma:548-552` |
| H8 | Gestión temporal #472 reutiliza `EntregarPedidoUseCase`; fecha de entrega ≤ 7 días atrás, nunca futura, nunca día cerrado. | `docs/pedidos/GESTION_TEMPORAL_SIN_EMBARQUE.md` |
| H9 | #841 / PR #843 (abierto) reordena las secciones de «Hoy». #836 no debe apilarse sobre él. | GitHub |

**Brecha central (H1+H2):** el compromiso de entrega ya tiene columna, pero sin contrato. Reutilizarla sin cerrar su significado contradice A01/A02 y puede pintar como «entregado el día X» un pedido que solo estaba programado para X.

## 2. Alternativas y refutación

**Compromiso de entrega**
- **A. Reutilizar `Pedido.fechaEntrega` como «fecha prometida» + historial nuevo.** ✔ Reutiliza lo que Embarques ya lee. ✘ Hay datos ya escritos por importación/API de significado dudoso (`NO VERIFICADO` en producción). *Mitigación:* no reinterpretar filas `ENTREGADO`; el respaldo `entregadoAt ?? fechaEntrega` del detalle se elimina o se limita a pedidos históricos entregados sin `entregadoAt`.
- **B. Columna nueva `fechaPrometida`.** ✔ Sin ambigüedad. ✘ Dos campos casi iguales, divergencia con Embarques (XMOD).
- **Recomendado: A**, con contrato escrito y prueba que fije el significado.

**Historial de reprogramación:** espejo de H6 sobre Pedido (`PedidoReprogramacion`: anterior, nueva, motivo, responsable, fecha, `offlineId`, indicador «ya vencido al reprogramar» **congelado al crear**). Congelar el indicador resuelve A04 vs A05 sin reescribir el pasado (A25).

**Horario del negocio:** tabla aditiva `NegocioHorario` (negocio, día, desde, hasta; varias filas por día = turno partido) + excepciones por fecha. `horaApertura` queda como lectura heredada. Alternativa descartada: ampliar el texto `horaApertura` (no es consultable ni valida turnos).

**Agrupar por barrio:** servidor, con `GROUP BY` sobre el barrio efectivo (SQL `COALESCE` en el orden de H7); agrupar por `barrioId` canónico cuando exista y por texto normalizado cuando no. Descartado: agrupar en el cliente (rompe A15 con paginación de 25).

**Refutación adversarial (qué la rompe)**
1. Importados con `fechaEntrega` pasada: aparecerían como «atrasados masivos». → solo cuentan pedidos abiertos; migración **no** toca datos.
2. «No antes de» bloqueando duro en el reparto: impide una entrega legítima acordada por teléfono. → advertir y exigir confirmación con motivo.
3. Día de calendario vs instante: `Timestamptz` a medianoche UTC cae el día anterior en Bogotá (ya ocurrió en #753). → el compromiso se interpreta siempre por día `America/Bogota`.
4. Hoy en Embarques y Hoy en Pedidos con dos lógicas distintas. → una sola función compartida de clasificación.
5. Parciales: reprogramar el remanente (H6) y la fecha del pedido pueden contradecirse. → la del remanente prevalece sobre la del pedido cuando existe obligación abierta (`NO VERIFICADO` el recorrido completo; se prueba en F1).
6. Pago anticipado de pedido futuro: no mueve caja a la fecha de entrega (A24). La caja ya atribuye por fecha de pago; no se toca.

## 3. Decisiones (adoptadas por instrucción del PO «sigue tu recomendación»; reversibles hasta aprobar maquetas)

| # | Decisión | Estado |
|---|---|---|
| D1 | «No antes de»: **advierte y exige confirmación auditada**; nunca bloqueo duro. Preparar siempre permitido. | `DECISIÓN` (delegada) |
| D2 | Horario por destino (negocio) en tabla aditiva; no global por cliente; fase 2. | `DECISIÓN` (delegada) |
| D3 | Reutilizar `Pedido.fechaEntrega` como compromiso, con contrato y historial nuevo. | `DECISIÓN` (delegada) |
| D4 | Domingo/cierre: se acepta con aviso «negocio cerrado ese día» y confirmación; sin autorreprogramar ni inventar fecha. Calendario de empresa, fuera de v1. | `DECISIÓN` (delegada) |
| D5 | Orden: **F1** compromiso + «Hoy / Programados» + historial · **F2** horario y restricciones · **F3** barrio (independiente). Un PR por fase, tras #843. | `DECISIÓN` (delegada) |

### Fase 2 · horario de atención en Negocios (respuestas del PO, 17-nov-2026)

- **P1 · horario por negocio, no por cliente:** `DECISIÓN` (PO). Un cliente con dos negocios tiene dos horarios; un cliente sin negocio no tiene horario.
- **P2 · solo horario semanal; excepciones por fecha después:** `DECISIÓN` (PO, «tu recomendación»).
- **Superficies a tocar (HECHO, a `2e3bad2`):** `src/components/negocio-form.tsx` (campo único `horaApertura`), `negocio-detail-modal.tsx:186-193`, `POST /api/negocios` (zod, `route.ts:26`), `GET /api/clientes/[id]:104`, `src/types/index.ts:54`, OpenAPI; el formulario se usa desde `clientes/clientes-client/index.tsx`.
- **Datos:** tabla aditiva `NegocioHorario` (negocio, día, desde, hasta; varias filas por día). `horaApertura` queda de solo lectura; no se convierte el texto libre automáticamente.
- **Consumidores:** formulario y lista de pedidos solo **avisan** «negocio cerrado ese día» / «fuera de horario»; nunca bloquean ni ocultan el pedido.
- **Maquetas:** `docs/agentes/maquetas/836-programacion-entregas/03-negocio-horario-*.html`, `PENDIENTE DE APROBACIÓN`.

## 4. Cobertura de la matriz A01–A30

Certeza: `PROPUESTO`; ninguno `PROBADO`.

- **F1:** A01–A05, A17, A18 (solo lectura del historial), A20, A22, A23, A25–A28, A30.
- **F2:** A06–A12, A26, A29.
- **F3:** A13–A15, con A16 (no reasignar a un segundo embarque) y A19.
- **Verificar en F1 sin cambiar nada:** A18, A19, A21, A24 (consumidores Caja, Cierre, Nómina).

## 5. Fuera de alcance / PRESERVAR

Fuera: crear otro embarque, cambiar `Pedido.fecha`/`createdAt`, el Contexto Maestro, comisiones y caja. Preservar: filtros, estados, búsqueda y acciones de la consulta; #472; comisión por fecha física; dinero por fecha de pago.

## 6. Gates pendientes

Maquetas F1 y F3 (escritorio y móvil, con confirmación, carga y error): `docs/agentes/maquetas/836-programacion-entregas/`, **PENDIENTE DE APROBACIÓN**. Sin aprobación del PO: no hay rama de implementación. Migraciones: aditivas, con plan de compatibilidad y verificación previa en producción **solo con autorización**.

## 7. Fase 1: decisiones del PO y verificación en producción (17-nov-2026)

- **Pestañas con contadores (maqueta 1) — `DECISIÓN` (PO, «decide tú»):** se mantienen las dos vistas como opciones de filtro («Entrega prevista hoy o atrasada», «Programados») con etiqueta en cada fila, sin pestañas ni contadores. Motivo: no alterar la pantalla de «Hoy» de #797 y #841. Los contadores quedan como mejora opcional posterior.
- **Hub activo en producción — `HECHO` (verificado por solo lectura en Vercel):** `NEXT_PUBLIC_PEDIDOS_V2 = "true"` en Production (activación 2026-10-26). Sin descifrar ningún valor.
- **Migración `20261118_pedido_reprogramacion` — verificación previa AUTORIZADA por el PO (solo lectura), realizada:** la tabla no existe aún en producción; `Pedido.id` y `User.id` son `text` (coinciden con las FK); el código desplegado no conoce la tabla, así que aplicarla antes del merge es compatible. SQL probado en PostgreSQL 16 local (idempotente, sin diferencias contra el esquema); producción es PostgreSQL 17.
- **`BRECHA` previa, ajena a #836:** `_prisma_migrations` de producción no registra 5 migraciones cuyos objetos sí existen (`20261111162455_fecha_pago_real_comision`, `20261111_devolucion_saldo_favor`, `20261112_user_puede_confirmar_pagos`, `20261113_precio_unitario_precision_795`, `20261117_pago_comision_fecha_correccion`). Requiere decisión aparte (#409). No se tocó.
- **Migración APLICADA y REGISTRADA en producción (17-nov-2026, autorización expresa del PO):** se ejecutó el SQL de `prisma/migrations/20261118_pedido_reprogramacion/migration.sql` sin cambios. Verificación de solo lectura posterior: 9 columnas, 4 índices, 2 claves foráneas (`CASCADE` hacia `Pedido`, `RESTRICT` hacia `User`), tabla vacía y los 1218 pedidos intactos. Registrada en `_prisma_migrations` con el sha256 real del archivo (`dd805348…d933`), sin otra fila creada. Reversa: la tabla es nueva y vacía; el código desplegado no la usa, así que dejarla no afecta a nadie.

## 8. Fase 2b · «no antes de HH:MM» por pedido (R1+R2 con Claude, sobre `main` `944c8cd`, 18-nov-2026)

**Estado:** `INVESTIGADO`, `PLAN_APROBADO`: **no**, maquetas: **pendientes**. Código de producto: ninguno. 2a (horario por negocio) está fusionada y en producción (#862, migración aplicada).

### Hechos nuevos (HECHO, a `944c8cd`)
- `Pedido.horaPreferida` ya existe (`String?`, `schema.prisma:1123`). Es **texto libre**; lo copia `lib/recurrentes.ts` desde la plantilla, lo muestran la tabla de Pedidos y el detalle, y Embarques lo usa solo para ordenar («hoy con hora» / «hoy sin hora»). No lo valida nadie y no restringe nada.
- Ningún formulario de creación captura `fechaEntrega`; la F1 añadió «Cambiar fecha prometida» (`pedido-reprogramar.tsx`), que es el único lugar de la UI donde hoy se fija.
- La entrega la registra `POST /api/pedidos/[id]/entrega` → `EntregarPedidoUseCase` (con `entregadoAt` que puede venir del dispositivo) y también se hace **sin conexión** (repartidor). Un bloqueo del servidor no puede detener una entrega ya hecha en la calle y sincronizada después.

### Alternativas
- **A. Campo nuevo `Pedido.entregaNoAntesDe` (`HH:MM`, hora de Bogotá, opcional)**, interpretado siempre sobre el día prometido (`fechaEntrega`). ✔ Sin ambigüedad, validable con el mismo formato que el horario de negocio. ✘ Una columna más; `horaPreferida` y este campo se parecen y hay que explicar la diferencia en la interfaz («preferida» orienta, «no antes de» avisa).
- **B. Reinterpretar `horaPreferida`.** ✘ Texto libre con datos de significado desconocido en producción (`NO VERIFICADO`) y copiado desde plantillas: convertiría una preferencia en una restricción sin que nadie lo pidiera.
- **C. Guardar la hora dentro de `fechaEntrega` (timestamp con hora).** ✘ Rompe el contrato de F1 («día de calendario de Bogotá»), las vistas «hoy/atrasado/programado» y la clasificación compartida con Embarques.
- **Recomendado: A.** Migración aditiva e idempotente (columna nullable + CHECK de formato). No toca datos existentes.

### Reglas propuestas (alineadas con D1, ya decidida)
1. **Nunca bloquea.** Preparar, planificar y asignar a embarque siempre se permite; la restricción solo gobierna la **entrega**.
2. **Al registrar la entrega:** si la hora de entrega (Bogotá) es anterior a `entregaNoAntesDe` el mismo día, se muestra un aviso y se pide **confirmar con un motivo**; queda como evento auditable («entregado antes de la hora acordada»), sin cambiar dinero ni comisión.
3. **Sin conexión:** el aviso se calcula en el dispositivo con el dato en caché; la entrega se guarda con la marca y el motivo, y el servidor la **registra y señala, no la rechaza** (un rechazo al sincronizar perdería un hecho físico real).
4. **Cambiar el día prometido** (F1) conserva o limpia la hora según lo que el usuario elija en el mismo diálogo; el historial `PedidoReprogramacion` guarda la hora anterior y la nueva.
5. **Pedidos ya entregados, cancelados o anulados:** no se muestra ni se aplica.
6. **Parciales / remanente:** la hora aplica al pedido; la obligación pendiente tiene su propia fecha (H6) y no hereda la hora (`NO VERIFICADO` el recorrido completo; se prueba en F2b).

### Refutación adversarial (qué la rompe)
1. Hora sin día (pedido sin `fechaEntrega`) → no se permite guardar la hora sin día prometido.
2. Medianoche y huso: la hora se compara siempre contra el día y la hora de **Bogotá**, no UTC (mismo origen que #753).
3. Entrega adelantada legítima (el cliente pidió que fueran antes) → por eso confirma con motivo en lugar de bloquear.
4. `entregadoAt` manipulado desde el dispositivo → el servidor lo registra como viene (precedente F1) y la marca queda en la auditoría; no es un control de seguridad.
5. Choque con el horario del negocio: «no antes de 06:00» en un negocio que abre a las 08:00 → solo aviso informativo al guardar; no se valida entre sí.
6. Reintentos y duplicados offline: el evento usa el `offlineId` de la entrega (idempotente).

### Superficies a tocar (a confirmar en R3)
`schema.prisma` + migración; `ReprogramarPedidoUseCase` y su ruta; `pedido-reprogramar.tsx` (campo de hora opcional); `EntregarPedidoUseCase`/ruta de entrega y la pantalla de registrar entrega (aviso + motivo); `compromiso-chip.tsx` (mostrar «no antes de HH:MM»); consulta de Pedidos (campo en la fila); sincronización offline; OpenAPI.

### Decisiones pendientes del PO
- **P1:** ¿Campo nuevo (A, recomendado) o reutilizar `horaPreferida` (B)?
- **P2:** ¿Dónde se captura? Recomendado: en «Cambiar fecha prometida» (hora opcional junto a la fecha). Alternativa: también en la creación del pedido (hoy no captura fecha).
- **P3:** ¿Confirmar con motivo al entregar antes de hora (recomendado, según D1) o solo avisar sin pedir motivo?
- **P4:** ¿Aviso también cuando la entrega cae fuera del horario de atención del negocio (2a)? Recomendado: fuera de v1.

**Maquetas (escritorio y móvil, con confirmación, carga y error):** pendientes; no se producen hasta cerrar P1–P4.

### 8.1 Decisiones del PO sobre la fase 2b (18-nov-2026)
- **P1 — `DECISIÓN` (PO):** campo nuevo `Pedido.entregaNoAntesDe` (HH:MM, hora de Bogotá), no se reutiliza `horaPreferida`.
- **P2 — `DECISIÓN` (PO):** se captura **en las dos partes**: al crear el pedido (bloque «¿Para cuándo?» con «Hoy» / «Otro día», fecha prometida y «No entregar antes de») y al «Cambiar fecha prometida». «Hoy» no guarda fecha, así que quien no programa no nota cambios.
- **P3 — `DECISIÓN` (PO):** al entregar antes de la hora **solo avisa**, sin pedir motivo (reemplaza la propuesta «avisar y pedir motivo» de §8). Se mantiene la marca auditable «entregado antes de la hora acordada» y nunca se bloquea, tampoco sin conexión.
- **P4 — `DECISIÓN` (PO):** el aviso por horario de atención del negocio al entregar queda fuera de esta versión.
- **Maquetas:** `05-no-antes-de-escritorio` y `06-no-antes-de-movil` (`.html` y `.png`), **PENDIENTE DE APROBACIÓN**. Sin aprobación no hay código.

### 8.2 Corrección de diseño (18-nov-2026, a observación del PO)
La hora «no antes de» también aplica a **hoy** («hoy, no antes de las 16:00»). Regla: en «Hoy» la hora es opcional; sin hora no se guarda nada, con hora se guarda `fechaEntrega` = hoy (Bogotá) + `entregaNoAntesDe`. Si la hora ya pasó, se avisa («no restringe la entrega») y se permite guardar. Maquetas 05 y 06 actualizadas, **PENDIENTE DE APROBACIÓN**.

### 8.3 Cambio de diseño por decisión del PO (18-nov-2026): la hora ordena y agrupa, no avisa
- **`DECISIÓN` (PO):** se **elimina el aviso al entregar** (reemplaza P3). La hora acordada (`Pedido.entregaNoAntesDe`, campo nuevo, P1) solo sirve para **ordenar y agrupar**; registrar la entrega no pide nada extra. La entrega conserva, sin mostrarlo, la hora real junto a la acordada.
- **`DECISIÓN` (PO):** franjas por tiempo restante, con el reloj de Bogotá: **«Ya toca»** (hora llegada o faltan ≤ 1 h, primero, por hora), **«Normales»** (sin hora, y con hora entre 1 h y 3 h, estos últimos ordenados por hora, así suben solos) y **«Más tarde hoy»** (faltan > 3 h, al final, plegado, con la hora visible). Nunca se oculta un pedido. Los límites son constantes fáciles de cambiar.
- **`DECISIÓN` (PO):** alcance **A + B + C**: armar embarque, ruta del repartidor (sobre el orden geográfico guardado, moviendo solo los pedidos con hora) y la vista «Para hoy» de la lista de oficina. La lista general paginada no cambia.
- **Sin ruido:** el bloque de crear pedido queda cerrado como enlace «＋ Programar entrega (fecha u hora)»; sin hora no aparece ninguna franja.
- **Riesgos anotados:** el orden de ruta es geográfico (`Embarque.ordenVisita`, heurístico NN+2-opt); mover pedidos con hora puede alargar tramos y no se optimiza con ventanas de tiempo (fuera de alcance). El orden depende del reloj: se calcula con una función pura que recibe la hora (probable con reloj inyectado), se refresca cada minuto y no reordena mientras hay un diálogo abierto. `NO VERIFICADO`: refresco de la ruta del repartidor al agregar un pedido; se comprueba en R3.
- **Maquetas 05 y 06 rehechas** (`.html` y `.png`): la lista «Para hoy» en tres momentos del día, armar embarque, ruta del repartidor, crear/cambiar sin ruido y detalle. **PENDIENTE DE APROBACIÓN.**
