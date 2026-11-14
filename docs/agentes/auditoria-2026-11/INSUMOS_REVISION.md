# Insumos automáticos para revisión semántica

**Estado:** BORRADOR MECÁNICO, **NO CERTIFICA** obligaciones, no es `obligaciones_atomicas.csv` y no satisface el gate `check_cutover.py`.

Este inventario contiene 595 filas no vacías/no encabezados del `AGENTS.md` original (se omitieron 203 posiciones vacías o encabezados entre las 798). Extrae un fragmento por línea y un destino *a contrastar*. Muchos fragmentos son continuación de otras líneas, tablas, ejemplos o antecedentes y **no representan obligaciones atómicas**. Puede haber varias obligaciones en una línea y reglas heredadas ocultas en explicaciones históricas.

Para convertir este material en evidencia:
1. Agrupar frases consecutivas, preservando condiciones y excepciones.
2. Dividir cada deber en cláusulas verdaderamente atómicas. Mantener referencia `Lx-Ly`.
3. Clasificar estado vigente mediante decisiones aprobadas/Planes Maestros, no por la ubicación ni por el nombre de la sección.
4. Para normas vigentes, señalar destino **real y operativo** (núcleo o reglas locales, no solo fuente-original) y escenario positivo/adversarial.
5. Comparar antes/después con criterio de evaluación; recoger revisión autorizada e identificador de evidencia.
6. Registrar las exclusiones históricas con justificación. No sustituir `PENDIENTE` por un PASS por lote.

**No se modificó ninguna regla de producto ni se acreditó ninguna prueba de CLI con este borrador.**
