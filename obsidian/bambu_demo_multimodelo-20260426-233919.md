---
created: 2026-04-26T23:39:19.178684
task: Eres el pipeline completo de desarrollo para Agua Bambú v2. A continuación te doy el 100% del contexto REAL del proyecto (ya leído y verificado). NINGÚN agente debe inventar archivos. Usa SOLO esta in
---

# bambu_demo_multimodelo

## Task
Eres el pipeline completo de desarrollo para Agua Bambú v2. A continuación te doy el 100% del contexto REAL del proyecto (ya leído y verificado). NINGÚN agente debe inventar archivos. Usa SOLO esta información.

## SCHEMA PRISMA REAL (prisma/schema.prisma)
17 tablas: User, Ruta, Cliente, Trabajador, Nomina, Pedido, Embarque, Factura, Abono, Produccion, Gasto, Proveedor, Insumo, CompraInsumo, Config, CierreDia, Historial.

Pedido tiene productos embebidos: cAguaPed/cAguaEnt/precioAgua, cHieloPed/cHieloEnt/precioHielo, cBotellonPed/cBotellonEnt/precioBotellon, cBolsaAguaPed/cBolsaAguaEnt/precioBolsaAgua, cBolsaHieloPed/cBolsaHieloEnt/precioBolsaHielo. Pagos embebidos: metodoPago, montoPagado. Auto-relación PedidoHijo para recurrentes. Factura se crea automáticamente al crear pedido.

Cliente tiene: nombre, apellido, telefono, direccion, barrio, referencia, linkUbicacion, nombreNegocio, tipoNegocio, horaApertura, precioAguaPref, rutaId, frecuencia, cadaNDias, ultEntrega, proxEntrega, habAgua/habHielo/habBotellon/habBolsaAgua/habBolsaHielo.

Trabajador tiene: nombre, rol, tipoPago, usaMoto, comPacaAgua, comPacaHielo, salarioFijo, deudaReposAgua, deudaReposHielo.

Embarque: numero, fecha, trabajadorId, rutaId, horaSalida, horaLlegada, estado (ABIERTO/CERRADO), pacasAgua/Hielo, devueltas, rotas.

## APIs REALES (src/app/api/)
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
- /api/search (GET) - búsqueda genérica (VACÍA)

## PÁGINAS FRONTEND REALES (src/app/(app)/)
- /dashboard - stats del día
- /clientes - lista clientes + crear
- /pedidos - lista pedidos + PedidoForm completo
- /embarques - embarques + asignar
- /produccion - producción turnos
- /cierre - cierre diario
- /facturas - facturas con abonos
- /gastos - gastos por categoría
- /nomina - nómina + cálculo automático
- /insumos - insumos + alertas stock
- /reportes - reportes básicos

## COMPONENTES REALES
- pedido-form.tsx, cliente-form.tsx, embarque-card.tsx, app-sidebar.tsx, offline-banner.tsx, base-caja-modal.tsx, providers.tsx
- UI: button, input, card, label, select, dialog, table, tabs, badge

## LIBRERÍAS REALES
- auth.ts (NextAuth v5, credentials provider, JWT strategy, roles en token)
- auth-server.ts (wrapper)
- prisma.ts (singleton PrismaClient)
- db/offline.ts (Dexie, offline-first, BambuOfflineDB)
- db/sync.ts (sincronización offline→online)
- utils.ts (formatCurrency, formatDate)
- cn.ts (clsx + tailwind-merge)

## CONFIGURACIÓN
- next.config.ts (headers para sw.js)
- middleware.ts (protege rutas /pedidos, /clientes, etc., redirige a /login)
- package.json: Next.js 16.2.4, React 19.2.4, Prisma 6.19.3, next-auth v5, Dexie, Zustand, Workbox

## HALLAZGOS DEL GRÁFICO (graphify)
- God nodes: GET() 20 edges, dashboard/page.tsx 16 edges, POST() 13 edges, middleware.ts 13 edges
- 76 comunidades detectadas
- Conexiones sorprendentes: middleware referencia insumos/page.tsx, OfflineBanner→useOnlineStatus, syncOfflineData→syncPedidos
- Hyperedges: App Pages Architecture, API Aggregator Pages, Financial Management Pages, Database seeding process, Offline-first sync architecture, Multi-model AI agent pipeline

## TAREA PARA EL PIPELINE
Ejecuta TODOS los agentes obligatoriamente sin omitir ninguno: PLANNER → ARCHITECT → PROJECT_MANAGER → CODER → TESTER → DEBUGGER → SECURITY → REVIEWER → QA.

### PLANNER
Analiza el modelo de negocio REAL de distribución de agua/hielo. Identifica requisitos funcionales, no funcionales, gaps entre lo implementado y lo necesario. Lista historias de usuario pendientes.

### ARCHITECT
Revisa schema Prisma completo. Evalúa offline-first, sincronización, PWA. Revisa next.config.ts, middleware.ts, estructura. Identifica deuda técnica.

### PROJECT_MANAGER
Revisa entregables de Planner y Architect. Formula PREGUNTAS de clarificación al usuario sobre decisiones críticas ANTES de avanzar. Crea plan de sprints priorizado con dependencias. Identifica riesgos.

### CODER
Revisa TODO el código leído. Identifica bugs, code smells, duplicación, código muerto. Revisa consistencia de tipos, manejo de errores, validaciones. Propone mejoras concretas.

### TESTER
Diseña estrategia de testing. Identifica partes SIN cobertura. Escribe casos de prueba para flujos críticos (pedido completo, cierre diario, nómina). Detecta edge cases.

### DEBUGGER
Ejecuta análisis estático conceptual: revisa consistencia entre schema Prisma y uso en APIs. Identifica posibles runtime errors (null pointers). Revisa manejo de errores.

### SECURITY
Revisa autenticación y autorización. Identifica vulnerabilidades en APIs (SQL injection, XSS, CSRF). Revisa manejo de datos sensibles. Valida permisos por rol.

### REVIEWER
Revisa calidad de código de TODO el proyecto. Evalúa patrones de diseño, clean code, SOLID. Revisa consistencia de naming conventions. Identifica violaciones DRY, KISS, YAGNI.

### QA
Valida que TODOS los entregables sean consistentes. Verifica que no haya contradicciones. Asegura que el plan del PM sea ejecutable. Emite veredicto final: PASS con observaciones, o FAIL con bloqueantes.

REGLAS:
- Usa SOLO la información proporcionada arriba. NO inventes archivos.
- Reporta con precisión.
- NO omitas ningún agente.
- Si QA detecta bloqueantes, el pipeline debe iterar.

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1924, 'out': 3, 'cost': 0.000145}, {'model': 'meta-llama/llama-4-maverick', 'in': 2305, 'out': 607, 'cost': 0.00071}, {'model': 'minimax/minimax-m2.5', 'in': 2159, 'out': 4513, 'cost': 0.005514}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2150, 'out': 768, 'cost': 0.000315}, {'model': 'qwen/qwen3-coder', 'in': 2517, 'out': 4078, 'cost': 0.007894}, {'model': 'mistralai/devstral-small', 'in': 2240, 'out': 4899, 'cost': 0.001694}, {'model': 'deepseek/deepseek-v4-flash', 'in': 867, 'out': 2171, 'cost': 0.000729}, {'model': 'meta-llama/llama-4-scout', 'in': 707, 'out': 878, 'cost': 0.00032}, {'model': 'deepseek/deepseek-v4-flash', 'in': 821, 'out': 940, 'cost': 0.000378}, {'model': 'meta-llama/llama-4-maverick', 'in': 16335, 'out': 1174, 'cost': 0.003155}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 2711, 'out': 586, 'cost': 0.000321}]
