# #783 · Avisos sin bloquear la siguiente operación

## Decisión y alcance

El PO aprobó el 15-11-2026 la maqueta de escritorio/móvil con confirmación,
carga y error: mover los avisos a la parte superior y añadir cierre explícito,
conservando tarjetas, botón «+», mensajes y acciones. También autorizó continuar
la investigación en esta conversación ante el error de autenticación de Codex CLI.
Esta excepción no acredita una revisión independiente ni una ejecución de ese CLI.

Fuente del defecto: <https://github.com/casasleonj/bambu/issues/783>.
Baseline de código consultado: `40038e5c`; cambios posteriores hasta `0c97ee43`
son documentación y eliminación de un archivo generado, sin cambios de producto.

## Investigación y refutación antes de implementar

1. **R1/R2: causa.** Sonner 2.0.7 usa `bottom-right` por defecto; el FAB usa
   `bottom-6 right-6`. La nueva regresión reprodujo en el build anterior que
   `elementFromPoint` sobre el centro del FAB pertenecía al aviso, no al botón.
   La pausa del temporizador al pasar el cursor conserva el bloqueo.
2. **R1/R2: alternativas.** Esperar, mover el cursor o forzar clic no corrige
   producto. Desactivar todas las interacciones rompería avisos con botones.
   Elevar ligeramente el aviso inferior podría tapar el menú desplegado; moverlo
   a la izquierda no basta en móvil. Se propone la posición superior nativa y
   cierre explícito, sin un sistema de notificaciones nuevo.
3. **R1/R2: límites.** Mensajes largos pueden cubrir temporalmente título o
   contenido superior; no se afirma ausencia universal de superposiciones.
   Conservar cierre accesible, pausa para leer, botones de acción, errores y
   avisos offline. La maqueta se verificó en ocho vistas antes de aprobación.

Fuentes consultadas el 14 y 15-11-2026: Context7
`/emilkowalski/sonner/v2.0.7`, documentación oficial versionada
<https://github.com/emilkowalski/sonner/blob/v2.0.7/website/src/pages/toaster.mdx>
y tipos/implementación/estilos de la versión instalada. Se contrastaron
`position`, `offset`, `mobileOffset`, `closeButton` y las etiquetas accesibles.
También se leyó la documentación instalada de layouts de Next.js 16.2.4.

## Cambio

`src/app/(app)/layout.tsx` configura el Toaster existente arriba y centrado,
separado 72 px del borde, con cierre «Cerrar aviso» y región «Avisos».
Se conservan duraciones, mensajes, acciones y pausa al leer.
No cambia cálculos, permisos, pagos, pedidos ni esquema.

Los E2E de G9 y de reintento de precio dejan de esperar artificialmente que
desaparezcan todos los avisos. La nueva regresión comprueba acciones reales
mientras el aviso sigue presente, cantidades conservadas, reintento, cierre
por teclado y recarga. No usa force-click ni elimina elementos del DOM.

## Evidencia local

- Antes del cambio: nueva regresión de creación en Chromium **falló** en el
  centro del FAB interceptado (`783-baseline-e2e.log`, exit 1).
- Build de producción con Hub ON: `npm run build`, **exit 0**, incluye TypeScript.
- `npx tsc --noEmit`: **exit 0** sobre el árbol con las pruebas corregidas.
- ESLint de archivos cambiados: **exit 0**; repetir tras la documentación final.
- `PW_WORKERS=1 npx playwright test e2e/avisos-pedidos-783.spec.ts e2e/precio-decimal-795.spec.ts e2e/pedidos-hub.spec.ts --grep '783|795|G9:' --reporter=line`:
  **16/16 aprobadas, exit 0**, escritorio y móvil, Hub ON.
- Primer intento de esa suite: 14 pasadas y dos fallos de la prueba nueva
  porque esperaba texto `0` en un borrador que muestra vacío con placeholder `0`.
  Se corrigió esa expectativa al comportamiento real; no se cambió producto
  ni se eliminó la comprobación de borrador nuevo.
- Suite unitaria completa: en ejecución al preparar este registro; no declarada
  aprobada aquí sin su salida final. Legacy, CI, revisión y entrega pendientes.

### QA en navegador

- Estado: **PASÓ** para los cuatro recorridos locales descritos; no certifica CI,
  revisión independiente ni prueba de una persona usuaria.
- Entorno: aplicación local de build de producción, PostgreSQL aislado con datos
  sintéticos, Hub ON; ninguna operación en producción.
- Herramienta: Chromium real mediante Playwright autónomo; `agent-browser` no está
  instalado. Este recorrido es independiente de Playwright Test.
- Rol: ADMIN, login por formulario real, escritorio 1280×800 y móvil 390×844.
- Recorridos: **4/4**, sin errores JavaScript registrados.
- Por dispositivo: crear con error de servidor simulado → conservar cantidad →
  reintentar con aviso presente → comprobar una sola operación → abrir otro
  pedido con aviso visible → consultar el anterior y recargar con persistencia.
- Por dispositivo: aviso real de cierre pendiente → botón «Ir →» abre la fecha
  correspondiente. La consulta de cierre anterior fue simulada en el navegador
  local; no se creó, modificó ni confirmó ningún cierre.
- Capturas de éxito móvil, error escritorio y aviso con acción móvil inspeccionadas.
  Registros sanitizados en el workspace de ejecución bajo
  `/workspace/scratch/agua-795-783/qa-783-resultados.json` y `qa-783-*.png`.
- La primera preparación de QA rechazó un teléfono sintético inválido; el
  siguiente intento encontró el duplicado transitorio de streaming SSR en un
  locator global. Se corrigieron los datos de prueba y el scope a `<main>`,
  como indican los fixtures existentes. No se modificó la app para esos fallos.

## Liberación pendiente

Validación final del árbol, comparación contra main, CI/review, registro
`.qa/pr-<N>.md`, enlace real de preview con restricciones de datos claras y gates
de merge aplicables. Una maqueta o un resultado local no acredita despliegue.
#795 sigue abierto: este cambio no implementa cantidades de regalo.
