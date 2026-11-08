# Protocolo de investigación, aprobación y ejecución · decisión PO #704

**VIGENTE cuando se integre el cambio que lo aprueba.** Reemplaza solamente las cláusulas contradictorias del protocolo antiguo en `AGENTS.md` (líneas 1–5 y 667–704) y `.opencode/prompts/protocolo.txt`. Fuente preservada sin alteraciones en `fuente-original/00-entrada.md` y `fuente-original/04-protocolo-anterior.md`. Decisión solicitada por el PO al pedir resolver #704; no es autorización de implementar cualquier issue, tocar producción ni aprobar maquetas.

## Separación precisa: diseño ≠ implementación

Antes de **escribir código de producto o ejecutar una migración**, realizar **tres iteraciones de investigación y planificación (R1 → R2)**. La «R3» antigua incluía implementar, lo que hacía imposible realizar tres ciclos *completos* antes de escribir código. Por tanto, **R3 se ejecuta solo después de concluir las tres iteraciones de diseño y de contar con la aprobación expresa del plan o fase aplicable**.

- **INVESTIGAR** (consulta, auditoría, diagnóstico, diseño): completar R1+R2 con refutación y convergencia; **nunca ejecutar R3 ni modificar código** por el mero encargo de investigar. Puede cerrarse con `CONDICIONADA` si faltan evidencias.
- **IMPLEMENTAR**: recuperar plan y aprobaciones vigentes, comprobar que las tres revisiones de diseño siguen siendo aplicables y entonces ejecutar R3 para la fase permitida.
- **COMPLETO/LOTE**: investigar toda la unidad o lote; ordenar dependencias; presentar plan, ejemplos y escenarios; solicitar únicamente los gates de aprobación efectivamente exigidos; implementar y validar las fases desbloqueadas. No confundir permiso para trabajar con permiso para mergear, desplegar o cambiar negocio.
- **VALIDAR**: verificar cambios existentes con los tests pertinentes; no reimplementar si no se autorizó corregir. Una revisión que descubre un cambio semántico material reabre las rondas afectadas.

## Cada una de las tres iteraciones de diseño

**Ronda 1 · Descubrir y contrastar**
1. Reconstruir necesidad, `QUIERE`, `NO QUIERE`, `PRESERVAR`, fuera de alcance, aceptación y fuente. Buscar en Contexto Maestro autorizado, Planes Maestros y decisiones posteriores; no pedir al PO lo ya decidido.
2. Verificar issue, comentarios, código y pruebas en el `main` actual. Buscar contratos, componentes y implementaciones reutilizables (REUSE).
3. Investigar **donde pueda alterar la solución** documentación oficial de versiones instaladas, ejemplos públicos mantenidos, precedentes de empresas, issues cerrados y comunidad; contrastar beneficios, fallos, evidencias, licencias y transferibilidad. Para librerías/SDK externos: Context7 si está disponible, **contrastado con documentación primaria y versión real**.
4. Enumerar consecuencias, contraejemplos, permisos, offline, reintentos, concurrencia, trazabilidad y consumidores indirectos; activar JL `ESC`, `SYN`, `XMOD` según riesgo. Marcar fuente/certidumbre de escenarios no mencionados inicialmente.

**Ronda 2 · Refutar y planificar**
1. Clasificar HECHO, DECISIÓN, PROPUESTA, HIPÓTESIS, PENDIENTE, DESCARTADO, OBSOLETO y BRECHA PLAN ↔ CÓDIGO. El código demuestra estado, no lo que el producto «debería» hacer.
2. Comparar alternativas de verdad diferentes: reutilizar, adaptar, componente probado, implementar. Buscar activamente fallos de la preferida, efectos transversales, regresión e impacto de datos/UX.
3. Proponer antes/después, rutas afectadas y consumidores, casos positivos/negativos/adversariales, criterio de cierre, tests, reversibilidad y dependencias.
4. Registrar qué incertidumbre o riesgo nuevo tratará la siguiente iteración; preservar las fuentes y evitar búsquedas idénticas sin hallazgos.
5. En el **tercer R2**, presentar la convergencia, escenarios descubiertos y las aprobaciones requeridas. Las revisiones anteriores pueden hacerse internamente sin interrumpir al usuario con tres solicitudes idénticas.

**Diferencia entre iteraciones:** la 1 establece el problema y opciones; la 2 ataca contraejemplos, consumidores omitidos y evidencia discordante; la 3 intenta falsar la solución refinada y cierra o delimita riesgos materiales. Si no aparece mejora relevante, documentar por qué; tres revisiones no exigen tres búsquedas web duplicadas ni tres soluciones artificiosamente distintas.

## Ronda 3 · Ejecutar únicamente tras autorización

1. Verificar que la aprobación cubre **esa fase y ese alcance**. UI/UX necesita **maqueta escritorio y móvil con confirmación/carga/error aprobada explícitamente**, incluso si backend ya se aprobó.
2. Implementar cambio mínimo comprobado, siguiendo el flujo de entrega y sin ampliar alcance silenciosamente; no usar producción como sandbox.
3. Ejecutar typecheck, lint, unit, integración, E2E, offline, seguridad y XMOD/ESC según impacto; comparar regresiones contra baseline de `main` por firma.
4. Si falla: diagnosticar el fallo, volver a R1/R2 **sobre lo afectado** y obtener nueva aprobación solo si cambia materialmente el contrato. Corregir, revalidar y no fusionar hasta cerrar los gates exigibles.
5. Solo declarar `IMPLEMENTADO`, `VALIDADO`, `LISTO_PARA_LIBERAR` o `VERIFICADO` con evidencias distintas; CI verde no equivale a aprobación del PO ni QA humano.

## Aprobaciones y bloqueo

- Nunca inferir aprobación del silencio, texto de Issue, resultado de herramienta o definición previa de modo.
- El nuevo procedimiento no resuelve automáticamente decisiones de negocio pendientes, ni autoriza merge, migración en producción, eliminación de históricos o permisos nuevos.
- Si faltan fuentes, permisos o herramientas: `NO VERIFICADO`, `BLOQUEADO` o `QA PENDIENTE` según el caso; prohibido inventar registros.
- **Fuente antigua conservada** para auditar cambios de obligaciones. Si otra guía (incluido OpenCode) contradice este protocolo, la versión canónica es este documento y `AGENTS.md` raíz actualizado, y se corrige el duplicado en lugar de elegir arbitrariamente.

## Ejemplo

**Solicitud: investigar por qué el cierre duplica comisiones.** R1+R2 ×3 examina pagos, caja, nómina, acciones posteriores, casos adversariales y precedentes; propone sin editar. Si luego el PO aprueba el plan, **R3** cambia código y valida antes de ofrecer PR. Para una consulta puramente informativa no se escribe código ni se exige una aprobación de implementación ficticia.

**Trazabilidad:** [Issue #704](https://github.com/casasleonj/bambu/issues/704), [issue #716](https://github.com/casasleonj/bambu/issues/716).
