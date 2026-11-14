---
description: QA en navegador real como usuario antes de producción (agent-browser)
argument-hint: "[issues o rutas a probar] [entorno: local|preview|prod-readonly]"
---

Ejecuta el QA de usuario en navegador real para lo que se acaba de implementar,
siguiendo `.agents/skills/qa-navegador/SKILL.md` y
`.agents/skills/jl/references/verification-release.md` (paso 3).

Objetivo: $ARGUMENTS

Procedimiento:

1. Preflight. Determina entorno autorizado (local con datos sintéticos primero;
   preview del PR después; producción SOLO lectura y solo si no hay alternativa).
   Verifica que `agent-browser` existe y navega de verdad
   (`agent-browser --version` + una apertura real). Si no arranca o no navega,
   informa `⏸️ QA PENDIENTE: sin navegador operativo` y NO inventes el recorrido.
2. Narra el alcance: qué issues y rutas, con qué rol, en qué viewports, y cuántos
   recorridos (N) antes de empezar.
3. Recorre cada tarea completa como una persona: entrar por login real con el rol
   del caso, ejecutar la acción, comprobar el efecto en la pantalla siguiente,
   recargar para verificar persistencia, y probar un camino adversarial
   (cancelar, volver, filtro, rol sin permiso, campo vacío).
4. Relee el snapshot tras cada acción (los `@eN` caducan). Lo visual
   (clipping, solape, contraste, responsive) solo se juzga con screenshot
   inspeccionado, nunca deducido del árbol de accesibilidad.
5. Repite en escritorio y en viewport móvil ~390×844 si el cambio afecta layout,
   overlays o botones.
6. No guardes, pagues, entregues, cierres caja ni generes procesos en producción.
   Si el paso imprescindible escribe y no hay entorno aislado, el estado es
   `NO EJECUTADO`, no un falso PASÓ.

6. **Escalón de modelo.** Usar el escalón que corresponda al trabajo
   (`docs/agentes/presupuesto-y-contexto.md` §7): el **por defecto** para un
   recorrido completo por rol; **effort bajo** para comprobar pantallas ya
   conocidas; effort alto **solo** si aparecen casos límite ocultos, dinero o
   permisos. `max`/tope de gama se consulta al PO. Un modelo caro sin navegador
   produce peor informe que un modelo medio con navegador.

Cierra con el bloque `### QA en navegador` del skill, por issue: estado
PASÓ/FALLÓ/NO EJECUTADO/NO APLICA, build/SHA, entorno, herramienta y versión, rol,
viewports, recorridos j/N, esperado vs observado, incidencia y evidencia.

Y entrega el paquete de aprobación del skill (`## Entrega al PO antes del merge`):
el **link del preview** del PR, qué cambió, qué se arregló, qué se agregó, qué NO
cambió, y cómo comprobarlo en un minuto. Lenguaje llano, sin rutas ni hashes: el
PO decide mirando, no leyendo código. Si el preview no existe, dilo en vez de
inventar una URL.

Si encuentras un defecto: regístralo con `/hallazgo` antes de continuar, y no
declares el QA aprobado mientras el fallo siga abierto. Un `FALLÓ` bloquea el
merge. No arregles el defecto de paso en el mismo PR sin issue que lo respalde.
