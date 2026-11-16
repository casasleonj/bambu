**La separación verificable ocurre al generar candidatos por campo; bajar el ranking no garantiza excluir identificadores parecidos.** [Meilisearch, especificación](https://github.com/meilisearch/specifications/blob/main/text/0117-typo-tolerance-setting-api.md).
Consulta de todas las URL: **15-11-2026**. **V** = documentación/código leído; **I** = inferencia propia; **SIN FUENTE** = evidencia solicitada no encontrada.

**1. Separación real entre nombres e identificadores**

- **V · Algolia:** `disableTypoToleranceOnAttributes` excluye atributos de las correcciones; documenta expresamente SKU y teléfonos. Es configuración por campo dentro del índice. [Documentación](https://www.algolia.com/doc/api-reference/api-parameters/disableTypoToleranceOnAttributes).
- **V · Typesense:** `query_by=name,phone_number,zip_code` con `num_typos=2,0,0` permite errores solamente en nombres. También documenta `drop_tokens_threshold=0` para impedir que elimine palabras buscando resultados. [Guía](https://typesense.org/docs/guide/ranking-and-relevance.html).
- **V · Meilisearch:** `disableOnAttributes` impide que un campo aporte candidatos con erratas; quitar la regla de ranking `typo` **no desactiva** el fuzzy. [Especificación](https://github.com/meilisearch/specifications/blob/main/text/0117-typo-tolerance-setting-api.md).
- **V · ERP real, Odoo 18:** su búsqueda web evita fuzzy con menos de cuatro caracteres, varias palabras o ≥80% dígitos; enumera candidatos usando `word_similarity` y normalización `unaccent`. [Código](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/website/models/website.py).
- **I · Límite de ese precedente:** `FAC-00120` no cumple ≥80% dígitos; ese guard no demuestra protección de facturas, usernames ni otros identificadores alfanuméricos. [Código examinado](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/website/models/website.py).
- **I · Traducción a PostgreSQL:** predicados separados: identificadores normalizados con `=`/`LIKE`; nombres con operadores trigram. Un GIN puede acelerar tanto `LIKE` como fuzzy: **el índice no impone la invariante; el predicado sí**. Columnas separadas facilitan mantenerla. [Operadores e índices](https://www.postgresql.org/docs/18/pgtrgm.html).

**2. Umbrales, operadores y español**

- **V:** `%` aplica `similarity`, predeterminado **0,3**; `<%` aplica `word_similarity`, **0,6**; `<<%` exige límites de palabra, **0,5**. Son valores distintos, no intercambiables. [PostgreSQL 18](https://www.postgresql.org/docs/18/pgtrgm.html).
- **V:** Odoo publica **0,3 para `word_similarity`** y mínimo de cuatro caracteres para activar su fallback. **SIN FUENTE:** justificación experimental de ese umbral para nombres de personas/empresas en español. [Código](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/website/models/website.py).
- **SIN FUENTE:** umbral y longitud mínima publicados, validados y transferibles a vuestro catálogo español; no puedo recomendar numéricamente uno como demostrado.
- **V · Español:** `unaccent` es una extensión distribuida con PostgreSQL, basada en reglas de sustitución; permite normalizar antes de comparar. **SIN FUENTE:** certificación específica de “estabilidad para español”. [Documentación](https://www.postgresql.org/docs/18/unaccent.html).
- **I · Español:** aplicar la misma normalización al dato y consulta, e indexar la representación consultada, evita comparar variantes incompatibles; no debe suponerse equivalencia exacta entre `unaccent` y vuestra función NFD. [Reglas de unaccent](https://www.postgresql.org/docs/18/unaccent.html).

**3. Ranking reproducible**

- **V · Meilisearch:** publica una cadena ordenada de reglas —palabras, erratas, proximidad, atributos, etc.—, configurable; no prescribe vuestra jerarquía completa exacto→prefijo→contiene→fuzzy. [Ranking](https://www.meilisearch.com/docs/capabilities/full_text_search/relevancy/ranking_rules).
- **V · SQL:** `ts_rank` permite pesos D/C/B/A, predeterminados **0,1/0,2/0,4/1**; `ts_rank_cd` incorpora proximidad. Estos pesos representan importancia de lexemas/campos, no clases exacto/prefijo/fuzzy. [PostgreSQL](https://www.postgresql.org/docs/18/textsearch-controls.html).
- **I · Para garantizar vuestra jerarquía:** ordenar por una categoría discreta de coincidencia y después por relevancia e ID estable; una suma de pesos necesita demostrar que ninguna combinación inferior supera la superior. Es propuesta propia, **SIN FUENTE** como receta empresarial exacta.
- **V · Fuse.js:** el mantenedor documenta influencia de `fieldNormWeight`, incluso sesgos con múltiples valores. **SIN FUENTE:** ponderación publicada que garantice vuestra jerarquía; la página oficial de teoría no pudo abrirse. [Respuesta del mantenedor](https://github.com/krisk/Fuse/discussions/716).

**4. Incidentes de negocio**

- **SIN FUENTE:** no encontré un postmortem verificable de autocompletado fuzzy de identificadores que causara específicamente cobro, factura o envío al registro equivocado.
- **V · Demostración técnica, no incidente:** Meilisearch muestra que un ISBN inválido devuelve otros libros con typo tolerance y cómo excluir `isbn`. Prueba el falso candidato, no una pérdida económica. [Ejemplo oficial](https://www.meilisearch.com/blog/typo-tolerance).

**5. Casos obligatorios — español**

- **I · `mas por menos`→`Más por Menos`:** normalización de diacríticos y mayúsculas; no requiere distancia de edición. [Mecanismo unaccent](https://www.postgresql.org/docs/18/unaccent.html).
- **I · `pun`→`Punti Frío`:** prefijo de palabra; **`MAX`→`Máximo`:** minúsculas+tildes+prefijo. Ninguno exige tratar la entrada como errata. PostgreSQL admite prefijos de lexema mediante `:*`. [Consulta de prefijos](https://www.postgresql.org/docs/18/textsearch-controls.html).
- **I · `perez juan`→`Juan Pérez`:** normalización y conjunción de tokens sin exigir orden; no una búsqueda de frase. `plainto_tsquery` combina términos con AND. [PostgreSQL](https://www.postgresql.org/docs/18/textsearch-controls.html).
- **I · Abreviatura distinta de prefijo:** una equivalencia convencional necesita alias/sinónimo; no se deduce automáticamente de esos ejemplos. **SIN FUENTE:** repertorio validado de abreviaturas españolas para vuestro ERP.

**6. Performance medida y límites**

- **V:** benchmark publicado por el autor de `pg_tre`: PostgreSQL **18.3**, **1 millón** de filas sintéticas de ≈85 caracteres, caché caliente; GIN trigram **159 MB**, construcción **28 s**, consultas `LIKE` **29–35 ms**. No mide fuzzy de nombres españoles ni concurrencia ERP. [Resultados](https://pgxn.org/dist/pg_tre/doc/perf.html).
- **V:** PGroonga publica **5,3 millones** de artículos Wikipedia, PostgreSQL **9.6.1**, 32 GiB RAM; consulta `database`: trigram **33 s**, textsearch **602 ms**, con distintos conjuntos de resultados. Es evidencia histórica de texto largo, no comparación equivalente de catálogos. [Benchmark y scripts](https://pgroonga.github.io/reference/pgroonga-versus-textsearch-and-pg-trgm.html).
- **SIN FUENTE:** volumen universal a partir del cual abandonar GIN. **I:** decidir mediante medición representativa de latencia, selectividad, escrituras y concurrencia; los dos benchmarks no permiten fijar ese corte.

**Estado:** investigación condicionada por esas brechas; sin implementación ni pruebas ejecutadas. Código local leído a SHA `5547026290a91256110634c7456b2a96ec8bc791`; árbol limpio. Contraste auxiliar: `codex exec --sandbox read-only`, modelo `gpt-6.1-sol`, proveedor `openai`; sus respuestas no se usaron como evidencia.