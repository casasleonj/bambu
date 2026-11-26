# JL COMPLETO + LOTE: auditoría R1/R2 y plan de 12 issues

**Fecha:** 21 de noviembre de 2026 (Bogotá).  
**Base verificada:** `main@7200f58f306e0ab0f225d6b6753118a37767d9b0`.  
**Issues:** #906, #837, #815, #812, #634, #334, #319, #873, #814, #632, #610, #333.  
**Clasificación:** INVESTIGACIÓN + PLAN PROPUESTO. **NO es aprobación del PO, implementación, QA ejecutado ni autorización de merge.**

## Jerarquía y límites
- Producto: Contexto Maestro v1.1 y decisiones/Planes Maestros aprobados. Técnica: `main` actual. No asumir que hallazgos de noviembre siguen idénticos.
- Aplicar `.agents/skills/jl/SKILL.md`, `AGENTS.md`, `docs/agentes/protocolo-investigacion.md`: R1/R2 antes de R3, aprobación expresa al plan, maquetas escritorio/móvil antes de tocar UI, pruebas E2E en navegador real y aprobación de merge separada.
- No hubo servidor de app, Postgres ni Playwright ejecutados en esta investigación. La revisión del código y del diff no sustituye CI ni QA.
- No tocar Contabilidad, caja, timestamps de pago o snapshots históricos sin contratos y pruebas de conciliación. Mantener idempotencia en offline.

## Matriz: hechos, hipótesis, propuestas y evidencias

| Issue | Clasificación / evidencia actual | Propuesta no aprobada |
|---|---|---|
| **#906** | HECHO: `e2e/pedidos-realtime-779.casos.ts` cuenta solicitudes `/api/pedidos/consulta` con ventana fija de 2 s y compara `<=1`; flake histórico confirmado en el issue. HIPÓTESIS: solicitudes legítimas en hidratación, sin descartar bucle real. | Instrumentar timestamps y causa de requests, establecer punto de reposo verificable después de reload, comprobar ventana de ausencia de bucle y repetir ADMIN/ASISTENTE, redes lenta/normal, reconexión. Nunca `skip` ni elevar umbral sin evidencia. |
| **#837** | EVIDENCIA HISTÓRICA: [PR #835](https://github.com/casasleonj/bambu/pull/835) fusionado sin gate `audit` superado ni revisión de otra familia. ESTADO ACTUAL: #915/#927 integraron anteriores en la consulta principal, superando el diseño de sección siempre separada. | Auditoría estática independiente de otra familia (esta lectura de GPT-6), QA real read-only en PC/móvil ADMIN/CONTADOR, inspección de CI y despliegue y definición de política del gate `audit`. No reintroducir diseño obsoleto. |
| **#815** | ESTADO TÉCNICO: `src/components/telefono-input.tsx` usa `left-3/pl-10` y `left-9/pl-16` para indicativo fijo; `cliente-table.tsx:550,652` trunca nombres sin texto completo. | Reservar el ancho del prefijo, mantener `+57`, copiado/pegado y validación. Mostrar nombre completo por tooltip accesible o ancho adaptable; PC/móvil. REQUIERE MAQUETA + PO. |
| **#812** | HECHO: `src/app/(app)/header.tsx` y `sidebar.tsx` usan `signOut({redirectTo:'/login'})`. Repro histórico `localhost:3001` → `0.0.0.0:3001`, sin residuo de cookies. | Conservar origin de la URL de retorno sin cambiar invalidación de sesión. Comprobar ambos botones, hostname/IP y cookies reales. |
| **#634** | HECHO: `pedidos-client/cobro-fiado-dialog.tsx:268-273` muestra siempre «Pagos recientes y pendientes». | Plegar **solo pagos ya confirmados**. Cobros offline/pendientes/inciertos y fallos siguen SIEMPRE visibles. Resumen/conteo, `aria-expanded`, botón táctil, errores y vuelta. REQUIERE MAQUETA + PO. |
| **#334** | HECHO: `.github/workflows/ci.yml` sube reportes HTML por shard y Hub pero no escribe fallos por spec al job summary. | Reporter estructurado + paso `if:always()` con fallos por spec/proyecto y causa; comparar contra artefacto de `main` del mismo proyecto, entorno y flags. Cuando falte baseline, indicarlo expresamente; no adivinar regresiones. |
| **#319** | HECHO: `src/app/api/embarques/[id]/movimientos/route.ts` permite `z.string().optional()` en origen/destino. `src/modules/embarques/domain/services/ledger-fisico.service.ts` define `CUSTODIAS`. | Usar `CUSTODIAS` como lista canónica en POST y dominio cuando corresponda. Retener campos opcionales y semántica de ajustes; comprobar 400 inválidos, válidos, idempotencia y ledger. |
| **#873** | HECHO: `resumen-facturas/page.tsx:353-380` sigue con `flex justify-between items-start` sin breakpoints; solape móvil reproducido históricamente. Existe plan en comentario del issue aún no aprobado. | Apilar logo/empresa y título en móvil, conservar horizontal escritorio/impresión y separar período con `flex-wrap`. Verificar 320/390 px, texto largo, print. REQUIERE MAQUETA + PO. |
| **#814** | HECHO: `src/proxy.ts:121-125` redirige a inicio del rol cuando falta permiso, sin explicación. Existe mapa centralizado en `src/lib/permissions.ts` y `src/app/not-found.tsx`. | Distinguir 403 de 404 y no autenticado sin mostrar datos protegidos ni añadir roles. Probar repartidor/contador/admin en rutas permitidas, prohibidas e inexistentes. REQUIERE MAQUETA + PO. |
| **#632** | **PARCIALMENTE RESUELTO**: `cierre-client/index.tsx` ya titula «Resumen del dinero del día»; `cierre-kpi-grid.tsx` ya usa `AyudaTermino` y no muestra «Neto de movimientos» como KPI. | Auditar únicamente etiquetas *todavía* visibles que necesiten simplificación. Mantener fórmula, período, fuente y snapshots. Pruebas de comprensión con personal no técnico. REQUIERE MAQUETA + PO para cambios perceptibles. |
| **#610** | HIPÓTESIS de auditoría histórica, **no reproducida**: el issue nunca identificó pantalla concreta de venta anónima que muestra «Sin registrar». Actualmente `pedido-detalle.tsx` presenta horas de `pg.ocurridoAt`/`pg.fecha`; `factura-historial-pagos.ts` usa `ocurridoAt ?? createdAt`. | Rastrear venta anónima pagada → Pedido/Pago/Factura/proyección. Corregir solamente causa comprobada, nunca inventar hora por `Pedido.createdAt`. Contrastar medios mixtos, offline e históricos. |
| **#333** | HECHO: GitHub informa `main` con `protected: false`. El status `Backlog` no protege obligatoriamente merges. | Admin configura en Branches/Rulesets el check requerido EXACTO `Backlog (estado de issues y PR vinculado)` y prueba PR sin issue bloqueado. No exigir shards `E2E (n/8)` individualmente; usar check resumen estable. Esta integración no expone acción para cambiar branch protection. |

## Auditoría estática independiente #837
**Revisor técnico:** GPT-6, modelo de familia diferente a Claude que implementó [PR #835](https://github.com/casasleonj/bambu/pull/835). No representa aprobación independiente de QA humano.

1. Inspeccionados diff de PR #835, `src/lib/pedidos-consulta.ts`, `pedidos-consulta.repository.ts` y `pedido-hub`. El PR original añadió lectura aparte de pendientes sin cambiar `Pedido.fecha`, y manejo local de error.
2. La implementación vigente **no es igual al PR original**. `consultarPedidos` integra los pendientes anteriores según #915/#927 en una misma lista cuando corresponde. Usa `whereLista` para universo operativo, manteniendo `where` para el resumen comercial del período. Deduplica las destacadas visibles.
3. El E2E `e2e/pedidos-pendientes-anteriores-797.spec.ts` **define** cobertura ADMIN desktop/mobile, CONTADOR y retorno después de entrega; no se ejecutó aquí.
4. PENDIENTE: corrida del CI de `main`, navegador real PC/móvil en rol efectivo, reproducciones con >5 pedidos, filtros cruzados/barrio, parciales, pedidos futuros, performance y verificación del despliegue. **No se halló una regresión concluyente por inspección estática; tampoco hay base para cerrar #837.**

## Escenarios adversariales antes de código

- **#319:** custodia válida/inválida/vacía, ajuste autorizado, doble `offlineId`, ledger sin escritura tras 400.
- **#812/#814:** logout desde `localhost`, IP, host externo, sesión revocada, intento de redirect abierto, 403 vs 404 vs login, usuario desactivado.
- **#634/#610:** respuesta de pago incierta + reconexión, referencia idempotente, corrección de fecha, parcial, pago del mismo día, efectivo/digital, venta anónima sin fuente horaria, histórico sin evidencia.
- **#632:** efectivo físico vs digital, fiados vs cobros de cartera, cierre histórico estable, explicación sin recontabilizar.
- **#873/#815:** 320/390/1280 px, impresión, zoom 200 %, teclado móvil, tooltip y accesibilidad.
- **#334/#906:** suite que falla antes de producir JSON, shards ausentes, baseline `main` con otro feature flag, flake por request real vs temporización.
- **#837:** pedidos anteriores y parciales en la misma lista sin duplicados, filtro por barrio, fecha futura reprogramada, roles ADMIN/CONTADOR, lectura/acción consistente.

## Dependencias y lotes candidatos para R3 (tras aprobación)
1. **Integridad/seguridad:** #319 y #812 en PRs aislados; #814 separado por cambio UX. #333 requiere configuración de repositorio por admin.
2. **Infraestructura QA:** #334 prepara comparación de regresiones; #906 investiga flake; #837 auditoría y QA, sin reimplementar #797.
3. **UI:** #815, #873, #634 separados, después de aprobar cada maqueta; máxima prioridad a no ocultar cobros inciertos.
4. **Finanzas/comprensión:** #632 solo vocabulario pendiente; #610 primero reproducción y fuente de timestamps.

## Estado y checklist
- [x] R1/R2: lectura de los 12 issues y del código vigente, análisis de cambios históricos, plan de escenarios.
- [x] Maquetas preliminares desktop/móvil de #815, #814, #634, #873, #632 y representación condicional de #610 preparadas en conversación para revisión del PO.
- [x] Auditoría **estática** distinta familia de PR #835 documentada con sus límites.
- [ ] Aprobación expresa del plan y de las maquetas aplicables por el PO.
- [ ] Implementación de código en PR(s) separados, pruebas unitarias/integración/TypeScript/ESLint/E2E, CI real y revisión independiente.
- [ ] QA de navegador (datos sintéticos) PC/móvil, evidencia y aprobación de merge.
- [ ] Admin aplica y prueba protección real de `main` (#333).
- [ ] Despliegue y cierre de cada issue contra criterios de aceptación.

**No cerrar automáticamente ninguno por crear este documento.**