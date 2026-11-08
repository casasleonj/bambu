# Sistema de diseño, UI y UX, sin inventar estándares

Leer cuando haya interfaz o **cambio observable por una persona** (incluye cifras, estados, errores, tiempos y permisos aunque el diff sea solo backend). Omitir si se demuestra ausencia de efecto visible y se justifica.

## Capas separadas

- **Reglas de negocio:** decisiones y hechos legítimos; no cambian por embellecer pantalla.
- **Sistema de diseño:** componentes, tokens, semántica visual y guías existentes. Reutilizar primero el sistema comprobable del producto; si falta patrón, consultar estándares de accesibilidad y sistemas reconocidos como **referencia**, no imponer biblioteca/paleta nueva.
- **UI:** organización visual, etiquetas, jerarquía, tamaño, estados, foco, legibilidad, accesibilidad y adaptación a dispositivo.
- **UX:** tarea completa, navegación, comprensión, prevención/recuperación de errores, pasos, esfuerzo mental y expectativas del usuario.

No inventar colores, tamaños, breakpoints o una guía de marca como requisito universal. Respetar preferencias expresas, compatibilidad y requisitos legales/accesibilidad aplicables. Antes de cambiar la experiencia aprobada, seguir el proceso de aprobación/maqueta **que exija el proyecto**; si no existe, proponer revisión apropiada, no fingir aprobación.

## Automatización responsable

Clasificar cada campo/decisión:

| Origen | Comportamiento |
|---|---|
| Conocido y vigente | Recuperar y mostrar la procedencia cuando sea relevante; permitir corrección autorizada |
| Derivable con certeza | Calcular automáticamente y mostrar el resultado/unidad |
| Probable/inferido | Sugerir con indicación de incertidumbre y confirmación o reversión apropiadas |
| Solo observable o decidible por humano | Solicitar claramente; nunca registrar como confirmado sin evidencia |

No automatizar pagos, entregas, accesos, cifras físicas o acciones irreversibles con presunciones. Eliminar digitaciones/clics innecesarios **sin quitar** confirmaciones de riesgo, trazabilidad, permisos ni la posibilidad de corregir.

## Auditoría de interfaz, tarea y esfuerzo

- Flujo de principio a fin con rol habitual: descubribilidad, vocabulario no técnico, estado del sistema, siguiente acción, consistencia y regreso.
- Estados relevantes: vacío, carga, éxito, error, validación, permisos, reconexión/offline, confirmación y acciones repetidas. Comprobar enlaces/destinos, navegación y persistencia tras recarga.
- Examinar móvil/escritorio realmente pertinentes: solapamientos, cortes, zoom, foco de teclado, targets táctiles, contraste, responsive y pantallas pequeñas; **el color nunca es única señal**.
- Probar con y sin datos, errores de escritura, teclados/puntero, latencia, errores temporales, ausencia de permisos y recuperación. Validar con personas del perfil objetivo si están disponibles; la simulación de agente **no demuestra** comprensión humana.
- Comparar `antes → después`: pasos/campos que el humano completa, errores evitables, tiempo observable, resultados correctos, comprensión real. Reducir clics no es criterio aislado; no usar números inventados.

## Visibilidad de las pruebas de experiencia

Al iniciar **pruebas reales de Playwright E2E o un recorrido real de interfaz por agente**, y no al escribir specs o planes, usar los avisos `QA DE USUARIO INICIADO / EN CURSO / FINALIZADO` descritos en [verification-release.md](verification-release.md). Informar a la persona del flujo en prueba, rol, dispositivo y avance entre escenarios, no de cada clic. Distinguir observación visual, aserción automática, feedback humano y evidencia pendiente; una inspección del componente o una maqueta **no son** una prueba en navegador.

## Benchmark y refutación

Comparar el flujo con patrones de productos comparables, no copiar superficialmente la estética de una empresa grande. Justificar cada desviación del patrón existente. Una maqueta visualmente consistente puede seguir siendo UX mala; una UX rápida puede ser inaccesible. Ambas requieren pruebas independientes.

## Feedback sobre UX y tareas reales

Cuando el criterio de comprensión o uso no está documentado, preguntar **qué intenta conseguir** la persona y observar el recorrido sin sugerir el control que debe pulsar. Tras la tarea preguntar «¿Qué esperabas que ocurriera aquí?» o «¿Qué fue fácil o difícil de completar?». No transformar una preferencia aislada en estándar de diseño. Para activar preguntas solo cuando cambien decisiones, ver [user-feedback.md](user-feedback.md).
