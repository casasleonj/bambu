# Información de entrega — resolución y suficiencia (transversal del Pedido Hub)

> **For agentic workers:** slices F-ENTREGA-0 → F-ENTREGA-i → F-ENTREGA-ii. TDD. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Prerrequisito de Fase 8 F8-0.** Rama sobre `feat/pedidos-fase7-peek-riesgo` o su propia rama según se coordine.

**Origen:** revisión del equipo de Fase 8 (2026-09-08) §6–§19. Se incorpora **ahora** al rediseño del Pedido Hub — no se difiere.

**Principio de producto (queda cerrado, deja de ser PENDIENTE):**

> Para un Pedido **DOMICILIO**, el sistema exige información **suficiente para identificar y ejecutar la entrega**, **no** un conjunto fijo de campos. `dirección` + `barrio` **no** son requisitos universales independientes: son fuentes complementarias.

**Regla fundamental del Hub:** *el sistema prepara; el usuario decide y completa únicamente lo que realmente falta.*

---

## 0. Contexto técnico (investigación, 2026-09-08)

| Pieza | Estado |
|---|---|
| `Cliente` | `direccion?`, `barrio?`, `referencia?`, `linkUbicacion?`, `lat?`/`lng?` (Decimal), `geocodeOrigen?` (`'PARSED_URL'\|'GPS_HISTORIAL'\|'NEGOCIO'\|'MANUAL'`), `geocodeAt?` |
| `Negocio` | `direccion?` (fallback cliente), `barrio?`, `referencia?`, `linkUbicacion?`, `lat?`/`lng?` |
| `Pedido` | `direccionEntrega?` / `barrioEntrega?` = **snapshot** de la operación (nunca modifica Cliente/Negocio — CLAUDE.md) |
| `pickCoords()` (`src/lib/geo/pedido-coords.ts`) | regla única de coords efectivas: **negocio con coords válidas gana, si no cliente**. `Number` cast + `isFinite`; salta `null` antes del cast (guard Golfo de Guinea) |
| `pickDireccionTexto()` (`src/lib/geo/pedido-direccion.ts`) | regla única de dirección de texto: override pedido → negocio → cliente → ninguna. `tieneTexto` = direccion **o** barrio (⚠️ no distingue barrio-solo) |
| `expandShortMapsUrl()` (`src/lib/geo/expand-short-maps-url.ts`) | resuelve short URLs (`maps.app.goo.gl` / `goo.gl`) con allowlist SSRF, tope redirects, timeout. Server-only |
| `PreviewPedidoUseCase` hoy | `if (canal === 'DOMICILIO' && !cliente.direccion)` → **warning** `DIRECCION_FALTANTE` (no bloquea; mira solo `cliente.direccion`, ignora negocio/coords/link) |
| **Cobertura de entrega** | **NO existe en el código.** `pedido-ruta.ts:12` explícitamente "no asumir cobertura total". No hay polígono/zona formal de entrega |

**Conclusión:** ya existe la infraestructura de resolución (`pickCoords`/`pickDireccionTexto`/`expandShortMapsUrl`). Falta: (1) una **autoridad única de suficiencia** que las componga y devuelva un estado; (2) que Preview y Commit la usen; (3) UI adaptativa en el workspace.

---

## 1. Definición formal de "ubicación suficiente"

Una entrega DOMICILIO está **SUFICIENTEMENTE IDENTIFICADA** cuando existe **al menos una** de estas dos vías:

### Vía A — Ubicación geográfica utilizable

Se cumple cuando **simultáneamente**:

1. hay `lat` y `lng` **válidas** (`Number.isFinite`, no `(0,0)`);
2. las coordenadas son **utilizables para navegación** (misma validación técnica que ya hace `pickCoords`);
3. la posición está **dentro de la cobertura de entrega** de Agua Bambú — **PENDIENTE** (§7);
4. la posición proviene de una **fuente utilizable** — **PENDIENTE** (ver abajo).

**Criterio 4 — "fuente utilizable": PENDIENTE (revisión del equipo F-ENTREGA-0, 2026-09-08 §1/§8).** NO existe todavía una política formal de confiabilidad/procedencia de geolocalización, y **no se inventa por iniciativa técnica**. Hasta que negocio la defina: **coordenadas válidas (criterios 1-2) se consideran utilizables para suficiencia**, sin importar `geocodeOrigen`. El `EntregaResuelta.coords.origen` solo se expone como etiqueta informativa (`'NEGOCIO'` / el `geocodeOrigen` del cliente / `'PARSED_URL'` / `'DESCONOCIDO'`), nunca como gate. Si más adelante se define una política de confiabilidad, será una decisión nueva documentada.

**Cobertura (criterio 3):** **NO hay política de cobertura formal** (revisión §8/§19 — PENDIENTE de negocio). Hasta que exista:
- `dentroDeCobertura(lat, lng)` es un **stub que devuelve `'no_evaluada'`** y **nunca** produce INSUFICIENTE por sí solo.
- El punto de extensión existe (la autoridad devuelve `cobertura: 'no_evaluada' | 'dentro' | 'fuera'`).
- El criterio de aceptación #9 ("fuera de cobertura → insuficiente") queda **documentado pero no ejecutable** hasta que negocio defina la cobertura. Se marca `test.skip` con el motivo.

### Vía B — Identificación textual suficiente

Se cumple cuando hay una **dirección textual** (`direccion` efectiva, trim no vacío) que permite identificar razonablemente el destino dentro de la cobertura.

- **Validación técnica** (sin inventar umbrales, revisión §8): `direccion` presente y no vacía tras `trim()`. El juicio de "razonablemente identificable" lo hace el operador/repartidor; el sistema **no** cuenta componentes ni exige formato.
- **`barrio` por sí solo NUNCA es suficiente.** `direccion` vacía + `barrio` presente → **no** satisface Vía B.
- **`linkUbicacion` por sí solo NUNCA es suficiente** — debe resolverse a coords utilizables (entonces es Vía A). Link almacenado pero roto/ambiguo/no resoluble → no aporta.
- `referencia` es información de apoyo; nunca sustituye a dirección ni a ubicación.

### La resolución del link NO la decide el frontend

`linkUbicacion → coords` se resuelve **server-side** (`expandShortMapsUrl` + parseo), en la autoridad de dominio. El frontend recibe el **resultado** (coords o "no resoluble"), nunca decide.

---

## 2. Estados formales

| Estado | Significado | ¿El pedido puede continuar? |
|---|---|---|
| **`SUFICIENTE`** | Vía A o Vía B satisfecha, y toda la información complementaria presente | **Sí** |
| **`SUFICIENTE_COMPLEMENTARIA_FALTANTE`** | Vía A o Vía B satisfecha, pero falta info que facilitaría la entrega (p.ej. hay ubicación pero no dirección escrita, o hay dirección pero no barrio) | **Sí** — no bloquea, no se muestra como error |
| **`INSUFICIENTE`** | Ninguna vía satisfecha | **No** — el Hub explica **qué falta** (no solo marca `required`) |

Para `canal === 'PUNTO'` → siempre `SUFICIENTE`, `via: null` (retiro en mostrador, sin domicilio).

---

## 3. Autoridad única de dominio

### `resolverEntrega(input): EntregaResuelta` — `src/modules/pedidos/domain/services/entrega-suficiencia.service.ts`

```ts
export interface EntregaFuente {
  direccion?: string | null
  barrio?: string | null
  referencia?: string | null
  linkUbicacion?: string | null
  lat?: unknown
  lng?: unknown
  geocodeOrigen?: string | null
}

export interface ResolverEntregaInput {
  canal: 'PUNTO' | 'DOMICILIO'
  /** snapshot del pedido — gana sobre negocio/cliente (misma prioridad que pickDireccionTexto). */
  overrideDireccion?: string | null
  overrideBarrio?: string | null
  cliente?: EntregaFuente | null
  negocio?: EntregaFuente | null
  /** coords ya resueltas desde linkUbicacion en vivo (server-only), si aplica. */
  coordsDeLink?: { lat: number; lng: number } | null
}

export type EstadoEntrega = 'SUFICIENTE' | 'SUFICIENTE_COMPLEMENTARIA_FALTANTE' | 'INSUFICIENTE'

export interface EntregaResuelta {
  estado: EstadoEntrega
  via: 'GEO' | 'TEXTO' | null
  // resolución efectiva (lo que se usará / se mostrará)
  direccion: string | null
  barrio: string | null
  referencia: string | null
  coords: { lat: number; lng: number; origen: string | null } | null
  linkUbicacion: string | null
  linkResoluble: boolean | null        // null si no había link
  cobertura: 'no_evaluada' | 'dentro' | 'fuera'
  // qué falta
  faltaComplementario: Array<'direccion' | 'barrio' | 'referencia'>
  faltaBloqueante: Array<'direccion' | 'ubicacion'>
}
```

**Pura, sin I/O.** La resolución de `linkUbicacion` (que sí hace I/O) ocurre **antes**, en el caller server-side (Preview/Commit), y se pasa como `coordsDeLink`. `dentroDeCobertura` es un helper interno stub.

### Consumidores (MISMA autoridad — revisión §16)

- **`PreviewPedidoUseCase`** → reemplaza el chequeo `!cliente.direccion` por `resolverEntrega(...)`. `estado === 'INSUFICIENTE'` → warning **bloqueante** `ENTREGA_INSUFICIENTE` que quita `'crear'` de `allowedActions` (o el mecanismo equivalente). `SUFICIENTE_COMPLEMENTARIA_FALTANTE` → warning informativo `ENTREGA_COMPLEMENTARIA` (no bloquea). Preview **proyecta**.
- **`CrearPedidoUseCase` / `ActualizarPedidoUseCase`** → **re-resuelven** con `resolverEntrega(...)` dentro de su transacción; `INSUFICIENTE` → rechazo (`ENTREGA_INSUFICIENTE`, 4xx). El commit no confía en el preview (puede estar obsoleto — revisión §16).
- **Workspace** → consume el `EntregaResuelta` del preview para la UI adaptativa (§4). No re-implementa la lógica (G7).
- **Generación recurrente** (Fase 8 F8-iv) → al preparar cada pedido, `resolverEntrega(...)` con la info **actual** de Cliente/Negocio (la plantilla no es autoridad de la dirección — revisión §15).

---

## 4. UI adaptativa del workspace (revisión §13)

La zona "Entrega" del workspace refleja el **estado real**, no `dirección *` / `barrio *` universal:

**`SUFICIENTE` (vía GEO, con dirección):**
```
ENTREGA
📍 Ubicación disponible
Carrera XX # XX-XX · Barrio XXXXX
[Ver ubicación]
```

**`SUFICIENTE_COMPLEMENTARIA_FALTANTE`:**
```
ENTREGA
📍 Ubicación disponible
Dirección escrita: no registrada
Barrio: no registrado
Puedes continuar. Agregar una referencia escrita puede facilitar la entrega.
[Agregar dirección] (opcional)
```

**`INSUFICIENTE`:**
```
ENTREGA
⚠️ Necesitamos información para localizar el domicilio.
[Agregar dirección]  [Agregar ubicación]
```

- Los campos de texto sólo son "obligatorios" cuando el estado es `INSUFICIENTE` y son la única vía para salir de ahí.
- El snapshot del pedido (§14): editar la dirección aquí guarda `Pedido.direccionEntrega`/`barrioEntrega`, **nunca** modifica Cliente/Negocio salvo acción explícita ("Actualizar también los datos del cliente").

---

## 5. Slices

### F-ENTREGA-0 — autoridad de dominio + Preview/Commit ✅ IMPLEMENTADO
- Crear `entrega-suficiencia.service.ts` + tests unit exhaustivos (matriz §6).
- `PreviewPedidoUseCase` → usa `resolverEntrega`; expone `entrega: EntregaResuelta` en `PreviewPedidoResult`; `INSUFICIENTE` bloquea `'crear'`.
- `CrearPedidoUseCase` / `ActualizarPedidoUseCase` → re-resuelven; `INSUFICIENTE` → rechazo.
- Resolución de `linkUbicacion` server-side en los callers (reusa `expandShortMapsUrl`).
- Tests: unit del servicio (22 criterios §6), integración Preview↔Commit (misma autoridad; preview obsoleto no permite commit inválido).

### F-ENTREGA-i — UI adaptativa del workspace ✅ IMPLEMENTADO
- Zona "Entrega" adaptativa por `preview.entrega.estado` (§4). Reemplaza el `dirección */barrio *`.
- `[Ver ubicación]` (Maps, pestaña nueva — como `PeekEntrega` de Fase 7).
- Tests: unit (los 3 estados renderizan lo correcto; `INSUFICIENTE` deshabilita commit; complementaria no).

### F-ENTREGA-ii — snapshot + peek + verificación ✅ IMPLEMENTADO
- Confirmar que editar la dirección en el workspace guarda snapshot y no toca Cliente/Negocio (ya es el comportamiento — añadir test de regresión).
- El peek (Fase 7 `PeekEntrega`) ya muestra la entrega ejecutada; añadir que para un pedido **no** entregado el peek muestre el `estado` de suficiencia si es relevante.
- E2E `e2e/pedidos-entrega-suficiencia.spec.ts` (gated): cliente con solo coords → workspace deja crear; cliente con solo barrio → bloqueado con explicación; cliente con dirección sin barrio → deja crear.

---

## 6. Matriz / criterios de aceptación (revisión §10, §17)

| # | Escenario | Estado esperado | Continúa |
|---|---|---|---|
| 1 | dirección + barrio + ubicación | `SUFICIENTE` | sí — no re-pedir |
| 2 | ubicación válida, sin dirección | `SUFICIENTE_COMPLEMENTARIA_FALTANTE` | sí |
| 3 | ubicación válida, sin barrio | `SUFICIENTE_COMPLEMENTARIA_FALTANTE` | sí |
| 4 | dirección válida, sin barrio ni ubicación | `SUFICIENTE` (vía TEXTO) / complementaria por barrio | sí |
| 5 | solo barrio | `INSUFICIENTE` | no |
| 6 | link Maps resoluble → coords utilizables | `SUFICIENTE` (vía GEO) | sí |
| 7 | link almacenado no resoluble | no aporta; estado según el resto | según resto |
| 8 | coordenadas inválidas `(0,0)`/NaN | no son ubicación válida | según resto |
| 9 | ubicación fuera de cobertura | `INSUFICIENTE` | no | **`test.skip` — cobertura PENDIENTE** |
| 10 | sin info suficiente | `INSUFICIENTE` + el Hub explica qué falta | no |
| 11 | negocio con info de entrega propia | usa el contexto del negocio | sí |
| 12 | cliente + negocio no se mezclan silenciosamente | contexto determinista (negocio si hay `negocioId`) | — |
| 13 | crear Pedido no modifica Cliente/Negocio | Cliente/Negocio intactos | — |
| 14 | el Pedido conserva snapshot | `Pedido.direccionEntrega`/`barrioEntrega` = lo capturado | — |
| 15 | editar snapshot no modifica Cliente/Negocio | salvo acción explícita | — |
| 16 | Preview y Commit usan la misma autoridad | mismo `estado` para el mismo input | — |
| 17 | la lógica no se duplica en frontend | `grep`: el workspace consume `preview.entrega`, no calcula | — |
| 18 | generación recurrente re-resuelve la info actual | usa Cliente/Negocio vigente, no la plantilla | — |
| 19 | una recurrencia no obliga a repetir datos conocidos | el sistema prepara | — |
| 20 | ausencia de barrio no bloquea si hay otra info suficiente | `SUFICIENTE`/complementaria | sí |
| 21 | ausencia de dirección no bloquea si hay ubicación utilizable | `SUFICIENTE_COMPLEMENTARIA_FALTANTE` | sí |
| 22 | ausencia de info suficiente sí bloquea | `INSUFICIENTE` | no |

---

## 7. Fuera de alcance / PENDIENTE

- **Política cuantitativa de geo** (precisión mínima en metros, polígono de cobertura formal, antigüedad máxima de coords). Revisión §8/§19: **no se inventan ahora**. El punto de extensión existe (`cobertura`, `dentroDeCobertura`). Se documentará como decisión nueva si el negocio la define.
- No se cambian `pickCoords` / `pickDireccionTexto` / `expandShortMapsUrl` (se componen).
- No se toca el flujo de GPS del repartidor en la entrega (Embarques).
- `PUNTO` no se toca (no tiene domicilio).
