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
