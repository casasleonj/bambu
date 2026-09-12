# AGUA BAMBÚ — ALS
## Architecture & Implementation Level Specification
### Barrio canónico + Zona territorial + Clientes + Distribución/Rutas

**Versión:** 1.0
**Fecha:** 2026-09-09
**Estado:** Contrato implementable por fases
**Repositorio:** casasleonj/bambu
**Baseline:** main / PR #144 merge 747a5c12fb2778266c729f7f08075093001d63c7

---

# 0. PROPÓSITO

Este ALS convierte el plan técnico de Barrio/Zona en un contrato de arquitectura e implementación.

No rediseña el Planificador existente.

Define:

- ownership;
- modelo de dominio;
- invariantes;
- persistencia;
- migración;
- API;
- UI;
- auditoría;
- offline;
- concurrencia;
- seguridad;
- pruebas;
- gates.

---

# 1. PRINCIPIOS NO NEGOCIABLES

## P1 — Barrio ≠ Zona ≠ Ruta

Barrio es unidad territorial canónica.
Zona es agrupación territorial/comercial.
Ruta es relación/resultado operativo.
Plan es decisión temporal.
Embarque es ejecución.

## P2 — Zona↔Barrio es M:N

Un barrio puede pertenecer a múltiples zonas.

La relación compartida es válida.

## P3 — Ningún overlap silencioso

El backend debe detectarlo y la UI debe hacerlo visible.

## P4 — Barrio compartido no propaga asignaciones

Una relación territorial no reasigna automáticamente Cliente, Negocio o Pedido.

## P5 — No inventar certeza

Datos insuficientes producen ambigüedad/excepción, no una asignación ficticia.

## P6 — Snapshot histórico

Pedido.barrioEntrega representa el contexto de entrega del pedido y no debe ser reescrito por cambios posteriores del maestro.

## P7 — Hechos históricos no se sobrescriben

Correcciones territoriales son eventos/cambios auditables.

## P8 — El Planificador actual es único

No crear un segundo planner ni duplicar la fuente de verdad de Embarques.

## P9 — Humano para excepciones

Lo determinista se automatiza.
Lo inferible se recomienda.
Lo incierto se expone.

## P10 — Backend es autoridad

La UI no es barrera de seguridad, integridad o concurrencia.

---

# 2. OWNERSHIP

```text
Barrio
  → catálogo territorial canónico

Zona
  → agrupación territorial/comercial

ZonaBarrio
  → relación M:N

Cliente / Negocio
  → ubicación maestra

Pedido
  → snapshot de entrega

Planificador
  → propuesta temporal

PlanGrupo / PlanParada
  → agrupación/secuencia temporal

Ruta
  → memoria operativa estable

Embarque
  → ejecución
```

---

# 3. MODELO DE DATOS

## 3.1 Barrio

```text
Barrio
-------
id
nombre
nombreNormalizado
municipioId
activo
createdAt
updatedAt
```

Constraints:

```text
UNIQUE(municipioId, nombreNormalizado)
```

La constraint definitiva debe considerar el modelo de municipio existente.

No asumir unicidad global por nombre.

## 3.2 Zona

```text
Zona
----
id
nombre
nombreNormalizado
activo
createdAt
updatedAt
```

Evitar duplicados semánticos activos dentro del mismo ámbito empresarial.

## 3.3 ZonaBarrio

```text
ZonaBarrio
----------
zonaId
barrioId
createdAt
createdBy
source
updatedAt
```

Constraint:

```text
UNIQUE(zonaId, barrioId)
```

Índices:

```text
(zonaId)
(barrioId)
```

`source` mínimo:

```text
USER
IMPORT
MIGRATION
SYSTEM
SYNC
```

---

# 4. CLIENTE / NEGOCIO

Migración progresiva:

```text
Cliente.barrio      legacy
Cliente.barrioId    canonical

Negocio.barrio      legacy
Negocio.barrioId    canonical
```

Durante transición:

```text
read:
  barrioId → canonical
  legacy → fallback

write:
  canonical + legacy compatible
```

No eliminar legacy hasta completar:

- backfill;
- verificación;
- regresión;
- revisión histórica.

---

# 5. PEDIDO

Pedido conserva:

```text
barrioEntrega
direccionEntrega
coordenadas/snapshot según contrato actual
```

No reemplazar retroactivamente el snapshot por el barrio maestro actual.

Ejemplo:

```text
2026-09-01
Pedido P1
barrioEntrega = Barrio A

2026-09-10
Cliente cambia a Barrio B

P1 sigue representando Barrio A.
```

---

# 6. NORMALIZACIÓN

Pipeline obligatorio:

```text
raw
 ↓
normalize
 ↓
canonical lookup
 ↓
SAFE_MATCH / AMBIGUOUS / UNMATCHED
 ↓
canonical assignment
```

Nunca:

```text
LOWER(TRIM(raw))
 ↓
merge automático
```

cuando existan posibles colisiones.

Conservar raw cuando sea necesario para trazabilidad/migración.

---

# 7. REGLAS DE SOLAPAMIENTO

Al ejecutar:

```text
add ZonaSur ← BarrioC
```

si existe:

```text
ZonaNorte ← BarrioC
```

backend devuelve un resultado equivalente a:

```text
overlapDetected = true
existingZones = [ZonaNorte]
requiresConfirmation = true
```

La operación final debe ser explícita.

Nunca confiar en que el frontend hará la detección por sí solo.

---

# 8. COMPORTAMIENTO UI

## 8.1 Estado normal

```text
Barrio A
```

## 8.2 Estado compartido

```text
Barrio C  ⚠ Compartido
Norte · Sur
```

El indicador debe ser visible en ambos contextos.

## 8.3 Confirmación

```text
Barrio compartido

Barrio C ya pertenece a Zona Norte.
Agregarlo a Zona Sur crea una relación compartida.

No reasigna automáticamente clientes ni pedidos.

[Cancelar]
[Agregar barrio]
```

## 8.4 Ambigüedad de cliente/pedido

```text
Zonas candidatas
• Norte
• Sur

Sugerida: Norte

Motivos:
• proximidad
• coordenada
• continuidad de ruta
```

Si no hay evidencia:

```text
Zona no determinada
```

---

# 9. PLANNER

El planificador recibe una señal territorial adicional.

Conceptualmente:

```text
Pedido
 ↓
effectiveGeo
 ↓
Barrio
 ↓
candidateZones[]
 ↓
agrupación
 ↓
capacidad
 ↓
secuencia
```

No convertir:

```text
Barrio → Zona única → Ruta
```

porque es falso cuando existe M:N.

## 9.1 Señales

El planner puede usar:

- coordenadas;
- calidad de coordenadas;
- barrio;
- zonas candidatas;
- ruta habitual;
- proximidad;
- capacidad.

## 9.2 Prioridad

```text
coordenada confiable
>
coordenada aproximada
>
barrio/zona
>
dirección
>
sin ubicación
```

La zona no genera distancia.

---

# 10. PROVENANCE

Toda asignación relevante debe distinguir:

```text
source:
  USER
  SYSTEM_RULE
  MIGRATION
  IMPORT
  SYNC
```

Para sugerencias:

```text
confidence
reasonCodes[]
evidence[]
```

Una recomendación no debe convertirse automáticamente en hecho persistente cuando requiere decisión humana.

---

# 11. AUDITORÍA

Modelo mínimo lógico:

```text
AuditEvent
----------
id
entityType
entityId
action
before
after
actorId
timestamp
source
reason
commandId/correlationId
```

Cambios obligatoriamente auditables:

- crear/archivar zona;
- crear/archivar barrio;
- agregar/quitar ZonaBarrio;
- cambios de barrio maestro;
- resolución manual de ambigüedad;
- override territorial/planner;
- cambios de ubicación de alto impacto.

---

# 12. AUTORIZACIÓN

Permisos deben separarse conceptualmente:

```text
territory.read
territory.write
territory.archive
territory.resolve
territory.override
territory.audit
```

No crear necesariamente nuevos roles.

Reutilizar el sistema actual de roles/permisos.

Cambios de alto impacto pueden requerir autorización adicional.

---

# 13. CONCURRENCIA

Operaciones sensibles:

```text
crear/actualizar zona
agregar/quitar barrio
resolver conflicto
override planner
```

deben protegerse con transacciones y mecanismos de concurrencia existentes.

Regla:

> Si dos usuarios modifican la misma relación, no perder silenciosamente una decisión.

Usar optimistic concurrency/advisory locks donde el patrón existente lo requiera.

---

# 14. OFFLINE

Catálogo local:

```text
barrios
zonas
zonaBarrios
territoryVersion
```

Los comandos offline deben tener:

```text
offlineId / commandId
```

y ser deduplicables.

Conflicto semántico:

```text
LOCAL CHANGE
vs
REMOTE CHANGE
```

no se resuelve con last-write-wins silencioso cuando afecta una decisión territorial relevante.

---

# 15. MIGRATION

Orden:

```text
1. schema additive
2. seed/catalog
3. normalization
4. safe backfill
5. ambiguous report
6. dual-read
7. UI canonical
8. verification
9. deprecation
10. legacy removal only after gate
```

Rollback debe ser posible por fase.

No ejecutar una migración destructiva como parte del primer despliegue.

---

# 16. API CONTRACTS

Operaciones requeridas:

```text
Barrio:
  create
  search
  update
  archive

Zona:
  create
  search
  update
  archive

ZonaBarrio:
  add
  remove
  listByZone
  listByBarrio
  detectOverlap
```

Todos los comandos deben:

- validar;
- autorizar;
- transaccionar;
- auditar;
- responder estados explícitos.

---

# 17. ERRORES / ESTADOS

El dominio debe distinguir:

```text
SAFE
INFO
WARNING
AMBIGUOUS
CONFLICT
STALE
REQUIRES_AUTHORIZATION
```

No usar un único `400` genérico para todos los escenarios semánticos.

---

# 18. FRAUDE / ABUSO

Riesgos cubiertos:

1. reasignación territorial para alterar KPI/responsabilidad;
2. modificación de ubicación para cambiar planificación;
3. manipulación de coordenadas;
4. manipulación de ruta habitual;
5. duplicación de barrios;
6. duplicación de zonas;
7. alteración post-plan;
8. conflicto snapshot/maestro;
9. cambios coordinados;
10. eliminación de evidencia;
11. sobrescritura de overrides;
12. cambios compuestos de ubicación.

Todos son hipótesis de riesgo.

Controles:

```text
canonicalization
+ uniqueness
+ provenance
+ audit
+ authorization
+ snapshots
+ stale detection
+ concurrency
+ E2E
```

---

# 19. TEST MATRIX

## Unit

```text
normalization
matching
ambiguity
zoneOverlap
candidateZones
provenance
```

## Integration

```text
schema constraints
migration
audit
concurrency
snapshot
planner input
```

## E2E

```text
create zone
shared barrio
visual overlap
new client
ambiguous zone
planner suggestion
multiple routes in zone
route crossing zones
manual override
post-plan change
offline sync
audit history
destructive delete prevention
```

---

# 20. PERFORMANCE

La implementación debe:

- indexar `nombreNormalizado`;
- indexar relaciones ZonaBarrio por ambos lados;
- evitar N+1 en listado de zonas/barrios;
- no cargar todo el catálogo territorial en cada operación si no es necesario;
- cachear catálogo local offline;
- mantener el planner puro donde ya lo es.

---

# 21. OBSERVABILIDAD

Registrar métricas:

```text
territory.lookup.latency
territory.ambiguous.count
territory.overlap.count
territory.manual_resolution.count
territory.sync_conflict.count
territory.audit.failure.count
planner.zone_signal.used.count
planner.territory_exception.count
```

Errores deben llegar al mecanismo de observabilidad existente.

---

# 22. CRITERIOS DE ACEPTACIÓN TÉCNICA

No aceptar la fase si:

- un barrio puede duplicarse canónicamente;
- un overlap puede crearse silenciosamente;
- un cliente es reasignado automáticamente por agregar un barrio a una zona;
- un pedido histórico cambia por modificación del maestro;
- el planner trata zona como partición obligatoria;
- una recomendación no tiene explicación cuando la necesita;
- un override humano puede desaparecer silenciosamente;
- un cambio sensible no queda auditado;
- una migración destruye información;
- offline duplica comandos;
- una regresión rompe E2E existentes.

---

# 23. DEFINITION OF DONE

Una fase está terminada únicamente cuando:

```text
CODE
+ SCHEMA
+ MIGRATION
+ API
+ UI
+ TESTS
+ AUDIT
+ OFFLINE
+ REGRESSION
+ DOCUMENTATION
```

están alineados.

La prueba final no es:

> "La interfaz funciona."

La prueba final es:

> "El comportamiento de producto, dominio, persistencia, interfaz, concurrencia, auditoría, offline y pruebas representa el mismo contrato."

---

# 24. EXCLUSIONES

No implementar en este ALS:

- nuevo planner;
- nuevo modelo de Embarque;
- ruta por barrio;
- ruta por zona;
- zona como partición rígida;
- preventa;
- forecast como pedido;
- geocoding ficticio de barrio;
- eliminación inmediata de legacy;
- entidades creadas por combinación diaria de territorio.

---

# 25. PRINCIPIO FINAL

```text
BARRIO = identidad territorial
ZONA = contexto territorial M:N
UBICACIÓN = evidencia
PEDIDO = demanda real
PLAN = decisión temporal
RUTA = memoria operativa
EMBARQUE = ejecución

SISTEMA → propone
USUARIO → gobierna excepciones
UI → hace visible incertidumbre
BACKEND → garantiza integridad
AUDITORÍA → reconstruye cambios
```

> **Ninguna ambigüedad territorial que pueda cambiar una decisión operacional puede ocurrir silenciosamente.**