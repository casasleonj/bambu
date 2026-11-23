# QA en navegador · PR (residuales de #634)

### QA en navegador

- Estado: PASÓ
- Fecha: 2026-11-23
- Entorno: local con datos sembrados a propósito (Postgres 17 en 127.0.0.1:5433, Next dev en http://localhost:3001)
- Herramienta: Chrome for Testing 157.0.8103.78 con Playwright core
- Rol: admin, login real por /login
- Escenario: historial de cobros **corrupto a propósito** (5 filas: 2 con `montoRecibido` ausente o no numérico, 2 con `referencia: null` y el mismo milisegundo)

## Qué se midió

| # | Comprobación | Resultado real |
|---|---|---|
| 1 | Resumen del desplegable cerrado con montos corruptos | «6 pagos · $ 69.000,50 · 2 sin monto legible» |
| 2 | ¿Aparece «NaN» en el resumen? | no |
| 3 | ¿Las filas ilegibles se declaran? | sí, «Registrado sin monto legible» |
| 4 | ¿Aparece «NaN» en el detalle? | no |
| 5 | Avisos de clave duplicada en consola de React | 0 |
| 6 | Filas renderizadas | 6 (5 sembradas + 1 del QA anterior que seguía en la base) |
| 7 | Abrir un resultado desde una fila | abre «Pago registrado» |

El total es correcto por dentro: 12.500 + 24.500,50 + 7.000 = 44.000,50 sumando las legibles del fixture, más los 12.500 y 12.500 de las dos filas heredadas del QA previo = 69.000,50. Las dos ilegibles quedan fuera de la suma y se anuncian aparte.

## Por qué este QA hacía falta

El defecto no se puede provocar desde la UI: `route.ts` siempre escribe un `number`. Sólo aparece con historial legado o manipulado, y eso es exactamente lo que se sembró en la base para verlo. Se verificó sobre datos reales leídos por la API, no sobre mocks.

## Capturas

- `qa634b-residuales.png` — desplegable abierto con el resumen y las filas ilegibles.
- `qa634b-resultado.png` — resultado abierto desde una fila.

Advertencia de método: en la corrida aparece superpuesto el modal «Base de Caja», que la app abre por su cuenta al entrar a Pedidos. Tapó parte de la captura del resultado; se comprobó por separado que el resultado sí abre (el `[role="dialog"]` con «Pago registrado» está presente detrás). No es un defecto de este cambio.

## Lo que NO cubre

- No es una prueba con personas.
- No se ejecutó contra preview ni producción.
- El historial corrupto es artificial: sirve para verificar el comportamiento defensivo, no para afirmar que existan tales filas en producción.
