# Tipo de pago y habilitación de reparto (#671)

Decisión del PO, 2026-11-06 (tercer listado, punto 3): debe poder cambiarse el tipo salarial aunque «Usa moto» esté desactivado por otro motivo. Esto corrige la coerción introducida en `24002e26`; no redefine quién hizo una entrega.

- SELLADOR y REPARTIDOR conservan el tipo elegido: FIJO, COMISION o MIXTO, con o sin moto. ADMIN/CONTADOR conservan la restricción de fijo.
- «Usa moto» conserva sus efectos existentes sobre capacidad y comisiones de reparto. Cambiar el tipo salarial no activa ese indicador ni atribuye entregas. Un sellador sin moto puede comisionar por producción.
- La presentación del formulario y sus controles son los existentes. Desmarcar moto conserva el tipo seleccionado.
- Un PUT parcial se combina con el registro persistido después de bloquear esa fila. Un cambio de contacto no normaliza configuración salarial anterior. Un fragmento del plan se valida con la frecuencia/días existentes.
- Alta y actualización guardan su auditoría en la misma transacción: actor, antes/después, tarifas, modalidad, plan y fecha de cambio. Un fallo de auditoría revierte la operación. Solo ADMIN puede mutar.
- Una nueva liquidación AUTO de tipo COMISION no suma un sueldo fijo residual que hubiera quedado configurado. FIJO/MIXTO conservan las reglas de sueldo y frecuencia.
- No se actualizan nóminas, pagos, producciones ni cierres guardados. No se cambian automáticamente trabajadores de producción.

## Vigencia y límites

El cambio de configuración rige desde su guardado y queda fechado en Historial. Una frecuencia realmente distinta reinicia `frecuenciaDesde`; reenviar la misma no la reinicia. Las nuevas liquidaciones se calculan con la configuración vigente al crearlas, también si abarcan períodos anteriores todavía no liquidados. No existe en esta fase una tabla de contratos salariales por intervalos: no se inventan tarifas o modalidades históricas. Las liquidaciones ya consolidadas conservan sus importes.

## Verificación

`integration/trabajadores-tipo-pago-671.test.ts` usa PostgreSQL aislado y handlers reales: altas y cambios sin moto, omisión de campos, planes parciales, concurrencia, permisos, error de auditoría con rollback, liquidación consolidada intacta y sueldo residual excluido. `e2e/trabajadores-tipo-pago-671.spec.ts` comprueba crear, editar, activar/desactivar moto, guardar y recargar con el formulario existente.

Los ejemplos y nombres de pruebas son sintéticos; los registros privados investigados no se publican.
