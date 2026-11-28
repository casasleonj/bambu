# #1010 F2B.2B.1 — ensayo de ventanas de corte

## Estado y alcance
Continuación del diagnóstico no liquidable #1031. Base bf539c38181f81d73ef437d4c413c8e6cf34e43b. Regla PO vigente: cambios normales desde el siguiente día Bogotá (comentario 7162861077). El corte real sigue PENDIENTE de aprobación. Este slice únicamente permite ensayar una fecha sintética explícita, separar el segmento previo y dividir el posterior en ventanas inclusivas de hasta 31 jornadas, límite existente de F2B.2A. No calcula dinero, no se conecta a rutas, no persiste flags ni altera la liquidación. El límite de 31 no es una restricción comercial de nómina. El helper se usa exclusivamente en pruebas; no se afirma que concatenar ventanas certifique el período completo.

## Inventario XMOD: comprobaciones directas en main
| Consumidor | Contrato actual / trabajo pendiente |
| --- | --- |
| src/lib/comision-repartidor.ts | comisionDeEmbarque, calcularComisionRepartidor, comisionRepartidoresDelDia; tarifa y elegibilidad actuales; fuentes ya separadas por #1031. |
| src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts | comisionDeEmbarque L320, incluido dryRun, devuelve comisionDetalle; CierrePresenter la propaga. Preservar preview y cierre real equivalentes. |
| src/lib/comision-pagada.ts | comisionDiaConEstado une pagos REPARTO y filas activas; trabajador desactivado sin pago puede quedar fuera; distinguir devengo y pago. |
| src/lib/cierre-resumen.ts y src/app/api/cierre/route.ts | comisionesDelCierre; snapshot de lectura RepeatableRead y guardado Serializable; preservar cierres guardados. |
| src/app/api/nomina/dia/route.ts y dia/pagar/route.ts | GET usa prisma directo; POST Serializable, idempotencia y evidencia F2A. La lectura y escritura deben coincidir sin confundir ausencia de evidencia con cero. |
| src/app/api/nomina/route.ts | AUTO usa elegibilidad actual y una tarifa por período, descuenta pagos previos y controla cobertura. No cambiar salario fijo/deudas por este alcance. |
| src/lib/nomina-historial-comisiones.ts | cálculo actual separado de evidencia F2A; no cambiar la evidencia histórica. |
| src/lib/comision-evidencia.ts | V1 representa una jornada y tres tarifas; preservar el lector y snapshots; no usar tarifa promedio para periodos mixtos. |
| src/app/api/produccion/route.ts, [id]/route.ts, preview/route.ts | POST guarda comRepartTotal con entregas de embarques agua/hielo por tarifa actual; PUT recalcula sellador con tarifa actual; preview lee tarifas actuales. No equiparar con devengo de reparto hasta clasificar todos los consumidores y coordinar #630/#645. |
| src/lib/comisiones.ts, cierre-resumen.ts | cálculo auxiliar de reparto por promedio y agregado de producción; verificar usos y semántica antes de retirar o adaptar. |

Inventario parcial, no exhaustivo: faltan búsqueda efectiva de símbolos en todos los clientes, jobs, exportaciones y pruebas; búsqueda GitHub del conector no devolvió resultados. No se han validado regresiones de UI ni producción.

## Escenarios y gates restantes
- Ventanas sin huecos ni solapamientos; corte inclusivo, año bisiesto, rango enteramente anterior/posterior, fecha inválida. Pruebas del helper.
- Antes de usar las ventanas: conciliar por identidad de fuente y cantidades por producto contra el período completo, dentro de una única transacción snapshot; no sumar candidatos parciales ni mezclar elegibilidad actual con histórica. Diseñar límites de costo/timeout antes de exposición real.
- Un período que cruza corte no debe publicar saldo pagable hasta conciliar el segmento previo; una fecha de activación no prueba tarifa antigua. Mantener pagos y cierres ya guardados, incluidas reversiones y ajustes. No sobrescribir evidencia.
- Fallback general solo para producto con actividad es propuesta pendiente de resolver junto con el contrato de tarifas no usadas; no presentar una tarifa inventada para un producto sin actividad.
- Revisar evidencia V1, desglose multi-jornada, lectura de inactivos, medio/fecha de desembolso, conciliación, sobrepagos, offline, permisos, reintentos y consistencia Cierre/Nómina/Embarques; UI requiere maquetas aprobadas.
- Fecha de corte real y tratamiento de saldos previos sin conciliar requieren PO; no activa dinero este PR. No migraciones, datos reales ni cambios de API/UI.

## Evidencia
Se compiló el helper aislado con tsc --strict y se ejecutaron 9 comprobaciones Node assert usando una copia del parser canónico de dates.ts; no equivale a typecheck ni Vitest completos del repositorio. Tests Vitest añadidos, pendientes de CI. Sin flujo de usuario nuevo: QA navegador no aplica al helper aislado; no exime QA de futuras fases monetarias.
