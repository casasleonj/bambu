# TERRITORIO-F2 — Ronda 1/2: persistencia de equivalencias (M3) y mecanismo de backfill (M4)

- Estado: PROPUESTA (revisión 3) — pendiente de aprobación formal del
  equipo. Sin código todavía.
- Fecha: 2026-09-13 (revisión de la propuesta original del 2026-09-13, tras
  feedback del equipo con 7 garantías adicionales requeridas, y una tercera
  ronda con 3 ajustes puntuales sobre esa revisión)
- Fuente: `docs/territorio/ESPECIFICACION_F2.md` (dos decisiones abiertas) +
  `docs/territorio/M1_INVENTARIO_BARRIO.md` (evidencia real de producción,
  corregida en esta misma fecha — ver su propia nota de corrección en §6)
- Gate: no se escribe código de TERRITORIO-F2 hasta que el equipo apruebe
  esta revisión o pida otra alternativa. El equipo ya confirmó que la
  **dirección arquitectónica está convergida** (JSON versionado + script
  one-off + dry-run + ejecución transaccional + idempotencia + constraint DB
  como autoridad + legacy intacto + conflictos explícitos) — no reabrir ese
  diseño; los 3 ajustes de esta revisión son puntuales, no un rediseño.

## Qué cambió respecto a la propuesta original

El equipo revisó la propuesta original y la aprobó en dirección general (sin
tabla nueva, sin UI, script one-off) pero exigió 7 garantías concretas antes
de pasar a implementación. Esta revisión las incorpora todas:

1. Clasificación real en 4 categorías (no "sin variante = casi válido").
2. El archivo de M3 pasa de 3 arreglos planos a un **ledger auditable por
   registro**.
3. Garantía explícita de no-destrucción para los valores que no se vinculan.
4. Estado `CONFLICTO` en el script — nunca reasignación silenciosa.
5. Modo `--dry-run` obligatorio, con reporte completo, cero escrituras.
6. Ejecución real transaccional e idempotente, apoyada solo en la constraint
   `UNIQUE(nombreNormalizado)` de F1 (sin pre-check-then-insert).
7. Checklist verificable de 7 puntos para el gate de F2.

También se corrige un error de conteo propio en `M1_INVENTARIO_BARRIO.md`:
la versión original de ese documento aproximaba "~9 familias ambiguas
(≈20 valores)"; el recuento exhaustivo real es **10 familias, 22 valores**
(corregido en `M1_INVENTARIO_BARRIO.md` §6 en el mismo commit que esta
revisión). Los ejemplos de fusión de la propuesta original (`antillana`/
`la antillana`, `el tesoro`/`altos del tesoro`, etc.) **siguen sin
decidirse** — se usan aquí solo como ejemplos de formato, nunca como
decisiones territoriales tomadas por similitud textual.

## Qué cambió en esta revisión (3 ajustes puntuales, ronda 3)

El equipo confirmó que la revisión 2 convergió la dirección arquitectónica
correcta y pidió únicamente estos 3 ajustes antes de dar la aprobación
formal — no una reapertura del diseño:

1. **Separar "ledger de decisiones" de "reporte/evidencia de ejecución".**
   El ledger de M3 sigue teniendo una entrada por `valorNormalizado` (52, no
   177) — eso no cambia. Lo que cambia es el nombre y el alcance: ya no se
   llama "ledger por registro", porque el ledger nunca tuvo una entrada por
   `Cliente`/`Negocio`. Se agrega una sección nueva (ver "Reporte de
   ejecución") que especifica el detalle por registro que el script debe
   producir como evidencia — eso es responsabilidad del reporte, no del
   ledger.
2. **`FUSIONAR_EN` a un solo salto, sin cadenas.** La validación ahora exige
   que `fusionarEn` apunte directamente a una entrada con
   `decision: CREAR_BARRIO` o `decision: MANTENER_SEPARADO` — nunca a otra
   entrada `FUSIONAR_EN`. Se prohíben explícitamente las cadenas
   (`A → B → C`) y los ciclos.
3. **Modelo transaccional explícito.** Se aclara que cada entrada del
   ledger se procesa en su propia transacción atómica — un fallo en una
   entrada hace rollback solo de esa entrada, se marca `ERROR` en el reporte,
   y el proceso continúa con las demás. Una segunda ejecución retoma el
   trabajo pendiente (incluidas las entradas `ERROR`) de forma segura e
   idempotente.

## Ronda 1 — Descubrimiento (sin cambios respecto a la propuesta original)

### Precedente evaluado: `ImportStagingRow` / `ImportBatch` (`src/lib/import/`)

Se investigó el código real (`application.ts`, `matcher.ts`, el wizard en
`/dashboard/importar`) para decidir si reutilizarlo, como se dejó como
propuesta abierta en `ESPECIFICACION_F2.md`. Hallazgos concretos:

- `ImportEntity` es un enum cerrado (`CLIENTE`, `PEDIDO`, `PAGO`, `GASTO`,
  `EMBARQUE`, `PRODUCCION`, `CIERRE`, `PROVEEDOR`, `INSUMO`, `COMPRA`,
  `NOMINA`) — no incluye `BARRIO`, y el matching (`analyzeBatch` en
  `src/lib/import/application.ts`) está hardcodeado por entidad en un
  `switch`, no es genérico.
- Todo el flujo asume un **archivo subido** (Excel/CSV) que se parsea en
  hojas (`parseImportFile`) y se persiste como filas nuevas a *importar*
  (`uploadImportFile` → `persistSheetRows`) — el batch nace de un upload.
  Nuestro caso es distinto: los datos ya existen en `Cliente.barrio`/
  `Negocio.barrio` en producción; no hay archivo que subir, es una
  deduplicación de datos ya persistidos.
- **Conclusión: no encaja.** Forzar `BARRIO` dentro de `ImportEntity`
  exigiría inventar un "archivo virtual" solo para activar el wizard, y el
  matching tendría que reescribirse igual (el de `matcher.ts` es específico
  de `Cliente` — nombre/teléfono/pg_trgm — no de nombres de barrio). No hay
  ahorro real de reutilizar el modelo; sí lo hay de reutilizar el **patrón**
  (staging + decisión + revisión) y el **scoring con `pg_trgm`** como
  técnica, no como código compartido.

### Escala real (de `M1_INVENTARIO_BARRIO.md`, corregida)

- 52 nombres normalizados distintos en total.
- **13** ya resueltos por normalización determinista, sin ambigüedad cruzada
  (categoría A — ver Ronda 2).
- **16** de una sola grafía, sin ambigüedad cruzada, requieren revisión
  humana liviana (categoría B).
- **22 valores agrupados en 10 familias ambiguas** que requieren decisión
  humana explícita de fusión o separación, familia por familia (categoría C)
  — corregido desde la aproximación original "~9 familias/~20 valores".
- **1 valor** de ruido evidente, no es un barrio (categoría D).
- 177 registros totales a vincular (126 `Cliente` + 51 `Negocio`).

Es una tarea de **revisión humana de 38 valores en total** (16 de categoría B
+ 22 de categoría C), no un problema de escala. Construir una UI
administrativa nueva para esto sería desproporcionado — es exactamente el
tipo de sobre-ingeniería que las reglas del proyecto piden evitar ("no
diseñar para requisitos hipotéticos").

## Ronda 2 — Propuesta (revisada)

### Clasificación formal en 4 categorías (aplica a los 52 nombres normalizados)

Ningún nombre normalizado pasa a `Barrio` sin pasar primero por una de estas
4 categorías, tal como quedaron formalizadas en `M1_INVENTARIO_BARRIO.md` §6:

| Categoría | Regla | n (nombres) | Decisión por defecto | Requiere revisión humana |
|---|---|---|---|---|
| **A — Equivalencia determinista** | ≥2 grafías ya normalizan al mismo valor; ese valor no aparece en ninguna familia ambigua | 13 | `CREAR_BARRIO` (1 `Barrio` por nombre) | No — vincular es mecánico, ya resuelto por `normalizeName` |
| **B — Candidato que requiere validación** | grafía única, sin ambigüedad cruzada | 16 | `PENDIENTE_DECISION` | Sí, liviana (¿es un barrio real o un error de tipeo aislado?) |
| **C — Familia ambigua** | 2+ nombres normalizados distintos, probable mismo barrio real, pero no son fusionables por normalización (artículo, sufijo, numeración) | 22 (10 familias) | `PENDIENTE_DECISION` | Sí, explícita, familia por familia — nunca por similitud textual sola |
| **D — No representa un Barrio** | ruido evidente | 1 | `DESCARTAR` | No — ya confirmado en M1 |

**Regla explícita (garantía 1):** "sin variante detectada" (categoría B) NO
equivale a "confirmado como barrio válido". Toda entrada de categoría B
entra al ledger de M3 con `estado: "PENDIENTE"` y decisión por defecto
`PENDIENTE_DECISION`, igual que las de categoría C. Solo la categoría A se
resuelve automáticamente, porque ahí no hay ninguna ambigüedad de nombre que
decidir — es exactamente el mismo caso que M5 (dual-read) ya resuelve hoy
para variantes de mayúsculas/acentos.

### Decisión M3: ledger de decisiones por valor normalizado (sin tabla nueva)

**Corrección de nombre (ajuste 1 de la ronda 3):** este archivo es un
**ledger de decisiones**, no un "ledger por registro" — nunca tuvo, ni debe
tener, una entrada por cada uno de los 177 `Cliente`/`Negocio`. Registra la
decisión humana sobre cada uno de los **52 `valorNormalizado`** (13 A + 16 B
+ 22 C + 1 D). El detalle de qué registro concreto fue afectado por esa
decisión — trazabilidad de ejecución, no de decisión — vive en el **reporte
de ejecución** que el script produce al correr (ver la subsección
siguiente), nunca en este JSON.

**Se mantiene la decisión de no crear ningún modelo Prisma nuevo** — el
razonamiento de escala de la propuesta original sigue aplicando (38 valores
a revisar, no un flujo recurrente). Lo que cambia respecto a la propuesta
original es la forma del archivo: en vez de 3 arreglos planos
(`fusionar`/`mantenerSeparados`/`descartar`),
`scripts/backfill-barrio-canonico.decisiones.json` es un **ledger**: un
arreglo con una entrada por cada uno de los 52 nombres normalizados (no 177),
generado a partir de `M1_INVENTARIO_BARRIO.md` y editado a mano por el
equipo para registrar cada decisión con su evidencia.

```ts
interface DecisionLedgerEntry {
  valorNormalizado: string          // ej. "antillana" — clave primaria del ledger
  categoria: 'A_DETERMINISTA' | 'B_VALIDACION' | 'C_FAMILIA' | 'D_DESCARTAR'
  familiaId: string | null          // agrupa entradas de categoría C; null en A/B/D
  fuentes: ('CLIENTE' | 'NEGOCIO' | 'PEDIDO')[]   // de dónde viene, evidencia de M1 §5
  n: number                          // cantidad de registros que usan este valor (de M1)
  decision: 'CREAR_BARRIO' | 'FUSIONAR_EN' | 'MANTENER_SEPARADO' | 'DESCARTAR' | 'PENDIENTE_DECISION'
  fusionarEn: string | null          // si decision=FUSIONAR_EN, el valorNormalizado de OTRA entrada cuya propia decision sea CREAR_BARRIO o MANTENER_SEPARADO — un solo salto, nunca otra entrada FUSIONAR_EN (sin cadenas A→B→C, sin ciclos)
  barrioCanonico: string | null      // nombre legible a usar en Barrio.nombre (ej. "La Antillana"); null mientras esté PENDIENTE_DECISION
  razon: string                      // evidencia/justificación humana, obligatoria si decision != PENDIENTE_DECISION
  estado: 'RESUELTO' | 'PENDIENTE'
}
```

Ejemplo — **ilustrativo únicamente**, no son decisiones tomadas (ver nota
más abajo):

```json
[
  {
    "valorNormalizado": "centro",
    "categoria": "A_DETERMINISTA",
    "familiaId": null,
    "fuentes": ["CLIENTE", "NEGOCIO"],
    "n": 60,
    "decision": "CREAR_BARRIO",
    "fusionarEn": null,
    "barrioCanonico": "Centro",
    "razon": "Categoría A — variantes de mayúsculas/espacios ya resueltas por normalizeName, sin ambigüedad cruzada (M1 §2).",
    "estado": "RESUELTO"
  },
  {
    "valorNormalizado": "villa mafe",
    "categoria": "B_VALIDACION",
    "familiaId": null,
    "fuentes": ["CLIENTE"],
    "n": 1,
    "decision": "PENDIENTE_DECISION",
    "fusionarEn": null,
    "barrioCanonico": null,
    "razon": "",
    "estado": "PENDIENTE"
  },
  {
    "valorNormalizado": "antillana",
    "categoria": "C_FAMILIA",
    "familiaId": "familia-antillana",
    "fuentes": ["CLIENTE", "NEGOCIO"],
    "n": 10,
    "decision": "PENDIENTE_DECISION",
    "fusionarEn": null,
    "barrioCanonico": null,
    "razon": "",
    "estado": "PENDIENTE"
  },
  {
    "valorNormalizado": "la antillana",
    "categoria": "C_FAMILIA",
    "familiaId": "familia-antillana",
    "fuentes": ["CLIENTE"],
    "n": 1,
    "decision": "PENDIENTE_DECISION",
    "fusionarEn": null,
    "barrioCanonico": null,
    "razon": "",
    "estado": "PENDIENTE"
  },
  {
    "valorNormalizado": "droguería fama yyy ubica en el romboy de la 25",
    "categoria": "D_DESCARTAR",
    "familiaId": null,
    "fuentes": ["CLIENTE"],
    "n": 1,
    "decision": "DESCARTAR",
    "fusionarEn": null,
    "barrioCanonico": null,
    "razon": "Ruido — descripción de negocio + referencia de ubicación, no un nombre de barrio (M1 §4).",
    "estado": "RESUELTO"
  }
]
```

**Nota explícita requerida por el equipo:** `antillana`/`la antillana` en el
ejemplo de arriba está deliberadamente dejado en `PENDIENTE_DECISION` — es
la única forma correcta de representarlo hasta que un humano revise la
evidencia de M1 §3 y decida `FUSIONAR_EN` o `MANTENER_SEPARADO`. Ningún
ejemplo de este documento (`antillana`/`la antillana`, `el tesoro`/`altos
del tesoro`, `la gaitana`/`gaitan`, etc.) debe leerse como una fusión ya
decidida — son ilustraciones del formato del ledger, no del contenido. El
ledger real que acompañe la ejecución del script tendrá las 52 entradas,
generadas mecánicamente desde `M1_INVENTARIO_BARRIO.md` con
`decision: "PENDIENTE_DECISION"` en las 38 de categoría B/C, y completadas a
mano por el equipo antes de correr el script en modo real.

**Reglas de validación del ledger** (el script las verifica antes de
ejecutar, en modo dry-run y en modo real):

- Debe tener exactamente 52 entradas, una por cada `valorNormalizado` de
  `M1_INVENTARIO_BARRIO.md` (Apéndice) — ninguna de más, ninguna de menos.
- Ninguna entrada con `decision: "PENDIENTE_DECISION"` puede procesarse — el
  script las reporta como pendientes y no crea ni vincula nada para ellas.
- **`FUSIONAR_EN` a un solo salto (ajuste 2 de la ronda 3):** el
  `valorNormalizado` referenciado en `fusionarEn` debe existir en el ledger y
  su propia entrada debe tener `decision: "CREAR_BARRIO"` o
  `decision: "MANTENER_SEPARADO"` — nunca `decision: "FUSIONAR_EN"`. Una
  cadena (`A.fusionarEn = "B"` con `B.decision = "FUSIONAR_EN"`) o un ciclo
  (`A.fusionarEn = "B"` y `B.fusionarEn = "A"`, incluido el caso trivial de
  una entrada que se referencia a sí misma) es un error de validación —no se
  ejecuta nada—. Esto garantiza que el `Barrio` destino de toda fusión existe
  y se resuelve en un único paso, sin tener que recorrer una cadena en tiempo
  de ejecución.
- Toda entrada con `decision` distinta de `PENDIENTE_DECISION` requiere
  `razon` no vacía.

### Reporte de ejecución (evidencia por registro — ajuste 1 de la ronda 3)

El ledger de M3 decide **por valor normalizado** (52 entradas). Pero cada
ejecución real del script (y también el `--dry-run`) debe producir,
además del resumen agregado (ver formato de reporte más abajo), un **log de
ejecución por registro** que permita reconstruir exactamente qué
`Cliente`/`Negocio` concreto fue afectado y cómo:

```ts
interface ExecutionLogEntry {
  entidad: 'CLIENTE' | 'NEGOCIO'
  registroId: string                 // Cliente.id / Negocio.id
  valorLegacyOriginal: string        // Cliente.barrio / Negocio.barrio tal cual está hoy — nunca se modifica, solo se registra
  valorNormalizado: string           // enlaza esta fila con su entrada en el ledger de decisiones
  barrioIdAnterior: string | null    // valor de barrioId antes de correr el script
  barrioIdResultante: string | null  // valor después — igual al anterior si no hubo cambio (no-op, conflicto, pendiente, descartado)
  resultado: 'VINCULADO' | 'YA_CORRECTO' | 'CONFLICTO' | 'PENDIENTE_DECISION' | 'DESCARTADO' | 'ERROR'
  detalleError?: string              // solo presente si resultado = 'ERROR'
}
```

Este log (uno por registro procesado, de los 177 del universo de M1 — 126
`Cliente` + 51 `Negocio`) es la evidencia que el checklist del gate de F2
(punto 5, "ejecución real sin pérdida") usa para verificar que ningún
registro queda sin contabilizar. El ledger de decisiones (52 entradas) y el
log de ejecución (hasta 177 entradas) son artefactos distintos con
propósitos distintos: uno registra **qué se decidió** por nombre, el otro
registra **qué pasó** por registro.

### Garantía de no-destrucción (categoría D y `PENDIENTE_DECISION`)

**Garantía explícita:** para toda entrada en `DESCARTAR` o que quede en
`PENDIENTE_DECISION` en el momento de ejecutar el script:

- No se crea ningún `Barrio`.
- No se toca `Cliente.barrioId` / `Negocio.barrioId` de esos registros (se
  quedan en `NULL`, tal como están hoy).
- **El valor legacy en texto (`Cliente.barrio` / `Negocio.barrio`) nunca se
  modifica ni se borra**, sea cual sea su categoría o decisión. El script
  solo *añade* un `barrioId` cuando corresponde — nunca escribe, limpia ni
  sobreescribe la columna legacy. Esto es consistente con M5 (dual-read, ya
  implementado en F1): el legacy sigue siendo válido como fallback mientras
  no se decida (en una fase futura, fuera de alcance de F2) eliminar la
  columna.

Un registro que queda sin `barrioId` tras correr el script **no está roto**
— es el estado esperado y válido para cualquier valor todavía
`PENDIENTE_DECISION` o `DESCARTAR`, tal como ya contemplaba F1.

### Decisión M4: script one-off con estado `CONFLICTO` explícito

**Propuesta:** `scripts/backfill-barrio-canonico.ts` (mismo patrón que
`scripts/generate-pwa-icons.ts` — ejecutable vía `npx tsx`), con dos modos:

#### Modo `--dry-run` (obligatorio, primer paso siempre)

Cero escrituras a la base de datos. Lee el ledger de M3, lee el estado real
de `Cliente`/`Negocio`/`Barrio` (solo `SELECT`), y produce un reporte con
estas secciones exactas:

```
=== BACKFILL BARRIO CANÓNICO — DRY RUN ===
Ledger: 52/52 entradas válidas

Barrios a crear:            <N>  (categorías A + C-resueltas + B-resueltas)
Registros a vincular:       <N>  (Cliente: <n>, Negocio: <n>)
Registros que quedan sin barrioId (PENDIENTE_DECISION): <N>  — detalle por valor
Registros que quedan sin barrioId (DESCARTAR):          <N>  — detalle por valor
CONFLICTOS detectados:       <N>  — detalle: registro, barrioId actual, barrioId esperado por el ledger
ERRORES (solo modo real):    <N>  — detalle por entrada: valorNormalizado, mensaje de error (siempre 0 en dry-run, que no escribe nada)
Anomalías:                    <N>  — ej. valorNormalizado del ledger que ya no existe en producción (dato cambió entre M1 y la ejecución)

Ledger inválido / bloqueante: <lista de errores de validación, si los hay>
```

Ningún registro se modifica en este modo. El reporte es el criterio de
aprobación final del equipo antes de correr el modo real.

#### Modelo transaccional (ajuste 3 de la ronda 3)

Antes de detallar los pasos del modo real, se deja explícito el modelo de
transacciones, porque determina cómo se interpreta cada resultado del log de
ejecución:

- **Una transacción atómica por entrada del ledger** (por `valorNormalizado`,
  no por registro individual ni una única transacción para las 52). Esa
  transacción crea el `Barrio` (si corresponde) y vincula todos los
  `Cliente`/`Negocio` asociados a ese valor.
- **No existe una transacción global para toda la corrida.** Si la
  transacción de una entrada falla (error de base de datos, timeout, lo que
  sea), hace **rollback únicamente de esa entrada** — el `Barrio` no queda a
  medio crear ni los registros a medio vincular — y esa entrada se marca
  `ERROR` en el log de ejecución (`ExecutionLogEntry.resultado = 'ERROR'` con
  `detalleError`). El script **continúa** con las demás entradas del ledger;
  un fallo puntual no aborta la corrida completa.
- **Una ejecución posterior retoma el trabajo de forma segura e
  idempotente**: las entradas ya resueltas en una corrida anterior (`Barrio`
  ya creado, registros ya vinculados) se detectan como "ya correcto" y no se
  reprocesan (ver idempotencia más abajo); las entradas que quedaron en
  `ERROR` se reintentan igual que si nunca se hubieran procesado — no hace
  falta ninguna acción manual de limpieza entre corridas.

#### Modo real

1. Valida el ledger (reglas de la sección anterior) — si falla, no ejecuta
   nada.
2. Para cada entrada `CREAR_BARRIO` (categorías A y las de B/C ya resueltas
   por el equipo con esa decisión): intenta crear el `Barrio` reutilizando
   `crearBarrio()` de `src/lib/barrios/barrio-service.ts` (sin lógica
   nueva). **No hace un `SELECT` previo para comprobar si ya existe** — deja
   que la constraint `UNIQUE(nombreNormalizado)` de F1 decida: si Postgres
   rechaza por duplicado, el script captura ese error puntual, recupera el
   `Barrio` existente con ese `nombreNormalizado` y continúa usándolo. Esto
   es exactamente lo que la garantía 6 exige: **ningún check-then-act**,
   porque un `SELECT` seguido de un `INSERT` en pasos separados es una
   condición de carrera real (dos ejecuciones concurrentes, o una ejecución
   parcial previa, podrían intercalarse entre el `SELECT` y el `INSERT`); la
   constraint de base de datos es la única fuente de verdad atómica.
3. Para cada entrada `FUSIONAR_EN`: resuelve el `Barrio` destino, que por la
   regla de validación (ajuste 2) es siempre una entrada `CREAR_BARRIO` o
   `MANTENER_SEPARADO` ya creada en el paso 2 — un solo salto, nunca una
   cadena — y vincula los registros de este valor a ese `Barrio`.
4. Para cada entrada `MANTENER_SEPARADO`: crea su propio `Barrio` (paso 2) y
   vincula solo sus propios registros.
5. **Antes de escribir `barrioId` en cada registro (`Cliente`/`Negocio`),
   revisa su valor actual** (garantía 4 — estado `CONFLICTO`):
   - `barrioId` es `NULL` → aplica el nuevo `barrioId`. Caso esperado.
   - `barrioId` ya apunta al mismo `Barrio` que resultaría de esta
     ejecución → no-op, cuenta como "ya correcto" en el reporte.
   - `barrioId` ya apunta a **otro** `Barrio` distinto → **`CONFLICTO`**:
     el script NO reasigna nada, solo lo registra en el reporte final
     (`id` del registro, `barrioId` actual, `barrioId` que el ledger
     hubiera asignado). Un conflicto nunca se resuelve automáticamente,
     ni siquiera si el ledger fue aprobado por el equipo — puede significar
     que alguien ya vinculó el registro manualmente vía la UI de F1 con
     otro criterio.
6. Excluye explícitamente los 105 registros de `Cliente` con `barrio` en
   blanco (ver M1 §0) — nunca se tratan como candidatos, ni en dry-run ni en
   modo real.
7. **Idempotencia real:** correr el script una segunda vez sobre el mismo
   ledger y el mismo estado de base de datos produce el reporte "0 Barrios
   nuevos, 0 registros vinculados nuevos, N ya correctos, 0 conflictos
   nuevos, 0 errores nuevos" — nunca duplica un `Barrio` (por la constraint)
   ni reescribe un `barrioId` ya aplicado (por el chequeo del paso 5). Las
   entradas que quedaron en `ERROR` en la corrida anterior se reintentan
   automáticamente (ver "Modelo transaccional").
8. Cada entrada del ledger se procesa en su propia transacción atómica (ver
   "Modelo transaccional" arriba) — un fallo puntual se marca `ERROR` y no
   aborta el resto de la corrida.
9. Imprime el mismo formato de reporte que el `--dry-run` (agregado por
   categoría, más el log de ejecución por registro de la sección anterior),
   pero con los cambios ya aplicados — nunca aplica cambios en silencio.

### Consistencia con `ADR-TERRITORIO-001`

El script no calcula ni asigna coordenadas, geometría ni centroides — opera
exclusivamente sobre el nombre textual. No toca `pickCoords`,
`LocationQuality`, ni ningún archivo de `src/lib/geo/`.

## Checklist verificable del gate de F2 (garantía 7)

TERRITORIO-F2 (fases M1-M4; M2 y M5 ya están implementadas en `main`, ver
`ESPECIFICACION_F2.md`) se considera terminado cuando las 7 condiciones
siguientes son demostrables, cada una con evidencia concreta (no solo
afirmadas):

1. **Ledger completo**: `scripts/backfill-barrio-canonico.decisiones.json`
   tiene exactamente 52 entradas y pasa la validación del script (ninguna
   entrada con `categoria`/`fuentes`/`n` inconsistente con
   `M1_INVENTARIO_BARRIO.md`).
2. **Cero pendientes sin justificar**: toda entrada que NO quedó en
   `PENDIENTE_DECISION` tiene una `razon` no vacía escrita por un humano —
   verificable leyendo el JSON.
3. **Cero fusiones por similitud automática**: ninguna entrada `C_FAMILIA`
   pasó a `FUSIONAR_EN`/`MANTENER_SEPARADO` sin que su `razon` referencie
   evidencia concreta (no "son similares") — revisión manual del PR que
   agrega el ledger completado, no automatizable por diseño (es juicio
   humano, no una regla de código).
4. **Dry-run limpio**: el reporte de `--dry-run` sobre producción, ejecutado
   justo antes del modo real, no muestra "Ledger inválido" ni anomalías sin
   explicar.
5. **Ejecución real sin pérdida**: la suma de resultados del log de ejecución
   (`VINCULADO + YA_CORRECTO + CONFLICTO + PENDIENTE_DECISION + DESCARTADO +
   ERROR = 177`, el total de M1: 126 `Cliente` + 51 `Negocio`) — ninguna fila
   del universo de M1 desaparece sin quedar contabilizada en algún resultado
   del log.
6. **Cero conflictos ni errores silenciosos**: si el log de ejecución muestra
   algún `CONFLICTO`, queda documentado (en el PR o en un doc de seguimiento)
   con la resolución manual tomada; si muestra algún `ERROR`, se corrige la
   causa y se re-ejecuta el script hasta que esa entrada quede resuelta — el
   gate no se cierra con conflictos ni errores sin resolver ni ignorados.
7. **Idempotencia demostrada**: correr el script una segunda vez sobre el
   estado post-ejecución produce un reporte con 0 creaciones, 0 vinculaciones
   nuevas, 0 conflictos nuevos y 0 errores nuevos — adjuntado como evidencia
   (output del comando) en el PR de M4.

Este checklist reemplaza el ítem "PENDIENTE de definir" que
`ESPECIFICACION_F2.md` (M4, "Gate del plan") dejaba abierto.

## Qué NO cubre esta propuesta

- No decide, por sí misma, ninguna fusión de las 10 familias — esa decisión
  la toma el equipo al llenar el ledger, con evidencia, antes de ejecutar el
  script.
- No toca `Pedido.barrioEntrega` (solo 1 registro con valor, ya cubierto por
  el cluster `instituto` — categoría A) — no requiere backfill separado.
- No implementa nada de F3 (Zona) ni F6 (planner).

## Pedido de aprobación

Esta es la revisión 3, con los 3 ajustes puntuales pedidos sobre la
revisión 2 ya incorporados: (1) el ledger de M3 queda explícitamente
separado del reporte/log de ejecución por registro; (2) `FUSIONAR_EN` exige
un destino directo (`CREAR_BARRIO`/`MANTENER_SEPARADO`), sin cadenas ni
ciclos; (3) el modelo transaccional queda explícito — una transacción
atómica por entrada del ledger, rollback solo de la entrada que falla,
estado `ERROR` reintentable en la siguiente corrida. La dirección
arquitectónica de fondo (JSON versionado + script one-off + dry-run +
ejecución transaccional + idempotencia + constraint DB como autoridad +
legacy intacto + conflictos explícitos) no cambió.

¿Aprueban esta revisión para que TERRITORIO-F2 pase a implementación? Si no
hay más objeciones, esto queda como la base aprobada para escribir
`scripts/backfill-barrio-canonico.ts`.
