# JL · Auditoría adversarial iterada de los PR pendientes (22-11-2026)

**Fuente técnica:** `main@d5f52cd329ac610fdd627b10c31cb7d56c9990b7` después del merge de #961.  
**Estado:** inspección de diffs y fuentes exactas + implementaciones en ramas; CI nuevo lanzado/encolado. NO se ejecutó PostgreSQL local, navegador autenticado ni QA humano desde esta sesión.  
**Propósito:** evitar regressiones, sustituciones silenciosas de reglas, contradicciones entre PRs y falsos cierres. Este documento NO aprueba merges.

## 0. Definiciones para interpretar los resultados

- **HECHO:** verificado por lectura del código actual, diff GitHub o metadata del repositorio.
- **CAMBIO IMPLEMENTADO:** commit persistido en rama, pero no significa test verde ni despliegue.
- **HIPÓTESIS/RIESGO:** caso adversarial pendiente de reproducción/test; no registrarlo como bug ocurrido.
- **BLOQUEADO:** faltan decisión del PO, permisos, QA, esquema/migración o garantía de seguridad.
- **DESCARTADO/OBSOLETO:** no replicar una solución superada por código posterior.

## 1. Inventario contra main y riesgos adversariales

| PR | Hallazgo adversarial y naturaleza | Criterio que no debe romperse | Estado |
|---|---|---|---|
| #957 (#772) | **HECHO:** captura de BONO sin Abono (#796) no tenía trazabilidad consumible por restitución/corrección, y ambos PR modifican pagar-fiado | Reintegro exacto neto de correcciones y cero regalo de crédito legado | Implementación ampliada y reconciliada con main + #961 en `e8d688fbed84`; QA/CI pendientes |
| #952 (#745) | Riesgo de confundir BONO con cobro nuevo y ajustar snapshot previo incorrectamente | El BONO se conserva como trazabilidad, pero caja/digital excluyen crédito ya recibido | Cambio previo recuperado; XMOD contra #957 pendiente |
| #970 (#630) | **HECHO:** ventas consultadas antes de lock de Producción podían quedar obsoletas; reintento antiguo era rechazado antes de deduplicación | Stock y cierre coherentes, sin altas viejas ni doble producción | Mejoras en `746adfb508cd` y `c10a20972e61`; no prometer aislamiento de entregas concurrentes |
| #947 (#812) | **HECHO:** purgeSWCache puede fallar o quedar pendiente antes de signOut | La salida siempre intenta revocar sesión, navegador permanece en mismo origin; caché no expone datos autenticados | Guard + timeout 3 s y tests en `cabbe3b4bde8` |
| #938 (#936) | **HECHO:** benchmark instalaba con npm install; riesgo de dependencias variables. Riesgo adicional: benchmark aislado no reproduce producción o escrituras concurrentes | Observabilidad y medición con DB efímera, sin cambiar FIFO | Cambio a npm ci en `82dd374a56a8`; benchmark/QA pendientes |
| #946 (#939) | Riesgo de prioridad incorrecta por suma floating point o por CONFIRMADO vs REPORTADO; dos consumidores del mismo cálculo | Comparación centavos para prioridades, sin alterar dinero en contabilidad | Implementación anterior conservada; regresión y contraste #938 pendientes |
| #972 (#853) | Riesgo de presentar el acumulado de pedido como entrega física histórica, o total global bajo filtros parciales | Período/día completo y cantidad entregada física no se sustituyen por fecha de creación | PR implementado pero UI/histórico requiere QA; sin nuevas decisiones aplicadas aquí |
| #941 (#334) | Riesgo de confundir JSON ausente, runner caído o comparación no homologable con «0 errores» | Mantener resultado rojo del runner y baseline solo SHA/config/lockfile equivalente | Code review no halló otra corrección objetiva; cotejar con #938 antes de merge |
| #951 (#748) | Riesgo de usar base global del Dashboard como base real de día específico | Base por fecha, sin inventar base cuando falta registro | Cambios de rama conservados, CI/consumidores pendientes |
| #937 (#813) | Error de diseño si un mensaje informativo de desarrollo se ve como autenticación fallida; no ocultar errores reales | UI existente sin alterar login/credenciales | Cambio UX necesita verificación visual; no modificar aquí |
| #935 | Los planes antiguos etiquetaban #319, #906 y protección main con estados superados | Historia primaria intacta, adendas con fecha/SHA | Esta adenda mantiene trazabilidad; no convierte documentación en implementación |
| #924 (#922) | Filtro histórico global podría cambiar totales, stock no reconstruible o mostrar un futuro inexistente | No inventar inventario histórico ni reinterpretar aprobaciones | WIP, bloquear implementación especulativa y merge |
| #886 (#885) | La rama apilada en #884 ya fusionado puede pisar ajustes posteriores, reversas antiguas sin evidencia no son cifras verificables | No reescribir ventas/cierres previos a ciegas | Draft bloqueado, requiere reconciliación histórica + QA |
| #767 | Plan financiero histórico no representa implementación vigente | No fusionar documentación vieja como nueva autoridad de negocio | Conservar fuente histórica |
| #296 | Pruebas deliberadamente rojas de embarques de octubre (base antigua) no certifican defecto vigente | Reproducir contra main primero, no fusionar pruebas en rojo | Draft bloqueado |

**Cambio concurrente:** el PR #961 (#796, oficina sin Abono espejo) fue fusionado a main durante esta revisión. La integración de #957 se rehízo preservando el predicado vigente `Boolean(pedidoId) && ocurridoAt === null && cobroDelDiaSinEspejoActivo()` y la evidencia de BONO en Pago cuando falta Abono, no se restauró la condición obsoleta `!oficina`.

## 2. Refutación iterativa con mejoras materiales

### Iteración A: adversariales de la propuesta inicial

- **A-772-01:** BONO válido paga un pedido entregado hoy con bandera sin espejo; el saldo se debita, el pago es visible en factura y no hay Abono. Antes de mejora, al anular no existía prueba en el Abono para restituir el crédito.
- **A-772-02:** BONO histórico sin prueba de débito puede encontrarse en Pago o Abono. Restituirlo indiscriminadamente inventaría dinero a favor.
- **A-630-01:** otra operación confirma entregas mientras Producción espera el lock. Usar ventas leídas antes del lock podría causar un stock final esperado erróneo.
- **A-812-01:** fallo de CacheStorage detiene el handler de logout antes de Auth.js.
- **A-936-01:** npm install puede actualizar dependencias en el benchmark, impidiendo contrastes comparables.

**Mejoras aplicadas:** evidencia de BONO por Pago o Abono según vía, lectura de ventas mediante tx, caché no bloqueante y npm ci.

### Iteración B: refutar la primera corrección

- **B-772-01:** corrección parcial (p. ej. BONO 2000, revertir 500) y anulación posterior deben restituir solo 1500, con referencias de operación y sin duplicar ante retry. Se agregaron pruebas PostgreSQL sobre ese ciclo (definidas; ejecución pendiente).
- **B-772-02:** una devolución basada únicamente en el método BONO de Pago es peligrosa para registros legados. `verificarConsumoBonoPago` exige auditoría vinculada por id, cliente, método y monto; sin evidencia retorna false. Auditoría contradictoria provoca bloqueo, nunca restitución silenciosa.
- **B-812-01:** catch del rechazo de CacheStorage no cubre una promesa que se queda colgada. Se añadió tope de 3 s a limpieza antes de signOut y una prueba que simula una promesa pendiente.
- **B-630-01:** una operación original válida de hace 40 días, reenviada ahora con el mismo offlineId, no debe crear nada ni disparar FECHA_MUY_ANTIGUA. Se movió el límite del ALTA después de comprobar dedup bajo lock.
- **B-630-02:** idéntica referencia con contenido distinto debe seguir causando conflicto 409; un alta NUEVA de esa fecha continúa devolviendo 422. Prueba PostgreSQL añadida.

### Iteración C: refutación transversal / condiciones de salida

- **C-772-01:** la oficina cobra BONO de pedido entregado HOY, y no se crea Abono espejo (#961). El Pago requiere marca de consumo y tanto corrección como anulación deben reconocerla. Con recepción retroactiva, sigue el Abono y su marcador. Se preservó explícitamente la condición integrada en main; faltan pruebas ejecutadas de ambos casos en una misma foto de base.
- **C-772-02:** coexistencia de corrección parcial y anulación/cancelación concurrentes: su orden de locks entre CARTERA/PEDIDO y SECUENCIA:notaCredito debe comprobarse con PostgreSQL; no se puede certificar sin prueba de contención simultánea.
- **C-630-01:** mover la lectura de entregas dentro de tx y CIERRE lock elimina la lectura prematura, pero **no asegura** una fotografía inmutable si el escritor de entregas no comparte el protocolo de locks. PostgreSQL Read Committed permite distinta vista por consulta. No ampliar locks de entregas sin reconstruir sus efectos y pruebas. **XMOD pendiente**.
- **C-970-02:** las ventas por evento pueden incluir pedidos legados con fecha aproximada, y los snapshots de un cierre ya sellado no deben reescribirse. Validar mismo día/fuente/precisión en Dashboard, Producción y Cierre.
- **C-941-01:** #938 añade E2E al workflow y #941 cambia reporteros/artefactos. Antes del merge, integrar ambos cambios de CI sin perder el spec ni el gate, y ejecutar el workflow final de un SHA común.
- **C-946-01:** #946 y #972 editan `pedidos-consulta.repository.ts`: el orden por pagos CONFIRMADOS y el resumen físico independiente deben sobrevivir juntos. Validar prioridad global, varias páginas, rangos históricos y filtros combinados.
- **C-812-01:** al terminar la sesión con origen conservado, probar volver, recargar, PWA/offline y token/cookies del dominio de origen. UI navegada no equivale a verificar invalidación.
- **C-885-01:** evitar que un evento posterior de reversa cambie retroactivamente un cierre ya guardado sin un contrato explícito de ajustes y su evidencia.

**Convergencia de diseño:** JUSTIFICADA localmente para las mejoras puntuales implementadas y no destructivas. **Convergencia funcional global: NO DEMOSTRADA** mientras haya pruebas PostgreSQL, CI, QA de navegador y decisiones históricas pendientes. No llamar «sin más mejoras» a una pasada estática; detener cambios especulativos para no dañar datos.

## 3. Mapa de usuario: antes → acción → resultado esperado (ejemplos hipotéticos)

| Acción cotidiana | Antes / adversarial | Después de la corrección, sujeto a QA |
|---|---|---|
| Cobrar con BONO por oficina el mismo día y anular más tarde | Sin Abono puede perder la procedencia y no devolver saldo | Marca en Pago y devolución de crédito real pendiente, sin ingreso nuevo |
| Corregir parcialmente un BONO | Devolver todo el crédito duplicaría el saldo | Solo corrección real, y la anulación devuelve lo que faltaba |
| Registrar producción después de despachos | Lectura de ventas antes de esperar lock | Lectura más reciente dentro de tx, todavía hay que probar la concurrencia con reparto |
| Reenviar offlineId de producción antiguo | 422 por límite de edad antes de deduplicar | Retorno de operación histórica idéntica; fecha antigua nueva sigue 422 |
| Salir con caché PWA defectuosa | Logout puede quedarse detenido | El intento de signOut continúa tras error o 3 s |
| Comparar rendimiento FIFO | npm install podría variar dependencias | npm ci exige lockfile sin cambios |

## 4. Evidencia de implementación

- #957: `a8abd252e407` (marcadores Pago, reversión y tests) y `e8d688fbed84` (integración de main con #961 sin pisar la condición oficina).
- #970: `746adfb508cd` (lectura ventas en tx) y `c10a20972e61` (dedup antes de ventana de 30 días, test).
- #947: `1c626efdef9c` (cache fail-open para signOut) y `cabbe3b4bde8` (timeout 3s y test).
- #938: `82dd374a56a8` (npm ci).
- #961: MERGED en main `d5f52cd329ac` (22/11), no repetir su implementación.

**Pruebas nuevas:** escritas en archivos de integración/unidad, NO ejecutadas localmente. Los GitHub Actions nuevos están lanzados/encolados; solo el resultado del SHA exacto certificaría su estado, y aun el CI verde no equivale a QA realista de escritorio/móvil.

## 5. Riesgos residuales que bloquean «todo validado»

1. Crédito BONO vs corrección/anulación y reintentos simultáneos entre CARTERA/PEDIDO/SECUENCIA; PostgreSQL real y rutas de oficina + días retroactivos.
2. Inventario físico y comisiones: reconciliar escrituras concurrentes de entrega con lectura de Producción y cierre; jamás normalizar cifras solo para que coincidan dos UI.
3. CI: están pendientes jobs en runners (no suponer FAIL/PASS por colas); #941 y #938 requieren combinación final.
4. #972/#937/#924 implican UI, aprobación de maqueta vigente/QA navegador.
5. #886 necesita contrato de ajustes monetarios históricos y datos verificables; #296 necesita reproducción de defectos de octubre en main vigente.
6. #767 y #935 no determinan estado técnico, son evidencia/proceso.
7. Branch protection de main requiere CI gate de última revisión; esta investigación no autoriza merge ni despliegue.

## 6. Patrones externos contrastados (no son decisiones de producto)

- PostgreSQL 17, consistencia de aplicación: https://www.postgresql.org/docs/17/applevel-consistency.html . **ADAPTAR:** un lock no sustituye verificar transacciones con escritores concurrentes ni los retries.
- Auth.js/NextAuth signOut redirect:false: https://authjs.dev/reference/nextjs/react y https://next-auth.js.org/getting-started/client . **ADOPTAR:** terminar signOut antes de navegar por ruta relativa; no confiar en URL de host interno.
- npm ci para CI reproducible: https://docs.npmjs.com/cli/commands/npm-ci/ . **ADOPTAR** en benchmark, sin instalar tecnología nueva.

_Esta adenda no reemplaza Contexto Maestro, planes aprobados, resultados de CI, ni aprobaciones de UX._