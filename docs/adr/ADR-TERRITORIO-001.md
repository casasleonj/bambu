# ADR-TERRITORIO-001 — Barrio canónico y relación con el modelo geográfico

- Estado: Aceptado
- Fecha: 2026-09-12
- Fuente: ALS "Barrio canónico + Zona territorial + Clientes + Distribución/Rutas" v1.0 (2026-09-09) · Plan Técnico Barrio/Zona v1.0 (2026-09-09) · PR #248 (F1 del ALS Barrio/Zona, mergeado 2026-09-10, squash `22fcfdb`)
- Reconcilia: `ADR-PLANIFICADOR-004` (Aceptado, 2026-08-30)
- Fase: F1 del ALS Barrio/Zona (implementada, no se revierte). Bloqueaba F2 del ALS Barrio/Zona hasta esta reconciliación.

## Contexto

`ADR-PLANIFICADOR-004` (Aceptado, gate F0/F1 del epic Planificador de Distribución, 2026-08-30) estableció que "no existe tabla geográfica nueva" y enumeró explícitamente, entre lo que no existe, la "tabla `Barrio`". El modelo geográfico del planificador se apoya en columnas de `Cliente`/`Negocio`/`Pedido` (`lat/lng`, `barrio` como string, `linkUbicacion`) y en reglas puras (`pickCoords`, `LocationQuality`, `haversineKm`).

Diez días después, el ALS "Barrio canónico + Zona territorial..." (2026-09-09) definió `Barrio` como catálogo canónico de identidad territorial. Su Fase 1 — implementada vía PR #248, mergeada en `main` el 2026-09-10 — introdujo el modelo `Barrio` y las columnas `Cliente.barrioId`/`Negocio.barrioId`.

Esto generó una contradicción documental directa: un ADR "Aceptado" afirmando que `Barrio` no existe, y el código real teniéndolo. Ningún commit ni documento reconcilió ambos antes de esta fecha. Este ADR resuelve la contradicción sin invalidar el trabajo geográfico ya aceptado en `ADR-PLANIFICADOR-004`.

Nota aparte, detectada durante esta reconciliación: `docs/adr/README.md` listaba los 6 ADRs de Planificador (`001`-`006`) bajo el epígrafe "Propuesta, gate F0/F1 — no están aceptados", cuando los 6 archivos individuales dicen "Estado: Aceptado" desde el 2026-08-30. Es una inconsistencia de índice, no de contenido; se corrige junto con este ADR (ver "Actualización de README").

## Decisión

### 1. La introducción de `Barrio` (F1 del ALS Barrio/Zona) es vigente y no se revierte

`Barrio`, `Cliente.barrioId`, `Negocio.barrioId` (PR #248) quedan como el catálogo canónico de identidad territorial de la aplicación. No se replantea ni se revierte por esta reconciliación.

### 2. Se supersede exclusivamente la afirmación "no existe tabla Barrio"

La única parte de `ADR-PLANIFICADOR-004` que queda **OBSOLETA** es:
- la premisa de Contexto: "No existe: `placeId`, tabla `Barrio`, polígonos/zonas...";
- la parte de la Decisión §1 ("Sin tabla geográfica nueva") que niega la existencia de una tabla territorial.

Todo lo demás de `ADR-PLANIFICADOR-004` — `LocationQuality`, la jerarquía de resolución del motor, Haversine, el backfill de coordenadas, la ausencia de geocoder — **sigue vigente sin cambios** (detalle en la tabla de la sección siguiente).

### 3. Regla central: Barrio = identidad territorial; proximidad = evidencia geográfica real

Son dos conceptos distintos que no deben combinarse:

```text
Barrio    → identidad territorial canónica (nombre, existencia, pertenencia)
Ubicación → evidencia geográfica real (coordenadas, calidad, origen)
```

`Barrio` no tiene, y no debe adquirir en fases futuras sin un ADR propio, ninguna de estas propiedades: coordenadas propias, geometría/polígono, o un centroide derivado de su nombre.

### 4. Reglas geográficas de `ADR-PLANIFICADOR-004` que siguen vigentes sin cambios

- Nunca geocodificar el nombre textual de un barrio para inventar un centroide.
- Nunca asignar coordenadas artificiales a un `Barrio`.
- `Barrio` nunca se trata como geometría.
- La proximidad se calcula siempre a partir de coordenadas reales/evidencia geográfica disponible (`pickCoords`, `LocationQuality`; el centroide de un barrio, cuando se usa, se **deriva de los clientes** con ≥2 puntos `PRECISE`/`APPROX` — nunca de un centroide propio de `Barrio`).
- Si no hay evidencia geográfica suficiente, el sistema expresa incertidumbre (`PROXIMIDAD_DESCONOCIDA`, bandeja de excepciones) — nunca la inventa.
- Haversine sigue siendo la distancia del MVP donde corresponda.
- `Barrio` puede funcionar como identidad, filtro, reporting y señal territorial — incluyendo agrupar por barrio cuando falta GPS, tal como ya preveía `ADR-PLANIFICADOR-004` §3 — sin que eso lo convierta en una entidad geométrica.

### 5. Relación futura con Zona y el planificador (no implementada; queda para su propio ADR)

- `Zona` (F3 del ALS Barrio/Zona, sin empezar) será una agrupación territorial/comercial de `Barrio`s (M:N vía `ZonaBarrio`) — igual que `Barrio`: identidad, no geometría.
- La integración con el planificador (F6 del ALS Barrio/Zona, sin empezar) debe respetar la jerarquía de resolución ya aceptada en `ADR-PLANIFICADOR-004` §5 (`pickCoords` → centroide de barrio derivado de clientes → ruta habitual → excepción). `Barrio`/`Zona` pueden aportar una señal adicional dentro de esa jerarquía (explicar agrupaciones, detectar continuidad territorial) — nunca reemplazar la evidencia de coordenadas.
- Ningún ADR vigente autoriza construir centroides propios de `Barrio`/`Zona`, tablas de polígonos, ni distancia derivada del nombre territorial. Cualquier cambio a esta regla requiere su propio ADR, explícito.

## Qué queda supersedido vs. vigente de `ADR-PLANIFICADOR-004`

| Parte de `ADR-PLANIFICADOR-004` | Estado tras este ADR |
|---|---|
| Contexto: "No existe: ... tabla `Barrio`" | **OBSOLETO** — `Barrio` existe desde PR #248 |
| Decisión §1, premisa "sin tabla geográfica nueva" | **OBSOLETO** en esa premisa puntual |
| Decisión §1, regla gemela `pickBarrio(pedido)` | **VIGENTE** — sigue siendo la forma de leer el string legacy `barrio` de un pedido; no se reemplaza en esta fase |
| Decisión §2, `LocationQuality` | **VIGENTE**, sin cambios |
| Decisión §3, "proximidad entre barrios: derivada de los clientes, nunca del nombre" | **VIGENTE**, sin cambios — regla central de este ADR |
| Decisión §4, Haversine como distancia MVP | **VIGENTE**, sin cambios |
| Decisión §5, jerarquía de resolución del motor | **VIGENTE**, sin cambios |
| Decisión §6, backfill de coordenadas (`backfillClienteCoords`) | **VIGENTE**, sin cambios — no relacionado con `Barrio` |
| Decisión §7, sin geocoder de direcciones | **VIGENTE**, sin cambios |

## Fuera de alcance de este ADR

- El modelo de `Zona`/`ZonaBarrio` (F3 del ALS Barrio/Zona) — su propio ADR cuando corresponda.
- Cómo exactamente el planificador consumirá `Barrio` como señal (F6 del ALS Barrio/Zona).
- `geocodeOrigen`/`geocodeAt` en `Negocio` — seguía pendiente en `ADR-PLANIFICADOR-004`, sigue pendiente aquí.
- El diseño de matching/backfill de F2 del ALS Barrio/Zona — ver `docs/territorio/ESPECIFICACION_F2.md`.

## Verificación

- `Barrio` no tiene columnas de coordenadas ni geometría en `prisma/schema.prisma` (`id, nombre, nombreNormalizado, activo, createdAt, updatedAt`).
- Ningún código de F1 (`src/lib/barrios/**`, `src/app/api/barrios/**`) calcula distancias ni centroides.
- `src/lib/geo/pedido-coords.ts` (`pickCoords`) no fue modificado por PR #248 — el planificador sigue sin depender de `Barrio`.

## Actualización de README

`docs/adr/README.md` se actualiza junto con este ADR para: (a) reflejar que los 6 ADRs de Planificador están Aceptados, no en estado de propuesta; (b) agregar este ADR al índice; (c) anotar la reconciliación con `ADR-PLANIFICADOR-004`.
