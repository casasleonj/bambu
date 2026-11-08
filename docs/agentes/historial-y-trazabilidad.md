# Historial de incidentes y contratos · consulta acotada

La sección «Known Issues» original se conserva **literalmente** en [fuente-original/02-historico-incidencias.md](fuente-original/02-historico-incidencias.md) (líneas 348–624, 277 posiciones). Contiene descripciones de bugs, soluciones, resoluciones técnicas, decisiones de producto y verificaciones antiguas. No todo es incidencia vigente ni todo es obsoleto.

**[Índice de 49 registros históricos por título y ancla](indice-historico-49.md)**. Cada entrada debe consultarse en su contexto, sin asumir que su estado de 2026 es todavía el actual.

Los contratos de incidentes significativos están también descompuestos como preanálisis en [contratos operativos](contratos-operativos.md). Consultar decisiones posteriores antes de tratarlos como vigentes.

**Antes de utilizar un elemento histórico:**
1. Identificar su número **y título**, no solo el número: el 13 aparece duplicado y algunos números posteriores se reutilizaron. Conservar ambos rastros hasta deduplicación comprobada; issue #335 registra esa deuda.
2. Determinar si es HECHO, DECISIÓN, PROPUESTA, DESCARTADO, OBSOLETO o EVIDENCIA HISTÓRICA a partir de PR/Issue y decisiones posteriores.
3. Contrastar contrato con Contexto Maestro/Plan Maestro disponible y código `main` a SHA.
4. Si un contrato sigue vigente, preservarlo y referenciarlo en la especificación del dominio afectado. Si quedó implementado o reemplazado, **no inventar** su estado; documentar fecha y evidencia.
5. El backlog vivo es [`docs/BACKLOG.md`](../../docs/BACKLOG.md) + GitHub Issues, no este archivo. Las correcciones nuevas se registran por Hallazgo sin duplicados.

**Excepción importante:** un contrato dentro de un incidente resuelto sigue siendo relevante para evitar regresiones. «Histórico» describe procedencia, no invalida la regla.
