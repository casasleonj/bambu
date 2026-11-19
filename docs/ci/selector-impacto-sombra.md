# #896 · Selector de impacto por dependencias (fase sombra)

## Contrato y límites

El workflow independiente **CI impact shadow** observa los PR contra main.
No es un gate requerido. No escribe variables de repositorio, no dispara ni
cancela el CI principal y no controla merges, despliegues, datos ni migraciones.
El campo canSkip es siempre false. **No activar omisiones** durante esta fase.

El analizador toma el checkout del candidato de merge y el SHA de la base del
evento; verifica su ascendencia, obtiene el diff raw de Git, e inventaría los
archivos versionados. Construye el grafo de imports/reexports con el AST y
el resolver de TypeScript (incluyendo los aliases de tsconfig), recorre sus
consumidores transitivos, y une los impactos de todos los cambios. Infere
relaciones de rutas/API en specs y helpers importados y conserva el smoke,
los specs no clasificados y la suite Hub. Informa consumidores unit e
integración por imports, **sin reducir sus respectivas suites**.

La primera hipótesis de selección acotada a cambios M de archivos normales
de código de las pantallas de Clientes y Proveedores no constituye una
declaración de bajo riesgo. Sus relaciones de negocio iniciales son propuestas
para contrastar: Clientes con Pedidos, Cartera, Facturas, Territorio,
Recurrentes y Sugerencias; Proveedores con Compras, Gastos e Insumos.
La presencia de consumidores críticos, rutas desconocidas, archivos nuevos,
eliminados, movidos o con modo cambiado, grafo sin resolver, layouts
transversales o inventario incompleto recomienda full. Un error fatal de
análisis también recomienda full y deja el workflow sombra en rojo.

Se calcula la hipótesis incluso cuando se recomienda full. Los archivos en
proposedLegacySpecs son una recomendación conservadora; hypothesisLegacySpecs
es una estimación experimental. No son comandos para ejecutar ni una
certificación de cobertura.

El reporte es por archivo spec, **no** por ID de prueba/proyecto/flag. Las
exclusiones y proyectos reflejan la configuración Playwright observada en
main; el inventario Hub se extrae de su paso en ci.yml. Rutas dinámicas,
SQL, eventos, layouts implícitos, dependencias de runtime y side effects
no son demostrables mediante imports. La ausencia de aristas detectadas
no demuestra independencia. Los helpers E2E compartidos pueden seleccionar
la mayoría de specs y el analizador puede recomendar siempre full; medir
en lugar de relajar reglas.

## Evidencia y operación

- Workflow en pull_request, con permisos contents:read, credenciales de
  checkout no persistentes, grupo de concurrencia separado; no instala
  lifecycle scripts ni inicia aplicación, DB o navegador. Usa TypeScript
  del lockfile existente, sin dependencia nueva.
- Un artefacto JSON por run/intento: base, head, cambios, archivos afectados,
  dominios, inventario, propuesta, hipótesis, motivos del fallback, conteo de
  dependencias y aristas sin resolver (muestra acotada).
- Prueba local del analizador:
  node --test scripts/ci/__tests__/impacto-dependencias.node.test.mjs
- Reproducción manual desde checkout aislado del merge candidato:
  node scripts/ci/impacto-dependencias.mjs BASE_SHA /tmp/bambu-impact.json
  Requiere dependencias instaladas. No usa ambiente de producción.

## Validación y transición (pendiente, no autorizada por este cambio)

Comparar los reportes contra el CI completo del **mismo** candidato y perfil
(base y SHA real de merge, no solamente head de PR). Registrar faltantes,
fallos, duración y ahorro teórico por test/shard. El comparador automático
de resultados y el inventario exacto de IDs de Playwright todavía no están
implementados; un CI verde no valida el selector. Incluir muestras
representativas, mutaciones deliberadas en sandbox (consumidor indirecto,
API, CSS, configuración, permisos, cambio combinado) y fallos de ejecución.
Correlacionar fallos por test, perfil, firma y baseline; no asumir que
ausencia de regresión en la muestra implica ausencia de falsos negativos.

Antes de cualquier fase activa: revisión independiente; verificación del
inventario real de tests por proyecto y flags; evidencia de fallos sembrados
detectados; comparación con full de candidato exacto; beneficio neto que
incluya instalación y análisis; protección real de main y promoción; QA de
infraestructura; aprobación explícita. El piloto de #897 es independiente.
Ningún PR debe fusionarse por el reporte sombra. Mantener las reglas
existentes de aprobación. Reversión: deshabilitar el workflow sombra o
revertir este único cambio; no modifica datos ni gates existentes.
