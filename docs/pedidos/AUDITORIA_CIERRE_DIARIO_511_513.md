# Cierre diario: ventas, cobros e identidad de abonos (#511 / #513)

Estado: implementación en validación. No implica migración de producción ni merge.

## Fuentes y alcance

- Requisitos: [#511](https://github.com/casasleonj/bambu/issues/511) y [#513](https://github.com/casasleonj/bambu/issues/513).
- Estado técnico de partida: `main` `443e0f356aa025ec4fe6c660b6c25bb9e9ac5b46` y PR [#519](https://github.com/casasleonj/bambu/pull/519), commit `409d7b095c47c4d02ef24bd9036ad5d2866a1741`.
- Decisión del PO, 2026-10-27: implementar la reparación y presentar maqueta antes de cambiar la interfaz. Maqueta de revisión, confirmación, resultado, error y conciliación aprobada explícitamente. Se usan cifras sintéticas.
- Se conserva la autoridad de los ADR monetarios y de concurrencia existentes. Este documento describe la reparación; no sustituye los originales ni añade otro backlog.

## Defectos verificados y alternativas descartadas

Un `Pago` y su `Abono` espejo representan un solo ingreso. Comparar pedido, método, importe y una ventana de cinco segundos puede descartar otro abono legítimo. Se descarta esa identificación temporal: el nuevo escritor guarda procedencia y relación explícitas en la misma transacción.

Una nota de crédito de un pedido anulado de esta fecha no vuelve a restarse de las ventas: ese pedido ya está excluido. Las notas emitidas hoy sobre ventas anteriores conservan su ajuste. Emitir una nota no prueba un reembolso de efectivo.

El navegador no es autoridad de los importes financieros guardados. Preview y POST comparten el resumen del servidor; POST lo recalcula dentro de la transacción del cierre. Solo los datos declarados (base, salarios, stock y cantidades físicas) proceden del cliente. El resultado visible se vuelve a consultar después de guardar.

## Identidad, legado y límites

- Nuevos abonos: `INDEPENDIENTE`, sin pago de origen; o `ESPEJO_PAGO`, con vínculo único al `Pago`. Un espejo no reaparece como ingreso si su pago pertenece a otra fecha o queda excluido.
- La migración añade columnas, índice único, FK y CHECK idempotentes. Conserva los registros anteriores sin clasificar; no hay backfill por similitud.
- Legado independiente: se acepta la evidencia del contrato anterior de `/api/abonos` (clave propia o creación auditada). Sin evidencia, GET y POST devuelven `409 COBROS_PENDIENTES_CONCILIACION`, con referencias e importes. Se bloquea únicamente la fecha afectada; no se asigna una identidad automáticamente.
- V17 detecta procedencia ausente o vínculo inconsistente; V18 compara los importes de snapshots nuevos, versión 2.1, contra las columnas canónicas. El verificador sigue siendo de solo lectura.
- No se reescriben cierres históricos. Los desgloses ausentes se indican como tales.
- **Pendiente de producto externo a esta fase: [#305](https://github.com/casasleonj/bambu/issues/305).** El neto operativo incluye medios digitales y egresos sin medio confirmado. No demuestra efectivo físico esperado. No se infiere una política para resolver esa brecha ni se declara resuelto el arqueo físico.
- #512 y #514–#517 siguen sus Issues y PR existentes. La siguiente fase espera la integración de esta, conforme a AGENTS.md.

## Interfaz y recuperación

La maqueta separa ventas netas, cobros, gastos y neto de movimientos; expone el cálculo y distingue el neto del conteo físico. La confirmación requiere revisión explícita. No se muestran ceros como si fueran cifras verificadas ante un error. El estado de conciliación no habilita confirmar ni ofrece emparejar automáticamente.

Un guard síncrono evita dos envíos del cierre. Tras perder la respuesta, se consulta el resultado antes de reenviar. Las consultas abandonadas no sustituyen la fecha activa; cambiar de fecha reinicia los datos declarados y el conteo.

## Verificación exigida

1. Typecheck, lint y suite unitaria completa.
2. PostgreSQL real: notas de la misma fecha y anteriores; espejo frente a abono independiente del mismo importe; correcciones; snapshot falsificado; último milisegundo de Bogotá; legado sin evidencia; espejo de otra fecha; V17/V18; auditoría y concurrencia del cierre.
3. Componentes: confirmación, cancelar sin enviar, doble clic, respuesta perdida, conciliación y consultas abandonadas. Estas pruebas no sustituyen E2E.
4. Navegador en escritorio y 390 px: lectura, confirmación, error/reintento, conciliación, resultado guardado y reporte. Contrastar pantalla, API y `CierreDia` con datos sintéticos.
5. Revisar CI y comparar los fallos E2E contra el mismo `main`; un fallo anterior no excusa otro nuevo.

La evidencia de cada ejecución y sus límites se registra en el PR #519. Una prueba que no pudo iniciar por acceso al entorno no cuenta como aprobada.

## Entrega y operación

Mantener el PR sin merge mientras falten verificaciones. Antes de desplegar, inspeccionar en modo lectura el volumen de legado sin procedencia: el código anterior puede seguir generándolo. Conciliar por evidencia verificable; cualquier herramienta de conciliación o backfill necesita una propuesta y aprobación propias.

Orden exigido por AGENTS.md: aprobación del PO para producción; aplicar la migración aditiva `20261027_abono_procedencia_pago` antes del merge; verificar columnas, restricciones y acceso; después merge aprobado, CI resuelto y comprobación de `main`. No deshacer la migración borrando columnas al revertir código. No se ejecuta ninguno de esos pasos de producción en esta implementación.
