# Investigación e implementación técnica (cualquier stack)

Activar solo las partes afectadas. **Descubrir tecnología y versión del repositorio**. No asumir lenguaje, ORM, nube, motor de base de datos, API HTTP, navegador o infraestructura. Los criterios describen fenómenos a investigar, no herramientas obligatorias.

## Trazabilidad del cambio

**Control REUSE-1/REUSE-2:** comprobar si las funciones, servicios, DTO, objetos y reglas ya existen; decidir reutilizar, extender o extraer una implementación compartida con compatibilidad de consumidores, según `code-reuse.md` (cargar solo cuando haya una decisión real sobre reutilización). Evitar funciones duplicadas o abstracciones forzadas.

Dibujar `entrada/acción → validación/autorización → función/servicio → persistencia/efecto → consumidores → resultado`. Seguir referencias en ambas direcciones, incluyendo reportes, trabajos en segundo plano, integración, offline y registros. Distinguir *hecho del negocio* de cálculo, saldo o visualización. **Si la regla o valor alimenta varios módulos, activar XMOD-1/2/3** de [cross-module-consistency.md](cross-module-consistency.md), siguiendo productores y consumidores indirectos.

### Servicios y reglas

- Invariantes antes/después; precondiciones y estados; cálculos, unidades, fechas, zonas horarias, dinero y redondeos cuando corresponda.
- Autorización por rol y recurso; abuso de parámetros; efectos secundarios, auditoría, errores observables y recuperación.
- Reintentos, idempotencia cuando el efecto no debe duplicarse, concurrencia, aislamiento/locks/optimistic concurrency donde aplique, límites transaccionales.
- Históricos, integridad y migraciones: no inventar datos, no borrar ni cambiar movimientos irrevocables sin autorización y reversión documentada.

### API y compatibilidad

- Identificar tecnología/protocolo real (HTTP, GraphQL, RPC, eventos, CLI, etc.) y contrato: entradas, omisión vs null, validaciones, salidas, errores, esquema, evolución, autenticación y caché cuando exista.
- Encontrar **todos los consumidores comprobables**: UI, otros endpoints, workers, clientes offline, integraciones, exportación, terceros. Marcar consumidores desconocidos; no afirmar compatibilidad sin revisar.
- Probar formatos anteriores y posteriores, errores, permisos, envíos repetidos, timeouts después de commit, carreras, fallos parciales, consumidores antiguos y rollback.
- No cambiar silenciosamente semántica de métodos, estados o nombres para seguir un ejemplo externo. Diferenciar estándares de contratos existentes que el producto ya utiliza.

### Offline, infra y pruebas

- Si hay offline: conflictos, reenvíos, duplicados, orden, sincronización parcial y versión de cliente.
- Si hay CI: comparar fallos contra baseline del branch base, distinguir flaky/infra/test obsoleto/defecto de app; no saltar ni relajar aserciones para aparentar verde. Ejecutar shards según configuración real.
- Para corregir bug, escribir prueba que falle antes y pase después si es viable. Elegir unidad, integración/DB, contrato, seguridad, concurrencia, E2E de flujo; no ejecutar navegador en cambios 100% internos sin efectos visibles justificadamente descartados.

## Context7: dos controles sin llamadas redundantes

`DOC-1` al **proponer** código de biblioteca, framework, SDK o API externa; `DOC-2` **al implementarlo**. Preguntar a Context7 solo por el **concepto/API que decide el diseño**, no por toda la arquitectura.

1. Descubrir dependencias y versiones instaladas (manifest, lockfile o equivalente). Si existe Context7, resolver biblioteca a ID con `resolve-library-id` y consultar `query-docs`; ID exacto puede omitirse si ya está disponible en la sesión/documentación.
2. Contrastar con fuente oficial (docs versionadas, changelog o docs locales del paquete). Si Context7 no indexa versión exacta, usar fuente de la versión instalada; nunca declarar compatibilidad exacta desde docs de otra versión.
3. Registrar compactamente `paquete@versión | API/concepto | ID Context7 | docs oficiales | resultado | discrepancias`. Guardar referencia para otra fase; repetir DOC-2 únicamente cuando cambie el concepto, la versión o el código real a escribir. No mostrar respuestas largas de documentación en el informe.
4. Si Context7 es inaccesible o no aplica (lógica interna pura, diseño de negocio, algoritmos sin dependencias externas), indicar `NO DISPONIBLE` o `NO APLICA` con motivo; seguir documentación oficial cuando sea posible y respetar cualquier bloqueo más estricto impuesto por el proyecto.
5. Context7 no verifica seguridad, corrección ni persistencia. Solo las pruebas adecuadas sustentan esos resultados.

## Pruebas adversariales representativas (elegir las causales)

- Entrada ausente/null/malformada; límite/valor extremo; orden diferente; permiso insuficiente.
- Doble clic o doble envío; respuesta perdida tras commit; reconexión y reintento.
- Dos operadores sobre el mismo recurso; actualización parcial que borra campos; colisión de identificadores.
- Migración con datos previos; despliegue con versiones mezcladas; caída entre dos operaciones.
- Diferencias entre métricas agregadas, hechos observados e históricos; zona horaria y periodos.
- Error de test/flakiness versus defecto real; prueba aislada pasa, flujo completo falla.
