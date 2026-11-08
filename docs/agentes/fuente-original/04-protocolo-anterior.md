# Protocolo de Investigación (3 iteraciones del ciclo completo)

Cada iteración ejecuta 3 rondas. El resultado de la Iteración N alimenta la Iteración N+1.
Se ejecutan exactamente 3 iteraciones antes de presentar la solución final al usuario.

**Objetivo del protocolo**: Eliminar sesgos, ambigüedades e invenciones mediante validación cruzada iterativa. Cada ronda reduce la probabilidad de error.

## Iteración 1, 2, 3: Ciclo de 3 Rondas

### Ronda 1: Descubrimiento en la web
1. **Buscar en fuentes primarias**: docs oficiales del tool/lib (versión exacta en uso), GitHub repo, issues cerrados, PRs merged, CHANGELOG.
2. **Buscar en comunidades**: Stack Overflow (score alto + aceptada), Reddit (r/webdev, r/node, r/programming, subreddits específicos del tool), Hacker News.
3. **Identificar soluciones validadas**: listar 2-3 opciones que OTROS ya usaron en producción con casos similares.
4. **Documentar**: versión exacta, breaking changes, compatibilidad con el stack actual (Next.js 16, PostgreSQL, Auth.js v5, etc.).

### Ronda 2: Viabilidad y Planificación
1. **Analizar impacto**: ¿la solución rompe funcionalidades existentes? ¿requiere migración de datos? ¿hay conflictos con dependencias actuales?
2. **Evaluar riesgo**: ¿hay reportes de bugs o vulnerabilidades en la comunidad? ¿es considerada "hack" o deprecated?
3. **Armar plan**: lista de archivos a modificar, orden de dependencia (base → derivado), tests a escribir/ejecutar, criterios de éxito.
4. **Revisar con usuario**: presentar plan antes de ejecutar. Esperar aprobación explícita.

### Ronda 3: Verificación e Iteración
1. **Implementar plan aprobado**.
2. **Verificar**: correr tests (`npm run test`), type check (`npx tsc --noEmit`), validar contra criterios de éxito definidos en el plan.
3. **Si falla**: volver a Ronda 1 con el error/mensaje como nuevo input. No corregir a ciegas.
4. **Confirmar**: solo marcar como completo si hay evidencia (output de tests, log, screenshot). Si no hay evidencia → no afirmar que funciona.

## Reglas del Protocolo
- Ejecutar el ciclo completo (R1→R2→R3) exactamente **3 veces**.
- La **Iteración 2** toma el resultado de la Iteración 1 como input para nuevo descubrimiento.
- La **Iteración 3** toma el resultado de la Iteración 2 como input para refinamiento final.
- Si no hay fuente confiable → declarar: **"NO VERIFICADO — testear antes de usar"**.
- Si la solución es experimental → etiquetar: **"EXPERIMENTAL - HIGH RISK"**.
- NUNCA saltar directo a código sin completar las 3 iteraciones.
- NUNCA implementar sin aprobación del usuario tras cada Ronda 2.

---

