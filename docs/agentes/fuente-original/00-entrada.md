# PROTOCOLO OBLIGATORIO

ANTES de escribir cualquier codigo, DEBES ejecutar las 3 iteraciones del protocolo de investigacion.
Lee el archivo `.opencode/prompts/protocolo.txt` para los detalles completos.
NUNCA saltes directo a codigo. NUNCA implementes sin aprobacion tras cada Ronda 2.

**Aprobación de interfaz (instrucción del PO, 2026-10-27):** antes de implementar cualquier cambio de interfaz o experiencia de usuario, presentar una maqueta de escritorio y móvil, incluidos los estados relevantes de confirmación, carga y error, y esperar aprobación explícita del PO. Aprobar el trabajo del servidor no aprueba la maqueta. La implementación debe respetar la maqueta aprobada; los cambios visuales posteriores requieren revisión de su maqueta.

DESPUES de la aprobacion, la entrega sigue el **Flujo de Entrega** (ver seccion al final de este archivo): **una fase = una rama = un PR**, y cada fase entra a `main` ANTES de empezar la siguiente. NUNCA apilar ramas.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

