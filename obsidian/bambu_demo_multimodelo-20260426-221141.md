---
created: 2026-04-26T22:11:41.164338
task: Eres un arquitecto de bases de datos senior con IQ 200. Analiza el schema prisma/schema.prisma del proyecto Agua Bambú (distribución de agua y hielo). PIENSA PROFUNDO sobre:

1. NEGOCIO REAL: ¿Cómo fu
---

# bambu_demo_multimodelo

## Task
Eres un arquitecto de bases de datos senior con IQ 200. Analiza el schema prisma/schema.prisma del proyecto Agua Bambú (distribución de agua y hielo). PIENSA PROFUNDO sobre:

1. NEGOCIO REAL: ¿Cómo funciona un negocio de distribución de agua? Entregas diarias, rutas, pedidos recurrentes, stock por entrega, devoluciones de envases. ¿Qué datos REALMENTE importan?

2. PATRONES DE DISEÑO INTELIGENTES:
   - Embedded vs Referenced: ¿Cuándo guardar dato directamente vs crear FK?
   - Temporal vs Snapshot: ¿Pedido es estado actual o histórico?
   - Aggregates: ¿Agrupa por cliente, por ruta, por día?
   - Event sourcing: ¿Necesita historial de cambios?

3. ANÁLISIS CRÍTICO ACTUAL:
   - Persona/Contacto/Ubicacion: ¿Realmente necesario? Un cliente tiene 1 teléfono, 1 dirección. ¿No es sobre-ingeniería?
   - PedidoItem: ¿Para 5 productos fijos, vale la pena crear tabla separada?
   - Pago separado: ¿Un pedido típicamente tiene 1-2 pagos, no docenas. ¿No es sobre-ingeniería?

4. DECISIONES DE IQ 200:
   - Simplificar donde no hay necesidad de complejidad
   - Agregar inteligencia donde el negocio lo requiere
   - Anticipar queries comunes y optimizar para它们
   - Considerar offline-first: ¿Qué datos se consultan sin internet?

5. RECOMENDACIONES FINALES CON JUSTIFICACIÓN:
   - qué tables eliminar o fusionar
   - qué campos agregar o quitar
   - qué índices crear
   - por qué cada decisión

Da un análisis profundo con código Prisma si propones cambios.

## Pipeline
[{'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 505, 'out': 5, 'cost': 3.9e-05}, {'model': 'meta-llama/llama-4-maverick', 'in': 1062, 'out': 923, 'cost': 0.000713}, {'model': 'deepseek/deepseek-v4-flash', 'in': 135, 'out': 761, 'cost': 0.000232}, {'model': 'meta-llama/llama-4-maverick', 'in': 1456, 'out': 705, 'cost': 0.000641}, {'model': 'mistralai/mistral-small-3.2-24b-instruct', 'in': 1144, 'out': 537, 'cost': 0.000193}]
