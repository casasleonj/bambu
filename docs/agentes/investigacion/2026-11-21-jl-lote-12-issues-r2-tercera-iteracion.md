# JL lote: tercera iteración R1→R2, contrato y convergencia

Fecha: 2026-11-21. Código inspeccionado: main@7200f58f306e0ab0f225d6b6753118a37767d9b0.
Issues: #906, #837, #815, #812, #634, #334, #319, #873, #814, #632, #610, #333.
Estado: INVESTIGADO 12/12; IMPLEMENTADO 0/12; VALIDADO 0/12; aprobación de plan/maquetas PENDIENTE; merge NO AUTORIZADO.

## 1. Trazabilidad de tres iteraciones

1. R1/R2-1: lectura de doce issues, código de main, PR #835, alternativas, plan y maquetas exploratorias. Evidencia: 2026-11-21-jl-lote-12-issues-r2.md.
2. R1/R2-2: refutación adversarial de 65 escenarios, permisos, inventario, pagos, histórico, CI y cruces entre issues. Evidencia: 2026-11-21-jl-lote-12-issues-adversarial.md.
3. R1/R2-3: nueva falsación de las tres primeras implementaciones, validación con esquema Prisma, pruebas de dominio, test E2E original, GitHub Actions histórico y flujo de aprobación. Este documento.

El análisis fue realizado por GPT-6 con GitHub y lectura de archivos. No se ejecutó Codex CLI en esta sesión; la instrucción vigente de AGENTS.md #704 requiere investigación de Codex CLI. No presentar esta revisión como sustituto del gate Codex ni como autorización de escribir código.

## 2. #319: decisión propuesta para la ruta de movimientos

**HECHO de código:** POST /api/embarques/[id]/movimientos acepta origen y destino como string opcional; el array CUSTODIAS incluye VEHICULO, ALMACEN, INSPECCION, CLIENTE, PRODUCCION, DESCARTE y EXTERNO. La búsqueda por offlineId devuelve un resultado anterior sin comparar su embarqueId ni sus datos; offlineId es único globalmente en Prisma.

**PROPUESTA técnica:** validar los campos presentes contra el enum canónico sin imponer obligatoriedad universal ajena al contrato por tipo. Antes de devolver deduped:true, comparar embarqueId, tipo, producto, cantidad, origen, destino, metadata y authorization de la solicitud y registro. Reintentos distintos o de embarques diferentes deben fallar con conflicto seguro, sin exponer un movimiento ajeno. Tratar concurrencia por la restricción única de PostgreSQL, interceptando solo conflicto de unicidad específico y cotejando luego la operación para evitar errores 500 evitables. No crear una nueva fila, tocar movimientos antiguos ni cambiar inventario al rechazar una colisión.

**Ejemplo hipotético:** se registran 10 pacas en embarque A con la referencia X; un dispositivo envía la referencia X al embarque B. Hoy el endpoint puede responder con el movimiento de A. Resultado buscado: 409 y B intacto. Mismo X con mismos datos en A: recuperar registro idéntico, sin doble stock. Mismo X con otra cantidad: no presentar éxito falso.

**Refutaciones de tercera ronda:** solo cambiar z.string a z.enum dejaría el replay sin protección; solo verificar embarqueId permitiría retomar X con producto/cantidad modificados; solo comparar antes de crear deja una ventana de carrera; comparar JSON serializado sin canon puede generar conflictos falsos; exigir origen/destino en todos los tipos puede romper AJUSTE_AUTORIZADO. Hay que definir la normalización y comprobar reglas de cada tipo.

**Test exigido, NO EJECUTADO:** integración PostgreSQL con 201, replay idéntico, replay cruzado, replay con monto/cantidad diferentes, dos POST simultáneos, input inválido, roles y ausencia de alteración del saldo físico. Unitarias para CUSTODIAS y sus consumidores. Sin migración por defecto. No reparar datos históricos sin evidencia.

## 3. #334: observabilidad real del CI

**HECHO:** el workflow usa Playwright con reporters list/html en 8 shards y html en Hub, pero no publica fallos por spec de forma estructurada en step summary.

**PROPUESTA:** añadir reporter JSON a archivo aislado en cada job, sin sustituir HTML ni cambiar exit code original. En paso siempre ejecutado, parser tolerante a resultados ausentes o corruptos, con categorías failed/flaky/skipped/interrupted/infraestructura y longitud acotada; no incluir datos de clientes ni secretos en markdown. Comparar con baseline de main solamente cuando versiones, selección de specs/proyectos y flags sean homologables; sin evidencia mostrar NO COMPARABLE en vez de declarar cero regresiones.

**Refutaciones:** grep de logs no es fuente estable; un JSON ausente por OOM no significa 0 fallos; un test exitoso al retry no es limpio; comparar commits con configuraciones diferentes es engañoso; un resumen no debe volver verde un job rojo.

**Test exigido, NO EJECUTADO:** fixtures JSON con fallido, flaky, skipped, JSON truncado y ausente, nombres duplicados y markdown potencialmente malicioso; comprobar preservación de error del job y upload de artifacts en 8 shards y Hub.

## 4. #906: no enmascarar el bucle de consultas

**HECHO:** e2e/pedidos-realtime-779.casos.ts registra cada request del pathname /api/pedidos/consulta. Después de reload espera visibilidad de fila, toma contador y espera 2 segundos. No comprueba que hayan terminado las solicitudes iniciadas antes.

**HIPÓTESIS:** algunas llamadas son legítimas de hidratación/reconexión, pero un bucle genuino sigue siendo posible.

**PROPUESTA:** trazabilidad de request, response y requestfailed con instantes y etapa; diferenciar solicitudes pendientes del estado estable, observar una ventana posterior sin usar networkidle global (SSE legítimo). Incluir control negativo que fuerce un patrón de solicitudes repetidas en un entorno sintético y demuestre que el test detecta un loop. Si la app causa solicitudes repetidas reales, corregir la fuente, no aumentar la tolerancia del test.

**Refutaciones:** timeout mayor, umbral alto, skip, retry como solución o esperar solo la fila ocultan el fallo. Se requieren cuatro variantes ADMIN/ASISTENTE × normal/lenta y repeticiones CI sin flake en primera ejecución. Pruebas NO EJECUTADAS.

## 5. #837: evidencia histórica verificada hoy

PR #835 head 4068c379f76a7ef5f75b8eff53084061555fa8d3; merge 9a9a55acd2253c8335111b5e16aaca0bb2f9f617.

Run GitHub Actions CI 43976532812: success para Type check + Tests, integración, lint, 8/8 E2E, E2E Hub y CI gate.
Run auditoría 43976532807, job 133681820057: failure. Log real: ERROR no hay bloque <!-- cadena-agentes --> en el cuerpo del PR.

**Interpretación:** CI verde y auditoría de procedimiento roja son hechos compatibles. Ni CI valida el gate independiente ni el gate rojo prueba defecto funcional. El PR reconoce QA por agente y faltante con personas, además de ausencia de recorrido actualizado tras segundo merge. Main actual incorporó la lista integrada por cambios posteriores (#915/#927); no restaurar UI histórica por inercia. La revisión independiente estática sigue siendo parcial; QA reciente, producción y estado del gate faltan.

## 6. Otros ocho issues: límites, dependencia y estado

- #812: la falta de cookies en 0.0.0.0 no demuestra sesión invalidada en localhost. Probar ambos controles, origin real, logout contra API, retroceder, PWA y token. No inventar riesgo confirmado.
- #814: distinguir 401, 403 y 404 sin filtrar existencia de recursos; proteger autorizaciones por persona, no solo mapa de roles. UI requiere aprobación.
- #815: reservar ancho de +57 sin romper normalización/copy/paste/autofill y ofrecer nombres completos con teclado y móvil. UI requiere aprobación.
- #873: comentario de issue del 19-nov ya propuso columna móvil y fila de impresión; no rediseñar ni afectar renderer PDF separado. UI requiere aprobación.
- #634: plegar confirmados, no pendientes o de resultado incierto; evitar respuestas viejas de consultas async al cambiar actor. UI requiere aprobación.
- #632: gran parte de términos ya se simplificaron (#601/#646); precisar copy restante, nunca tocar cálculos ni cierres históricos. UI requiere aprobación.
- #610: no se reprodujo la vista reportada. Una fecha retroactiva corregida puede almacenarse como mediodía técnico, NO hora real del cobro; hace falta causa precisa y prueba sintética. UI/contrato sin aprobación.
- #333: GitHub main protected:false; exigir solo Backlog deja CI sin protección. Regla debe contemplar CI gate, bypass, jobs condicionales y prueba de PR sin issue bloqueado. Requiere acción/decisión administrativa, no basta un cambio de documentación.

## 7. Mapa ESC-2: efecto cotidiano para el PO

| Acción cotidiana | Adversarial descubierto | Resultado propuesto | No cambiar |
|---|---|---|---|
| Operador reintenta una transferencia offline | Mismo offlineId enviado a embarque equivocado | Rechazo sin fuga, ni segundo movimiento | Stock y auditoría anteriores |
| Encargado revisa CI | Se cortó el runner antes de generar reporte | Resumen dice sin evidencia, no cero fallos | CI sigue fallando cuando falla |
| Asistente recarga Pedidos después de desconexión | Peticiones legítimas tardías y bucle real se parecen | Instrumentar causa; detector sigue castigando loop real | SSE y navegación |
| Trabajador cierra sesión | Origen del redirect cambia | Volver al mismo host y perder acceso a sesión | Revocación existente |
| Administrador observa pago de otro día | Fecha corregida almacenada a mediodía | Mostrar día sin fingir hora exacta | Auditoría, caja y cierre |
| Operación ve fiados sin conexión | Resultado de cobro incierto | Aviso siempre visible, sin pago duplicado | Referencia idempotente |
| Encargado abre un enlace de acceso prohibido | Ruta inexistente se parece a 403 | Mensaje seguro, 404 distinto cuando corresponda | Permisos vigentes |
| Operario revisa cierre antiguo | Copy simplificado confunde abonos con venta | Ayuda contextual sin cambio contable | Totales y cortes históricos |

## 8. Autorizaciones y salida

**R2:** tres iteraciones de diseño registradas; 12/12 inventariados; 65 escenarios adversariales en anexo; nuevas evidencias CI #837 verificadas.
**Pendientes reales:** ejecución del gate Codex CLI #704 (no accesible como tal aquí); aprobación explícita del plan técnico, especialmente #319 y comparabilidad CI; aprobación expresa de maquetas desktop/móvil para UI; reproducción #610; pruebas y QA; permisos configuración GitHub #333.
**R3:** NO INICIADA, 0 PRs de código, 0 tests ejecutados. PR #935 sigue documental y draft.
**Merge:** NO AUTORIZADO.

Recomendación de convergencia: autorizar primero el plan técnico corregido de #319 y #334/#906, realizar las verificaciones que las reglas permiten, y mantener bloqueados los cambios de UI hasta aprobación de maquetas. El costo de corregir no justifica saltar un gate documentado.

## 9. Contraste con documentación oficial y versiones instaladas

Versiones confirmadas en package.json de main: Next.js 16.2.4, Playwright Test 1.61.1, Prisma Client 6.19.3.

- **Prisma ORM v6 (ADOPTAR):** la referencia oficial muestra error de unicidad P2002 y uso de Prisma.PrismaClientKnownRequestError. Aplica a la versión 6.19.3 del proyecto. Referencia: https://www.prisma.io/docs/orm/v6/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors . No extrapolar nuevas excepciones de Prisma v7.
- **Playwright (ADAPTAR):** reportero JSON ofrece outputFile y configuración por entorno, compatible con reportero HTML complementario. Se debe comprobar el comportamiento del CLI con la versión bloqueada antes de editar CI. Referencia oficial: https://playwright.dev/docs/test-reporters .
- **GitHub Actions (ADOPTAR):** job summaries se escriben mediante el archivo GITHUB_STEP_SUMMARY, soportan Markdown y no transforman el estado del job. Referencia oficial: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands .

Ninguna fuente externa sustituye el contrato de negocio del ledger, las aprobaciones del PO ni los tests del repo. Especificaciones y ejemplos externos, **NO** ejecución local.
