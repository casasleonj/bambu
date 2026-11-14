# Agua Bambú · JL COMPLETO / LOTE · Bloque financiero, 10–11 nov 2026

**Estado: INVESTIGACIÓN / PLAN PARA APROBACIÓN. NO IMPLEMENTADO.**  
**Baseline técnico leído:** `main@c093210c30acb9c3ff2f839d1e410063d0bea08a` (11-nov-2026).  
**Skill:** `.agents/skills/jl/SKILL.md` v2.13.0 · `AGENTS.md` y reglas locales de `src/lib`, `src/modules`, `src/app/api`.  
**Autoridad de producto:** Contexto Maestro v1.1 accesible en archivo privado del Proyecto; reglas aprobadas en #402, #617, #688, ADR de Cierre y contratos de conciliación #513/#524/#631. **No incluir dicho archivo privado ni información operacional identificable en repositorio público.**

> Esta rama documenta investigación y convergencia, no autoriza código, alteración de producción ni merge. El modo JL COMPLETO exige aprobación expresa del plan/fases y, para cambios visuales, maquetas de escritorio/móvil aprobadas. No se ejecutaron pruebas, navegador ni escritura en base de datos durante esta investigación. No declarar P0 como impacto observado cuando el issue documenta únicamente riesgo estático.

## 1. Alcance estricto y trazabilidad: 12/12 issues financieros abiertos

| ID | Área | Evidencia leída en main | Fase propuesta | Estado |
|---|---|---|---|---|
| #746 | Rango de fechas | `dateRangeForDay` combina `lt` con 23:59:59.999, excluyendo último ms | F1 | diagnóstico estático |
| #753 | Fecha de gasto | `new Date('YYYY-MM-DD')` en `POST /api/gastos` se interpreta UTC | F1 | diagnóstico estático |
| #752 | Días sin cierre | SQL `UNION ALL` omite Abono, ingresos/devoluciones de crédito, comisiones pagadas | F1 | diagnóstico estático |
| #750 | Fiados retrofechados | `ocurridoAt` se conserva, caja usa `createdAt`, de acuerdo con #402/#617 | F1 / decisión PO | conflicto de expectativa |
| #745 | BONO | `leerCobrosPeriodo` lo excluye como dinero nuevo; `cierre-resumen` lo suma | F2 | diagnóstico estático |
| #749 | Origen × medio | `desglosarCobros` infiere venta/fiado solo de fecha del pedido; abonos sin matriz de medios | F2 | diagnóstico estático |
| #747 | Reporte Ventas | Page/API repiten agregados y agrupan pagos por fecha de pedido | F2 | diagnóstico estático |
| #748 | Base diaria | Dashboard usa `BASE_DIA` global como fallback, Cierre exige `BASE_DIA_<fecha>` | F3 | diagnóstico estático |
| #751 | Cambio de jornada | Dashboard y Cierre no demuestran transición automática de pestaña abierta | F3 / maqueta | hipótesis pendiente E2E |
| #756 | Stock multijornada | Dashboard toma último cierre sin ancla de fecha y aplica solo movimientos de hoy | F4 / maqueta | diagnóstico estático |
| #755 | Gastos | No hay ruta de corrección/anulación; `Gasto` carece de medio; arqueo resta todos los gastos como efectivo | F5 / maqueta y política | diagnóstico estático |
| #758 | Facturas consolidadas | Enlace no conserva estado; endpoint excluye anuladas; rol de lista y resumen difiere | F5 / maqueta | diagnóstico estático |

**Regresión de control:** #763 ya cerrado; comprobar la separación de pedido creado D-1, entrega física D y cobro D, sin reabrirlo por defecto.  
**Precedentes no duplicables:** #306 (gate de días), #402/#617 (tres fechas), #513 (Pago+Abono espejo), #524 (saldo a favor), #631 (desglose previo), #650 (entregas por fecha), #656 (deuda parcial, abierto), #668/#740 (stock/snapshots), #672 (reversión excepcional), #673 (índice del tercer lote), #688 (base obligatoria). No declarar cerrados sus alcances extendidos por inferencia.

## 2. JL R1→R2, tres iteraciones trazables (solo investigación)

### Iteración 1: recuperar el problema y las fuentes
- **R1:** Contexto Maestro: separar venta, cobro, efectivo, crédito, gasto, nómina causada/pagada, stock y diferencia; preservar previsualización, mínima digitación y auditoría. Estado técnico del SHA indicado. Backlog y decisiones #402/#617/#688/#631.
- **R2:** hallazgo: al menos cinco contratos de fecha o dinero no son equivalentes (fecha del pedido, fecha física de entrega, fecha efectiva del cobro, fecha de captura y período del cierre). Reutilizar los lectores `leerCobrosPeriodo`, `resumirAbonosDelDia`, `leerExigibles`, `unidadesEntregadasDelDia` y `resolverStockInicial`, condicionados a comparar sus contratos exactos.
- **Corrección a la hipótesis inicial:** no basta cambiar etiquetas ni sumar de nuevo dinero registrado: existen BONO, abonos espejo, ajustes y sobregiros a saldo a favor.

### Iteración 2: refutación adversarial y XMOD
- **R1:** trazar escritor → registro → lector → Cierre → Dashboard → Reportes → Facturas → siguiente jornada → historial/reversión. Verificar validadores, schema, caja y rutas principales.
- **R2:** descartar cuatro «arreglos» tentadores: (a) trasladar `Pago.createdAt` al día efectivo, porque viola #402 y snapshots; (b) contar `BONO` como transferencia/digital, porque es consumo de crédito y puede duplicar ingreso; (c) hacer `lastCierre + movimientosDeHoy`, porque omite días intermedios y puede recontar cierre del mismo día; (d) borrar/editar silenciosamente Gasto en período cerrado, porque rompe auditoría.
- **Escenarios añadidos:** ingreso de crédito A y consumo B; sábado cobrado/lunes registrado con sábado cerrado/abierto; día sin otros hechos pero con solo abono o comisión; gasto digital que no baja efectivo; cierre de hoy y varios días sin cierre.

### Iteración 3: síntesis, precedentes y pruebas para no repetir la rueda
- **R1:** comparar con documentación oficial de ERPNext (cobro ≠ asignación posterior a factura/anticipo), Microsoft Dynamics 365 Finance (reversiones en períodos abiertos, ajustes cuando períodos cerrados) y PostgreSQL (timestamp/zonas); son **patrones de referencia, no decisiones de Bambú**.
  - https://docs.frappe.io/erpnext/payment-entry
  - https://docs.frappe.io/erpnext/payment-reconciliation
  - https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/finance/general-ledger/cant-reverse-transactions
  - https://www.postgresql.org/docs/current/datatype-datetime.html
- **R2:** convergencia **CONDICIONADA**: corregir fuentes comunes y mantener doble dimensión temporal, sin migración/borrado histórico automático. Dos decisiones nuevas siguen pendientes (#750, #755) y varios cambios de experiencia requieren maquetas/aprobación. No equiparar métricas de periodos/estados distintos. Las pruebas planificadas aún no se han ejecutado.

## 3. Invariantes y contratos propuestos (a ratificar con decisiones vigentes)

- **M-01:** un hecho económico con ID/identidad de operación se cuenta una sola vez en `dineroNuevo` por período contable. `Abono ESPEJO_PAGO` es proyección de Pago, no segunda entrada.
- **M-02:** `BONO` aplicado reduce crédito disponible y deuda; no aumenta billetes, banco, Nequi, Daviplata o dinero recién recibido.
- **M-03:** sobrante ingresado a `IngresoSaldoFavor` aumenta dinero en su medio una vez cuando se recibió; aplicación posterior de ese crédito no es nuevo cobro.
- **M-04:** `fechaPedido`, `fechaEntrega`, `ocurridoAt`, `createdAt` y `fechaContable` describen dimensiones diferentes. **Decisión vigente #402:** Cierre cuenta por captura, sin reescribir histórico; modificaciones mediante regularización autorizada.
- **M-05:** `efectivoEsperado` solo suma entradas efectivas de efectivo y resta **salidas físicamente en efectivo** más base del día. No restar una salida digital de monedas/billetes. Dado que `Gasto` no guarda medio, la política para legados es PENDIENTE; no adivinarlo.
- **M-06:** una base diaria ausente es `SIN_BASE`, no un importe histórico asumido; no falsear `0` como confirmado. Cierre conserva el gate #688.
- **M-07:** intervalos de consulta de hechos temporales nuevos `[inicioBogotá, inicioDíaSiguienteBogotá)`; mantener interfaces legadas que exijan límite inclusivo mediante adaptador explícito.
- **M-08:** stock físico comprobado ≠ stock teórico ≠ stock de último cierre. En ausencia de trazas completas, resultado `POR_CONCILIAR`, no precisión inventada.
- **M-09:** períodos cerrados son snapshots históricos; una corrección posterior exige rastro, reversión/ajuste y permisos aprobados, nunca eliminación física ni cambio retroactivo silencioso.
- **M-10:** no mezclar comisiones pagadas con devengadas ni registrarlas como gasto manual duplicado; conservar bloque de categoría NOMINA de #641.
- **M-11:** reportes por pedido/entrega/cobro solo deben coincidir con el Cierre cuando comparten **métrica, fuente, estado, fecha, zona y filtro**.
- **M-12:** no inferir «pago de fiado» solo porque la fecha del pedido es anterior; sin prueba de origen, `POR_CONCILIAR`.

## 4. ESC-2 · Mapa visible del trabajo cotidiano (casos sintéticos, no datos reales)

| ESC | Antes / acción / después esperado | Pantallas y módulos | Aceptación |
|---|---|---|---|
| ESC-01 | El lunes ingresa $20.000 como crédito; el miércoles cliente aplica $8.000 BONO. Cierre de miércoles muestra crédito consumido, **$0 de dinero nuevo por ese BONO**. | saldo favor, pedido, Cierre, Dashboard, Reporte | no doble cobro |
| ESC-02 | Pedido lunes, 5 pacas entregadas lunes y otras 5 martes, cobra $10.000 martes. Cada día conserva su entrega y el dinero solo aparece en día de su captura. | pedidos, entregas, fiados, reportes, cierre, stock | sin doble unidades/importe |
| ESC-03 | Admin anota lunes un fiado realmente cobrado el sábado. Se conservan **sábado hecho** y **lunes captura**; sábado cerrado requiere regularización específica, no movimiento silencioso. | fiados, pago, auditoría, reporte, cierre | historia estable |
| ESC-04 | Lunes sin pedidos pero con Abono independiente $12.000; se intenta cerrar martes sin lunes. El gate debe identificar lunes con operación. | abonos, días pendientes, cierre | bloqueo correcto |
| ESC-05 | Caja base ayer $50.000; hoy aún no se registró base. Dashboard no hereda $50.000; Cierre exige registro. | dashboard, configuración, cierre | misma fuente |
| ESC-06 | Se registra gasto digital de $35.000. No disminuye efectivo físico; sí modifica egreso total según naturaleza aprobada. | gastos, caja, dashboard, reportes | ningún egreso doble |
| ESC-07 | Admin corrige un gasto del día abierto. Recalcula consumidores; tras cerrar un día, solo ajuste/reversión con motivo, autor y rastro. | gastos, cierre, auditoría | sin borrado |
| ESC-08 | Último cierre agua 100; día siguiente +20 producción, −10 entrega; otro día −5; hoy −3. Stock teórico = 102 si no hay otros eventos; advertir si faltan hechos. | producción, embarques, dashboard, cierre | multijornada |
| ESC-09 | A las 00:00 una pestaña Dashboard abierta cambia de jornada y actualiza flujos, **sin perder** stock/cartera de arrastre. Fecha histórica fijada por usuario no cambia. | dashboard, cierre, caché, offline | sin arrastre de ventas/cobros |
| ESC-10 | Estado de Facturas «Anuladas» → «Ver resumen» conserva filtro en navegación, API e impresión; muestra importes anulados como históricos, no activos. | facturas, resumen, PDF/impresión | totales por filas |
| ESC-11 | Pago mixto EFECTIVO + NEQUI y abono independiente. Origen × medio separa filas, conserva sumas; BONO aparece como crédito. | cobranza, cierre, dashboard | conciliación por dimensiones |
| ESC-12 | Reintento offline de pago/gasto, concurrente con cierre. Identidad idempotente, permisos y versión previenen duplicación; error HTTP no se interpreta como éxito. | API, colas, cierre, logs | 1 hecho económico |
| ESC-13 | Fecha 23:59:59.999 Bogotá y siguiente 00:00 entran en fechas distintas con `gte/lt`, incluyendo fin de año. | todos lectores temporales | no pérdida al borde |
| ESC-14 | Gasto previo al cierre se anula posteriormente; se conserva original y ajuste con vínculo, no se reescribe snapshot. | gasto, auditoría, reportes | rastro y reversibilidad |

**No quiere/preservar:** no alterar el Contexto Maestro; no crear una nueva UI completa; no borrar pagos/gastos/cierres; no inventar métodos de pago históricos ni evidencia de entrega; no modificar decisión #402 sin aprobación; no duplicar lectores; no mover caja por el mero cambio de fecha efectiva.  
**Fuera de alcance:** #754 proveedores, #757 barrios, #759 duplicación de clientes, #760 sesiones, #761 notificaciones, cambios de producción no relacionados y la reconstrucción automática de datos históricos. #763 solo como regresión de entrega física.

## 5. Implementación por PR separado, condicionada a gates

**F0, caracterización y pruebas previas** (sin cambio de reglas): documentar contract tests y matrices de métricas/días; preparar fixtures sintéticos PostgreSQL. Verificar `main` actualizado y consumers reales. No declarar pruebas rojas antes de ejecutarlas.

**F1, fecha y calendario (#746/#753/#752):** consolidar constructor semiabierto para queries; validar `YYYY-MM-DD` y timestamps con offset y error 4xx; evaluar y completar catálogo de eventos que vuelven una jornada obligatoria; preservando conteo semántico único y regularizaciones. #750 permanece en contrato aprobado #402 hasta resolución explícita. Sin cambios visuales: puede ser primera fase tras aprobación del plan.

**F2, cobros y fuentes únicas (#745/#749/#747):** un read-model compartido, preferentemente evolución compatible de `leerCobrosPeriodo`, que exponga dinero nuevo, crédito aplicado, correcciones, origen verificable, método y fecha/corte; Dashboard, Cierre y Reporte usan proyecciones de él sin cambiar métricas comercial vs física. `resumirAbonosDelDia` y `clasificarCobroCartera` se reutilizan; no forzar todas las métricas a un solo total. Maquetas si cambian etiquetas, desglose, selección o impresión.

**F3, base y rollover (#748/#751):** Dashboard usa únicamente la clave diaria aprobada #688 y representa explícitamente `SIN_BASE`; Cierre y Dashboard detectan cambio de día Bogotá y refetch seguro al foco/visibilidad/reconexión; preservar fecha histórica seleccionada y diferenciar error HTTP de 0 real. Requiere maquetas para estados nuevos.

**F4, stock multijornada (#756):** ancla de cierre estrictamente anterior al corte; agregar movimientos físicos netos por fecha desde esa ancla hasta corte, con reempaque/filtradas/cambios/devoluciones según registro canónico; no duplicar producción ni salida con cierres de mismo día. Advertencia no confirmado, último cierre y días faltantes. Coordinar #668/#740/#630. Requiere maqueta.

**F5, gastos y facturas (#755/#758):** un flujo canónico de consulta/corrección/anulación por ID, auditoría y permisos server-side, medio de egreso y contraparte trazable (esquema/migración aditiva solo si autorizada). La gestión de gasto en Cierre reutiliza el mismo formulario/acción. Facturas conserva estado y filtros en enlace/API/impresión y distingue anuladas históricas de totales activos. No abrir roles existentes sin decisión. Requiere maquetas, aprobación de política, migración/QA si procede.

**F6, validación transversal:** reconciliar capturas reales en entorno no productivo, sin exponer datos; replay offline/idempotencia/locks; pruebas y E2E escritorio/móvil, comparar baseline main por firma; CI con Typecheck+Tests, Lint, integración PostgreSQL, 8 shards pertinentes, QA visual real con navegador y revisión humana. PRs separados; esperar aprobación explícita antes de merge/despliegue y verificar postmerge.

## 6. Contratos de pruebas por fase (a implementar y ejecutar)

- **F1:** TZ=UTC/Bogotá, 2026-11-09 sin hora, 23:59:59.998/.999, 00:00 siguiente, fin de año, ISO offset y fecha inválida; día solo Abono, Ingreso/DevoluciónSaldoFavor, PagoComision (efectivo/digital), solo espejo, regularización, sin movimiento, cierre D+1.
- **F2:** BONO puro/mixto, ingreso crédito D1 y consumo D2, abono espejo e independiente, reversión, fiado parcial, pago posterior, confirmación REPORTADO/CONFIRMADO, importes Decimal/centavos, ventas y pedidos D-1 con entregas D, reportes coincidentes solo para igual semántica.
- **F3:** global BASE_DIA existe pero clave diaria no, base 0/valor/NaN/error de DB, cambio concurrente y 409, 23:59:59→00:00 con pestaña visible/oculta/reenfocada, offline, histórico fijado, fetch lento de jornada anterior.
- **F4:** 0/1/varios días sin cierre, cierre ayer/hoy, entregas parciales, producción y merma, reempaque y devolución, datos faltantes, cierres retroactivos, stock físico vs teórico.
- **F5:** permisos ADMIN/CONTADOR/ASISTENTE según política, gasto efectivo/digital/desconocido, día abierto/cerrado, ajuste repetido/concurrente, nómina manual 422, anulación doble; facturas emitida/parcial/pagada/anulada, todas y paginación, role 403, impresión con filtros.
- **Cada PR:** evidencia test rojo antes/test verde después cuando aplicable; Typecheck y lint reales; Postgres real descartable; QA de agente navegador no equivale a prueba humana. No se han ejecutado aquí.

## 7. Decisiones genuinamente pendientes y gates

1. **#750, atribución retroactiva:** decisión aprobada #402 mantiene caja por captura y reportes por hecho. Recomendación: preservar ese contrato y agregar conciliación/explicación dual, **sin mover caja a sábado**. Si PO quiere mover dinero contablemente, debe definir quién tenía el efectivo, qué hacer con sábado cerrado, regularización y qué decisión reemplaza #402.
2. **#755, egresos:** política y permisos para editar/solicitar anulación; medio de pago explícito en nuevos gastos, regla de legado sin medio, fechas de ajuste, cierre cerrado y reversión. No asumir todo efectivo ni convertir método desconocido a digital.
3. **UI/UX:** antes de cualquier código que cambie valores presentados o interacción, aprobar maquetas desktop/móvil de Cierre/Dashboard/Gastos/Facturas con vacío, carga, sin conciliar, confirmación y error. Preferir ajustes mínimos en componentes vigentes.
4. **Implementación:** aprobación explícita de este plan y fases. `JL COMPLETO` es intención de resultado, no aceptación automática de una política material nueva o permiso de merge.
5. **Producción:** migraciones (si las hay) y cualquier regularización/corrección de datos reales requieren control y autorización independientes.

## 8. Resultado y honestidad de evidencia

- **12/12 issues incluidos en investigación y plan. 0/12 corregidos por este PR.**
- **CI/tests/DB/QA ejecutados por este PR: 0.** No hay pruebas de impacto real en producción.
- **Convergencia:** CONDICIONADA, con contratos #402/#688 preservados; pendientes de aprobación enumerados.
- **Peligro de liberación prematura:** sería falso anunciar «Cierre arreglado» sin comprobar coincidencia semántica y conservación del histórico.
- **Siguiente gate:** revisión/aprobación del plan; maquetas necesarias; luego F1 con un PR de código propio, sus pruebas y autorización individual de merge.
