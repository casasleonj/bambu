# AGUA BAMBÚ — PLAN DE DESARROLLO TÉCNICO
## Barrio canónico + Zona territorial + integración con Clientes, Distribución y Rutas

**Versión:** 1.0  
**Fecha:** 2026-09-09  
**Estado:** Plan técnico para ejecución controlada  
**Repositorio:** `casasleonj/bambu`  
**Rama de referencia:** `main`  
**Baseline técnico conocido:** PR #144, merge `747a5c12fb2778266c729f7f08075093001d63c7`  
**Alcance:** esta sección específica de ubicación territorial y su integración con Clientes, Distribución y Rutas.

---

# 0. OBJETIVO

Implementar de forma incremental y segura la capa territorial que falta alrededor del sistema existente:

```text
CLIENTE / NEGOCIO
      ↓
ubicación
      ↓
BARRIO CANÓNICO
      ↓
ZONA(S) TERRITORIAL(ES)
      ↓
señales para planificación
      ↓
PLAN DE DISTRIBUCIÓN
      ↓
RUTA / EMBARQUE
```

El objetivo **no** es reconstruir Rutas ni crear un segundo planificador.

El sistema actual ya posee un planificador de distribución operativo; esta implementación debe enriquecerlo con datos territoriales confiables, explicables y auditables.

La experiencia de usuario es parte del contrato técnico: una relación territorial ambigua, un solapamiento de zonas o una asignación de baja confianza **no puede ocurrir silenciosamente**.

---

# 1. FUENTES Y PRECEDENCIA

## 1.1 Autoridad de producto

1. `AGUA_BAMBU_CONTEXTO_MAESTRO_v1.1.md`
2. Planes Maestros aprobados.
3. Decisiones posteriores explícitas.
4. ALS vigentes.
5. Conversaciones históricas.
6. Investigación externa.
7. Código actual como evidencia del estado técnico.

El código demuestra lo que existe; no redefine el producto.

## 1.2 Estado técnico relevante

El PR #144 ya implementó F0→F6 del Planificador de Distribución:

- generación automática;
- agrupación por proximidad;
- soporte territorial mediante barrio como señal;
- capacidad;
- secuenciación;
- excepciones;
- edición manual;
- replanificación;
- integración con Embarques;
- UI de Distribución;
- E2E e integración.

Por tanto:

> **No crear otro motor de planificación, otra entidad de ruta diaria ni otra fuente de verdad de Embarques.**

## 1.3 Brechas actuales

El estado técnico actual todavía presenta:

- `Cliente.barrio` como texto libre;
- `Negocio.barrio` como texto libre;
- `Pedido.barrioEntrega` como snapshot;
- ausencia de entidad canónica `Barrio`;
- ausencia de entidad `Zona`;
- ausencia de relación `Zona ↔ Barrio`;
- ausencia de catálogo territorial offline;
- controles específicos de solapamiento territorial aún no implementados.

Estas son **BRECHAS PLAN ↔ CÓDIGO**, no decisiones de producto pendientes.

---

# 2. MODELO CONCEPTUAL CONGELADO

## 2.1 Barrio

**Barrio** es una unidad territorial canónica.

Propiedades mínimas:

- identidad estable;
- nombre canónico;
- nombre normalizado para búsqueda;
- municipio/padre territorial;
- estado activo/inactivo si se requiere archivado;
- metadatos de origen/migración cuando sean necesarios.

Barrio no representa una ruta.

Barrio no representa una orden.

Barrio no representa una zona.

## 2.2 Zona

**Zona** es una agrupación territorial/comercial/logística utilizada por Agua Bambú.

Una zona:

- puede contener varios barrios;
- puede compartir uno o varios barrios con otra zona;
- no equivale necesariamente a una división administrativa oficial;
- no es una ruta;
- no es un grupo diario;
- no debe convertirse en una partición rígida del planificador.

## 2.3 Relación Zona ↔ Barrio

La relación debe ser **M:N**.

Ejemplo válido:

```text
Zona Norte
├── Barrio A
├── Barrio B
└── Barrio C

Zona Sur
├── Barrio C   ← COMPARTIDO
├── Barrio D
└── Barrio E
```

El solapamiento es válido.

Lo que no es válido es que sea silencioso.

## 2.4 Regla crítica

> **Barrio compartido entre zonas ≠ cliente compartido entre zonas ≠ pedido compartido entre zonas.**

La pertenencia territorial del catálogo y la decisión operacional sobre un cliente/pedido son niveles diferentes.

---

# 3. REGLAS DE DOMINIO

## R1 — No duplicar barrios canónicos

No puede existir más de un `Barrio` activo equivalente para el mismo municipio bajo la misma identidad canónica.

## R2 — La normalización no es fusión automática

Normalizar texto no autoriza a fusionar valores ambiguos.

Estados de migración:

```text
SAFE_MATCH
AMBIGUOUS
UNMATCHED
CANDIDATE
```

Solo `SAFE_MATCH` puede automatizarse sin intervención.

## R3 — Zona puede compartir barrio

No bloquear:

```text
Zona A → Barrio X
Zona B → Barrio X
```

si la relación es deliberada y visible.

## R4 — Ningún solapamiento silencioso

Al crear una relación Zona↔Barrio que ya existe en otra zona:

- backend detecta el solapamiento;
- UI lo comunica;
- usuario confirma;
- auditoría registra el cambio.

## R5 — No herencia silenciosa

Agregar Barrio X a Zona A no debe reasignar automáticamente todos sus clientes, negocios o pedidos a Zona A.

## R6 — No inventar certeza

Si Barrio X pertenece a Norte y Sur y los datos de un pedido no permiten distinguir la zona operacional, el sistema debe conservar la ambigüedad.

No debe inventar una asignación.

## R7 — Coordenadas no son infalibles

Una coordenada tiene calidad/origen.

No debe considerarse automáticamente verdadera solo porque existe.

## R8 — Pedido conserva snapshot

Modificar el barrio maestro del Cliente/Negocio no debe reescribir retroactivamente el `barrioEntrega` histórico de un pedido.

## R9 — Replanificación no borra decisiones humanas

Una decisión manual válida debe distinguirse de una sugerencia automática y no ser sobrescrita silenciosamente.

## R10 — Hechos históricos no se destruyen

Barrio/Zona no deben eliminarse físicamente si existen dependencias históricas.

Preferir:

- desactivación;
- archivado;
- merge controlado;
- corrección auditada.

---

# 4. EXPERIENCIA DE USUARIO — REQUISITO TÉCNICO

La UI no es una capa cosmética. Debe implementar las reglas de seguridad cognitiva.

## 4.1 Crear relación Zona ↔ Barrio

Cuando el usuario intenta agregar un barrio que ya pertenece a otra zona:

```text
⚠ Barrio compartido

Barrio C ya pertenece a:
• Zona Norte

Puedes agregarlo también a Zona Sur.

Esto crea una asignación territorial compartida.
No reasigna automáticamente clientes ni pedidos.

[Cancelar] [Agregar barrio]
```

Después:

```text
Zona Sur

Barrios
────────────────────────
Barrio C   ⚠ Compartido
Barrio D
Barrio E
```

Y Zona Norte debe mostrar el mismo indicador.

## 4.2 No usar modal para todo

La interfaz debe diferenciar:

- información;
- advertencia;
- conflicto;
- excepción operativa.

Evitar alertas constantes.

### Severidades

**INFO**
> Barrio C pertenece a Norte y Sur.

**WARNING**
> Estás agregando un barrio que ya pertenece a otra zona.

**OPERATIONAL_AMBIGUITY**
> El pedido está en un barrio compartido y no existen señales suficientes para seleccionar zona.

**CONFLICT**
> La acción contradice una asignación confirmada, afecta un hecho histórico o requiere autorización.

## 4.3 Cliente nuevo en barrio compartido

La UI debe mostrar:

```text
Barrio: C
Zonas posibles:
• Norte
• Sur

Zona sugerida: Norte
¿Por qué?
• proximidad a clientes de Norte
• coordenada compatible
• continuidad con ruta habitual

[Usar Norte] [Elegir otra]
```

Si no hay evidencia suficiente:

```text
Zona no determinada

Este barrio pertenece a Norte y Sur.
No hay información suficiente para decidir.

[Elegir zona] [Dejar sin determinar]
```

## 4.4 Explicabilidad

Toda recomendación automática relevante debe poder responder:

> ¿Por qué el sistema eligió esto?

Ejemplos de señales:

- coordenada;
- proximidad;
- barrio;
- zona;
- ruta habitual;
- capacidad;
- continuidad operacional;
- decisión humana previa.

No mostrar una puntuación matemática sin explicación útil.

---

# 5. INTEGRACIÓN CON CLIENTES Y NEGOCIOS

## 5.1 Modelo objetivo

Agregar:

```text
Barrio
  id
  nombre
  nombreNormalizado
  municipioId
  activo
```

Y migrar progresivamente:

```text
Cliente.barrioId → Barrio.id
Negocio.barrioId → Barrio.id
```

Durante transición conservar el texto legacy.

## 5.2 Entrada de datos

Al escribir barrio:

```text
usuario escribe "san jose"
        ↓
búsqueda normalizada
        ↓
sugerencias canónicas
        ↓
selección
        ↓
barrioId
```

El usuario no debe memorizar la grafía exacta.

## 5.3 Valores desconocidos

No crear automáticamente un Barrio definitivo ante cualquier cadena desconocida.

Flujo:

```text
valor desconocido
      ↓
candidate
      ↓
revisión / equivalencia
      ↓
Barrio canónico
```

---

# 6. MIGRACIÓN DE DATOS

## Fase M1 — Inventario

Extraer valores distintos de:

- `Cliente.barrio`;
- `Negocio.barrio`;
- `Pedido.barrioEntrega`.

Clasificar:

- frecuencia;
- municipio;
- variantes;
- equivalencias;
- valores vacíos;
- valores sospechosos.

## Fase M2 — Normalización

Aplicar normalización segura para búsqueda:

- espacios;
- mayúsculas/minúsculas;
- acentos cuando corresponda;
- caracteres equivalentes.

No usar `LOWER(TRIM())` como regla de fusión.

## Fase M3 — Equivalencia

Crear tabla/lista de:

```text
valor original → candidato canónico → confianza → evidencia
```

## Fase M4 — Migración segura

Solo los matches inequívocos pasan automáticamente.

Los ambiguos quedan pendientes.

## Fase M5 — Dual-read / compatibilidad

Durante la transición:

```text
barrioId → fuente preferida
legacy barrio → fallback controlado
```

No eliminar el campo legacy hasta verificar históricos y consumidores.

---

# 7. MODELO DE ZONA

## 7.1 Entidades

Implementar conceptualmente:

```text
Zona
ZonaBarrio
```

`ZonaBarrio`:

- zonaId;
- barrioId;
- createdAt;
- createdBy;
- source;
- metadata de auditoría si aplica.

Restricción:

```text
UNIQUE(zonaId, barrioId)
```

## 7.2 No agregar todavía

No crear:

- `RutaZona`;
- `PedidoZona` como duplicación innecesaria;
- grupos diarios persistentes como zonas;
- una ruta por zona;
- un solver nuevo.

Solo introducir asignaciones adicionales cuando una necesidad operacional demostrada lo requiera.

---

# 8. INTEGRACIÓN CON EL PLANIFICADOR EXISTENTE

El planificador actual sigue siendo la fuente de planificación diaria.

## 8.1 Flujo

```text
Pedido
 ↓
ubicación efectiva
 ↓
coordenadas / barrio
 ↓
zonas candidatas
 ↓
agrupación
 ↓
capacidad
 ↓
secuencia
 ↓
propuesta
 ↓
excepciones
 ↓
decisión humana
 ↓
Embarques
```

## 8.2 Prioridad geográfica

Mantener:

```text
coordenada confiable
        ↓
coordenada aproximada
        ↓
barrio / zona
        ↓
dirección / referencia
        ↓
sin ubicación
```

Barrio/Zona no deben convertirse en distancia falsa.

## 8.3 Zona como señal

La zona puede influir en:

- continuidad territorial;
- explicación;
- agrupación cuando falta GPS;
- compatibilidad con rutas habituales;
- detección de anomalías;
- sugerencias.

No debe actuar como partición absoluta.

## 8.4 Múltiples rutas dentro de una zona

Ejemplo:

```text
Zona Norte
  40 pedidos
       ↓
capacidad + proximidad
       ↓
Ruta temporal A
Ruta temporal B
```

Esto es correcto.

## 8.5 Ruta que cruza zonas

También es correcto:

```text
Ruta temporal 1
├── Norte
├── Centro
└── Sur
```

si el planificador lo justifica.

---

# 9. CASOS DE USO

## UC-01 — Barrio normal

Cliente pertenece a Barrio A.

Barrio A pertenece a Zona Norte.

Resultado:

- no se muestra advertencia;
- planner puede usar Norte como señal.

## UC-02 — Barrio compartido

Barrio C pertenece a Norte y Sur.

Resultado:

- UI muestra `Compartido`;
- catálogo conserva ambas relaciones;
- cliente/pedido no se duplican.

## UC-03 — Pedido en barrio compartido con GPS fuerte

Barrio C es compartido.

Coordenada del negocio está claramente próxima a Norte.

Resultado:

- planner sugiere Norte;
- explicación visible;
- no se inventa certeza absoluta.

## UC-04 — Pedido en barrio compartido sin GPS

Barrio C compartido.

No hay coordenadas suficientes.

Resultado:

- planner puede agrupar por barrio;
- si la zona es necesaria para una decisión operacional, crea excepción;
- no asigna arbitrariamente.

## UC-05 — Seis clientes, no todo el barrio

Zona Norte contiene 300 clientes potenciales.

Solo seis hicieron pedidos.

Resultado:

- planificación usa los seis pedidos;
- no crea recorridos sobre residentes sin demanda.

## UC-06 — Una zona produce varias rutas

Zona Norte tiene demanda superior a capacidad de un vehículo.

Resultado:

- varias agrupaciones/rutas temporales;
- no se crean varias zonas;
- no se duplica el territorio.

## UC-07 — Ruta cruza zonas

Proximidad y capacidad hacen conveniente combinar pedidos de Norte y Centro.

Resultado:

- se permite;
- explicación disponible;
- zona no bloquea la optimización.

## UC-08 — Nuevo cliente con barrio conocido

Barrio ya existe.

Resultado:

- sugerencia canónica;
- no se crea duplicado.

## UC-09 — Nuevo barrio ambiguo

Texto coincide con dos candidatos.

Resultado:

- no autoasignar;
- mostrar candidatos;
- pedir resolución.

## UC-10 — Cambio de barrio maestro

Cliente cambia de Barrio A a Barrio B.

Resultado:

- nuevo estado maestro;
- pedidos históricos conservan snapshot;
- no reescribir historia.

## UC-11 — Cambio después de generar plan

Se cambia ubicación después de generar propuesta.

Resultado:

- plan queda `STALE`/requiere revalidación según reglas actuales;
- sistema no oculta el cambio;
- nueva generación registra diferencia.

## UC-12 — Override manual

Usuario mueve una parada a otro grupo.

Resultado:

- decisión manual persistida;
- actor/fecha/razón según regla;
- replanificación no la pisa silenciosamente.

---

# 10. CASOS DE FRAUDE / ABUSO Y CONTROLES

Estos casos son **HIPÓTESIS DE RIESGO**, no evidencia de fraude observado.

| Riesgo | Posible beneficio indebido | Control |
|---|---|---|
| Cambiar zona de un territorio | alterar responsabilidad/KPI | auditoría + permisos |
| Cambiar barrio para influir en ruta | desviar responsabilidad | historial + revalidación |
| Cambiar coordenadas | manipular agrupación | origen/calidad + historial |
| Manipular ruta habitual | favorecer repartidor/territorio | trazabilidad + revisión |
| Crear barrios duplicados | fragmentar métricas | unicidad + catálogo canónico |
| Crear zonas duplicadas | fragmentar cobertura | unicidad/alerta semántica |
| Cambiar datos después del plan | provocar otro resultado | snapshots + diff |
| Alterar Pedido vs maestro | ocultar cambio histórico | snapshot inmutable |
| Cambios coordinados entre usuarios | evadir controles | actor + timestamp + correlación |
| Cambiar varios campos a la vez | ocultar reasignación | auditoría de cambio compuesto |
| Eliminar territorio con historia | borrar evidencia | archive/soft delete |
| Sobrescribir override manual | modificar decisión humana | provenance + protección |
| Inflar rutas | manipular productividad/costos | comparación plan vs ejecución |
| Falsificar ubicación con precisión aparente | mejorar artificialmente prioridad | geocodeOrigen + calidad |

## 10.1 Regla antifraude

No bloquear toda operación por riesgo hipotético.

Aplicar controles proporcionales:

```text
bajo riesgo → información
riesgo medio → confirmación
alto riesgo → autorización/auditoría reforzada
hecho histórico → nunca sobrescribir
```

---

# 11. AUDITORÍA

Los cambios sensibles deben conservar:

```text
entityType
entityId
action
before
after
actorId
timestamp
source
reason
correlationId / commandId cuando exista
```

Fuentes:

```text
USER
SYSTEM_RULE
IMPORT
MIGRATION
SYNC
```

La auditoría debe permitir responder:

- qué cambió;
- quién lo cambió;
- cuándo;
- por qué;
- qué dato existía antes;
- qué impacto tuvo.

---

# 12. OFFLINE-FIRST

El catálogo territorial debe estar disponible localmente para operación normal.

## Catálogo local

Dexie/IndexedDB:

```text
barrios
zonas
zonaBarrios
version / updatedAt
```

## Offline

Permitir:

- consultar barrios;
- consultar zonas;
- seleccionar barrio canónico;
- crear comandos compatibles con offline;
- sincronizar después.

## Conflictos

Si dos usuarios modifican una relación Zona↔Barrio:

- no hacer last-write-wins silencioso cuando exista riesgo semántico;
- detectar conflicto;
- preservar ambas versiones;
- resolver explícitamente.

Los comandos críticos deben seguir siendo deduplicables.

---

# 13. API / BACKEND

Los endpoints concretos deben respetar los patrones actuales del repositorio.

Operaciones mínimas:

```text
crearBarrio
buscarBarrios
actualizarBarrio
archivarBarrio

crearZona
buscarZonas
actualizarZona
archivarZona

agregarBarrioAZona
quitarBarrioDeZona
listarBarriosDeZona
listarZonasDeBarrio
```

La API debe:

- validar invariantes;
- controlar autorización;
- detectar solapamiento;
- registrar auditoría;
- usar transacciones;
- proteger concurrencia.

La UI nunca debe ser la única barrera.

---

# 14. UI A IMPLEMENTAR

## 14.1 Clientes / Negocios

Agregar:

- selector/buscador canónico de barrio;
- indicador de calidad;
- indicador de zona(s) cuando sea útil;
- estado de ambigüedad;
- explicación de sugerencias.

## 14.2 Configuración territorial

Nueva experiencia:

```text
Territorio

Zonas
  Norte
    • Barrio A
    • Barrio B
    • Barrio C ⚠ Compartido

  Sur
    • Barrio C ⚠ Compartido
    • Barrio D
```

Acciones:

- crear zona;
- agregar barrio;
- retirar barrio;
- ver relaciones;
- revisar solapamientos;
- ver historial.

## 14.3 Distribución

No convertir Distribución en CRUD territorial.

Mostrar territorio como contexto:

```text
Ruta propuesta
Zona principal: Norte
También cubre: Centro
¿Por qué?
• proximidad
• capacidad
• continuidad
```

## 14.4 Excepciones

La bandeja de excepciones debe poder mostrar:

```text
⚠ Barrio compartido
3 pedidos
Norte / Sur
Sin señal suficiente para distinguir
[Resolver]
```

---

# 15. PRUEBAS

## 15.1 Unitarias

- normalización;
- equivalencias;
- match seguro;
- ambigüedad;
- relaciones M:N;
- detección de solapamiento;
- prioridad geográfica;
- no propagación de zona;
- provenance de override.

## 15.2 Integración DB-real

Probar:

- creación canónica;
- unicidad;
- Zona↔Barrio M:N;
- transacción de solapamiento;
- auditoría;
- concurrencia;
- migración;
- snapshot de Pedido;
- replanificación.

## 15.3 E2E

Obligatorios:

1. crear zona;
2. agregar barrio nuevo;
3. agregar barrio ya perteneciente a otra zona;
4. confirmar solapamiento;
5. visualizar `Compartido` en ambas zonas;
6. crear cliente en barrio compartido;
7. resolver zona;
8. dejar sin determinar;
9. planificar pedidos reales del día;
10. múltiples rutas dentro de una zona;
11. ruta que cruza zonas;
12. override manual;
13. cambio de maestro después de plan;
14. plan stale;
15. migración con valor ambiguo;
16. operación offline;
17. conflicto de sincronización;
18. auditoría visible;
19. evitar duplicados;
20. impedir eliminación destructiva.

---

# 16. CRITERIOS DE ÉXITO

## Producto / UX

### S1 — Cero solapamientos silenciosos

Si un barrio pertenece a varias zonas, el usuario puede descubrirlo inmediatamente desde la UI.

### S2 — El solapamiento válido no bloquea

Norte y Sur pueden compartir Barrio C.

### S3 — La ambigüedad no se propaga

Barrio compartido no duplica automáticamente clientes ni pedidos.

### S4 — Explicabilidad

Una sugerencia relevante puede explicar por qué fue generada.

### S5 — Decisiones humanas persistentes

Un override no desaparece silenciosamente por una regeneración.

### S6 — Historia reconstruible

Los cambios territoriales sensibles permiten reconstruir antes/después, actor y momento.

### S7 — Sin falsa precisión

El sistema no transforma barrio en distancia exacta ni inventa coordenadas.

### S8 — Operación sin sobrecarga cognitiva

El usuario no debe revisar manualmente todos los pedidos para descubrir los casos problemáticos.

### S9 — Alertas proporcionales

No convertir información normal en una sucesión de warnings.

### S10 — Demanda real

La planificación usa pedidos reales del día; no población potencial.

## Técnicos

### T1
TypeScript, lint y tests existentes continúan pasando.

### T2
E2E existentes del planificador no retroceden.

### T3
Las migraciones son aditivas/reversibles y no destruyen históricos.

### T4
Concurrencia protegida en backend/DB.

### T5
Operaciones offline críticas son idempotentes.

### T6
Auditoría completa de cambios sensibles.

### T7
No existen dos fuentes de verdad para la planificación.

### T8
El planificador existente sigue siendo el único motor de propuesta diaria.

---

# 17. GATES DE IMPLEMENTACIÓN

Cada fase debe terminar con:

```text
schema
  ↓
migration
  ↓
domain
  ↓
API
  ↓
UI
  ↓
unit
  ↓
integration
  ↓
E2E
  ↓
typecheck/lint
  ↓
regression
```

No avanzar si existe:

- migración destructiva no justificada;
- test crítico fallando;
- pérdida de trazabilidad;
- comportamiento silencioso;
- conflicto no resuelto;
- discrepancia entre contrato y código.

---

# 18. FASES DE EJECUCIÓN

## F0 — Baseline y ADRs
**Estado:** requerido antes de cambios.

Entregables:

- baseline `main`;
- inventario de consumidores de `Cliente.barrio`, `Negocio.barrio`, `Pedido.barrioEntrega`;
- ADR de Barrio canónico;
- ADR de Zona M:N;
- ADR de provenance/auditoría;
- ADR de UX para solapamientos.

Gate: sin cambios funcionales todavía.

## F1 — Barrio canónico

Entregar:

- modelo `Barrio`;
- índices/constraints;
- repositorio/servicios;
- selector UI;
- pruebas unitarias/integración;
- compatibilidad legacy.

Gate: crear/consultar Barrio sin afectar pedidos existentes.

## F2 — Migración segura

Entregar:

- inventario;
- normalización;
- equivalencias;
- clasificación;
- migración segura;
- reporte de ambiguos;
- dual-read/compatibilidad.

Gate: cero fusiones ambiguas y cero pérdida de valores históricos.

## F3 — Zona territorial

Entregar:

- `Zona`;
- `ZonaBarrio`;
- M:N;
- CRUD administrativo;
- auditoría;
- permisos;
- archivado.

Gate: solapamiento permitido y consistente.

## F4 — UX de solapamiento

Entregar:

- warning contextual;
- estado `Compartido`;
- vista inversa Zona→Barrios y Barrio→Zonas;
- resolución explícita;
- historial.

Gate: ningún overlap puede ser creado o mostrado silenciosamente.

## F5 — Integración Clientes/Negocios

Entregar:

- barrio canónico;
- sugerencias;
- resolución de ambigüedad;
- visualización de zona;
- no propagación automática.

Gate: datos maestros consistentes.

## F6 — Integración Planificador

Entregar:

- zona como señal;
- candidate zones;
- explicación;
- excepciones territoriales;
- no hard partition;
- protección de overrides.

Gate: planner conserva comportamiento existente y gana contexto territorial.

## F7 — Offline

Entregar:

- catálogo local;
- sync;
- deduplicación;
- detección de conflictos;
- E2E offline.

Gate: operación territorial básica sin conectividad.

## F8 — Antifraude y auditoría reforzada

Entregar:

- provenance;
- before/after;
- actor;
- reason;
- autorización;
- controles de cambios de alto impacto;
- consultas de historial.

Gate: casos de abuso relevantes reproducibles en pruebas.

## F9 — Verificación final

Ejecutar:

- typecheck;
- lint;
- unit;
- integration;
- E2E;
- regresión del Planificador;
- auditoría de UI;
- revisión de seguridad;
- revisión de migración;
- comparación Plan ↔ Código.

Resultado final:

```text
IMPLEMENTADO
VERIFICADO
AUDITABLE
SIN REGRESIONES CONOCIDAS
```

---

# 19. EXCLUSIONES

Esta implementación **NO** debe:

- reconstruir el Planificador;
- reemplazar Embarques;
- convertir Barrio en Ruta;
- convertir Zona en Ruta;
- crear rutas diarias persistentes innecesarias;
- introducir preventa en esta fase;
- crear pedidos desde forecast;
- obligar a usar mapa;
- exigir GPS para operar;
- hacer geocoding ficticio de barrios;
- eliminar legacy prematuramente;
- introducir una entidad por cada combinación barrio/cliente/día;
- convertir una hipótesis de fraude en acusación o bloqueo indiscriminado.

---

# 20. DEFINICIÓN FINAL DE CONVERGENCIA

Esta sección estará técnicamente convergida cuando:

1. Barrio sea canónico.
2. Los datos existentes hayan sido migrados de forma segura.
3. Zona sea una relación M:N con Barrio.
4. Los solapamientos sean válidos pero visibles.
5. Clientes y Negocios usen identidad canónica.
6. Pedidos conserven sus snapshots históricos.
7. Zona sea señal, no partición rígida.
8. El Planificador existente continúe siendo el único motor diario.
9. La UI haga visible la incertidumbre.
10. Las decisiones humanas sean distinguibles de las automáticas.
11. Los cambios sensibles sean auditables.
12. Offline y concurrencia estén protegidos.
13. Los casos de fraude/abuso relevantes estén cubiertos por controles y pruebas.
14. Los criterios de éxito sean verificables mediante pruebas automatizadas y métricas UX/operativas.

---

# 21. REGLA DE ORO

> **El territorio aporta contexto; la demanda determina la operación; el algoritmo propone; el humano gobierna las excepciones; y la interfaz nunca oculta una ambigüedad que pueda cambiar una decisión.**