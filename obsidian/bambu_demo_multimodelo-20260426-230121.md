---
created: 2026-04-26T23:01:21.730559
task: 
Eres el equipo completo de desarrollo para el proyecto Agua Bambú v2 (distribución de agua y hielo). Tu tarea es ejecutar TODO el pipeline: PLANNER → ARCHITECT → PROJECT_MANAGER → CODER → TESTER → DE
---

# bambu_demo_multimodelo

## Task

Eres el equipo completo de desarrollo para el proyecto Agua Bambú v2 (distribución de agua y hielo). Tu tarea es ejecutar TODO el pipeline: PLANNER → ARCHITECT → PROJECT_MANAGER → CODER → TESTER → DEBUGGER → SECURITY → REVIEWER → QA.

## CONTEXTO COMPLETO DEL PROYECTO

### Estructura:
- Next.js 16 + React 19 + TypeScript + Tailwind + Prisma (SQLite)
- 17 tablas en prisma/schema.prisma (normalizadas IQ200)
- 35 APIs en src/app/api/
- 15 páginas en src/app/(app)/
- Componentes UI en src/components/ui/

### Schema DB (tablas):
User, Ruta, Cliente, Trabajador, Nomina, Pedido, Embarque, Factura, Abono, Produccion, Gasto, Proveedor, Insumo, CompraInsumo, Config, CierreDia, Historial

### APIs implementadas:
- /api/clientes (GET/POST) - lista/crear clientes
- /api/clientes/[id] (GET/PUT/DELETE) - CRUD cliente
- /api/pedidos (GET/POST) - lista/crear pedidos + auto-factura
- /api/pedidos/[id] (GET/PUT/DELETE) - CRUD pedido
- /api/embarques (GET/POST) - embarques
- /api/embarques/[id] (GET/PUT) - asignar pedidos
- /api/facturas (GET/POST) - facturas + abonos
- /api/abonos (GET/POST) - registrar pagos
- /api/nomina (GET/POST) - calcular comisiones automáticamente
- /api/gastos (GET/POST) - gastos por categoría
- /api/insumos (GET/POST) - insumos con alertas stock
- /api/compras (GET/POST) - compras a proveedores
- /api/proveedores (GET/POST) - proveedores
- /api/produccion (GET/POST) - producción
- /api/cierre (GET/POST) - cierre diario
- /api/cierre/last (GET) - último cierre
- /api/trabajadores (GET/POST) - trabajadores
- /api/config (GET/POST) - configuraciones
- /api/search (GET) - búsqueda genérica

### Páginas frontend:
- /dashboard - stats del día
- /clientes - lista clientes + crear
- /pedidos - lista pedidos + PedidoForm completo
- /embarques - embarques + asignar
- /produccion - producción turnos
- /cierre - cerrar día
- /facturas - facturas + registrar abonos
- /nomina - calcular nómina automática
- /gastos - gastos por categoría
- /insumos - insumos + alertas stock
- /reportes - dashboard analytics

### Componentes:
- PedidoForm - buscar cliente, crear cliente, 5 productos, precios por cliente, pago, obs
- ClienteForm - crear/editar cliente
- AppSidebar - navegación
- BaseCajaModal - configurar base del día
- EmbarqueCard - card de embarque

### Datos de prueba:
- 5 usuarios (admin, asistente, contador, repartidor, sellador)
- 3 rutas (Norte, Centro, Sur) con días de entrega
- 6 clientes con frecuencia (diaria, semanal, quincenal)
- 3 trabajadores (repartidor, sellador, admin)
- 5 configs (base día, comisiones, precios)

## INSTRUCCIONES PARA CADA AGENTE

### PLANNER (mistral):
1. Analiza el modelo de negocio COMPLETO: distribución agua/hielo, rutas diarias, pedidos recurrentes, entregas, cobros, comisiones, cierre diario.
2. Identifica gaps de lógica: ¿qué flujos no están implementados? ¿qué validaciones faltan?
3. Define user stories faltantes.

### ARCHITECT (llama-4-maverick):
1. Revisa el schema Prisma actual: ¿faltan campos? ¿relaciones incorrectas? ¿índices necesarios?
2. Revisa la arquitectura de APIs: ¿REST correcto? ¿validaciones? ¿manejo de errores?
3. Revisa frontend: ¿componentes reusables? ¿estado global? ¿offline-first?

### PROJECT_MANAGER (mistral):
1. Convierte los gaps en tasks priorizados.
2. Define dependencias entre tasks.
3. Estima esfuerzo (simple/medio/complejo).

### CODER (qwen3-coder):
1. Propone código específico para los gaps críticos.
2. Corrige bugs conocidos.
3. Optimiza queries Prisma.

### TESTER (devstral-small):
1. Define casos de prueba para cada flujo.
2. Identifica edge cases.
3. Propone tests.

### DEBUGGER (deepseek):
1. Revisa el código existente línea por línea.
2. Encuentra bugs potenciales.
3. Propone fixes.

### SECURITY (llama-4-scout):
1. Revisa auth.
2. Valida inputs.
3. Identifica vulnerabilidades.

### REVIEWER (llama-4-maverick):
1. Revisa todo el output anterior.
2. Verifica consistencia.
3. Ajusta prioridades.

### QA (mistral):
1. Valida que todo esté cubierto.
2. Verifica calidad del plan.
3. PASS/FAIL.

## OUTPUT ESPERADO

Para CADA agente, reporta:
- Qué analizó
- Qué encontró (específico, no genérico)
- Qué recomienda
- Código si aplica

NO seas genérico. Sé específico sobre este proyecto de distribución de agua.


## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1403, 'out': 3, 'cost': 0.000106}, {'model': 'meta-llama/llama-4-maverick', 'in': 1927, 'out': 927, 'cost': 0.000845}, {'model': 'minimax/minimax-m2.5', 'in': 1523, 'out': 11987, 'cost': 0.014013}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1624, 'out': 545, 'cost': 0.000231}, {'model': 'qwen/qwen3-coder', 'in': 2089, 'out': 6487, 'cost': 0.012136}, {'model': 'deepseek/deepseek-v4-flash', 'in': 831, 'out': 2946, 'cost': 0.000941}, {'model': 'meta-llama/llama-4-scout', 'in': 705, 'out': 749, 'cost': 0.000281}, {'model': 'deepseek/deepseek-v4-flash', 'in': 712, 'out': 1139, 'cost': 0.000419}, {'model': 'meta-llama/llama-4-maverick', 'in': 21688, 'out': 1225, 'cost': 0.003988}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2180, 'out': 220, 'cost': 0.000208}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2042, 'out': 1098, 'cost': 0.000373}, {'model': 'qwen/qwen3-coder', 'in': 2090, 'out': 2595, 'cost': 0.005131}, {'model': 'deepseek/deepseek-v4-flash', 'in': 914, 'out': 1987, 'cost': 0.000684}, {'model': 'meta-llama/llama-4-scout', 'in': 863, 'out': 981, 'cost': 0.000363}, {'model': 'deepseek/deepseek-v4-flash', 'in': 1082, 'out': 1113, 'cost': 0.000463}, {'model': 'meta-llama/llama-4-maverick', 'in': 20685, 'out': 1229, 'cost': 0.00384}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2180, 'out': 193, 'cost': 0.000202}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2062, 'out': 875, 'cost': 0.00033}, {'model': 'qwen/qwen3-coder', 'in': 2099, 'out': 2, 'cost': 0.000465}, {'model': 'deepseek/deepseek-v4-flash', 'in': 34, 'out': 267, 'cost': 8e-05}, {'model': 'meta-llama/llama-4-scout', 'in': 21, 'out': 149, 'cost': 4.6e-05}, {'model': 'deepseek/deepseek-v4-flash', 'in': 947, 'out': 595, 'cost': 0.000299}, {'model': 'meta-llama/llama-4-maverick', 'in': 15418, 'out': 1229, 'cost': 0.00305}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2180, 'out': 577, 'cost': 0.000279}]
