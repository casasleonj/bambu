# Reutilización de código y arquitectura proporcional | JL

**Cuándo leer:** se pretende escribir, ampliar o refactorizar una función, método, objeto, clase, componente, servicio, contrato o estructura de datos; o se sospecha código duplicado. Método agnóstico a lenguaje y framework. Revisar únicamente símbolos y consumidores pertinentes, no todo el repositorio indiscriminadamente.

## REUSE-1: inspección antes de diseñar

1. **Describir la responsabilidad y su invariante** en una frase: entrada, transformación, salida, errores y efectos. Distinguir resultado deseado de aspecto sintáctico.
2. **Buscar código existente** por lenguaje del negocio, nombres de funciones/clases, rutas, interfaces, DTO, tests, llamadas y símbolos, incluidos otros módulos y bibliotecas ya instaladas. Leer definición real, callers, pruebas y cambios recientes. Si la búsqueda es incompleta, declararlo.
3. **Decidir si hay duplicación de conocimiento**: mismo concepto, política, fuente de verdad e invariantes; o solo parecido accidental. El mismo algoritmo para reglas comerciales distintas puede merecer separar políticas; la misma regla escrita en tres lugares sugiere consolidación.
4. **Evaluar el contrato previo y los consumidores**: compatibilidad de entradas, salidas, efectos, permisos, tiempos, errores, concurrencia, persistencia y usos históricos. No alterar un servicio compartido sin medir blast radius y tests. **Si comparte métricas o invariantes entre módulos, abrir XMOD** de [cross-module-consistency.md](cross-module-consistency.md), no asumir que dos cifras similares significan lo mismo.
5. **Comparar opciones en este orden condicionado**:
   - **Usar lo existente** si cubre el caso sin modificarlo.
   - **Extender una función/clase/objeto existente** si la responsabilidad sigue siendo cohesionada y el contrato existente puede conservarse; incorporar campo/método/variación explícita y mínima. Revisar validaciones, serialización, interfaz pública y todos los consumidores.
   - **Componer/delegar/parametrizar con moderación** si hay pequeñas diferencias auténticas; preferir composición a jerarquías nuevas impuestas por simple semejanza. No añadir banderas booleanas múltiples que oculten responsabilidades.
   - **Extraer una responsabilidad compartida** mediante refactorización pequeña y probada cuando la misma regla ya está duplicada; cambiar consumidores hacia la única fuente de verdad.
   - **Crear implementación nueva** si no existe equivalente adecuado, las responsabilidades divergen o la abstracción produciría acoplamiento incorrecto. Registrar el porqué en una frase.
6. **No hacer refactor oportunista amplio**: si la reutilización afecta módulos no autorizados, documentar alternativas y solicitar aprobación según el proyecto.

## REUSE-2: verificación durante implementación y revisión

- Mantener o añadir prueba de comportamiento existente antes de extender el contrato. Confirmar `antes → después` para casos normales, errores, datos previos, permisos y consumidores relevantes. Test de regresión para cualquier función compartida.
- Buscar de nuevo al terminar: ¿se creó una segunda implementación de la misma regla?, ¿se duplicó el mismo cálculo/validación?, ¿quedaron rutas antiguas usando la implementación anterior?, ¿un objeto con campos duplicados o semántica desalineada?, ¿se alteró un contrato público silenciosamente?
- Si extiende un objeto existente, revisar compatibilidad de esquema, serialización, migración, persistencia, acceso y evolución de contratos cuando aplique. **No agregar propiedades sin examinar quién construye, lee, modifica y exporta el objeto.**
- Si aparecen nuevos casos adversariales o regresiones, volver al análisis de consumidores y revisar alternativa; iterar hasta convergencia sustentada.
- Para propuestas que usen API externas, cumplir DOC-1/DOC-2 con Context7 si está disponible, con documentación exacta de versión y tests; Context7 no sustituye inspección local.

## Principios, aplicados sin dogmatismo

| Principio | Aplicación | Antipatrón a evitar |
|---|---|---|
| **DRY** | Una representación autorizada para una misma regla o conocimiento; reutilizar función/objeto ya adecuado | Consolidar reglas conceptualmente distintas porque su código coincide |
| **KISS** | El cambio más simple que cumple requisitos, compatibilidad y seguridad | Framework propio, capa nueva o patrón complejo sin beneficio probado |
| **SOLID** | Responsabilidades cohesionadas, contratos estables, extensiones compatibles, interfaces enfocadas y dependencias invertidas **cuando aplique** | Crear clases e interfaces por obligación en programación funcional o un script pequeño |
| **AHA / YAGNI** | Abstraer cuando la evidencia de reutilización sea real; no diseñar necesidades hipotéticas | Generalización prematura, configuración interminable, acoplamiento erróneo |
| **Refactorización segura** | Pequeños cambios, comportamiento observable preservado y tests antes/después | Renombrar o mover contratos públicos y afirmar que nada cambió sin comprobarlo |

**Regla de salida:** `REUSE: reutilizar / extender / componer / extraer / crear por necesidad`, `símbolo y consumidores verificados`, `invariante`, `contrato antes/después`, `tests`, `excepciones justificadas`. Para un cambio trivial basta una línea; ampliar si hay riesgo.

## Escenarios adversariales rápidos

- Funciones idénticas textual pero con **normas distintas**: no acoplarlas.
- Misma regla en API y UI: preferir autoridad del dominio/servidor y representación adaptada; no confiar en validación cliente como fuente de verdad.
- Extender método compartido cambia defaults en un consumidor antiguo: preservar contrato o versionar; prueba de regresión.
- Varios módulos requieren diferencias pequeñas: evitar una función con docenas de flags; evaluar composición o estrategias justificadas.
- Dos entidades comparten campos pero tienen ciclos de vida diferentes: no forzar herencia ni entidad única.
- Reutilización implica dependencia circular o fuga de datos/roles: separar responsabilidades y contratos.
- Propuesta reusable está menos clara, menos segura o cuesta más de mantener que dos casos aislados: documentar excepción a DRY, preferir diseño simple.

## Fuentes primarias

- Martin Fowler, *Refactoring* y catálogo (Extract Function, Replace Inline Code with Function Call): https://refactoring.com/catalog/
- Microsoft, *Architectural principles*, DRY y separación de responsabilidades, incluyendo cautela sobre abstracción errónea: https://learn.microsoft.com/dotnet/standard/modern-web-apps-azure-architecture/architectural-principles
- Kent C. Dodds, *AHA Programming*: https://kentcdodds.com/blog/aha-programming
