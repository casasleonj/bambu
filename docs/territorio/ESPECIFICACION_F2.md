# F2 del ALS Barrio/Zona — Migración segura — Especificación exacta

- Estado: Especificación previa a implementación (sin código de F2 todavía)
- Fecha: 2026-09-12
- Fuente: `AGUA_BAMBU_PLAN_TECNICO_BARRIO_ZONA_DISTRIBUCION_v1.0.md` §6 (Fases M1-M5) y §18 (gate F2)
- Precondición: `ADR-TERRITORIO-001` (reconciliación con `ADR-PLANIFICADOR-004`)
- Regla de esta especificación: cada ítem del plan original se clasifica en una de
  seis categorías y toda diferencia entre el plan y el código se registra
  explícitamente como **BRECHA PLAN ↔ CÓDIGO**. Ningún ítem se implementa en este
  documento — es solo especificación.

## Aclaración de numeración (para evitar ambigüedad futura)

Existen dos líneas de fases independientes en el repositorio, ambas numeradas
F0...F9:

| | ALS Barrio/Zona | Epic Planificador de Distribución |
|---|---|---|
| Fuente | `AGUA_BAMBU_PLAN_TECNICO_BARRIO_ZONA_DISTRIBUCION_v1.0.md` | Plan Técnico Rutas + Planificador v4 |
| F1 | Barrio canónico — **implementada**, PR #248 | Representación/generación del plan — **implementada**, PR #144 |
| F2 (este documento) | Migración segura (matching/backfill legacy) | Elegibilidad de pedido / trazabilidad Plan↔Pedido |
| ADRs | `ADR-TERRITORIO-001` | `ADR-PLANIFICADOR-001..006` |

**"F2" sin prefijo es ambiguo.** En este documento y en adelante: "TERRITORIO-F2"
se refiere exclusivamente al ALS Barrio/Zona.

## Contexto de origen

El primer commit de PR #248 declara explícitamente: *"Normalización determinista
(reusa `normalizeName`), sin fuzzy matching ni estados
`SAFE_MATCH`/`AMBIGUOUS`/`UNMATCHED` — eso es F2."* Esto confirma que el equipo
que implementó F1 ya reconocía el matching como trabajo de TERRITORIO-F2, no de
F1 — consistente con el Plan Técnico. Este documento formaliza esa intención
antes de tocar código.

## Clasificación por entregable (Plan Técnico §6, Fases M1-M5)

### M1 — Inventario

> "Extraer valores distintos de `Cliente.barrio`, `Negocio.barrio`,
> `Pedido.barrioEntrega`. Clasificar: frecuencia, municipio, variantes,
> equivalencias, valores vacíos, valores sospechosos."

- **Estado: PENDIENTE.** No ejecutado. Requiere una consulta de solo lectura
  contra producción (accesible vía Supabase MCP en esta sesión, sin necesidad de
  herramienta nueva) para generar el inventario real antes de diseñar el
  matching — el matching no debe diseñarse sobre datos hipotéticos.
- **BRECHA PLAN ↔ CÓDIGO:** el plan pide clasificar "por municipio". Municipio
  no existe como entidad ni como concepto en el código (decisión ya tomada en
  F1, ver traceability). Ese eje de clasificación es **OBSOLETO** y se omite del
  inventario; el resto de los ejes (frecuencia, variantes, equivalencias,
  vacíos, sospechosos) sigue aplicando sin cambios.

### M2 — Normalización

> "Aplicar normalización segura para búsqueda... No usar `LOWER(TRIM())` como
> regla de fusión."

- **Estado: IMPLEMENTADO EN MAIN.** `normalizeName` (`src/lib/import/normalizer.ts`,
  reutilizado sin cambios en `src/lib/barrios/normalizer.ts`) ya normaliza
  acentos/mayúsculas/espacios de forma determinista para `Barrio.nombreNormalizado`.
  No hace fusión automática — dos valores que normalizan igual no se fusionan
  solos hoy, porque hoy la vinculación de un registro legacy es 100% manual (F1).

### M3 — Equivalencia

> "Crear tabla/lista de: valor original → candidato canónico → confianza →
> evidencia."

- **Estado: PENDIENTE de diseño**, con dos precedentes reutilizables ya
  identificados en el repositorio (no inventar desde cero, por regla del
  proyecto):
  1. **`src/lib/import/matcher.ts`** — ya implementa scoring por niveles
     exactamente análogo a `SAFE_MATCH`/`AMBIGUOUS`/`UNMATCHED` para dedup de
     `Cliente` durante importación CSV: teléfono exacto → score 1.0
     (auto-merge), nombre+barrio idénticos → score 0.95 (auto-merge),
     similaridad `pg_trgm` ≥ 0.7 → candidato de revisión, resto → no candidato.
     `pg_trgm` ya está instalado en la base de producción (confirmado por
     advisor de seguridad de Supabase) — no requiere nueva extensión.
  2. **`ImportBatch` / `ImportStagingRow` / `ImportStagingContacto`** (schema
     existente) — ya implementan la cola de decisión (`decision: PENDING | ...`)
     necesaria para exponer casos `AMBIGUOUS` a revisión humana, en vez de
     inventar un modelo paralelo.
- **PROPUESTA abierta, no decidida:** ¿TERRITORIO-F2 reutiliza/extiende
  `ImportStagingRow` (con un `entity` nuevo tipo `BARRIO`), o crea un modelo
  propio más simple dado que el volumen de barrios es órdenes de magnitud menor
  que el de clientes? Requiere decisión del equipo antes de diseñar el schema.
- **RECONCILIADO por `ADR-TERRITORIO-001`:** cualquiera que sea el diseño, la
  "confianza"/"evidencia" de un match es sobre el **nombre** (texto), nunca
  sobre coordenadas o proximidad geográfica — el matching de M3 no tiene
  relación con `pickCoords`/`LocationQuality`.

### M4 — Migración segura (backfill)

> "Solo los matches inequívocos pasan automáticamente. Los ambiguos quedan
> pendientes."

- **Estado: PENDIENTE.**
- **PROPUESTA abierta, no decidida:** ¿el backfill corre como script one-off
  (`npx tsx scripts/...`, patrón ya usado en el repo — ej.
  `scripts/generate-pwa-icons.ts`) ejecutado una vez contra producción, o
  necesita una UI administrativa de revisión para los casos `AMBIGUOUS`
  (análoga a la UI de revisión de importación, si existe)? El ALS no lo
  especifica. Afecta directamente el alcance de UI de TERRITORIO-F2.
- **Gate del plan** ("cero fusiones ambiguas y cero pérdida de valores
  históricos"): **PENDIENTE de definir** cómo se verifica con una prueba
  automatizada — hoy no existe criterio de aceptación medible porque no hay
  matching implementado. Debe definirse en la Ronda 2 (plan) antes de escribir
  código, junto con el diseño del matching.

### M5 — Dual-read / compatibilidad

> "`barrioId` → fuente preferida; legacy `barrio` → fallback controlado. No
> eliminar el campo legacy hasta verificar históricos y consumidores."

- **Estado: IMPLEMENTADO EN MAIN.** Cubierto por F1 (PR #248): `barrioId` es la
  fuente preferida, `barrio` (legacy) se sincroniza dentro de la misma
  transacción cuando existe `barrioId`, y toda la UI/API actual ya lee con ese
  fallback. **M5 no requiere trabajo adicional en TERRITORIO-F2** — ya está
  resuelto, aunque el plan lo liste como parte de F2.
- **BRECHA PLAN ↔ CÓDIGO (de alcance, no de defecto):** el plan ubica M5 dentro
  de F2; la implementación real lo resolvió antes, dentro de F1. Documentado
  para que el equipo no lo cuente dos veces al medir progreso de F2.

## Relación con el modelo geográfico (reconciliado)

- **RECONCILIADO por `ADR-TERRITORIO-001`:** TERRITORIO-F2 no debe, bajo ninguna
  circunstancia, construir centroides de `Barrio`, tocar `pickCoords`,
  `LocationQuality` o cualquier código de `src/lib/geo/`. El matching de M3/M4
  opera exclusivamente sobre el nombre textual del barrio. Cualquier propuesta
  que mezcle matching de nombre con señal geográfica requiere su propio ADR y
  no se considera parte de TERRITORIO-F2.

## Resumen de clasificación

| Ítem (Plan Técnico §6) | Categoría |
|---|---|
| M1 — Inventario (ejes no-municipio) | PENDIENTE |
| M1 — Clasificación "por municipio" | OBSOLETO |
| M2 — Normalización determinista | IMPLEMENTADO EN MAIN |
| M3 — Tabla de equivalencia | PENDIENTE (diseño abierto, ver PROPUESTA) |
| M3 — Confianza/evidencia solo sobre nombre, no geografía | RECONCILIADO |
| M4 — Backfill seguro (solo SAFE_MATCH automático) | PENDIENTE |
| M4 — Mecanismo de revisión de AMBIGUOUS (script vs. UI) | PROPUESTA |
| M4 — Gate "cero fusiones ambiguas" verificable | PENDIENTE |
| M5 — Dual-read/compatibilidad | IMPLEMENTADO EN MAIN (ya resuelto en F1) |
| Reutilización de `src/lib/import/matcher.ts` como base de M3 | PROPUESTA |
| Reutilización de `ImportStagingRow` como base de M4 | PROPUESTA |
| Precedente declarado en PR #248 ("matching es F2") | CONFIRMADO HISTÓRICAMENTE |
| No tocar `pickCoords`/`LocationQuality`/geo desde TERRITORIO-F2 | RECONCILIADO |

## Brechas plan ↔ código registradas en este documento

1. Plan asume clasificación de inventario por Municipio (M1) → Municipio no
   existe (decisión F1). Eje omitido.
2. Plan no especifica el mecanismo de persistencia de "equivalencias" (M3) ni
   el mecanismo de revisión de ambiguos (M4) — quedan como propuestas abiertas,
   no como decisiones tomadas.
3. Plan ubica M5 (dual-read) dentro de F2; el código real ya lo resolvió en F1.
4. Plan no define un criterio de aceptación automatizado para el gate de F2
   ("cero fusiones ambiguas") — pendiente de definir junto con el diseño.

## Próximo paso

Con esta especificación aceptada, el siguiente paso (todavía sin código) es la
**Ronda 1** real del protocolo de investigación para las dos propuestas
abiertas (M3: modelo de persistencia de equivalencias; M4: script vs. UI de
revisión), apoyada en el inventario real de M1 una vez ejecutado — no antes.
