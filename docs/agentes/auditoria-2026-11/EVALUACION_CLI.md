# Evaluación real de skills · CLI autenticado necesario

**Estado:** este repositorio **NO** adjunta trazas de Codex, Claude Code y OpenCode por ausencia de sesiones CLI reales en la auditoría anterior. El harness ejecutable es una herramienta, **no una prueba de éxito**.

## Inventario sin coste / sin ejecutar

```bash
python scripts/auditoria-agentes/eval_runtime.py --repo . --salida /tmp/ab-evals
```

## Pruebas reales autorizadas en entorno controlado

Solo en equipo autorizado y con versiones revisadas de las tres CLI:

```bash
python scripts/auditoria-agentes/eval_runtime.py --repo . --salida /tmp/ab-evals \
  --execute --accept-provider-costs --agent all
```

El harness copia instrucciones a un **fixture sintético temporal**, pasa herramientas de solo lectura a las CLI, evita copiar el código real/variables de DB y guarda las trazas **fuera del repositorio**. El código no garantiza que una CLI o plugin de versión desconocida respete el sandbox; revisarlo y aislar la red/permisos en CI antes de ejecutarlo. Nunca añadir secretos, nombres, teléfonos o logs originales a PR público.

**Cierre de evaluación:** hay 12 casos por agente = 36 ejecuciones de candidata. Repetir bajo el mismo modelo/permisos con baseline = **72 ejecuciones** de comparación. La salida `TRAZA_PARA_REVISION` es solo material de revisión, no `PASS`. Comprobar invocación/lectura de skill, cumplimiento de no escritura, ausencia de acciones no autorizadas, comportamiento negativo, resultado esperado y coste. Registrar SHA de ambos conjuntos y comparación por caso. La ausencia de trazas instrumentadas es `NO VERIFICADO`, no aprobación.

**No usar** los CLI sin autenticación o en producción para «simular» un resultado. Un test unitario del harness no sustituye esas 72 ejecuciones.
