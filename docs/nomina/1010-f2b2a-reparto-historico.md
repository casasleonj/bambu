# #1010 F2B.2A — diagnóstico histórico de reparto

## Decisión aprobada y alcance

El PO aprobó vigencia normal desde el siguiente día calendario Bogotá (comentario 7162861077). F2B.1 certificada en producción: PR #1019, main 161d094, CI 45692342687, migrate-deploy 45692342626 y migration gate 45692342752 verdes. F2B.2A prepara valoración de reparto **no liquidable**; ningún consumidor monetario nuevo, API, pantalla, flag de activación, migración o escritura productiva.

## Contrato de la fase

- Reutilizar las fuentes canónicas de comision-repartidor.ts (#499/#669). Embarques siguen su jornada Embarque.fecha; sin embarque se usa el hecho de entrega. No reasignar una misión cruzada por fecha de captura o de cierre; cambiar atribución física sería otra decisión con impacto en Cierre, Embarques y Nómina.
- Leer por jornadas civiles Bogotá, hasta 31 días; preservar identificadores de fuente. Conciliar el conjunto por identidad (origen,id) y cantidades por producto contra la lectura canónica del período completo. Un parcial del mismo pedido en dos jornadas no es duplicado: sumar los deltas de ambas. Cualquier revisión de fuentes o diferencia bloquea el total candidato.
- Resolver la versión del trabajador por jornada y la elegibilidad configurada entonces (COMISION/MIXTO y moto; sin inventar histórico de activo). Valorar por producto con el mismo calcularPorFuentes y tarifasRepartidor. Fallback general agua/hielo solo si tarifa individual cero; botellón conserva fallback 200 (#500). Configuración general ausente observada es distinta de falta de evidencia. No interpretar cadenas monetarias dañadas ni extrapolar versión a fecha anterior. Enteros/centavos, no promedio de tarifas.
- Devuelve desglose diario con IDs de versión, estado y cálculo cuando procede. Si alguna jornada con actividad no tiene evidencia suficiente o requiere conciliación, no devuelve total candidato. Días sin actividad no crean obligación de pago. NO_ELEGIBLE es diagnóstico, no orden de descontar a nadie. La salida siempre dice DIAGNOSTICO_NO_LIQUIDABLE y liquidable=false. No se presenta la suma candidata como saldo pendiente ni pago real.
- La función de lectura solo se debe invocar dentro de snapshot RepeatableRead o superior, como prueba sintética. Límite de 31 jornadas y 10000 versiones; no ruta de producción ni coste de consultas en operación normal. No es un contrato de UI ni de nómina definitiva.

## Casos adversariales

100×300 + 50×330 = 46500, no 150×330 = 49500. Mismo pedido parcial en dos días, cambio general, tarifa botellón, modalidad fija posterior, centavos, legado sin evidencia, configuración malformada, identidad de fuentes distinta aun si suman igual, revisiones y períodos inválidos. Prueba de integración con dos entregas reales por handler de oficina y fixtures sintéticos de versiones. La suite anterior de reparto debe conservar sus resultados.

## Antes de activar F2B.2B

PENDIENTES, no decisiones inventadas:

1. Definir/validar corte operativo a partir del cual las vigencias se usan realmente para liquidar. El diario desde F2B.1 registra configuración prospectiva, no certifica cálculo anterior. No repricing de pagos existentes (F2A), cierre guardado, nóminas existentes ni días anteriores al corte; reconciliar pendientes y divergencias explícitamente.
2. Inventariar y migrar conjuntamente todos los consumidores: comisionDeEmbarque (incluyendo dry-run y cierre), comisionRepartidoresDelDia, comisionDiaConEstado, POST /api/nomina/dia/pagar, POST /api/nomina AUTO, historial de comisiones, producción/preview y otros lectores de tarifa. El modelo singular ComisionRepartidor.tarifas no representa períodos mixtos; no falsear una tarifa promedio. Conservar separación día de trabajo, desembolso y captura, no restar dos veces un pago.
3. Revisar misiones de fecha comercial distinta a fecha física y transacciones que cruzan medianoche, tramos con parciales/regalos/venta libre, cambios de rol y baja, reversiones, sobrepagos y ajustes. No activar por partes un cálculo nuevo que muestre un saldo en Cierre y otro en Nómina. Reutilizar #630/#645 para producción, no recalcular importes guardados.
4. Optimizar lectura masiva por fechas si es necesario, comprobar coste y concurrencia en entorno aislado, diseñar QA de activación con aprobación correspondiente. Sin habilitación ni corrección histórica automática.

## Verificación

Pruebas añadidas; solo el CI del SHA final confirma resultados. No se declara QA visual nuevo: no cambia UI ni existe flujo de usuario para el diagnóstico. Validar regresión E2E de flujos existentes; no hay modificación productiva.
