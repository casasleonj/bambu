# Guía de atomización semántica · no contar filas como obligaciones

**Alcance:** `matriz_fuente_798.csv` contiene 798 posiciones de fuente; **530 filas son candidatas** por heurística. No son 530 obligaciones distintas, y el conteo no certifica equivalencia.

El gate `check_cutover.py` exige ahora un archivo de revisión `obligaciones_atomicas.csv` cuando se proponga sustituir `AGENTS.md`, además de la matriz de posiciones. **No se incluye un archivo ficticio rellenado:** debe crearse mediante descomposición real y revisión humana.

## Esquema CSV estricto

```csv
id,lineas_origen,clausula_original,significado,clasificacion,condiciones,excepciones,destino_activo,criterio_verificacion,estado_revision,referencia_revisor
```

- `id`: único por cláusula atómica, nunca por simple párrafo.
- `lineas_origen`: líneas/rangos originales `1;5-7` dentro de 1–798, cada fila candidata debe estar cubierta.
- `clausula_original` y `significado`: explicar **deber**, sujeto, ámbito y resultado. Una frase con tres obligaciones requiere tres filas.
- `clasificacion`: `VIGENTE`, `HISTORICO_NO_NORMATIVO` o `CAMBIO_APROBADO`. No resolver cambios de producto por conveniencia técnica.
- `condiciones`, `excepciones`: usar explícitamente `NINGUNA` cuando no existan; no dejarlas vacías.
- `destino_activo`: ruta local real. Una obligación **VIGENTE** no puede vivir exclusivamente en `fuente-original/` porque eso es evidencia, no instrucción operativa.
- `criterio_verificacion`: escenario positivo/negativo o prueba vinculada a la cláusula, con definición observacional.
- `estado_revision`: `VERIFICADA` solo con revisión; de lo contrario `PENDIENTE`. El gate falla si hay pendientes.
- `referencia_revisor`: enlace/registro de evidencia y revisor autorizado; una IA no se autoaprueba.

Se exige clasificación especial para las decisiones de producto, las dependencias históricas y el protocolo #704. Cada contrato vigente que provenga de un incidente histórico debe poder recuperarse por un agente al analizar el dominio afectado. Si el documento no está disponible o el agente no lo abre, el resultado operativo continúa `PENDIENTE` aunque exista equivalencia textual.

**Criterio de no-regresión:** fuente íntegra, contrato vigente recuperable, condiciones y excepciones conservadas, pruebas reales de activación/cumplimiento por agente y aprobación. `PASS_ESTRUCTURAL` no autoriza merge de sustitución.
