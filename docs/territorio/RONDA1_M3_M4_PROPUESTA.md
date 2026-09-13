# TERRITORIO-F2 — Ronda 1/2: persistencia de equivalencias (M3) y mecanismo de backfill (M4)

- Estado: PROPUESTA — pendiente de aprobación explícita del equipo. Sin código
  todavía.
- Fecha: 2026-09-13
- Fuente: `docs/territorio/ESPECIFICACION_F2.md` (dos decisiones abiertas) +
  `docs/territorio/M1_INVENTARIO_BARRIO.md` (evidencia real de producción)
- Gate: no se escribe código de TERRITORIO-F2 hasta que el equipo apruebe esta
  propuesta o pida una alternativa.

## Ronda 1 — Descubrimiento

### Precedente evaluado: `ImportStagingRow` / `ImportBatch` (`src/lib/import/`)

Se investigó el código real (`application.ts`, `matcher.ts`, el wizard en
`/dashboard/importar`) para decidir si reutilizarlo, como se dejó como
propuesta abierta en `ESPECIFICACION_F2.md`. Hallazgos concretos:

- `ImportEntity` es un enum cerrado (`CLIENTE`, `PEDIDO`, `PAGO`, `GASTO`,
  `EMBARQUE`, `PRODUCCION`, `CIERRE`, `PROVEEDOR`, `INSUMO`, `COMPRA`,
  `NOMINA`) — no incluye `BARRIO`, y el matching (`analyzeBatch`) está
  hardcodeado por entidad en un `switch`, no es genérico.
- Todo el flujo asume un **archivo subido** (Excel/CSV) que se parsea en hojas
  (`parseImportFile`) y se persiste como filas nuevas a *importar* — el batch
  nace de un upload. Nuestro caso es distinto: los datos ya existen en
  `Cliente.barrio`/`Negocio.barrio` en producción; no hay archivo que subir,
  es una deduplicación de datos ya persistidos.
- **Conclusión: no encaja.** Forzar `BARRIO` dentro de `ImportEntity` exigiría
  inventar un "archivo virtual" solo para activar el wizard, y el matching
  tendría que reescribirse igual (el de `matcher.ts` es específico de
  `Cliente` — nombre/teléfono/pg_trgm — no de nombres de barrio). No hay
  ahorro real de reutilizar el modelo; sí lo hay de reutilizar el **patrón**
  (staging + decisión + revisión) y el **scoring con `pg_trgm`** como técnica,
  no como código compartido.

### Escala real (de `M1_INVENTARIO_BARRIO.md`)

- 52 nombres normalizados distintos en total.
- 23 clusters ya resueltos por normalización — no requieren ninguna decisión.
- 28 valores de una sola grafía — candidatos directos a `Barrio`, revisión
  humana ligera (¿es un barrio real o un error de tipeo aislado?).
- ~9 familias ambiguas (~20 valores) que requieren una decisión humana
  puntual cada una (fusionar o no).
- 1 valor de ruido evidente (se descarta, no se crea `Barrio`).
- 177 registros totales a vincular (126 `Cliente` + 51 `Negocio`).

Es una tarea de **revisión humana de ~30 valores en total**, no un problema de
escala. Construir una UI administrativa nueva para esto sería
desproporcionado — es exactamente el tipo de sobre-ingeniería que las reglas
del proyecto piden evitar ("no diseñar para requisitos hipotéticos").

## Ronda 2 — Propuesta

### Decisión M3: sin tabla nueva de "equivalencias"

**Propuesta:** no crear ningún modelo Prisma nuevo para persistir
equivalencias. En su lugar, la decisión humana sobre las ~9 familias
ambiguas se registra en un **archivo de configuración versionado**
(`scripts/backfill-barrio-canonico.decisiones.json`), revisado y aprobado
por el equipo antes de ejecutar el script — análogo a cómo esta misma
Ronda 1 ya es un documento revisado antes de tocar código.

```json
{
  "fusionar": [
    { "canonico": "La Antillana", "variantes": ["antillana", "la antillana"] },
    { "canonico": "Las Palmeras", "variantes": ["las palmeras", "palmeras"] }
  ],
  "mantenerSeparados": [
    { "nota": "sectores probablemente distintos, no fusionar", "valores": ["el tesoro", "altos del tesoro"] },
    { "nota": "terminación real distinta, alto riesgo de fusión incorrecta", "valores": ["la gaitana", "gaitan"] }
  ],
  "descartar": [
    { "valor": "Droguería fama YyY ubica en el romboy de la 25", "razon": "no es un nombre de barrio" }
  ]
}
```

Por qué no una tabla: la clasificación no es un proceso recurrente en este
volumen — una vez hecho el backfill inicial, los registros nuevos ya entran
con `barrioId` directo vía la UI de F1 (`BarrioSelect`). No hay necesidad de
un modelo persistente para algo que se ejecuta una vez.

**Riesgo si más adelante aparece un volumen mayor** (ej. una importación
masiva futura de otra fuente): en ese momento sí se justificaría revisar si
conviene un modelo de staging — pero no ahora, sobre esta evidencia.

### Decisión M4: script one-off, no UI nueva

**Propuesta:** `scripts/backfill-barrio-canonico.ts` (mismo patrón que
`scripts/generate-pwa-icons.ts` — ejecutable vía `npx tsx`), que:

1. Lee el archivo de decisiones de M3 (aprobado por el equipo).
2. Para los 23 clusters deterministas + 28 valores únicos (menos el ruido):
   crea el `Barrio` canónico vía `crearBarrio()` (reutiliza
   `src/lib/barrios/barrio-service.ts`, sin lógica nueva) y actualiza
   `Cliente.barrioId`/`Negocio.barrioId` de los registros correspondientes.
3. Para las familias marcadas `fusionar`: crea un único `Barrio` con el
   nombre canónico indicado y vincula todos los registros de esas variantes.
4. Para las marcadas `mantenerSeparados`: crea un `Barrio` por cada valor,
   sin fusionar.
5. Para las marcadas `descartar`: no crea nada; deja el registro sin
   `barrioId` (sigue siendo válido per F1 — un registro legacy sin vincular
   no rompe nada).
6. Excluye explícitamente los 105 registros de `Cliente` con `barrio` en
   blanco (ver M1 §0) — nunca se tratan como candidatos.
7. Corre dentro de transacciones, es **idempotente** (re-ejecutarlo no
   duplica `Barrio` ni reasigna algo ya vinculado — usa la misma constraint
   `UNIQUE(nombreNormalizado)` de F1 para detectar "ya existe").
8. Imprime un reporte final (cuántos `Barrio` creados, cuántos registros
   vinculados, cuántos omitidos) — no aplica cambios en silencio.

**Por qué no una UI:** es una operación de una sola vez, ya con la decisión
humana capturada en el archivo de configuración (Ronda 2, este documento).
Una UI de revisión con estado persistente sería trabajo real para un
problema que no se repite a este volumen. Si en el futuro se necesita repetir
este proceso (ej. una nueva fuente de datos legacy), se reevalúa con nueva
evidencia — no se construye la UI hoy "por si acaso".

### Consistencia con `ADR-TERRITORIO-001`

El script no calcula ni asigna coordenadas, geometría ni centroides — opera
exclusivamente sobre el nombre textual. No toca `pickCoords`,
`LocationQuality`, ni ningún archivo de `src/lib/geo/`.

## Qué NO cubre esta propuesta

- No decide el gate de aceptación automatizado de F2 ("cero fusiones
  ambiguas") — eso se resuelve con los tests del script (unit: clasificación
  correcta de cada categoría; integración: backfill idempotente sobre datos
  reales de staging/test).
- No toca `Pedido.barrioEntrega` (solo 1 registro con valor, ya cubierto por
  el cluster `instituto`) — no requiere backfill separado.
- No implementa nada de F3 (Zona) ni F6 (planner).

## Pedido de aprobación

¿Aprueban esta propuesta (sin tabla nueva, script one-off con archivo de
decisiones revisado a mano) para que TERRITORIO-F2 pase a implementación? Si
prefieren otra dirección (ej. sí quieren una UI, o sí quieren un modelo
persistido para trazabilidad futura), avisen antes de que se escriba código.
