---
created: 2026-04-27T00:55:28.392285
task: Eres el pipeline completo de desarrollo para Agua Bambú v2. El deadline REAL es 2 meses (8 semanas), NO 1 semana. Re-ajusta TODO el plan.

## CONTEXTO ACUMULADO DEL PROYECTO

### Schema Prisma (17 tab
---

# bambu_demo_multimodelo

## Task
Eres el pipeline completo de desarrollo para Agua Bambú v2. El deadline REAL es 2 meses (8 semanas), NO 1 semana. Re-ajusta TODO el plan.

## CONTEXTO ACUMULADO DEL PROYECTO

### Schema Prisma (17 tablas)
User, Ruta, Cliente, Trabajador, Nomina, Pedido, Embarque, Factura, Abono, Produccion, Gasto, Proveedor, Insumo, CompraInsumo, Config, CierreDia, Historial.

Pedido tiene productos embebidos: cAguaPed/cAguaEnt/precioAgua, cHieloPed/cHieloEnt/precioHielo, cBotellonPed/cBotellonEnt/precioBotellon, cBolsaAguaPed/cBolsaAguaEnt/precioBolsaAgua, cBolsaHieloPed/cBolsaHieloEnt/precioBolsaHielo. Pagos embebidos: metodoPago, montoPagado. Auto-relación PedidoHijo para recurrentes. Factura auto al crear pedido.

### APIs (20 endpoints)
/clientes, /clientes/[id], /pedidos, /pedidos/[id], /embarques, /embarques/[id], /facturas, /abonos, /nomina, /gastos, /insumos, /compras, /proveedores, /produccion, /cierre, /cierre/last, /trabajadores, /config, /config/BASE_DIA, /search (vacío)

### Frontend
11 páginas: dashboard, clientes, pedidos, embarques, produccion, cierre, facturas, gastos, nomina, insumos, reportes. Todas 'use client'. Componentes UI con shadcn/ui.

### Auth
NextAuth v5, credentials provider, password en PLANO (===), JWT 4h, middleware protege páginas pero NO APIs.

### Offline
Dexie (BambuOfflineDB) + sync.ts + sw.ts. Solo pedidos/clientes. Colas inconsistentes.

### Hallazgos críticos del pipeline anterior
- 26 vulnerabilidades (7 críticas: passwords plano, APIs públicas, sin RBAC, mass assignment, DELETE físico, sin rate limiting, sin validación)
- 66 bugs (4 críticos: APIs públicas, passwords plano, pedido+factura sin transacción, race conditions en números)
- Schema desincronizado (clienteId en DB pero no en schema)
- Productos hardcodeados (15 campos en Pedido)
- Sin índices, sin enums, sin transacciones
- Offline roto, PWA incompleta, SQLite no escala
- Calificación REVIEWER: D+/F

### Respuestas del usuario
1. Deadline: 2 meses (ahora confirmado)
2. Repartidores con 2G/3G intermitente en pueblo rural
3. Botellones: ,500 fábrica (cliente lleva) vs 0,000 domicilio (recoger+lavar+enviar)
4. Sí a múltiples métodos de pago por pedido
5. 6 usuarios concurrentes, usarán Supabase en producción
6. Exportar reportes puede esperar
7. Precios cambian en cualquier momento
8. Sí hay pedidos recurrentes reales

## TAREA: RE-EJECUTAR PIPELINE COMPLETO CON 8 SEMANAS

Ejecuta TODOS los agentes sin omitir ninguno con el nuevo deadline:

### PLANNER
Re-analiza con 8 semanas. ¿Qué entra y qué no? Prioriza épicas para 8 semanas.

### ARCHITECT
Diseña arquitectura target: Supabase PostgreSQL, schema normalizado, offline-first real, PWA funcional.

### PROJECT_MANAGER
Crea plan de 8 sprints con dependencias. Identifica milestones. Formula preguntas si hay ambigüedades.

### CODER
Plan detallado de implementación por sprint. Qué archivos modificar, qué crear, snippets concretos.

### TESTER
Estrategia de testing para 8 semanas. Unit, integration, E2E. Cuándo se integra testing en cada sprint.

### DEBUGGER
Análisis de qué bugs arreglar en qué sprint. Dependencias entre fixes.

### SECURITY
Plan de remediación de las 26 vulnerabilidades en 8 semanas. Priorización por sprint.

### REVIEWER
Roadmap de calidad: cuándo refactorizar, cuándo aplicar patrones, cuándo hacer code reviews.

### QA
Veredicto final: ¿El plan de 8 semanas es ejecutable? ¿PASS o FAIL?

REGLAS:
- Usa SOLO la información real del proyecto
- NO inventes archivos
- Reporta con precisión
- NO omitas ningún agente
- Sé realista con 8 semanas

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1171, 'out': 3, 'cost': 8.8e-05}, {'model': 'meta-llama/llama-4-maverick', 'in': 1681, 'out': 291, 'cost': 0.000427}, {'model': 'minimax/minimax-m2.5', 'in': 1267, 'out': 3928, 'cost': 0.004707}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1374, 'out': 674, 'cost': 0.000238}, {'model': 'qwen/qwen3-coder', 'in': 2634, 'out': 19, 'cost': 0.000614}, {'model': 'qwen/qwen3-coder', 'in': 3287, 'out': 26, 'cost': 0.00077}, {'model': 'qwen/qwen3-coder', 'in': 4024, 'out': 37, 'cost': 0.000952}, {'model': 'qwen/qwen3-coder', 'in': 4870, 'out': 38, 'cost': 0.00114}, {'model': 'qwen/qwen3-coder', 'in': 5837, 'out': 38, 'cost': 0.001353}, {'model': 'mistralai/devstral-small', 'in': 1107, 'out': 1747, 'cost': 0.000635}, {'model': 'deepseek/deepseek-v4-flash', 'in': 511, 'out': 527, 'cost': 0.000219}, {'model': 'meta-llama/llama-4-maverick', 'in': 5498, 'out': 610, 'cost': 0.001191}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1704, 'out': 389, 'cost': 0.000206}]
