---
created: 2026-04-26T22:22:36.928450
task: Analiza el proyecto Agua Bambú v2: 1) Requerimientos del modelo de negocio (distribución de agua/hielo): pedidos, productos, precios, pagos, entregas, rutas, trabajadores, comisiones. 2) Flujo del neg
---

# bambu_demo_multimodelo

## Task
Analiza el proyecto Agua Bambú v2: 1) Requerimientos del modelo de negocio (distribución de agua/hielo): pedidos, productos, precios, pagos, entregas, rutas, trabajadores, comisiones. 2) Flujo del negocio: ciclo diario, producción → embarques → entregas → cobros. 3) Lógica: precios por cliente, frecuencia de pedidos, cálculo de comisiones, cierre diario. 4) Base de datos actual en prisma/schema.prisma con datos de prueba (6 clientes, 3 rutas con días, 6 usuarios, 5 configs). 5) APIs existentes en src/app/api/. Da un reporte ejecutivo con gaps encontrados y roadmap de implementación priorizado.

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 241, 'out': 5, 'cost': 1.9e-05}, {'model': 'meta-llama/llama-4-maverick', 'in': 632, 'out': 651, 'cost': 0.000485}, {'model': 'deepseek/deepseek-v4-flash', 'in': 146, 'out': 655, 'cost': 0.000204}, {'model': 'meta-llama/llama-4-maverick', 'in': 1037, 'out': 551, 'cost': 0.000486}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 816, 'out': 297, 'cost': 0.000121}]
