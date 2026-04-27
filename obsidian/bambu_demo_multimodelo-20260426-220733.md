---
created: 2026-04-26T22:07:33.664590
task: Analiza el schema de base de datos en prisma/schema.prisma para Agua Bambú v2. Revisa cada tabla y identifica problemas de normalización: 1) Datos de persona (nombre, apellido) mezclados con datos de 
---

# bambu_demo_multimodelo

## Task
Analiza el schema de base de datos en prisma/schema.prisma para Agua Bambú v2. Revisa cada tabla y identifica problemas de normalización: 1) Datos de persona (nombre, apellido) mezclados con datos de contacto (teléfono, email) y datos de ubicación (dirección, barrio, referencia) en la misma tabla, 2) Datos duplicados entre tablas (ej: cliente duplicado en pedido, factura), 3) Tablas que violan 1NF (campos múltiples como metodo1/monto1), 4) Falta de normalización de campos repetitivos, 5) Campos que deberían estar en tablas separadas. Da un reporte detallado con cada problema encontrado y recomendaciones específicas de normalización.

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 252, 'out': 5, 'cost': 2e-05}, {'model': 'meta-llama/llama-4-maverick', 'in': 510, 'out': 843, 'cost': 0.000582}, {'model': 'deepseek/deepseek-v4-flash', 'in': 123, 'out': 557, 'cost': 0.000173}, {'model': 'meta-llama/llama-4-maverick', 'in': 1207, 'out': 1084, 'cost': 0.000831}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 981, 'out': 165, 'cost': 0.000107}]
