# Adversariales, convergencia y explicación al usuario

## Bucle de decisión

1. Definir causa demostrada o hipótesis; resultados esperados, límites negativos explícitos, invariantes a preservar, no-objetivos y criterios de aceptación. No inventar restricciones por querer ser exhaustivo.
2. Proponer alternativas **materialmente distintas** si existen (reutilizar, adaptar, construir). Una candidata suficiente es válida si las demás son claramente dominadas o no aplican; justificar.
3. **SYN-2, antes de cerrar el diseño:** comprobar que la investigación externa e interna ha alimentado ESC/XMOD/REUSE, que todo escenario crítico y precedente determinante está clasificado, y que no se preguntan decisiones ya confirmadas. Ver [evidence-reuse.md](evidence-reuse.md).
4. **Falsación:** buscar deliberadamente evidencia en contra de la candidata favorita, escenarios adversariales, interacciones entre módulos y riesgos introducidos por la propia solución, no solo por el bug original.
5. Corregir/refinar `vN → debilidad → cambio → nuevo riesgo → evidencia` y comparar con alternativas. Reexaminar tras cambios relevantes.
6. **Criterio de parada:** riesgos relevantes mitigados o delimitados, invariantes preservadas, efectos transversales considerados, evidencia suficiente para elegir, sin mejora **material** pendiente tras al menos una revisión crítica posterior a la última modificación. Para alto/crítico, realizar una segunda revisión independiente o con hipótesis adversa distinta; si descubre problema, iterar. No exigir rondas arbitrarias sin hallazgos.

**Mejora material**: cambia resultado, integridad, seguridad, compatibilidad, funcionamiento del usuario, accesibilidad, recuperabilidad o costo/mantenimiento de modo significativo. Cambios cosméticos de informe no son motivo para reiniciar.

**Estados:** `CONVERGENCIA DE DISEÑO` (propuesta lista para aprobación, no probada), `CONDICIONADA` (falta evidencia/decisión), `BLOQUEADA` (riesgo o contradicción sin resolver); `VALIDADA` solo después de tests/QA realmente ejecutados. No prometer certeza total ni eliminar todos los sesgos.

## Crítica adversarial del propio razonamiento

- ¿Se consideró la hipótesis de que el issue ya está resuelto o el test está obsoleto?
- ¿El patrón externo se traslada correctamente o introduce complejidad y dependencia innecesarias?
- ¿La solución viola algún NO QUIERE explícito, invariante PRESERVAR o altera contratos, históricos, permisos o hechos comerciales sin autorización? ¿Se confundió FUERA DE ALCANCE con permiso de romperlo?
- ¿Lo que se «automatiza» se conoce o es una conjetura?
- ¿Se evaluó el fallo en la reparación, no solo en el escenario original?
- ¿Se han revisado lectores, consumidores, rutas de error, seguridad y contexto real?
- ¿Se confunde CI en verde con funcionamiento usable, o inspección con ejecución?
- ¿Se afirma no-impacto UI solo por tocar archivos servidor?
- ¿Las fuentes/versiones siguen válidas? ¿Se cerró un issue basándose solo en notas?

## Explicación cotidiana (incluso si es backend)

Orden recomendado:

1. Qué ocurría y qué problema humano/operativo causaba; separar causa demostrada de hipótesis.
2. Qué se propone cambiar y qué **no** cambiará.
3. Ejemplo **hipotético o verificable**, explícitamente etiquetado: estado inicial → acción normal → resultado previo → resultado esperado → confirmación. Números y fechas solo si realmente ayudan.
4. Tabla breve de «¿y si...?» con los escenarios **que cambian la decisión** (doble envío, otro rol, red, datos antiguos, error de usuario, etc.). No enumerar todas las combinaciones imaginables.
5. Cómo se comprobará o se comprobó, qué falta decidir, riesgos restantes y aprobación necesaria.

Escribir para persona sin conocimientos técnicos; glosario técnico únicamente si aporta al implementador. Una revisión hecha por IA no sustituye una prueba real de comprensión con usuarios.

## Contraprueba transversal

Para cambios compartidos, la convergencia requiere un mapa de consumidores de [cross-module-consistency.md](cross-module-consistency.md) y un contraejemplo: «¿puede esta solución hacer correcto el módulo original pero mantener un valor o estado incorrecto en otro?». Comprobar que dos pantallas representan la misma métrica antes de exigir igualdad; si no, probar el puente o diferencia semántica. La falta de acceso a un consumidor material convierte la convergencia en condicionada y la validación en pendiente, no exitosa.
