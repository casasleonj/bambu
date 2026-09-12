# M1 — Inventario real de barrio (evidencia de producción)

- Estado: EJECUTADO — evidencia de producción / estado técnico actual, **no es una
  decisión de producto**.
- Fecha: 2026-09-12
- Alcance: consultas de solo lectura contra Supabase producción (proyecto
  `wdttkrlbpcawulaaiapj`). **Cero escrituras** — no se creó ningún `Barrio`, no se
  ejecutó backfill, no se modificó ningún registro.
- Fuente: `docs/territorio/ESPECIFICACION_F2.md` §M1. Esta evidencia alimenta la
  Ronda 1 de las dos propuestas abiertas ahí (persistencia de equivalencias,
  mecanismo de backfill) — no las resuelve por sí sola.
- Normalización aplicada: `normalizeName` real (`src/lib/import/normalizer.ts`,
  reutilizado sin cambios por `src/lib/barrios/normalizer.ts`) — NFD, strip de
  diacríticos, `trim`, minúsculas, colapso de espacios. Aplicada manualmente
  sobre los valores crudos para este análisis; no se ejecutó código nuevo.

## 0. Corrección a la evidencia inicial del equipo

La cifra "231 con valor" en `Cliente.barrio` (`IS NOT NULL`) es correcta, pero
**105 de esos 231 registros son strings vacíos tras `trim` (solo espacios en
blanco)** — no son barrios "sucios", son efectivamente **sin valor**. La cifra
real de Cliente con un valor de barrio *utilizable* es **126**, no 231.

| | Total registros | `barrio` no-null | `barrio` con valor tras `trim` | Distintos (con valor) |
|---|---|---|---|---|
| `Cliente` | 232 | 231 | **126** | 61 |
| `Negocio` | 76 | 51 | 51 | 35 |
| `Pedido.barrioEntrega` | 198 | — | 1 | 1 |

`normalizeName(' ')` (o cualquier string solo-espacios) da `''` — estos 105
registros de `Cliente` deben tratarse como **"sin barrio"**, nunca como
candidatos a un `Barrio` canónico llamado `""`. Esto es una regla que M4 debe
aplicar explícitamente (filtrar antes de normalizar, no después).

## 1. Catálogo canónico actual

```sql
SELECT COUNT(*) FROM "Barrio";                          -- 0
SELECT COUNT(*) FROM "Cliente" WHERE "barrioId" IS NOT NULL;  -- 0
SELECT COUNT(*) FROM "Negocio" WHERE "barrioId" IS NOT NULL;  -- 0
```

**Cero `Barrio` creados, cero vínculos `barrioId` en producción.** El flujo de
F1 (crear/vincular barrio desde la UI) todavía no se usó en producción. M1
parte de una pizarra limpia — no hay riesgo de colisión con barrios creados a
mano ni de invalidar vínculos existentes.

## 2. Clusters resueltos por normalización determinista (sin ambigüedad)

Estos grupos ya colapsan a un único `nombreNormalizado` — la normalización
existente los unifica sola, sin necesidad de matching difuso. `n` = ocurrencias
totales sumando `Cliente` + `Negocio` + `Pedido`.

| `nombreNormalizado` | Variantes crudas (fuente) | n total |
|---|---|---|
| `centro` | "Centro"×51, "centro"×2 (C) · "centro"×6, "Centro"×1 (N) | 60 |
| `san jose` | "san jose"×3, "San jose"×1, "san jose "×1, "San Jose "×1, "San José  "×1 (C) · "san jose"×3, "San jose"×1, "San José"×1 (N) | 12 |
| `antillana` | "antillana "×3, "Antillana "×2, "Antillana"×1 (C) · "antillana"×4 (N) | 10 |
| `instituto` | "instituto"×2, "Instituto"×1 (C) · "instituto"×4 (N) · "Instituto "×1 (P) | 8 |
| `martinez barbosa` | "Martinez Barbosa "×3, "Martinez barbosa"×1, "Martinez Barbosa"×1 (C) · "Martínez Barbosa"×2, "Martinez Barbosa"×1 (N) | 8 |
| `camilo torres` | "Camilo Torres "×3, "camilo torres"×1, "Camilo Torres"×1 (C) · "camilo torres"×1 (N) | 6 |
| `las palmeras` | "las Palmeras"×2, "las palmeras"×1, "las palmeras "×1 (C) · "las palmeras"×1 (N) | 5 |
| `el tesoro` | "El tesoro"×3 (C) · "El tesoro"×1 (N) | 4 |
| `laureles` | "Laureles "×2 (C) · "laureles"×1, "Laureles "×1 (N) | 4 |
| `alfonso avila` | "alfonso avila"×1, "alfonso avila "×1 (C) · "alfonso avila"×1 (N) | 3 |
| `mercado` | "mercado"×1 (C) · "mercado"×1, "Mercado"×1 (N) | 3 |
| `tiburon` | "tiburon"×1 (C) · "tiburon"×2 (N) | 3 |
| `margaritas 2` | "margaritas 2"×1, "Margaritas 2"×1 (C) | 2 |
| `el socorro` | "El socorro"×1 (C) · "el socorro"×1 (N) | 2 |
| `socorro` | "socorro"×1, "Socorro"×1 (C) | 2 |
| `fatima` | "Fatima"×1 (C) · "Fatima"×1 (N) | 2 |
| `la pista` | "La Pista "×1 (C) · "la pista"×1 (N) | 2 |
| `la variante` | "la variante "×1 (C) · "la variante"×1 (N) | 2 |
| `las flores` | "Las flores "×1 (C) · "las flores"×1 (N) | 2 |
| `variante` | "Variante "×1 (C) · "Variante"×1 (N) | 2 |
| `villa eduardo` | "villa eduardo "×1 (C) · "villa eduardo"×1 (N) | 2 |
| `5 de diciembre` | "5 de Diciembre "×1 (C) · "5 de diciembre"×1 (N) | 2 |
| `aida quintero` | "Aida Quintero"×1 (C) · "aida quintero"×1 (N) | 2 |

Valores únicos sin variantes de escritura (una sola fuente, una sola grafía) —
se vuelven candidatos directos a `Barrio` nuevo, sin conflicto de matching,
pero como aparecen una sola vez conviene una revisión humana ligera antes de
darlos por buenos (podrían ser errores de tipeo aislados, no necesariamente
ruido): `15 de noviembre`, `20 de marzo`, `altos del tesoro`, `el carmen`,
`el estadio`, `el libano`, `la antillana`, `la gaitana`, `la victoria`,
`las margaritas 2`, `libano`, `los laureles`, `margarita 1`, `margaritas`,
`palmeras`, `primero de mayo`, `santa rita`, `urbanizacion don emerito`,
`villa mafe`, `villa olimpica`, `machique` (N), `15 diciembre` (N),
`barrio las delicias` (N), `gaitan` (N), `mercado publico` (N),
`nueva esperanza` (N), `san martin` (N), `san vicente` (N).

## 3. Casos ambiguos — familias que probablemente son el mismo barrio real pero NO normalizan igual

Ninguno de estos debe fusionarse automáticamente. Cada familia requiere una
decisión humana explícita (Fase M3/M4), consistente con R2/R6 del Plan Técnico
("la normalización no es fusión automática" / "no inventar certeza").

| Familia | Variantes (normalizadas) y `n` | Por qué es ambigua, no automática |
|---|---|---|
| antillana | `antillana`(10) vs `la antillana`(1) | Diferencia es solo el artículo "la" — muy probable mismo barrio, pero es una decisión de fusión, no un match textual exacto |
| palmeras | `las palmeras`(5) vs `palmeras`(1) | Mismo patrón — artículo "las" |
| laureles | `laureles`(4) vs `los laureles`(1) | Mismo patrón — artículo "los" |
| socorro | `socorro`(2) vs `el socorro`(2) | Mismo patrón, además empatados en frecuencia — ninguno domina |
| variante | `variante`(2) vs `la variante`(2) | Mismo patrón, empatados |
| libano | `libano`(1) vs `el libano`(1) | Mismo patrón, empatados |
| tesoro | `el tesoro`(4) vs `altos del tesoro`(1) | Probablemente lugares **relacionados pero distintos** ("Altos del Tesoro" suena a sector diferenciado) — riesgo real de fusión incorrecta |
| mercado | `mercado`(3) vs `mercado publico`(1) | Incierto si es el mismo lugar o una referencia distinta (zona comercial vs. barrio) |
| gaitana/gaitán | `la gaitana`(1, Cliente) vs `gaitan`(1, Negocio) | Similar textualmente pero con terminación real distinta (-a vs -án) — alto riesgo de fusión incorrecta si se automatiza por similaridad |
| margaritas (familia completa) | `margaritas`(1), `margaritas 2`(2), `las margaritas 2`(1), `margarita 1`(1) | Patrón típico de sub-sectores numerados reales en Colombia (I/II) — probablemente son **2 o 3 barrios distintos**, no uno. Requiere resolución caso por caso, no una fusión de familia completa |
| diciembre (no ambiguo, aclaración) | `5 de diciembre`(2) vs `15 diciembre`(1, Negocio) vs `15 de noviembre`(1, Cliente) | **No son ambiguos entre sí** — son 3 fechas/nombres distintos que comparten palabras. Se listan aquí solo para dejar constancia de que no deben confundirse por similaridad superficial |

## 4. Valor inválido / ruido

- `"Droguería fama YyY ubica en el romboy de la 25"` (`Cliente`, 1 registro) —
  no es un nombre de barrio; es una descripción de negocio + referencia de
  ubicación ("ubicado en el rombo de la 25"). **No debe convertirse en
  `Barrio`.** Candidato a quedar como excepción/no-match en M4, o a corregirse
  manualmente en `Cliente.barrio` (fuera de alcance de F2).
- `"Barrio las Delicias"` (`Negocio`, 1 registro) — no es ruido (es un nombre
  de barrio real), pero tiene el prefijo redundante "Barrio " embebido en el
  valor. `normalizeName` actual no lo separa. Se deja como hallazgo para la
  Ronda 1 de M3 — no se decide aquí si vale la pena un paso adicional de
  limpieza de prefijos.

## 5. Cruce entre Cliente / Negocio / Pedido

18 de los 52 nombres normalizados distintos aparecen en **más de una fuente**
(`Cliente` y `Negocio`, o las tres): `centro`, `san jose`, `antillana`,
`instituto` (las tres fuentes), `martinez barbosa`, `camilo torres`,
`las palmeras`, `el tesoro`, `laureles`, `alfonso avila`, `mercado`, `tiburon`,
`el socorro`, `fatima`, `la pista`, `la variante`, `las flores`, `variante`,
`villa eduardo`, `5 de diciembre`, `aida quintero`. Esta coincidencia
cross-entidad es la señal de confianza más fuerte de que un nombre corresponde
a un barrio real (dos fuentes independientes de captura de datos coinciden),
y debería pesar en el diseño del scoring de M3 — más que la sola frecuencia
dentro de una tabla.

El único valor de `Pedido.barrioEntrega` (`"Instituto "`) coincide exactamente
con el cluster `instituto` ya visto en `Cliente`/`Negocio` — no es un dato
sospechoso aislado, es consistente con el resto de la evidencia. El problema
real de `Pedido.barrioEntrega` no es calidad de dato sino **cobertura**: 197 de
198 pedidos no tienen el campo poblado.

## 6. Resumen cuantitativo

- **52 nombres normalizados distintos** en total (`Cliente` + `Negocio`;
  `Pedido` no aporta ninguno nuevo).
- **23 clusters** ya resueltos por normalización determinista (variantes de
  mayúsculas/acentos/espacios de un mismo nombre) — cero ambigüedad.
- **28 valores** que aparecen con una sola grafía (posibles `Barrio` directos,
  con revisión humana ligera recomendada antes de crear cada uno).
- **~9 familias ambiguas** (≈20 valores) que requieren decisión humana
  explícita antes de cualquier fusión — no son matcheables por normalización
  ni deberían auto-fusionarse solo por similaridad textual alta (el caso
  "gaitana/gaitán" y "tesoro/altos del tesoro" muestran que la similaridad
  alta puede ser engañosa).
- **1 valor** es ruido evidente, no un barrio.
- **105 registros de `Cliente`** tienen `barrio` efectivamente vacío (solo
  espacios) pese a no ser `NULL` — deben excluirse de cualquier matching, no
  tratarse como "sin dato limpio".

Ningún número de esta sección es una meta ni una decisión de diseño — es el
conteo real sobre el que la Ronda 1 de M3/M4 debe apoyarse.

## 7. Qué NO se hizo (explícitamente fuera de alcance de M1)

- No se creó ningún `Barrio`.
- No se ejecutó backfill ni se tocó `barrioId` de ningún registro.
- No se decidió el modelo de persistencia de equivalencias (`ImportStagingRow`
  extendido vs. modelo propio) — sigue como PROPUESTA abierta en
  `ESPECIFICACION_F2.md`.
- No se decidió si el backfill es script one-off o necesita UI de revisión —
  sigue como PROPUESTA abierta.
- No se tocó el modelo geográfico (`pickCoords`, `LocationQuality`) — consistente
  con `ADR-TERRITORIO-001`.

## Apéndice — listas crudas completas (verificables)

**`Cliente.barrio` (61 valores distintos, con valor tras `trim`):**
`Centro`×51, `antillana `×3, `Camilo Torres `×3, `El tesoro`×3,
`Martinez Barbosa `×3, `san jose`×3, `Antillana `×2, `centro`×2, `instituto`×2,
`las Palmeras`×2, `Laureles `×2, `15 de Noviembre `×1, `20 de marzo`×1,
`5 de Diciembre `×1, `Aida Quintero`×1, `alfonso avila`×1, `alfonso avila `×1,
`Altos del tesoro `×1, `Antillana`×1, `camilo torres`×1, `Camilo Torres`×1,
`Droguería fama YyY ubica en el romboy de la 25`×1, `el carmen `×1,
`El Estadio `×1, `el libano`×1, `El socorro`×1, `Fatima`×1, `Instituto`×1,
`La Antillana `×1, `La gaitana `×1, `La Pista `×1, `la variante `×1,
`La victoria `×1, `Las flores `×1, `las margaritas 2`×1, `las palmeras`×1,
`las palmeras `×1, `libano`×1, `Los Laureles`×1, `Margarita 1`×1,
`margaritas`×1, `margaritas 2`×1, `Margaritas 2`×1, `Martinez barbosa`×1,
`Martinez Barbosa`×1, `mercado`×1, `palmeras`×1, `Primero de mayo`×1,
`San jose`×1, `san jose `×1, `San Jose `×1, `San José  `×1, `Santa Rita `×1,
`socorro`×1, `Socorro`×1, `tiburon`×1, `urbanizacion don emerito `×1,
`Variante `×1, `villa eduardo `×1, `villa mafe`×1, `villa Olimpica`×1.

**`Negocio.barrio` (35 valores distintos):**
`centro`×6, `antillana`×4, `instituto`×4, `san jose`×3, `machique`×2,
`Martínez Barbosa`×2, `tiburon`×2, `15 diciembre`×1, `5 de diciembre`×1,
`aida quintero`×1, `alfonso avila`×1, `Barrio las Delicias`×1,
`camilo torres`×1, `Centro`×1, `el socorro`×1, `El tesoro`×1, `Fatima`×1,
`gaitan`×1, `la pista`×1, `la variante`×1, `las flores`×1, `las palmeras`×1,
`laureles`×1, `Laureles `×1, `Martinez Barbosa`×1, `mercado`×1, `Mercado`×1,
`mercado publico`×1, `nueva esperanza`×1, `San jose`×1, `San José`×1,
`San Martin`×1, `san vicente`×1, `Variante`×1, `villa eduardo`×1.

**`Pedido.barrioEntrega` (1 valor distinto):** `Instituto `×1.
