# #668 · Primera entrega: consultar y corregir producción por fecha

Base: main 707952acd5d4775eeb55f66683a3f2b37b6c4915, después de integrar #667.
Estado: implementación en rama; validación incompleta, no apta para integrar ni desplegar todavía.

## Problema y alcance

El cierre anterior puede capturarse después de la producción. El snapshot inicial queda antiguo y el preview suma producción previa al número que la pantalla llama inicial. Además, «Ver y corregir» del cierre llevaba a producción de hoy, sin conservar la fecha del registro.

El PO confirmó inicial del 2026-11-05 de agua 138, hielo 3 y botellones 0; coincide con el cierre del 2026-11-04. También aclaró que las 500 de agua registradas son un error de captura y deben poder editarse; no confirmó la cantidad correcta. No cambiar esa cantidad por una suposición ni usarla como producción real confirmada.

El PO aprobó explícitamente la maqueta de escritorio/móvil para selector de fecha, edición del registro existente, estados de error/carga/cerrado e inicial separado. No se amplían permisos: solo ADMIN edita y el servidor conserva el límite de siete días y la prohibición de editar días cerrados.

## Implementación

- Resolver stock inicial siempre antes de la fecha comercial consultada, incluido el caso predeterminado de hoy.
- Resumen de cierre usa el inicial vigente por fecha, no el snapshot antiguo de la primera producción.
- Preview añade stockInicialDia; conserva los campos planos acumulados para compatibilidad con clientes anteriores y con registros adicionales del mismo día.
- Producción acepta fecha de consulta, muestra estado editable/cerrado y normaliza solo la respuesta de días abiertos. GET no escribe ni cambia comisiones.
- Selector de fecha y enlace desde cierre mantienen la fecha; edición conserva identidad del registro y muestra su fecha. No se crea otra producción para corregir la anterior.
- PUT recalcula su inicial desde el cierre anterior y producciones anteriores en orden estable, preserva conteos físicos y usa tarifa histórica inferida de cantidad/comisión originales cuando existían unidades. Para pasar de cero a unidades nuevas usa tarifa actual; no inventar una tarifa histórica ausente.
- Cambios de observaciones, pérdidas o stock no revalorizan la comisión cuando la cantidad no cambia. Una corrección real de cantidad sí cambia devengado; nunca modifica pagos existentes.
- La auditoría de PUT pasa a la misma transacción; no guardar una corrección sin su historial.

## Validación ejecutada

1. Regresiones de fechas contra main sin corrección: cinco fallos y un caso correcto, reproduciendo ausencia de inicial separado y consulta predeterminada sin corte de fecha.
2. Las mismas seis comprobaciones con corrección: seis correctas en Vitest 3.2.4.
3. Grupo de interfaz y pruebas existentes: 34 de 36 correctas. Los dos fallos fueron aserciones: el enlace ahora conserva fecha, y el número 3 coincide también con un paso del asistente. Ambas aserciones quedaron actualizadas, pero falta repetir el grupo.
4. next typegen terminó correctamente en un intento. Typecheck completo no terminó por agotamiento de recursos del entorno; no se considera aprobado.
5. Verificación local con Node 24: 13 archivos TS analizados sintácticamente y seis casos del cálculo de comisión correctos. No sustituye TypeScript, React ni PostgreSQL.
6. git diff --check correcto después de normalizar finales de archivo.

Bloqueo de infraestructura: el entorno local tiene el proxy inalcanzable; el remoto se reinició por recursos durante instalación/validación y después devolvió bloqueo HTTP 403. No se insiste sobre el bloqueo ni se considera que los checks pasaron.

## Pendiente antes de abrir PR

- Repetir unitarias incluidas, grupo de interfaz y suite completa; lint y typecheck.
- Ejecutar produccion-correccion-668.test.ts con PostgreSQL aislado y las integraciones #645/#618 de producción, cierre y comisiones.
- E2E de seleccionar fecha desde cierre, abrir edición, guardar corrección y verificar misma identidad y fecha; móvil/escritorio, día cerrado, permiso insuficiente, fallos de red y respuestas tardías.
- Comparar E2E contra baseline de main y resolver regresiones nuevas.
- Rebase sobre main más reciente y repetir validaciones antes de abrir PR, según AGENTS.md. Sin cambios a main ni despliegue.

## Fuera de esta entrega

Siguen en el plan: stock disponible para embarques (pérdidas/devoluciones/doble suma), validación de stock del cierre desde servidor, coordinación concurrente entre cierre y producción, recuperaciones y merma diferenciadas, historial por rango y conciliación explícita de pagos excedentes. No afirmar que #668 completo queda resuelto con este primer cambio.

La recuperación no genera comisión nueva, según regla del PO. Este cambio no implementa todavía el circuito de recuperación.
