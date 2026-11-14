# Segunda revisión de 202 posiciones candidatas · PR #718

Este archivo clasifica **202/202** posiciones que quedaron fuera de las 354 cláusulas del catálogo AB. Es revisión de lectura y extracción **preliminar**, no certificación de que cada cláusula esté íntegramente conservada. Cada fila conserva una referencia de fuente, una descripción, la condición, el límite, la categoría tentativa y un módulo a contrastar.

## Distribución preliminar

- `EVIDENCIA_HISTORICA`: 68
- `ESTRUCTURA`: 30
- `INCIDENTE_HISTORICO`: 23
- `VERSION_DESCRIPTIVA`: 17
- `ARQUITECTURA_DESCRIPTIVA`: 13
- `CONTRATO_TECNICO`: 9
- `CHECKLIST_OPERATIVA`: 8
- `PENDIENTE_HISTORICO`: 8
- `CONTRATO_FINANCIERO_HISTORICO`: 7
- `POSIBLE_REGLA_EMBEBIDA`: 4
- `ESTADO_TECNICO`: 2
- `INCIDENTE_FINANCIERO_HISTORICO`: 2
- `CONFIGURACION_REFERENCIA`: 1
- `CONTEXTO_OPERATIVO`: 1
- `CHECKLIST_SENSIBLE`: 1
- `COMANDO_HISTORICO_SENSIBLE`: 1
- `COMANDO_HISTORICO`: 1
- `PROPUESTA_HISTORICA`: 1
- `PENDIENTE_HISTORICO_SENSIBLE`: 1
- `HIPOTESIS_HISTORICA`: 1
- `PROPUESTA_MONITOREO_HISTORICO`: 1
- `CONTRATO_INVENTARIO_HISTORICO`: 1
- `CONTRATO_LOGISTICO_HISTORICO`: 1

## Criterios de decisión

- Versión de dependencia y estructura de archivos: **estado técnico histórico**, no requisito eterno. Contrastar con `package.json`, `prisma/schema.prisma` y rutas de `main` por SHA.
- Prueba listada: **evidencia de una validación pasada**, nunca `PASS` del commit actual.
- Incidente: contiene hechos, explicación, contratos y a veces propuestas. No clasificar el registro entero como obsoleto por estar bajo Known Issues.
- Expresiones de prohibición, condición, pagos, offline y conciliación: requieren comprobar que no esconden obligaciones adicionales. Donde corresponda, duplicar rango para generar cláusulas atómicas distintas.
- Credenciales de ejemplo, datos identificables y comandos SQL antiguos: no duplicar sin redacción ni ejecutarlos. El origen literal archivado no autoriza actuar.

## Casos adversariales explícitos

1. **L282/L392**: los ejemplos contienen claves ilustrativas. No cargarlas en scripts ni divulgarlas en documentos de revisión; emplear secretos autorizados fuera del repositorio.
2. **L456**: una nota anterior sugería borrar un negocio concreto en producción. No ejecutar un DELETE histórico sin nueva evaluación, evidencia de dependencias y autorización expresa.
3. **L423**: recomendación de infraestructura no equivale a decisión actual.
4. **L226-L230**: lista de cinco consumidores de coordenadas no debe reducirse a una única instrucción genérica; probar cada consumidor.
5. **L522/L530/L536/L543/L597**: contratos monetarios de caja, nómina y créditos deben contrastarse con los ADR posteriores (incluidos los aceptados de cierre y saldo a favor), no solo con el snapshot del AGENTS viejo.
6. **L717/L733**: son títulos, no 2 obligaciones adicionales.

## Próximo gate legítimo

Revisar que las categorías `POSIBLE_REGLA_EMBEBIDA`, `CONTRATO_*`, `CHECKLIST_OPERATIVA` y las incidencias compuestas estén desglosadas contra la fuente completa, el dominio y consumidores. Marcar `VERIFICADA` solo después de aprobación trazada y pruebas pertinentes. El estado de la revisión y de la activación real permanece pendiente.
