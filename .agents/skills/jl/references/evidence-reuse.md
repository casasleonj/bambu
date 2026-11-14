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

## SYN-1 · Investigación externa dentro de INVESTIGAR, no al final de la solución

La búsqueda de patrones exitosos en **empresas, productos, bibliotecas y comunidad ocurre antes de cerrar el diagnóstico y de elegir el diseño**. Complementa REUSE-1 (código propio), ESC-1 (recorrido de negocio) y XMOD-1 (impacto transversal); **no los reemplaza ni se hace como informe paralelo**. En nuevas funcionalidades, reglas sensibles, finanzas, seguridad o UX con incertidumbre relevante, buscar precedentes transferibles; para una errata local comprobada puede bastar evidencia interna y documentar por qué no se buscó externamente.

1. **Pregunta de negocio y ingeniería:** ¿qué necesidad resuelve la función y bajo qué restricciones? Separar comportamiento visible (por ejemplo, cómo otros muestran un crédito al elegir cliente) de mecanismo técnico (registro contable, idempotencia, concurrencia, auditoría, caché).
2. **Buscar y verificar:** evidencia interna, documentación oficial/versión, casos de productos/empresas y comunidad con resultados contrastables. Distinguir *producto que exhibe una función*, *patrón publicado*, *testimonio* y *resultado operacional demostrado*. No suponer acceso a implementación privada ni afirmar éxito sin pruebas.
3. **Traducir a impacto observable:** por cada descubrimiento que podría cambiar la decisión preguntar: «¿Qué persona, pantalla, botón, próxima operación, excepción, reversa o rol hemos omitido?», «¿qué fuente de verdad o consumidor XMOD afecta?», «¿qué reutilización REUSE permite?». **Crear/actualizar IDs ESC y sus pruebas**. Si no cambia nada, registrar «sin nuevo impacto» una vez, sin repetir búsquedas.
4. **Contrastar antes de adoptar:** una función popular de un competidor es una opción, no un requisito nuestro. Verificar decisiones explícitas del usuario, contratos existentes, licencias, seguridad, coste, restricciones operativas y contraejemplos. Marcar `ADOPTAR / ADAPTAR / DESCARTAR / PENDIENTE`, con razón y grado de confianza. Lo no corroborado permanece `NO VERIFICADO`.
5. **Iterar de forma dirigida:** los nuevos escenarios pueden requerir otra búsqueda técnica; un precedente puede revelar escenarios omitidos. Reabrir solo los elementos impactados hasta que no queden **novedades materiales** sin analizar; no imponer rondas ni búsquedas ilimitadas.

**Registro mínimo de síntesis** (puede estar en la matriz ESC sin documento extra):

`fuente/versión → hallazgo verificable → patrón/alternativa → ESC(s) nuevo(s) o afectados → XMOD/REUSE implicados → adoptar/adaptar/descartar/pendiente + razón → decisión/contrato y prueba`.

Mostrar al responsable del producto los **casos nuevos que cambian su trabajo cotidiano**, su procedencia y la recomendación; agrupar casos menores y conservar trazabilidad. Una afirmación de marketing de una empresa no basta para atribuir seguridad, adopción o buenos resultados.

## SYN-2 · Gate de síntesis antes del plan y de ESC-2

Antes de presentar solución y maquetas, contrastar en dos direcciones: (a) **cada precedente externo/interno determinante** con requisitos, escenarios e invariantes; (b) **cada escenario crítico** con evidencia interna, opciones externas pertinentes, consumidores y prueba prevista. Registrar lagunas y alternativas descartadas por incompatibilidad. Si la evidencia cambia el recorrido, actualizar el mapa ESC-2 **antes de pedir aprobación**, con IDs estables y un resumen de diferencias. No decir «investigación completa» si un hallazgo material conocido quedó sin analizar.

**No reabrir decisiones existentes:** consultar primero el issue, mensajes disponibles, especificaciones aprobadas, reglas vigentes y decisiones del repositorio. Si consta una decisión aplicable (p. ej. «usar crédito automáticamente al crear el siguiente pedido»), tratarla como `CONFIRMADO (fuente, alcance y vigencia)` y no volver a ofrecer «manual o automático». Investigar por separado la cuestión verdaderamente abierta (p. ej. instante de reserva/aplicación o efecto de una anulación). Si una regla del sistema contradice lo decidido, **mostrar el conflicto exacto** y pedir solo autorización o nueva decisión indispensable, sin sustituir silenciosamente la anterior. Si la decisión anterior no es accesible, no inventar que existe; registrar el límite y verificar fuentes disponibles.

**Salida mínima de INVESTIGAR:** causa y objetivo; solución existente propia y externa considerada; mapa ESC visible con casos añadidos; XMOD y REUSE relevantes; opción adoptada/descartada y evidencia; decisiones **ya fijadas** y **realmente pendientes**; prueba por escenario. En un issue trivial, esto puede ocupar unas pocas líneas.
