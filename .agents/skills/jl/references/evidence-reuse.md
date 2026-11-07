# Evidencia, investigación comunitaria y reutilización

Cargar cuando una solución necesita datos externos, documentación o precedentes. No repetir este protocolo para cambios obvios que solo dependan de evidencia interna.

## Fuentes reales y verificables

1. **Internas:** issue + comentarios + decisiones, historial de PR/commits, pruebas, contratos, especificaciones y código actual. Confirmar estado y SHA, no aceptar documentación antigua como estado actual.
2. **Primarias:** referencia de la biblioteca/SDK en la versión pertinente, estándares, especificaciones, changelogs, ejemplos oficiales, registros de vulnerabilidades.
3. **Precedentes de ingeniería y productos:** implementaciones públicas, bibliotecas consolidadas, casos de empresas, patrones de diseño/arquitectura; diferenciar producto observado, ejemplo documentado, experimento y operación realmente confirmada.
4. **Comunidad:** issues y PRs resueltos, discusiones con pruebas reproducibles, Stack Overflow, Reddit, blogs técnicos; calificar vigencia, evidencia y sesgo de supervivencia. Opinión/popularidad no equivalen a éxito en producción.

Para cada **afirmación determinante**, conservar: `afirmación | URL/ruta+SHA | fecha/versión | evidencia | límite | decisión que cambia`. No citar un resultado de búsqueda como si su contenido estuviera verificado. Si fuentes contradicen, preferir evidencia directa compatible con la versión actual; si no hay certeza, declarar `NO VERIFICADO`.

## Anti-reinvención y transferibilidad

- Buscar en el repositorio y en el backlog antes de abrir trabajo nuevo. Detectar **funciones/objetos/componentes existentes** con la misma responsabilidad, no solo issues. Evitar duplicar una solución resuelta/abierta.
- Priorizar *reutilizar > adaptar > introducir dependencia > construir desde cero*, **siempre que** mantenga invariantes, mantenibilidad, licencia y seguridad. No elegir por fama o por número de estrellas.
- Comparar solo candidatas plausibles por: corrección, compatibilidad, costo, seguridad, rendimiento, complejidad, soporte, accesibilidad, escalabilidad apropiada y reversibilidad.
- Explorar fallos conocidos del patrón elegido y contraejemplos. Si no hay equivalente probado, documentar búsqueda acotada y diseñar con pruebas; no fingir que existe precedente.
- No copiar código de licencia incompatible ni divulgar secretos o información propietaria en servicios externos.

## Investigación eficiente

- Formular pregunta concreta, buscar 1–3 fuentes de mayor calidad, ampliar **solo** si hay desacuerdo, hueco que afecte decisión o riesgo elevado.
- Registrar una ficha breve reutilizable de la evidencia; evitar consultar las mismas páginas en cada iteración. Revalidar únicamente las fuentes invalidadas por un cambio de versión/alcance.
- Si la documentación externa no cambia qué hacer, detener exploración y pasar a refutación/pruebas. No exigir benchmark masivo para un defecto trivial.
