---
created: 2026-04-26T23:11:05.649560
task: Eres el equipo completo de desarrollo senior para el proyecto Agua Bambú v2. Debes ejecutar TODO el pipeline de agentes sin omitir ninguno: PLANNER -> ARCHITECT -> PROJECT_MANAGER -> CODER -> TESTER -
---

# bambu_demo_multimodelo

## Task
Eres el equipo completo de desarrollo senior para el proyecto Agua Bambú v2. Debes ejecutar TODO el pipeline de agentes sin omitir ninguno: PLANNER -> ARCHITECT -> PROJECT_MANAGER -> CODER -> TESTER -> DEBUGGER -> SECURITY -> REVIEWER -> QA.

## INSTRUCCIONES CRÍTICAS
1. Project Manager DEBE hacer preguntas de clarificación al usuario cuando detecte ambigüedades, requisitos faltantes o decisiones arquitectónicas importantes antes de continuar.
2. Ningún agente debe saltarse pasos ni resumir su trabajo. Cada agente debe entregar su output completo.
3. El análisis debe cubrir el 100% del código del proyecto, sin excepciones.

## CONTEXTO DEL PROYECTO
- Proyecto: Next.js 16 + React 19 + TypeScript + Tailwind + Prisma (SQLite)
- Ubicación: /home/cristof/Documents/bambu_demo_multimodelo
- Schema: prisma/schema.prisma (lee el archivo real)
- APIs: src/app/api/**/*.ts (lee todos los archivos reales)
- Frontend: src/app/(app)/**/*.tsx (lee todas las páginas reales)
- Componentes: src/components/**/*.tsx (lee todos los componentes reales)
- Libs/Hooks/Stores: src/lib/**, src/hooks/**, src/stores/** (lee todo)

## TAREAS DE CADA AGENTE

### PLANNER
- Analiza el modelo de negocio REAL de distribución de agua/hielo
- Identifica todos los requisitos funcionales y no funcionales
- Detecta gaps entre lo que el negocio necesita y lo que está implementado
- Lista historias de usuario pendientes

### ARCHITECT
- Revisa prisma/schema.prisma completo (cada modelo, relación, índice)
- Evalúa si la arquitectura soporta offline-first, sincronización, PWA
- Revisa next.config.ts, middleware.ts, estructura de carpetas
- Identifica deuda técnica y propone refactorizaciones

### PROJECT_MANAGER
- Revisa todo lo entregado por Planner y Architect
- Formula PREGUNTAS de clarificación al usuario sobre decisiones críticas antes de avanzar
- Crea un plan de sprints priorizado con dependencias
- Identifica riesgos y mitigaciones

### CODER
- Revisa TODOS los archivos de src/ y prisma/
- Identifica bugs, code smells, duplicación, código muerto
- Revisa consistencia de tipos, manejo de errores, validaciones
- Propone mejoras concretas de código (incluye snippets)

### TESTER
- Diseña estrategia de testing para el proyecto
- Identifica qué partes del código NO tienen cobertura
- Escribe casos de prueba para flujos críticos (pedido completo, cierre diario, nómina)
- Detecta edge cases y escenarios de fallo

### DEBUGGER
- Ejecuta análisis estático: tsc --noEmit (verifica errores TypeScript reales)
- Revisa consistencia entre schema Prisma y uso en APIs
- Identifica posibles runtime errors (null pointers, race conditions)
- Revisa manejo de errores en APIs y frontend

### SECURITY
- Revisa autenticación y autorización (auth.ts, auth-server.ts, middleware.ts)
- Identifica vulnerabilidades en APIs (SQL injection, XSS, CSRF)
- Revisa manejo de datos sensibles
- Valida permisos por rol (ADMIN, SUPERVISOR, VENDEDOR, REPARTIDOR)

### REVIEWER
- Revisa calidad de código de TODO el proyecto
- Evalúa patrones de diseño, clean code, SOLID
- Revisa consistencia de naming conventions, formateo
- Identifica código que viola principios DRY, KISS, YAGNI

### QA
- Valida que TODOS los entregables anteriores sean consistentes entre sí
- Verifica que no haya contradicciones entre Architect y Coder
- Asegura que el plan del PM sea ejecutable
- Emite veredicto final: PASS con observaciones, o FAIL con bloqueantes

## REGLAS
- Lee cada archivo del proyecto ANTES de opinar sobre él. No inventes archivos que no existan.
- Si un archivo no existe, indícalo explícitamente.
- Reporta con precisión de archivo y línea.
- NO omitas ningún agente del pipeline.
- Si el QA detecta bloqueantes, el pipeline debe iterar.


## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1079, 'out': 3, 'cost': 8.2e-05}, {'model': 'meta-llama/llama-4-maverick', 'in': 1554, 'out': 1070, 'cost': 0.000875}, {'model': 'minimax/minimax-m2.5', 'in': 1219, 'out': 271, 'cost': 0.000495}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1251, 'out': 635, 'cost': 0.000221}, {'model': 'qwen/qwen3-coder', 'in': 1681, 'out': 311, 'cost': 0.00093}, {'model': 'deepseek/deepseek-v4-flash', 'in': 363, 'out': 289, 'cost': 0.000132}, {'model': 'meta-llama/llama-4-scout', 'in': 308, 'out': 412, 'cost': 0.000148}, {'model': 'deepseek/deepseek-v4-flash', 'in': 648, 'out': 919, 'cost': 0.000348}, {'model': 'meta-llama/llama-4-maverick', 'in': 3014, 'out': 578, 'cost': 0.000799}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1665, 'out': 382, 'cost': 0.000201}]
