# ADR-PLANIFICADOR-004 — Modelo geográfico y calidad de ubicación

- Estado: **Propuesta** — pendiente de sign-off del PO (gate F0/F1)
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §9-§15, §59 · F0 §3, §4, §16
- Fase: F1. Bloquea F2.

## Contexto

Modelo existente (F0 §3):
- `Cliente`: `lat?/lng? (Decimal 10,6)`, `barrio? (string, @@index)`, `linkUbicacion?`,
  `geocodeOrigen? ('PARSED_URL'|'GPS_HISTORIAL'|'NEGOCIO'|'MANUAL')`, `geocodeAt?`.
- `Negocio`: `lat?/lng?`, `barrio?`, `linkUbicacion?`. **Sin** `geocodeOrigen`/`geocodeAt`.
- `Pedido`: `gpsLat?/gpsLng?` (GPS de entrega), `direccionEntrega?`, `barrioEntrega?`.
- Reglas: `pickCoords` (negocio gana, `src/lib/geo/pedido-coords.ts`), `haversineKm`,
  DBSCAN (`dbscan.ts` + `cluster-clientes.ts`), `backfillClienteCoords`
  (`linkUbicacion` → mediana GPS → negocioDefault).
- **No existe:** `placeId`, tabla `Barrio`, polígonos/zonas, distancia vial, geocoder
  de direcciones.

Datos de producción (F0 §16): **1.1%** de clientes con coords, **41%** con barrio,
**0** pedidos con GPS histórico, **63 (35%)** con `linkUbicacion`.

## Decisión propuesta

### 1. Sin tabla geográfica nueva (v4 riesgo R3)

Se usa `Cliente`/`Negocio`/`Pedido` tal como están. `pickCoords` es la regla única
de coords efectivas. Se agrega la regla gemela `pickBarrio(pedido)` =
`barrioEntrega ?? negocio.barrio ?? cliente.barrio ?? null`.

### 2. Calidad de ubicación: derivada en runtime, sin columna nueva

Enum de aplicación `LocationQuality`:

| Nivel | Regla |
|---|---|
| `PRECISE` | coords presentes, `geocodeOrigen IN ('MANUAL','PARSED_URL','GPS_HISTORIAL')`, `geocodeAt` < 6 meses (o null si origen MANUAL) |
| `APPROX` | coords presentes con `geocodeOrigen='NEGOCIO'` o `geocodeAt` ≥ 6 meses |
| `BARRIO_ONLY` | sin coords, con barrio |
| `NONE` | ni coords ni barrio |

`Negocio` no tiene `geocodeOrigen` → sus coords se tratan como `APPROX` salvo que
se agregue el campo (aditivo, opcional, decidir en F2 si vale la pena).

Cada `PlanParada.ubicacionUsada` guarda `{ lat, lng, fuente, calidad }`.

### 3. Proximidad entre barrios: derivada de los clientes, nunca del nombre

No hay tabla de barrios ni centroides. Para "¿barrio A cerca de barrio B?":

- Si **cada** barrio tiene ≥ 2 clientes/negocios con coords `PRECISE`/`APPROX` →
  centroide = mediana de esas coords; distancia = `haversineKm` entre centroides.
- Si no → `PROXIMIDAD_DESCONOCIDA`. Los barrios **no se combinan
  automáticamente**; la combinación va a la bandeja de excepciones
  (`LOW_LOCATION_CONFIDENCE`) para decisión humana.
- **Nunca** geocodificar el string del barrio a un centroide inventado (v4 §12).

### 4. Distancia: geodésica (Haversine) para el MVP

`haversineKm` para clustering y secuenciación. **No** se presenta como tiempo vial
(v4 §13). Distancia/tiempo vial (OSRM u otro) → epic posterior, solo si el piloto
muestra que la geodésica agrupa mal en la topología real de la ciudad.

### 5. Jerarquía de resolución para el motor (v4 §11)

Por cada pedido elegible, el motor resuelve su "ancla" así:

```
1. pickCoords(pedido)  → si PRECISE/APPROX: punto exacto
2. centroide del barrio (si computable, punto 3) → punto aproximado + flag
3. ruta habitual (pickRutaId) → señal de grupo, sin punto
4. sin ancla → excepción LOW_LOCATION_CONFIDENCE / MISSING_DATA
```

El pedido sin ancla **no bloquea** la generación: entra a la bandeja de
excepciones y el resto del plan se genera igual (v4 §8 del vFinal).

### 6. Backfill (prerequisito de F2 — F0 §0.a)

- **Corrida única + cron incremental** de `backfillClienteCoords` para los 63
  clientes con `linkUbicacion` (`geocodeOrigen='PARSED_URL'`).
- La palanca `GPS_HISTORIAL` se activa sola cuando los repartidores usen la app y
  se capture `Pedido.gpsLat/gpsLng` (rollout pendiente, F0 §0.a).
- Endpoint manual ya existe para negocios (`POST /api/negocios/[id]/geocode`).

### 7. Geocodificación de direcciones de texto: fuera del MVP

No hay geocoder. El operador pega link de Maps (`CoordsPreview` +
`parse-google-maps-link` ya lo soportan en los forms). Un geocoder (Nominatim /
Google Geocoding) → epic posterior.

## Qué falta decidir / evidencia pendiente

- Umbral de antigüedad para `PRECISE` (propuesta: 6 meses) — validar con el ritmo
  real de mudanzas de clientes.
- ¿Agregar `geocodeOrigen`/`geocodeAt` a `Negocio`? (aditivo; decidir en F2 según
  cuántos negocios terminan con coords).
- Correr backfill y volver a medir cobertura antes de arrancar F2.

## Consecuencias

- Cero tablas nuevas de geo. `LocationQuality` es lógica pura, testeable.
- El motor degrada de forma explícita: coords → barrio → ruta → excepción.
- Riesgo residual: si la cobertura de coords sigue baja tras el backfill (muchos
  `linkUbicacion` que no parsean), el motor operará mayormente sobre barrios y
  producirá más excepciones hasta que el GPS de entrega acumule historial.

## Verificación (cuando se implemente)

Unit: `LocationQuality` (todos los niveles), `pickBarrio`, centroide de barrio con
< 2 puntos → `PROXIMIDAD_DESCONOCIDA`. Reusar `src/lib/geo/__tests__/*`.
