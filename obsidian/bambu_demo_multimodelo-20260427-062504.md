---
created: 2026-04-27T06:25:04.341817
task: Continúa la implementación del plan de 8 semanas para Agua Bambú v2. Estado actual:

COMPLETADO (Semana 1, parcial):
- Task 1.1: PostgreSQL provider configurado en Prisma, .env.local creado
- Task 1.2
---

# bambu_demo_multimodelo

## Task
Continúa la implementación del plan de 8 semanas para Agua Bambú v2. Estado actual:

COMPLETADO (Semana 1, parcial):
- Task 1.1: PostgreSQL provider configurado en Prisma, .env.local creado
- Task 1.2: Schema arreglado (clienteId verificado, modelo Pago agregado, PrecioHistorial, enums, índices)
- Task 1.3: bcrypt instalado, auth-check creado, TODAS las API routes protegidas con requireAuth
- Task 1.4: Zod validation en TODOS los POST endpoints, validators.ts creado

PENDIENTE (ejecutar en orden):
- Task 1.5: Wrap Pedido+Factura+Pagos y Abono+Factura en . Crear SQL de secuencias PostgreSQL
- Task 1.6: Eliminar src/app/api/search/route.ts (vacío), src/app/api/config/BASE_DIA/route.ts (duplicado)
- Task 2.1: Fix /api/produccion — cambiar findFirst a findMany para múltiples turnos
- Task 2.2: Crear /api/cierre-dia/route.ts (404 actualmente)
- Task 2.3: Repository pattern base (BaseRepository, PedidoRepository, ClienteRepository)
- Task 3.1: Panel de precios configurable (/api/precios + página + componentes)
- Task 3.2: Refactor PedidoForm para múltiples pagos y precios dinámicos
- Task 4.1: Motor de pedidos recurrentes (campos en schema + lógica + endpoint)
- Task 4.2: Advisory locks PostgreSQL para eliminar race conditions en números
- Task 5.1: Rebuild Dexie schema con syncStatus y localIds
- Task 5.2: Sync engine con resolución de conflictos + indicador de conectividad
- Task 6.1: Service worker con background sync
- Task 6.2: PWA manifest e íconos
- Task 7.1: APIs de reportes (ventas, cartera)
- Task 7.2: Dashboard con datos reales
- Task 8.1: Tests unitarios con Vitest
- Task 8.2: E2E con Playwright
- Task 8.3: Rate limiting y security headers

IMPORTANTE:
- Trabajar en el worktree: /home/cristof/Documents/bambu_demo_multimodelo/.worktrees/feat-8-week-impl
- Usar SQLite local (prisma/dev.db) para desarrollo
- NO ejecutar prisma migrate dev (no hay PostgreSQL conectado)
- Sí ejecutar prisma generate cuando se cambie schema
- Verificar npm run build después de cada tarea
- Hacer commit después de cada tarea
- Seguir plan detallado en docs/superpowers/plans/2026-04-27-agua-bambu-v2.md

Genera un plan de ejecución, luego implementa cada tarea, verifica build, y reporta progreso.

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 759, 'out': 2, 'cost': 5.7e-05}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1951, 'out': 34, 'cost': 0.000153}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2161, 'out': 52, 'cost': 0.000172}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2273, 'out': 48, 'cost': 0.00018}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2609, 'out': 52, 'cost': 0.000206}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 3578, 'out': 518, 'cost': 0.000372}, {'model': 'qwen/qwen3-coder', 'in': 2245, 'out': 51, 'cost': 0.000586}, {'model': 'qwen/qwen3-coder', 'in': 2462, 'out': 43, 'cost': 0.000619}, {'model': 'qwen/qwen3-coder', 'in': 2585, 'out': 43, 'cost': 0.000646}, {'model': 'qwen/qwen3-coder', 'in': 3460, 'out': 42, 'cost': 0.000837}, {'model': 'qwen/qwen3-coder', 'in': 3519, 'out': 31, 'cost': 0.00083}, {'model': 'mistralai/devstral-small', 'in': 696, 'out': 2077, 'cost': 0.000693}, {'model': 'deepseek/deepseek-v4-flash', 'in': 44, 'out': 354, 'cost': 0.000105}, {'model': 'meta-llama/llama-4-scout', 'in': 29, 'out': 351, 'cost': 0.000108}, {'model': 'deepseek/deepseek-v4-flash', 'in': 475, 'out': 1384, 'cost': 0.000454}, {'model': 'meta-llama/llama-4-maverick', 'in': 3974, 'out': 671, 'cost': 0.000999}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1305, 'out': 182, 'cost': 0.000134}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1972, 'out': 17, 'cost': 0.000151}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2169, 'out': 426, 'cost': 0.000248}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2619, 'out': 6, 'cost': 0.000198}, {'model': 'qwen/qwen3-coder', 'in': 2091, 'out': 49, 'cost': 0.000548}, {'model': 'qwen/qwen3-coder', 'in': 2312, 'out': 46, 'cost': 0.000591}, {'model': 'qwen/qwen3-coder', 'in': 2443, 'out': 32, 'cost': 0.000595}, {'model': 'qwen/qwen3-coder', 'in': 2625, 'out': 39, 'cost': 0.000648}, {'model': 'qwen/qwen3-coder', 'in': 2733, 'out': 44, 'cost': 0.00068}, {'model': 'mistralai/devstral-small', 'in': 705, 'out': 1633, 'cost': 0.00056}, {'model': 'deepseek/deepseek-v4-flash', 'in': 53, 'out': 1011, 'cost': 0.00029}, {'model': 'meta-llama/llama-4-scout', 'in': 37, 'out': 495, 'cost': 0.000151}, {'model': 'deepseek/deepseek-v4-flash', 'in': 543, 'out': 1052, 'cost': 0.000371}, {'model': 'meta-llama/llama-4-maverick', 'in': 3663, 'out': 225, 'cost': 0.000684}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 960, 'out': 315, 'cost': 0.000135}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1979, 'out': 10, 'cost': 0.00015}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2169, 'out': 637, 'cost': 0.00029}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2826, 'out': 6, 'cost': 0.000213}, {'model': 'qwen/qwen3-coder', 'in': 2073, 'out': 52, 'cost': 0.00055}, {'model': 'qwen/qwen3-coder', 'in': 2297, 'out': 53, 'cost': 0.000601}, {'model': 'qwen/qwen3-coder', 'in': 2402, 'out': 44, 'cost': 0.000608}, {'model': 'qwen/qwen3-coder', 'in': 2503, 'out': 43, 'cost': 0.000628}, {'model': 'qwen/qwen3-coder', 'in': 2592, 'out': 65, 'cost': 0.000687}, {'model': 'deepseek/deepseek-v4-flash', 'in': 73, 'out': 384, 'cost': 0.000118}, {'model': 'mistralai/devstral-small', 'in': 722, 'out': 4907, 'cost': 0.001544}, {'model': 'meta-llama/llama-4-scout', 'in': 54, 'out': 167, 'cost': 5.4e-05}, {'model': 'deepseek/deepseek-v4-flash', 'in': 561, 'out': 625, 'cost': 0.000254}, {'model': 'meta-llama/llama-4-maverick', 'in': 5599, 'out': 291, 'cost': 0.001014}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1033, 'out': 241, 'cost': 0.000126}]
