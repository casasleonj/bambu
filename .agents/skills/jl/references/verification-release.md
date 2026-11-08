# Implementación, QA realista y liberación segura

## Descubrir el sistema de entrega real

Leer solo las configuraciones y reglas **existentes** de build, pruebas, CI, revisión, ramas y despliegue. No asumir GitHub, Vercel, ocho shards ni despliegue automático. Detectar si un merge a rama principal despliega automáticamente, si hay previews, staging, flags, migraciones, protecciones, required checks y aprobaciones humanas. Documentar lo comprobado y lo que sigue sin protección técnica.

## Orden de controles (adaptar al proyecto)

En modo `COMPLETO`, estos controles se ejecutan como continuación automática de la investigación y la implementación autorizadas. En `LOTE+COMPLETO`, se aplican por cada unidad antes de cualquier merge que despliegue y nuevamente de forma transversal al lote. Véase [workflow.md](workflow.md) únicamente en esos modos.

0. **Permisos y plan:** requisitos, decisiones de negocio, cambio visual/UX aprobado cuando el proceso local lo exige; no usar datos productivos sin autorización. Implementación solo si solicitada.
1. **Código:** cambio enfocado, DOC-2 de documentación de API, invariantes, pruebas que fallan antes y pasan después cuando sea posible, regresión relevante. Si se cambian datos/migraciones, prever compatibilidad, respaldo, reversibilidad y el momento seguro para aplicarlos.
2. **Calidad técnica:** tests unitarios, integración, contrato, seguridad, accesibilidad automática y CI/shards aplicables. Revisar resultado individual, baseline conocido y defectos nuevos. Un test omitido, flaky o rojo no es verde.
3. **QA preproducción:** si hay interfaz/efecto visible, ejecutar en entorno aislado de preview/staging **antes de cualquier acción que despliegue a producción**. Usar navegador real, permisos/roles y datos ficticios; comportarse como una persona con la tarea completa, sin usar atajos de API para completar pasos que el usuario debe realizar. Revisar PC y móvil si aplican.
4. **Inspección de UX:** orden, textos, tamaño/zoom, contraste, foco, clipping, overlays, botones, enlaces y destinos, formularios y validación, cambios de estado, persistencia tras recarga, recuperabilidad, fricción cognitiva y datos visibles. En red intermitente o offline, probar pérdida y retorno de conexión cuando corresponda.
5. **Evidencias:** SHA del build probado, configuración/flag, entorno, rol, viewport/dispositivo, datos sintéticos, pasos, esperado/observado, trazas/capturas sanitizadas, incidencias y re-test. No llamar prueba real a un análisis de código.
6. **Fallo:** detener gate; diagnosticar causalidad y escala. Cambiar propuesta solo cuando necesario; corregir y repetir los tests pertinentes; si afecta invariantes compartidas, ampliar regresión y volver a la crítica de solución.
7. **Autorización de liberación:** requerimientos satisfechos, no defectos bloqueantes atribuibles, evidencia accesible, aprobaciones necesarias. Si protección CI/branch/deploy no existe, registrar que es **control procedimental**, no barrera automática. No fusionar/desplegar sin autorización.
8. **Post-release:** smoke y monitoreo son una red adicional, **nunca** sustituyen QA previo. No experimentar en producción. Tras incidencia, rollback/mitigación con procedimiento autorizado.

## Excepciones proporcionales

- Cambio sin interfaz **y sin efecto observable** demostrado: no exigir navegador; sustituir con contrato/API/integración/DB/seguridad o pruebas de infraestructura y justificar `QA visual NO APLICA`.
- Cambios en servidor que alteran valores, estados, errores o permisos **sí** pueden requerir recorrido UI pese a no tocar frontend.
- Si no existe entorno seguro o navegador disponible: declarar `QA PENDIENTE/BLOQUEADO`, no inventar ejecución ni aprobar producción.
- Revisión de agente ≠ test de usuario humano. Pedir validación con usuarios representativos cuando comprensión/operación sea crítica; especificar límite cuando no se puede realizar.

## Sobre «gates obligatorios»

La orden escrita en un skill no impide físicamente desplegar. El equipo debe configurar el mecanismo de control real (checks obligatorios, restricciones de merge, aprobaciones de ambientes, o equivalente) según su plataforma. Recomendación genérica, **no** modificación autorizada. No usar el entorno productivo como sustituto de preview/QA.

## Validación con feedback humano (cuando proceda)

Si la tarea crítica depende de comprensión/operación humana, realizar el recorrido de QA en navegador **y** solicitar evaluación del usuario representativo conforme a las reglas del proyecto; son evidencias diferentes. Preguntar qué hizo, qué esperaba y qué resultado obtuvo **sin guiarlo**. Registrar observaciones concretas y decisión posterior, nunca asumir «me gusta» = aceptación formal. Si aparece un defecto material, volver a corrección y revalidación. Ver [user-feedback.md](user-feedback.md).
