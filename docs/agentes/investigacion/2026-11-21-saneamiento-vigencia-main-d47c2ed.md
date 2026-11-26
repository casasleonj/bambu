# Adenda de vigencia: saneamiento JL contra main (21 nov 2026)

**Autoridad técnica:** `main@d47c2edc1f38c7ebffa495233c4950d605152889`.  
**Alcance:** actualizar la investigación histórica del lote sin reescribir R1/R2 ni convertir propuestas en decisiones.  
**Límite:** esta adenda NO certifica QA con personas ni autoriza automáticamente merge/despliegue.

## Cambios de estado demostrados

| Issue | Clasificación / evidencia actual | Acciones realizadas y pendientes |
|---|---|---|
| #319 | RESUELTO EN MAIN | PR #940 merge 21/11; issue cerrado. No reimplementar custodias ni idempotencia |
| #906 | RESUELTO EN MAIN, observación futura | PR #942 merge a main; runs CI 44952449071 y 44952743578 success, Hub 107 passed y 1 skipped sin flaky reportado. Issue cerrado 21/11; reabrir si reaparecen reintentos |
| #333 | PARCIALMENTE RESUELTO, requiere admin | GitHub ruleset 27807059 activo, main protected=true, CI gate (resumen) requerido y strict=true. Falta required status check Backlog; solo admin puede modificar/verificar la regla |
| #812 | CAMBIO IMPLEMENTADO, NO MERGE | PR #947 corrige origen en ambos controles; CI y QA de revocación pendientes |
| #334 | CAMBIO IMPLEMENTADO, NO MERGE | PR #941 añade reporte Playwright JSON y baseline; CI real del HEAD y primera comparación homologable pendientes |
| #837 | PENDIENTE QA INDEPENDIENTE | UI vigente fue alterada por #915/#927, no reconstruir la UI del PR #835 |
| #815, #873, #814, #634 | PENDIENTES DE MAQUETA/APROBACIÓN UX | No tocar pantallas ni flujos visuales hasta completar gate |
| #632 | PARCIAL | Se simplificó una parte por #601/#646, no sustituir números o etiquetas vigentes sin acordar copy |
| #610 | HIPÓTESIS SIN REPRODUCCIÓN | Preservar fechas de origen; no presentar una fecha corregida de precisión DÍA como hora real |

## Saneamiento adicional de PR/finanzas

- #745 seguía presente en main: `cobroVentasHoy` añadía BONO. El PR #952 tenía solo QA. Se recuperó el parche funcional desde #771, adaptando `cierre-desglose-cobros.ts` al clasificador posterior #796. Commit `dd38c0db069895c931c583904d81097fe9156364` en PR #952; CI y XMOD financiero **PENDIENTES**.
- #748: main sigue heredando base global; PR #951 conserva corrección, no fusionada.
- #746: issue aparecía cerrado, pero main usa `lt: endOfDayInBogota(fecha)` y omite 23:59:59.999; se reabrió. PR #956 contiene corrección más #752/#753 aún no integradas.
- #772: main no consume de forma atómica el BONO en pagar-fiado. PR #957 contiene la reparación, no fusionada.
- #939: main suma confirmados mediante `Number` flotante; PR #946 lo corrige, no fusionado.
- #959: completados en Cercanía y falsos avisos por conciliar continúan en main; PR #960 trae corrección y CI exitoso, QA visual pendiente.
- #922: el filtro global de Dashboard no existe todavía; PR #924 parcial y draft.
- #885: PR #884 del Dashboard se fusionó; #886 del Cierre y reversas NO está terminado.

**PR duplicados cerrados sin merge:** #774 → #957; #769 → #956; #775 → #951; #771 → #952. Sus ramas/historia permanecen accesibles. El cierre de un PR viejo no cierra su issue.

**PR #937:** CI anterior falló en `pedidos-sin-asignar.test.ts` (#944), no en cambio del login; main incluyó solución #945. Sin conflicto en `login-form.tsx`, la rama se sincronizó con main en `2649d2855be301aba085ca7b72807888efea969d`; CI nuevo aún pendiente.

## Gates intactos

No declarar pruebas de integración, QA móvil/PC, UX aprobada ni efectos productivos cuando solo existen cambios de código, diff o CI de un SHA anterior. La regla GitHub exige actualización respecto a main y `CI gate (resumen)`; los PR con estado `behind` requieren sincronización cuidadosa y CI del HEAD correspondiente antes del merge. El propietario del producto mantiene autoridad sobre cambios UX/negocio, y un merge que despliega requiere QA preproducción y autorización.
